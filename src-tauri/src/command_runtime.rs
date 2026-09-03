use serde::Serialize;
use std::io::Write;

const COMMAND_TIMEOUT_SECS: u64 = 150;

#[derive(Debug, Serialize)]
pub struct CommandOutcome {
    pub ok: bool,
    pub summary: String,
}

const SKILL_ENV_KEYS: [&str; 6] = [
    "OA_USERNAME",
    "OA_PASSWORD",
    "COMPANY_LLM_BASE_URL",
    "COMPANY_LLM_MODEL",
    "COMPANY_LLM_API_KEY",
    "NODE_PATH",
];

/// 读取 skill-env.conf 中壳层可编辑的键；文件缺失时返回空表，界面提示未配置。
pub fn read_skill_env() -> std::collections::HashMap<String, String> {
    let mut values = std::collections::HashMap::new();
    let Ok(text) = std::fs::read_to_string(crate::paths::env_conf_path()) else {
        return values;
    };
    for line in text.lines() {
        let Some((key, value)) = line.split_once('=') else { continue };
        let key = key.trim();
        if SKILL_ENV_KEYS.contains(&key) {
            values.insert(key.to_string(), value.trim().to_string());
        }
    }
    values
}

/// 保存运行配置。与 legacy 行为一致：只写壳层管理的键，凭证仅落本机 skill-env.conf。
pub fn write_skill_env(values: &std::collections::HashMap<String, String>) -> CommandOutcome {
    let default_base = "https://hongxincy.changhong.com/v1";
    let default_model = "qwen3.7-plus";
    let read = |key: &str| {
        values
            .get(key)
            .map(|value| value.trim().to_string())
            .unwrap_or_default()
    };
    let base = {
        let value = read("COMPANY_LLM_BASE_URL");
        if value.is_empty() { default_base.to_string() } else { value }
    };
    let model = {
        let value = read("COMPANY_LLM_MODEL");
        if value.is_empty() { default_model.to_string() } else { value }
    };
    let lines = [
        "# Boss Jarvis Skill 运行环境（key=value，勿提交到代码库）".to_string(),
        format!("OA_USERNAME={}", read("OA_USERNAME")),
        format!("OA_PASSWORD={}", read("OA_PASSWORD")),
        format!("COMPANY_LLM_BASE_URL={base}"),
        format!("COMPANY_LLM_MODEL={model}"),
        format!("COMPANY_LLM_API_KEY={}", read("COMPANY_LLM_API_KEY")),
        format!("NODE_PATH={}", read("NODE_PATH")),
    ];
    let path = crate::paths::env_conf_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match std::fs::write(&path, lines.join("\n") + "\n") {
        Ok(()) => CommandOutcome { ok: true, summary: "配置已保存，Skill 下次运行生效。".to_string() },
        Err(error) => CommandOutcome { ok: false, summary: format!("配置保存失败：{error}") },
    }
}

