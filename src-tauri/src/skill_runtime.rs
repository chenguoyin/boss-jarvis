use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::panic::AssertUnwindSafe;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::{Duration, Instant};
const FETCH_TIMEOUT_SECS: u64 = 150;
const FETCH_CONCURRENCY: usize = 4;

/// 共享 OA 登录会话的 Skill：并发登录会互相顶号导致整批超时。
/// reminder-center / daily-briefing 内部 spawn oa-todo，oa-schedule 内部 spawn OA 脚本，一并归入串行组。
const OA_SESSION_SKILLS: &[&str] = &[
    "oa-todo",
    "spm-todo",
    "oa-schedule",
    "reminder-center",
    "daily-briefing",
    "hongyi-today-metrics",
    "hongyi-business-overview",
];

/// Boss cockpit 必须在其他数据源 skills 完成后才能执行，否则会读到不完整的缓存数据。
const BOSS_COCKPIT_SKILL: &str = "boss-cockpit";

#[derive(Debug)]
pub struct RunOutcome {
    pub ok: bool,
    pub error: String,
    pub stdout: String,
    pub stderr: String,
}

pub fn data_dir() -> PathBuf {
    crate::paths::data_dir()
}

fn write_file_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, bytes)?;
    std::fs::rename(&temp, path)
}

/// GUI App 不继承登录 shell 的 PATH；统一补齐 node 常见安装位置，
/// 并加载 skill-env.conf 中的运行依赖（凭证、NODE_PATH 等），源码不保存任何凭证。
pub fn build_environment() -> HashMap<String, String> {
    let mut env: HashMap<String, String> = std::env::vars().collect();

    if let Ok(text) = std::fs::read_to_string(crate::paths::env_conf_path()) {
        for line in text.lines() {
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                let value = value.trim();
                if !key.is_empty() && !value.is_empty() {
                    env.insert(key.to_string(), value.to_string());
                }
            }
        }
    }

    let separator: &str = if cfg!(windows) { ";" } else { ":" };
    let path = env.get("PATH").cloned().unwrap_or_default();
    let mut parts: Vec<String> = path.split(separator).map(|s| s.to_string()).collect();
    // 绿色版优先用 exe 同目录的 node.exe，最终用户无需单独安装 Node。
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let dir = parent.to_string_lossy().into_owned();
            if !parts.iter().any(|x| x == &dir) {
                parts.insert(0, dir);
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    let extra = [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ];
    #[cfg(target_os = "windows")]
    let extra: [&str; 0] = [];
    for p in extra {
        if !parts.iter().any(|x| x == p) {
            parts.insert(0, p.to_string());
        }
    }
    env.insert("PATH".to_string(), parts.join(separator));
    env.insert(
        "BOSS_JARVIS_DATA_DIR".to_string(),
        data_dir().to_string_lossy().into_owned(),
    );
    // Windows 绿色包把 Playwright 浏览器放在 exe 同级 .playwright-browsers，
    // 脚本按 PLAYWRIGHT_BROWSERS_PATH 离线定位，无需首次联网下载 Chromium。
    #[cfg(target_os = "windows")]
    {
        if env.get("PLAYWRIGHT_BROWSERS_PATH").map(|v| v.is_empty()).unwrap_or(true) {
            if let Ok(exe) = std::env::current_exe() {
                if let Some(parent) = exe.parent() {
                    let candidates = [
                        parent.join(".playwright-browsers"),
                        parent.join("playwright-browsers"),
                    ];
                    if let Some(dir) = candidates.iter().find(|d| d.is_dir()) {
                        env.insert(
                            "PLAYWRIGHT_BROWSERS_PATH".to_string(),
                            dir.to_string_lossy().into_owned(),
                        );
                    }
                }
            }
        }
    }
    env
}

#[cfg(unix)]
fn stop_process(pid: i32, kill: bool) {
    let sig = if kill { 9 } else { 15 };
    unsafe {
        libc::kill(pid, sig);
    }
}

