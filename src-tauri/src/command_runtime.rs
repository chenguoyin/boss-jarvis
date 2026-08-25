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

fn run_skill_action(skill: &str, action: &str, args: &[String]) -> (bool, String, String, String) {
    let manifest = crate::manifest::load();
    let Some(resolved) = manifest.resolve_action(skill, action) else {
        return (false, String::new(), String::new(), "未找到执行脚本".to_string());
    };
    let path = manifest.skills_root().join(&resolved.script);
    if !path.is_file() {
        return (false, String::new(), String::new(), "未找到执行脚本".to_string());
    }
    let result = crate::skill_runtime::run_with_timeout(&resolved.runner, &path, args, COMMAND_TIMEOUT_SECS);
    let error = if result.ok {
        String::new()
    } else if !result.stderr.is_empty() {
        result.stderr.clone()
    } else {
        result.error.clone()
    };
    (result.ok, result.stdout, result.stderr, error)
}

fn json_field(stdout: &str, key: &str) -> Option<serde_json::Value> {
    serde_json::from_str::<serde_json::Value>(stdout).ok()?.get(key).cloned()
}

fn json_string(stdout: &str, key: &str) -> Option<String> {
    json_field(stdout, key)?.as_str().map(String::from)
}

fn record_audit(payload: serde_json::Value) {
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
pub fn approve_todo(skill: &str, title: &str, comment: &str, approve: bool) -> CommandOutcome {
    if title.is_empty() {
        return failure(skill, "待办标题未获取，无法执行审批。");
    }
    let verb = if approve { "同意" } else { "不同意" };
    let action = if approve { "approve" } else { "reject" };
    let target_skill = if skill == "spm-todo" { "spm-todo" } else { "oa-todo" };
    let args = vec![
        title.to_string(),
        comment.to_string(),
        action.to_string(),
        "--confirmed".to_string(),
    ];
    let (_ok, stdout, _stderr, error) = run_skill_action(target_skill, "approve", &args);
    let approved = json_field(&stdout, "approved").and_then(|v| v.as_bool()) == Some(true);
    let verified = json_field(&stdout, "verified").and_then(|v| v.as_bool()) == Some(true);
    let page_type = json_string(&stdout, "pageType").unwrap_or_else(|| "未获取".to_string());
    let status = if approved && verified {
        "success"
    } else if approved {
        "success"
    } else {
        "failed"
    };
    let summary = if approved && verified {
        format!("审批已提交并验证：{verb} · {page_type}")
    } else if approved {
        format!("审批已提交，验证未完成：{page_type}")
    } else {
        format!("审批执行失败：{}", if error.is_empty() { page_type.clone() } else { error.clone() })
    };
    let outcome_ok = approved;
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

/// 邮件标记已读：只操作该封邮件，不发送任何内容。
pub fn mark_mail_read(message_id: i64) -> CommandOutcome {
    if message_id <= 0 {
        return failure("company-mail", "邮件标识未获取，无法标记已读。");
    }
    let (_ok, stdout, _stderr, error) = run_skill_action(
        "company-mail",
        "mark-read",
        &[format!("--message-id={message_id}"), "--confirmed".to_string()],
    );
    let marked = json_field(&stdout, "markedRead").and_then(|v| v.as_bool()) == Some(true);
    let summary = if marked {
        "已同步为已读。".to_string()
    } else {
        format!("标记已读失败：{}", if error.is_empty() { "邮件客户端未响应".to_string() } else { error.clone() })
    };
    record_audit(audit_payload(
        "company-mail",
        "mark_read",
        "write_pending",
        if marked { "success" } else { "failed" },
        &format!("mail:{message_id}"),
        &summary,
        if marked { "" } else { &error },
    ));
    CommandOutcome { ok: marked, summary }
}

fn mail_argument(value: &str, flag: &str) -> String {
    format!("--{flag}={value}")
}

/// 邮件回复：生成草稿、加工签名后打开回复窗口；发送动作永远留在客户端由用户完成。
pub fn open_mail_reply(to: &str, subject: &str, body_summary: &str, reply_basis: &str, sender: &str) -> CommandOutcome {
    if to.is_empty() || subject.is_empty() {
        return failure("company-mail", "收件人或主题未获取，无法打开回复窗口。");
    }
    let draft_args = vec![
        mail_argument(subject, "subject"),
        mail_argument(body_summary, "body-summary"),
        mail_argument(reply_basis, "reply-basis"),
        mail_argument(sender, "sender"),
    ];
    let (draft_ok, draft_stdout, _draft_stderr, draft_error) =
        run_skill_action("company-mail", "generate-reply", &draft_args);
    let Some(draft_body) = json_string(&draft_stdout, "draftBody")
        .filter(|body| !body.is_empty())
    else {
        let summary = if draft_ok {
            "回复草稿生成失败：company-mail 输出无法解析".to_string()
        } else {
            format!("回复草稿生成失败：{draft_error}")
        };
        record_audit(audit_payload(
            "company-mail",
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
        run_skill_action("company-mail", "prepare-reply", &prepare_args);
    let full_to = json_string(&prepare_stdout, "to").unwrap_or_else(|| to.to_string());
    let full_subject = json_string(&prepare_stdout, "subject").unwrap_or_else(|| subject.to_string());
    let full_body = json_string(&prepare_stdout, "body").unwrap_or(draft_body);
    if !prepare_ok {
        let summary = format!("回复草稿加工失败：{}", if prepare_error.is_empty() { "company-mail 输出无法解析".to_string() } else { prepare_error.clone() });
        record_audit(audit_payload(
            "company-mail",
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
        run_skill_action("company-mail", "open-reply", &open_args);
    let opened = json_field(&open_stdout, "opened").and_then(|v| v.as_bool()) == Some(true);
    let summary = if opened {
        "回复窗口已在邮件客户端打开，请核对后点击发送。".to_string()
    } else {
        format!("打开回复窗口失败：{}", if open_error.is_empty() { "邮件客户端未响应".to_string() } else { open_error.clone() })
    };
    record_audit(audit_payload(
        "company-mail",
        "draft_reply",
        "draft_only",
        if opened { "success" } else { "failed" },
        subject,
        &summary,
        if opened { "" } else { &open_error },
    ));
    CommandOutcome { ok: opened, summary }
}

fn failure(_skill: &str, message: &str) -> CommandOutcome {
    CommandOutcome {
        ok: false,
        summary: message.to_string(),
    }
}