/// 邮件签名单独保存为 UTF-8 文本，支持多行且不混入凭证配置。
fn read_mail_signature_from(path: &std::path::Path) -> String {
    std::fs::read_to_string(path)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn write_mail_signature_to(path: &std::path::Path, value: &str) -> Result<(), String> {
    let signature = value.trim();
    if signature.is_empty() {
        return Err("邮件签名不能为空。".to_string());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::write(path, format!("{signature}\n")).map_err(|error| error.to_string())
}

pub fn read_mail_signature() -> String {
    read_mail_signature_from(&crate::paths::mail_signature_path())
}

pub fn write_mail_signature(value: &str) -> CommandOutcome {
    match write_mail_signature_to(&crate::paths::mail_signature_path(), value) {
        Ok(()) => CommandOutcome {
            ok: true,
            summary: "邮件签名已保存。".to_string(),
        },
        Err(error) => CommandOutcome {
            ok: false,
            summary: format!("邮件签名保存失败：{error}"),
        },
    }
}

fn run_skill_action(skill: &str, action: &str, args: &[String]) -> (bool, String, String, String) {
    let manifest = crate::manifest::load();
    let Some(resolved) = manifest.resolve_action(skill, action) else {
        let error = format!("未找到执行脚本：skill={skill} action={action}");
        log_action(skill, action, args, false, 0, &error, "unresolved-action", "", "");
        return (false, String::new(), String::new(), error);
    };
    let path = manifest.skills_root().join(&resolved.script);
    if !path.is_file() {
        let error = format!("未找到执行脚本：{}", path.display());
        log_action(skill, action, args, false, 0, &error, "script-missing", "", "");
        return (false, String::new(), String::new(), error);
    }
    let started = std::time::Instant::now();
    let result = crate::skill_runtime::run_with_timeout(&resolved.runner, &path, args, COMMAND_TIMEOUT_SECS, None);
    let duration_ms = started.elapsed().as_millis() as u64;
    let error = if result.ok {
        String::new()
    } else {
        extract_script_error(&result.stderr, &result.error)
    };
    log_action(skill, action, args, result.ok, duration_ms, &error, &result.error, &result.stdout, &result.stderr);
    (result.ok, result.stdout, result.stderr, error)
}

/// 写命令执行日志：落到 ~/.boss-jarvis/logs/actions.log，JSON Lines。
/// stdout/stderr 各截断保留 4000 字符，覆盖审批脚本全部 ERROR 明细与步骤输出。
fn log_action(
    skill: &str,
    action: &str,
    args: &[String],
    ok: bool,
    duration_ms: u64,
    error: &str,
    run_error: &str,
    stdout: &str,
    stderr: &str,
) {
    use crate::runtime_log::truncate_head;
    let entry = serde_json::json!({
        "time": crate::runtime_log::iso_now(),
        "skill": skill,
        "action": action,
        "ok": ok,
        "durationMs": duration_ms,
        "error": truncate_head(error, 800),
        "runError": run_error,
        "args": args,
        "stdout": truncate_head(stdout, 4000),
        "stderr": truncate_head(stderr, 4000),
    });
    crate::runtime_log::append_log_line("actions.log", &(entry.to_string() + "\n"));
}

/// 脚本把真正的失败原因写成 "ERROR: <原因>"（见 oa-todo/spm-todo approve 脚本）；
/// 其次有的脚本把 { "error": "..." } JSON 直接打到 stderr（如 skill-manager）；
/// 超时等运行层错误直接用运行层信息；
/// 其余非零退出取 stderr 尾部，避免界面只剩 "exit 1"。
fn extract_script_error(stderr: &str, fallback: &str) -> String {
    if let Some(line) = stderr.lines().rev().find(|line| line.trim_start().starts_with("ERROR:")) {
        return line.trim().trim_start_matches("ERROR:").trim().to_string();
    }
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(stderr.trim()) {
        if let Some(message) = value.get("error").and_then(|v| v.as_str()).map(str::trim).filter(|m| !m.is_empty()) {
            return message.to_string();
        }
    }
    let tail = stderr.trim();
    if tail.is_empty() {
        return fallback.to_string();
    }
    if fallback.is_empty() || fallback.starts_with("exit ") {
        return tail.to_string();
    }
    fallback.to_string()
}

fn json_field(stdout: &str, key: &str) -> Option<serde_json::Value> {
    serde_json::from_str::<serde_json::Value>(stdout).ok()?.get(key).cloned()
}

fn json_string(stdout: &str, key: &str) -> Option<String> {
    json_field(stdout, key)?.as_str().map(String::from)
}

pub(crate) fn record_audit(payload: serde_json::Value) {
    let manifest = crate::manifest::load();
    let Some(resolved) = manifest.resolve_action("audit-log", "record") else {
        return;
    };
    let script = manifest.skills_root().join(&resolved.script);
    let env = crate::skill_runtime::build_environment();
    let mut command = std::process::Command::new("node");
    command
        .arg(script)
        .arg("append")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    crate::skill_runtime::hide_child_console(&mut command);
    for (key, value) in &env {
        command.env(key, value);
    }
    if let Ok(mut child) = command.spawn() {
        {
            let stdin = child.stdin.take();
            if let Some(mut stdin) = stdin {
                let _ = stdin.write_all(payload.to_string().as_bytes());
            }
        }
        let _ = child.wait();
    }
}

fn audit_payload(
    skill: &str,
    action_type: &str,
    mode: &str,
    status: &str,
    target: &str,
    result_summary: &str,
    error: &str,
) -> serde_json::Value {
    serde_json::json!({
        "skill": skill,
        "actionType": action_type,
        "mode": mode,
        "status": status,
        "sourceSystem": "Boss Jarvis Tauri",
        "target": { "title": target },
        "resultSummary": result_summary,
        "error": error,
    })
}

/// OA/SPM 审批：详情弹层点击即是确认，直接真实执行并写审计。
pub fn approve_todo(
    skill: &str,
    title: &str,
    comment: &str,
    approve: bool,
    target_ref: Option<serde_json::Value>,
    source: Option<&str>,
    sender: Option<&str>,
    time: Option<&str>,
) -> CommandOutcome {
    if title.is_empty() {
        return failure(skill, "待办标题未获取，无法执行审批。");
    }
    let verb = if approve { "同意" } else { "不同意" };
    let action = if approve { "approve" } else { "reject" };
    let target_skill = if skill == "spm-todo" { "spm-todo" } else { "oa-todo" };
    let mut target = serde_json::Map::new();
    target.insert("title".to_string(), serde_json::json!(title));
    if let Some(value) = target_ref {
        if let Some(object) = value.as_object() {
            for (key, value) in object {
                target.insert(key.clone(), value.clone());
            }
        }
    }
    if let Some(value) = source.filter(|value| !value.trim().is_empty()) {
        target.insert("source".to_string(), serde_json::json!(value));
    }
    if let Some(value) = sender.filter(|value| !value.trim().is_empty()) {
        target.insert("sender".to_string(), serde_json::json!(value));
    }
    if let Some(value) = time.filter(|value| !value.trim().is_empty()) {
        target.insert("time".to_string(), serde_json::json!(value));
    }
    let target_json = serde_json::Value::Object(target).to_string();
    let args = vec![
        title.to_string(),
        comment.to_string(),
        action.to_string(),
        format!("--target-json={target_json}"),
        "--confirmed".to_string(),
    ];
    let (_ok, stdout, _stderr, error) = run_skill_action(target_skill, "approve", &args);
    // 脚本契约：reject 成功时 approved 恒为 false，processed 才是"已流转"的判定；
    // 早期只看 approved 会把成功的"不同意"误报为失败。
    let processed = json_field(&stdout, "processed").and_then(|v| v.as_bool()) == Some(true);
    let verified = json_field(&stdout, "verified").and_then(|v| v.as_bool()) == Some(true);
    let page_type = json_string(&stdout, "pageType").unwrap_or_else(|| "未获取".to_string());
    let verification_hint = json_string(&stdout, "verificationHint").unwrap_or_default();
    let submit_button = json_string(&stdout, "submitButton").unwrap_or_default();
    let outcome_ok = processed;
    let status = if outcome_ok { "success" } else { "failed" };
    let summary = if outcome_ok {
        let mut text = format!("审批已执行：{verb} · {page_type}");
        if !submit_button.is_empty() {
            text += &format!("（{submit_button}）");
        }
        if !verified {
            text += "；页面验证未完成，请重新获取待办确认状态";
        }
        text
    } else if !error.is_empty() {
        // 明细已在 actions.log；界面只给截断后的原因和日志位置，避免长堆栈撑破状态行。
        format!(
            "审批执行失败：{}（完整日志见 ~/.boss-jarvis/logs/actions.log）",
            crate::runtime_log::truncate_head(&error, 260)
        )
    } else if !verification_hint.is_empty() {
        format!("审批未完成：{verification_hint}")
    } else {
        format!("审批未完成：脚本未确认流转结果（{page_type}）")
    };
    record_audit(audit_payload(
        skill,
        "execute",
        "write_pending",
        status,
        title,
        &summary,
        if outcome_ok { "" } else { &error },
    ));
    CommandOutcome {
        ok: outcome_ok,
        summary,
    }
}

/// Skill 启停：必须由确认中心确认后调用，执行并写审计。
pub fn toggle_skill(skill_id: &str, enable: bool) -> CommandOutcome {
    if skill_id.is_empty() {
        return failure("skill-manager", "Skill 标识未获取，无法执行启停。");
    }
    let verb = if enable { "enable" } else { "disable" };
    let (ok, _stdout, _stderr, error) =
        run_skill_action("skill-manager", "manage", &[verb.to_string(), skill_id.to_string()]);
    let summary = if ok {
        format!("Skill 已{}：{skill_id}", if enable { "启用" } else { "停用" })
    } else {
        format!("Skill {skill_id} {verb} 失败：{error}")
    };
    record_audit(audit_payload(
        "skill-manager",
        "execute",
        "write_pending",
        if ok { "success" } else { "failed" },
        skill_id,
        &summary,
        if ok { "" } else { &error },
    ));
    CommandOutcome { ok, summary }
}

/// Skill 安装：确认中心确认后执行；安装并启用，失败也写审计。
pub fn install_skill(source: &str) -> CommandOutcome {
    if source.trim().is_empty() {
        return failure("skill-manager", "安装源目录未获取，无法安装。");
    }
    let (ok, stdout, _stderr, error) = run_skill_action(
        "skill-manager",
        "manage",
        &["install".to_string(), source.to_string(), "--enable".to_string()],
    );
    let name = json_field(&stdout, "skill")
        .and_then(|v| v.get("name").cloned())
        .and_then(|v| v.as_str().map(String::from))
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| source.to_string());
    let summary = if ok {
        format!("Skill 已安装并启用：{name}")
    } else {
        format!("Skill 安装失败：{error}")
    };
    record_audit(audit_payload(
        "skill-manager",
        "install",
        "write_pending",
        if ok { "success" } else { "failed" },
        source,
        &summary,
        if ok { "" } else { &error },
    ));
    CommandOutcome { ok, summary }
}

/// Skill 卸载：确认中心确认后执行；代码归档不删除，历史日志保留。
pub fn uninstall_skill(skill_id: &str) -> CommandOutcome {
    if skill_id.is_empty() {
        return failure("skill-manager", "Skill 标识未获取，无法卸载。");
    }
    let (ok, stdout, _stderr, error) = run_skill_action(
        "skill-manager",
        "manage",
        &["uninstall".to_string(), skill_id.to_string(), "--confirm".to_string()],
    );
    let archive = json_string(&stdout, "archiveDir").unwrap_or_else(|| "归档目录".to_string());
    let summary = if ok {
        format!("Skill 已卸载，代码归档至 {archive}")
    } else {
        format!("Skill 卸载失败：{error}")
    };
    record_audit(audit_payload(
        "skill-manager",
        "uninstall",
        "write_pending",
        if ok { "success" } else { "failed" },
        skill_id,
        &summary,
        if ok { "" } else { &error },
    ));
    CommandOutcome { ok, summary }
}

/// 邮件标记已读：通过 Coremail 只操作该封邮件，不依赖本地邮件客户端。
pub fn mark_mail_read(message_id: String) -> CommandOutcome {
    if message_id.trim().is_empty() {
        return failure(MAIL_SKILL_ID, "邮件标识未获取，无法标记已读。");
    }
    let (_ok, stdout, _stderr, error) = run_skill_action(
        MAIL_SKILL_ID,
        "mark-read",
        &[format!("--message-id={message_id}"), "--confirmed".to_string()],
    );
    let marked = json_field(&stdout, "markedRead").and_then(|v| v.as_bool()) == Some(true);
    let summary = if marked {
        "已同步为已读。".to_string()
    } else {
        format!("标记已读失败：{}", if error.is_empty() { "Coremail 未响应".to_string() } else { error.clone() })
    };
    record_audit(audit_payload(
        MAIL_SKILL_ID,
        "mark_read",
        "write_pending",
        if marked { "success" } else { "failed" },
        &format!("mail:{message_id}"),
        &summary,
        if marked { "" } else { &error },
    ));
    CommandOutcome { ok: marked, summary }
}

/// 邮件 Skill 标识：统一走 changhong-mail，不区分平台。
const MAIL_SKILL_ID: &str = "changhong-mail";

fn mail_argument(value: &str, flag: &str) -> String {
    format!("--{flag}={value}")
}

/// 邮件回复：生成草稿、加工签名后打开回复窗口；发送动作永远留在客户端由用户完成。
pub fn open_mail_reply(to: &str, subject: &str, body_summary: &str, reply_basis: &str, sender: &str) -> CommandOutcome {
    if to.is_empty() || subject.is_empty() {
        return failure(MAIL_SKILL_ID, "收件人或主题未获取，无法打开回复窗口。");
    }
    let draft_args = vec![
        mail_argument(subject, "subject"),
        mail_argument(body_summary, "body-summary"),
        mail_argument(reply_basis, "reply-basis"),
        mail_argument(sender, "sender"),
    ];
    let (draft_ok, draft_stdout, _draft_stderr, draft_error) =
        run_skill_action(MAIL_SKILL_ID, "generate-reply", &draft_args);
    let Some(draft_body) = json_string(&draft_stdout, "draftBody")
        .filter(|body| !body.is_empty())
    else {
        let summary = if draft_ok {
            "回复草稿生成失败：邮件 Skill 输出无法解析".to_string()
        } else {
            format!("回复草稿生成失败：{draft_error}")
        };
        record_audit(audit_payload(
            MAIL_SKILL_ID,
            "draft_reply",
            "draft_only",
            "failed",
            subject,
            &summary,
            &draft_error,
        ));
        return CommandOutcome { ok: false, summary };
    };

    let prepare_args = vec![
        mail_argument(to, "to"),
        mail_argument(subject, "subject"),
        mail_argument(&draft_body, "body"),
    ];
    let (prepare_ok, prepare_stdout, _prepare_stderr, prepare_error) =
        run_skill_action(MAIL_SKILL_ID, "prepare-reply", &prepare_args);
    let full_to = json_string(&prepare_stdout, "to").unwrap_or_else(|| to.to_string());
    let full_subject = json_string(&prepare_stdout, "subject").unwrap_or_else(|| subject.to_string());
    let full_body = json_string(&prepare_stdout, "body").unwrap_or(draft_body);
    if !prepare_ok {
        let summary = format!("回复草稿加工失败：{}", if prepare_error.is_empty() { "邮件 Skill 输出无法解析".to_string() } else { prepare_error.clone() });
        record_audit(audit_payload(
            MAIL_SKILL_ID,
            "draft_reply",
            "draft_only",
            "failed",
            subject,
            &summary,
            &prepare_error,
        ));
        return CommandOutcome { ok: false, summary };
    }

    let open_args = vec![
        mail_argument(&full_to, "to"),
        mail_argument(&full_subject, "subject"),
        mail_argument(&full_body, "body"),
        "--confirmed".to_string(),
    ];
    let (_open_ok, open_stdout, _open_stderr, open_error) =
        run_skill_action(MAIL_SKILL_ID, "open-reply", &open_args);
    let opened = json_field(&open_stdout, "opened").and_then(|v| v.as_bool()) == Some(true);
    let summary = if opened {
        "回复窗口已在邮件客户端打开，请核对后点击发送。".to_string()
    } else {
        format!("打开回复窗口失败：{}", if open_error.is_empty() { "邮件客户端未响应".to_string() } else { open_error.clone() })
    };
    record_audit(audit_payload(
        MAIL_SKILL_ID,
        "draft_reply",
        "draft_only",
        if opened { "success" } else { "failed" },
        subject,
        &summary,
        if opened { "" } else { &open_error },
    ));
    CommandOutcome { ok: opened, summary }
}

/// 定时巡检状态：只读，直接透传 manage-schedule.cjs status 的结构化结果。
pub fn schedule_status() -> Result<serde_json::Value, String> {
    let (ok, stdout, _stderr, error) =
        run_skill_action("daily-briefing", "schedule", &["status".to_string()]);
    if !ok {
        return Err(if error.is_empty() { "无法读取定时任务状态".to_string() } else { error });
    }
    parse_schedule_json(&stdout, "status")
}

/// 定时任务写操作：设置提醒时间或安装/重载/卸载 launchd 任务，调用前已由 UI 确认。
pub fn manage_schedule(action: &str, time: Option<&str>) -> Result<serde_json::Value, String> {
    let mut args = vec![action.to_string()];
    match action {
        "set-time" => {
            let time = time
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "缺少提醒时间".to_string())?;
            if !is_clock_time(time) {
                return Err(format!("提醒时间格式应为 HH:MM：{time}"));
            }
            args.push("--time".to_string());
            args.push(time.to_string());
        }
        "install" => args.push("--load".to_string()),
        "uninstall" => args.push("--unload".to_string()),
        "reload" | "status" => {}
        _ => return Err("未知的定时任务操作".to_string()),
    }
    let (ok, stdout, _stderr, error) = run_skill_action("daily-briefing", "schedule", &args);
    if !ok {
        return Err(if error.is_empty() { "定时任务操作失败".to_string() } else { error });
    }
    let parsed = parse_schedule_json(&stdout, action)?;
    if action != "status" {
        record_audit(audit_payload(
            "daily-briefing",
            "execute",
            "write_pending",
            "success",
            &format!("schedule:{action}"),
            "定时巡检配置已更新",
            "",
        ));
    }
    Ok(parsed)
}