#[cfg(windows)]
fn stop_process(_pid: u32, _kill: bool) {
    // Windows 侧 Phase T 用 taskkill /T 补齐；当前主路径不依赖。
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// GUI 进程直接 spawn 控制台子系统程序（如 node.exe）时，Windows 会为其新开
/// 一个控制台窗口。统一加 CREATE_NO_WINDOW，让 Skill 在后台无窗口运行。
pub fn hide_child_console(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = command;
}

/// 带超时执行；超时先 TERM 后 KILL，避免脚本挂起时界面永远转圈。
pub fn run_with_timeout(
    runner: &str,
    script: &Path,
    args: &[String],
    timeout_secs: u64,
    stderr_handler: Option<Box<dyn Fn(String) + Send>>,
) -> RunOutcome {
    let env = build_environment();
    let mut command = Command::new(runner);
    // PowerShell 默认执行策略（Restricted）会直接拒绝运行 .ps1 并以 exit 1 结束，
    // 不产出任何 JSON。这里统一用 -NoProfile -ExecutionPolicy Bypass -File 启动。
    if runner.eq_ignore_ascii_case("powershell")
        || script.extension().and_then(|e| e.to_str()) == Some("ps1")
    {
        command
            .arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-File")
            .arg(script)
            .args(args);
    } else {
        command.arg(script).args(args);
    }
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(script.parent().unwrap_or(Path::new(".")));
    for (k, v) in &env {
        command.env(k, v);
    }
    hide_child_console(&mut command);

    let mut child = match command.spawn() {
        Ok(c) => c,
        Err(e) => {
            return RunOutcome {
                ok: false,
                error: format!("无法启动 {}: {}", runner, e),
                stdout: String::new(),
                stderr: String::new(),
            }
        }
    };

    let mut stdout_pipe = child.stdout.take().expect("stdout piped");
    let stderr_pipe = child.stderr.take().expect("stderr piped");
    let (out_tx, out_rx) = mpsc::channel::<String>();
    let (err_tx, err_rx) = mpsc::channel::<String>();
   std::thread::spawn(move || {
       let mut buf = String::new();
       let _ = stdout_pipe.read_to_string(&mut buf);
       let _ = out_tx.send(buf);
   });
   std::thread::spawn(move || {
        // stderr 行式读取：每行立即传给 handler，同时攒到 buf 等进程结束后返回完整内容。
        let mut buf = String::new();
        use std::io::{BufRead, BufReader};
        let mut reader = BufReader::new(stderr_pipe).lines();
        while let Some(Ok(line)) = reader.next() {
            buf.push_str(&line);
            buf.push('\n');
            if let Some(ref h) = stderr_handler {
                h(line);
            }
        }
        let _ = err_tx.send(buf);
    });

    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    loop {
        if let Ok(Some(_)) = child.try_wait() {
            break;
        }
        if Instant::now() >= deadline {
            let pid = child.id();
            #[cfg(unix)]
            stop_process(pid as i32, false);
            #[cfg(windows)]
            stop_process(pid, false);
            let grace = Instant::now() + Duration::from_secs(3);
            loop {
                if let Ok(Some(_)) = child.try_wait() {
                    break;
                }
                if Instant::now() >= grace {
                    #[cfg(unix)]
                    stop_process(pid as i32, true);
                    #[cfg(windows)]
                    stop_process(pid, true);
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            let _ = child.wait();
            let stdout = out_rx.recv().unwrap_or_default();
            let stderr = err_rx.recv().unwrap_or_default();
            return RunOutcome {
                ok: false,
                error: format!("脚本执行超时（{} 秒），已终止", timeout_secs),
                stdout,
                stderr,
            };
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    let status = child.wait().expect("child exited");
    let stdout = out_rx.recv().unwrap_or_default();
    let stderr = err_rx.recv().unwrap_or_default();
    let ok = status.success();
    RunOutcome {
        ok,
        error: if ok {
            String::new()
        } else {
            format!("exit {}", status.code().unwrap_or(-1))
        },
        stdout,
        stderr,
    }
}

#[derive(Serialize)]
pub struct FetchOutcome {
    pub skill: String,
    pub ok: bool,
    pub error: String,
}

/// 取数实时进度：每个 Skill 开始/结束时发一次，壳层用于逐项状态展示。
#[derive(Clone, Serialize)]
pub struct FetchProgress {
    pub skill: String,
    pub label: String,
    pub phase: String,
}

/// skill + label 固定，phase/detail 随时更新。
#[derive(Clone)]
pub struct ProgressCtx {
    pub skill: String,
    pub label: String,
}

pub type ProgressCallback = Arc<dyn Fn(String, String, String, String) + Send + Sync>;

fn emit_progress(
    progress: &Option<ProgressCallback>,
    ctx: &ProgressCtx,
    phase: &'static str,
    detail: String,
) {
    if let Some(callback) = progress {
        callback(ctx.skill.clone(), ctx.label.clone(), phase.to_string(), detail);
    }
}

pub fn fetch_skill(manifest: &crate::manifest::Manifest, id: &str) -> FetchOutcome {
    fetch_skill_tracked(manifest, id, None)
}

pub fn fetch_skill_tracked(
    manifest: &crate::manifest::Manifest,
    id: &str,
    progress: Option<ProgressCallback>,
) -> FetchOutcome {
    let label = manifest
        .resolve(id)
        .map(|(_, display, _)| display)
        .unwrap_or_else(|| id.to_string());
    let ctx = ProgressCtx {
        skill: id.to_string(),
        label: label.clone(),
    };
    emit_progress(&progress, &ctx, "running", String::new());
    let outcome = fetch_skill_inner(manifest, id);
    let phase = if outcome.ok { "done" } else { "failed" };
    emit_progress(&progress, &ctx, phase, String::new());
    outcome
}

fn fetch_skill_inner(manifest: &crate::manifest::Manifest, id: &str) -> FetchOutcome {
    let Some((skill, _display, resolution)) = manifest.resolve(id) else {
        return FetchOutcome {
            skill: id.to_string(),
            ok: false,
            error: "未找到该 Skill 的取数任务".to_string(),
        };
    };
    let crate::manifest::PlatformResolution::Available(resolved) = resolution else {
        let error = match resolution {
            crate::manifest::PlatformResolution::Unavailable(u) => u.note,
            crate::manifest::PlatformResolution::Available(_) => unreachable!(),
        };
        return FetchOutcome {
            skill,
            ok: false,
            error,
        };
    };

    let script = manifest.skills_root().join(&resolved.script);
    let output_file = data_dir().join(format!("{}.json", id));
    // boss-cockpit 是聚合器：由壳层传入已有契约 JSON，避免它在取数链路里再次
    // 逐个执行上游 Skill；同时保证任一数据源缺失时仍能产出其余数据的驾驶舱。
    let mut args = resolved.args.clone();
    if id == "changhong-mail" && resolved.runner == "node" {
        // 邮件信封 stdout 体积过大易被管道截断，改为脚本直写文件、壳层读文件。
        args.push(format!("--output={}", output_file.display()));
    }
    if id == "boss-cockpit" {
        for source in ["oa-todo", "changhong-mail", "oa-schedule", "spm-todo"] {
            let path = data_dir().join(format!("{source}.json"));
            if path.is_file() {
                args.push(format!("--source={source}:{}", path.display()));
            }
        }
    }
    let result = run_with_timeout(&resolved.runner, &script, &args, FETCH_TIMEOUT_SECS, None);
    if !result.ok {
        let error = prefer_json_error(&result.stdout, &result.stderr, &result.error);
        log_fetch(&skill, false, &error, &result.stdout, &result.stderr);
        record_audit_failure(&skill, &error);
        return FetchOutcome {
            skill,
            ok: false,
            error,
        };
    }

    // changhong-mail 优先读脚本写入的 JSON 文件，避免大 stdout 被管道截断。
    let stdout_source = if id == "changhong-mail" {
        std::fs::read_to_string(&output_file).unwrap_or_else(|_| result.stdout.clone())
    } else {
        result.stdout.clone()
    };
    let parsed = match serde_json::from_str::<serde_json::Value>(stdout_source.trim()) {
        Ok(v) => v,
        Err(e) => {
            let error = format!("输出不是 JSON: {}", e);
            log_fetch(&skill, false, &error, &result.stdout, &result.stderr);
            record_audit_failure(&skill, &error);
            return FetchOutcome {
                skill,
                ok: false,
                error,
            };
        }
    };

    let mut parsed = parsed;
    if parsed.get("ok").and_then(|v| v.as_bool()) == Some(false) {
        let detail = parsed
            .get("error")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| envelope_failure_summary(&parsed))
            .unwrap_or_else(|| "取数未完成".to_string());
        write_json(&output_file, &parsed);
        log_fetch(&skill, false, &detail, &result.stdout, &result.stderr);
        record_audit_failure(&skill, &detail);
        return FetchOutcome {
            skill,
            ok: false,
            error: detail,
        };
    }

    if id == "changhong-mail" {
        attach_mail_analysis(&manifest, &mut parsed);
    }
    write_json(&output_file, &parsed);
    log_fetch(&skill, true, "", &result.stdout, &result.stderr);
    FetchOutcome {
        skill,
        ok: true,
        error: String::new(),
    }
}

/// Windows 的 Outlook 取数器不自带 analysis；这里统一补一次只读规则分析。
/// 脚本或 node 缺失时保持原样，不让邮件功能整体失败。
fn attach_mail_analysis(manifest: &crate::manifest::Manifest, parsed: &mut serde_json::Value) {
    let Some(rows) = parsed.get_mut("rows").and_then(|value| value.as_array_mut()) else {
        return;
    };
    if !rows.iter().any(|row| row.get("analysis").is_none()) {
        return;
    }
    let analyzer = manifest.skills_root().join("mail-analysis/analyze-mails.cjs");
    if !analyzer.is_file() {
        return;
    }
    let Ok(input) = serde_json::to_string(rows) else {
        return;
    };
    let env = build_environment();
    let mut command = Command::new("node");
    command
        .arg(&analyzer)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .current_dir(analyzer.parent().unwrap_or(Path::new(".")));
    hide_child_console(&mut command);
    for (key, value) in &env {
        command.env(key, value);
    }
    let Ok(mut child) = command.spawn() else {
        return;
    };
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(input.as_bytes());
    }
    let Ok(output) = child.wait_with_output() else {
        return;
    };
    let Ok(analyzed) = serde_json::from_slice::<serde_json::Value>(&output.stdout) else {
        return;
    };
    let Some(new_rows) = analyzed.get("rows").and_then(|value| value.as_array()) else {
        return;
    };
    let count = new_rows.len();
    let homepage: Vec<serde_json::Value> = new_rows
        .iter()
        .filter(|row| row.pointer("/analysis/urgency").and_then(|v| v.as_str()) != Some("green"))
        .cloned()
        .collect();
    *rows = new_rows.clone();
    if let Some(obj) = parsed.as_object_mut() {
        obj.insert("count".to_string(), serde_json::json!(count));
        obj.insert("homepageItems".to_string(), serde_json::json!(homepage));
    }
}

/// 并发取数：保持传入 id 顺序返回；单任务异常被隔离为该 Skill 的失败结果，不拖垮整批。
pub fn fetch_skills(manifest: &crate::manifest::Manifest, ids: &[String]) -> Vec<FetchOutcome> {
    fetch_skills_tracked(manifest, ids, None)
}

pub fn fetch_skills_tracked(
    manifest: &crate::manifest::Manifest,
    ids: &[String],
    progress: Option<ProgressCallback>,
) -> Vec<FetchOutcome> {
    // 批次开始先广播排队态（含中文名），壳层可立即展示完整清单。
    for id in ids {
        let label = manifest
            .resolve(id)
            .map(|(_, display, _)| display)
            .unwrap_or_else(|| id.clone());
        let ctx = ProgressCtx {
            skill: id.clone(),
            label: label.clone(),
        };
        emit_progress(&progress, &ctx, "pending", String::new());
    }
    if ids.len() <= 1 {
        return ids
            .iter()
            .map(|id| fetch_skill_tracked(manifest, id, progress.clone()))
            .collect();
    }
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(FETCH_CONCURRENCY)
        .build()
        .unwrap_or_else(|_| {
            rayon::ThreadPoolBuilder::new()
                .num_threads(2)
                .build()
                .expect("fallback rayon pool")
        });
    // OA 串行组作为一个整体占一个并发位，其余 Skill 各自并发。
    let serial: Vec<String> = ids
        .iter()
        .filter(|id| OA_SESSION_SKILLS.contains(&id.as_str()))
        .cloned()
        .collect();
    // 提取 boss-cockpit，单独最后执行
    let cockpit_requested = ids.iter().any(|id| id == BOSS_COCKPIT_SKILL);
    let other_ids: Vec<String> = ids
        .iter()
        .filter(|id| !OA_SESSION_SKILLS.contains(&id.as_str()) && id.as_str() != BOSS_COCKPIT_SKILL)
        .cloned()
        .collect();
    let mut groups: Vec<Vec<String>> = Vec::new();
    if !serial.is_empty() {
        groups.push(serial);
    }
    // 其他非 OA 的 skills 并发执行
    for id in other_ids {
        groups.push(vec![id]);
    }
    let mut by_id: HashMap<String, FetchOutcome> = HashMap::new();
    let outcomes: Vec<FetchOutcome> = pool.install(|| {
        use rayon::prelude::*;
        groups
            .par_iter()
            .flat_map_iter(|group| {
                group.iter().map(|id| {
                    std::panic::catch_unwind(AssertUnwindSafe(|| {
                        fetch_skill_tracked(manifest, id, progress.clone())
                    }))
                    .unwrap_or_else(|_| FetchOutcome {
                        skill: id.clone(),
                        ok: false,
                        error: "取数任务异常退出".to_string(),
                    })
                })
            })
            .collect()
    });
    for outcome in outcomes {
        by_id.insert(outcome.skill.clone(), outcome);
    }
    // Boss cockpit 必须等其他 skills 完成后才执行，确保读取到完整的最新数据
    if cockpit_requested {
        let cockpit_outcome = fetch_skill_tracked(manifest, BOSS_COCKPIT_SKILL, progress.clone());
        by_id.insert(BOSS_COCKPIT_SKILL.to_string(), cockpit_outcome);
    }
    ids.iter()
        .map(|id| {
            by_id.remove(id).unwrap_or_else(|| FetchOutcome {
                skill: id.clone(),
                ok: false,
                error: "取数任务异常退出".to_string(),
            })
        })
        .collect()
}

fn write_json(path: &Path, value: &serde_json::Value) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(bytes) = serde_json::to_vec_pretty(value) {
        if let Err(error) = write_file_atomic(path, &bytes) {
            log_fetch("workbench", false, &format!("写入 {} 失败：{}", path.display(), error), "", "");
        }
    }
}

fn prefer_json_error(stdout: &str, stderr: &str, fallback: &str) -> String {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(stdout) {
        if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
            if !err.is_empty() {
                return err.to_string();
            }
        }
    }
    if !stderr.is_empty() {
        stderr.to_string()
    } else {
        fallback.to_string()
    }
}

fn envelope_failure_summary(payload: &serde_json::Value) -> Option<String> {
    let unavailable: Vec<&str> = payload
        .get("unavailableSources")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str()).take(3).collect())
        .unwrap_or_default();
    if !unavailable.is_empty() {
        return Some(format!("部分数据源未获取：{}", unavailable.join("、")));
    }
    let missing: Vec<&str> = payload
        .get("missingFields")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str()).take(3).collect())
        .unwrap_or_default();
    if !missing.is_empty() {
        return Some(format!("部分字段未获取：{}", missing.join("、")));
    }
    None
}

