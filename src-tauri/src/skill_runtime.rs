use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::panic::AssertUnwindSafe;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};
const FETCH_TIMEOUT_SECS: u64 = 150;
const FETCH_CONCURRENCY: usize = 4;

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

/// 带超时执行；超时先 TERM 后 KILL，避免脚本挂起时界面永远转圈。
pub fn run_with_timeout(
    runner: &str,
    script: &Path,
    args: &[String],
    timeout_secs: u64,
) -> RunOutcome {
    let env = build_environment();
    let mut command = Command::new(runner);
    command
        .arg(script)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(script.parent().unwrap_or(Path::new(".")));
    for (k, v) in &env {
        command.env(k, v);
    }

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
    let mut stderr_pipe = child.stderr.take().expect("stderr piped");
    let (out_tx, out_rx) = mpsc::channel::<String>();
    let (err_tx, err_rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        let mut buf = String::new();
        let _ = stdout_pipe.read_to_string(&mut buf);
        let _ = out_tx.send(buf);
    });
    std::thread::spawn(move || {
        let mut buf = String::new();
        let _ = stderr_pipe.read_to_string(&mut buf);
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

pub fn fetch_skill(manifest: &crate::manifest::Manifest, id: &str) -> FetchOutcome {
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
    if id == "boss-cockpit" {
        for source in ["oa-todo", "company-mail", "native-calendar", "spm-todo"] {
            let path = data_dir().join(format!("{source}.json"));
            if path.is_file() {
                args.push(format!("--source={source}:{}", path.display()));
            }
        }
    }
    let result = run_with_timeout(&resolved.runner, &script, &args, FETCH_TIMEOUT_SECS);
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

    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&result.stdout) else {
        let error = "输出不是 JSON".to_string();
        log_fetch(&skill, false, &error, &result.stdout, &result.stderr);
        record_audit_failure(&skill, &error);
        return FetchOutcome {
            skill,
            ok: false,
            error,
        };
    };

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

    write_json(&output_file, &parsed);
    log_fetch(&skill, true, "", "", "");
    FetchOutcome {
        skill,
        ok: true,
        error: String::new(),
    }
}

/// 并发取数：保持传入 id 顺序返回；单任务异常被隔离为该 Skill 的失败结果，不拖垮整批。
pub fn fetch_skills(manifest: &crate::manifest::Manifest, ids: &[String]) -> Vec<FetchOutcome> {
    if ids.len() <= 1 {
        return ids.iter().map(|id| fetch_skill(manifest, id)).collect();
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
    ids.iter()
        .map(|id| {
            pool.install(|| {
                std::panic::catch_unwind(AssertUnwindSafe(|| fetch_skill(manifest, id)))
                    .unwrap_or_else(|_| FetchOutcome {
                        skill: id.clone(),
                        ok: false,
                        error: "取数任务异常退出".to_string(),
                    })
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
    use std::io::Write;
    let dir = crate::paths::logs_dir();
    let _ = std::fs::create_dir_all(&dir);
    let mut line = String::new();
    let _ = write!(
        line,
        "{} skill={} ok={} error={} stdout={} stderr={}\n",
        iso_now(),
        skill,
        ok,
        error,
        truncate(stdout, 400),
        truncate(stderr, 400)
    );
    let path = dir.join("fetch.log");
    rotate_log_if_needed(&path);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = f.write_all(line.as_bytes());
    }
}

const FETCH_LOG_MAX_BYTES: u64 = 2 * 1024 * 1024;

/// 日志压缩轮转：超过 2MB 归档为 fetch.log.1，只保留一代，避免长期运行撑爆磁盘。
fn rotate_log_if_needed(path: &Path) {
    let Ok(meta) = std::fs::metadata(path) else {
        return;
    };
    if meta.len() <= FETCH_LOG_MAX_BYTES {
        return;
    }
    let archived = dir_archive_path(path);
    let _ = std::fs::remove_file(&archived);
    if std::fs::rename(path, &archived).is_err() {
        let _ = std::fs::remove_file(path);
    }
}

fn dir_archive_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    name.push_str(".1");
    path.with_file_name(name)
}

fn iso_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86400;
    let rem = secs % 86400;
    let (h, _m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let z = days as i64 + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m, d, h, m, s)
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &s[..end])
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
        "resultSummary": format!("取数失败：{}", truncate(error, 400)),
        "error": truncate(error, 400),
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