fn is_clock_time(value: &str) -> bool {
    let Some((hour, minute)) = value.split_once(':') else {
        return false;
    };
    if hour.is_empty()
        || minute.len() != 2
        || !hour.bytes().all(|byte| byte.is_ascii_digit())
        || !minute.bytes().all(|byte| byte.is_ascii_digit())
    {
        return false;
    }
    let hour = hour.parse::<u32>().unwrap_or(99);
    let minute = minute.parse::<u32>().unwrap_or(99);
    hour <= 23 && minute <= 59
}

fn parse_schedule_json(stdout: &str, action: &str) -> Result<serde_json::Value, String> {
    serde_json::from_str::<serde_json::Value>(stdout)
        .map_err(|error| format!("定时任务输出无法解析（{action}）：{error}"))
}

fn failure(_skill: &str, message: &str) -> CommandOutcome {
    CommandOutcome {
        ok: false,
        summary: message.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{extract_script_error, read_mail_signature_from, write_mail_signature_to};

    #[test]
    fn mail_signature_round_trips_multiline_text() {
        let path = std::env::temp_dir().join(format!(
            "boss-jarvis-mail-signature-{}-{}.txt",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("系统时间应晚于 UNIX epoch")
                .as_nanos(),
        ));
        let _ = std::fs::remove_file(&path);
        write_mail_signature_to(&path, "第一行\n\n第二行").expect("邮件签名应可写入");
        assert_eq!(read_mail_signature_from(&path), "第一行\n\n第二行");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn mail_signature_rejects_empty_text() {
        let path = std::env::temp_dir().join("boss-jarvis-empty-mail-signature.txt");
        assert_eq!(
            write_mail_signature_to(&path, "  \n "),
            Err("邮件签名不能为空。".to_string()),
        );
    }

    #[test]
    fn prefers_last_error_line_from_stderr() {
        // 审批脚本：步骤输出在前，失败原因以 "ERROR:" 落最后一行。
        let stderr = "🔄 打开 OA 首页\n🔄 启动浏览器\nERROR: OA首页待办表格加载超时\n    at main (...approve-todo.cjs:648:1)";
        assert_eq!(extract_script_error(stderr, "exit 1"), "OA首页待办表格加载超时");
    }

    #[test]
    fn falls_back_to_stderr_tail_when_no_error_marker() {
        let stderr = "playwright: browser exited unexpectedly\n";
        assert_eq!(
            extract_script_error(stderr, "exit 1"),
            "playwright: browser exited unexpectedly"
        );
    }

    #[test]
    fn timeout_message_wins_over_empty_stderr() {
        let fallback = "脚本执行超时（150 秒），已终止";
        assert_eq!(extract_script_error("", fallback), fallback);
    }

    #[test]
    fn parses_json_error_envelope_from_stderr() {
        // skill-manager 等脚本失败时把 { "error": "..." } 整段打到 stderr。
        let stderr = "{\n  \"ok\": false,\n  \"error\": \"Skill 不存在：__x__\"\n}";
        assert_eq!(extract_script_error(stderr, "exit 1"), "Skill 不存在：__x__");
    }
}