fn log_fetch(skill: &str, ok: bool, error: &str, stdout: &str, stderr: &str) {
    use std::fmt::Write as _;
    let mut line = String::new();
    let _ = write!(
        line,
        "{} skill={} ok={} error={} stdout={} stderr={}\n",
        crate::runtime_log::iso_now(),
        skill,
        ok,
        error,
        crate::runtime_log::truncate_head(stdout, 400),
        crate::runtime_log::truncate_head(stderr, 4000)
    );
    crate::runtime_log::append_log_line("fetch.log", &line);
}

/// 取数失败同时写审计（record-audit.cjs append）；审计失败不影响取数主流程。
fn record_audit_failure(skill: &str, error: &str) {
    let manifest = crate::manifest::load();
    let script = manifest.skills_root().join("audit-log/record-audit.cjs");
    if !script.exists() {
        return;
    }
    let payload = serde_json::json!({
        "skill": skill,
        "actionType": "fetch_data",
        "mode": "read_only",
        "status": "failed",
        "sourceSystem": "工作台取数",
        "resultSummary": format!("取数失败：{}", crate::runtime_log::truncate_head(error, 400)),
        "error": crate::runtime_log::truncate_head(error, 400),
        "target": { "title": skill }
    });
    let env = build_environment();
    let mut command = Command::new("node");
    command
        .arg(&script)
        .arg("append")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_child_console(&mut command);
    for (k, v) in &env {
        command.env(k, v);
    }
    if let Ok(mut child) = command.spawn() {
        if let Some(stdin) = child.stdin.as_mut() {
            use std::io::Write;
            let _ = stdin.write_all(payload.to_string().as_bytes());
        }
        let _ = child.wait();
    }
}
