mod manifest;
mod paths;
mod skill_runtime;
mod command_runtime;
mod llm_runtime;

/// 晨报产物由 daily-briefing 巡检写到 ~/.codex/workbench-reports/latest/，
/// 壳层只读该文件，不解释巡检 stdout。
#[tauri::command]
async fn read_daily_briefing_report() -> Option<String> {
    tauri::async_runtime::spawn_blocking(read_daily_briefing_report_sync)
        .await
        .ok()
        .flatten()
}

fn read_daily_briefing_report_sync() -> Option<String> {
    let path = paths::home_dir()?
        .join(".codex")
        .join("workbench-reports")
        .join("latest")
        .join("boss-cockpit.json");
    std::fs::read_to_string(path).ok()
}

/// 集成测试辅助：让 tests/ 复用与命令面相同的取数链路。
pub fn fetch_skill_for_integration(skill: &str) -> skill_runtime::FetchOutcome {
    skill_runtime::fetch_skill(manifest::load_cached(), skill)
}

pub fn fetch_skills_for_integration(skills: &[String]) -> Vec<skill_runtime::FetchOutcome> {
    skill_runtime::fetch_skills(manifest::load_cached(), skills)
}

pub fn data_dir_for_integration() -> std::path::PathBuf {
    skill_runtime::data_dir()
}

pub fn read_daily_briefing_report_for_integration() -> Option<String> {
    read_daily_briefing_report_sync()
}

pub fn weekly_summary_dates_for_integration() -> Vec<String> {
    weekly_summary_dates_sync()
}

pub fn read_weekly_summary_archive_for_integration(date: String) -> Option<String> {
    read_weekly_summary_archive_sync(date)
}

pub fn toggle_skill_for_integration(skill_id: &str, enable: bool) -> command_runtime::CommandOutcome {
    command_runtime::toggle_skill(skill_id, enable)
}

pub fn install_skill_for_integration(source: &str) -> command_runtime::CommandOutcome {
    command_runtime::install_skill(source)
}

pub fn uninstall_skill_for_integration(skill_id: &str) -> command_runtime::CommandOutcome {
    command_runtime::uninstall_skill(skill_id)
}

#[tauri::command]
async fn data_dir() -> String {
    tauri::async_runtime::spawn_blocking(|| {
        skill_runtime::data_dir().to_string_lossy().into_owned()
    })
    .await
    .unwrap_or_default()
}

/// 顶栏“放大/还原”：等价 legacy 的 NSApp.keyWindow.zoom(nil)。
#[tauri::command]
fn toggle_maximize(window: tauri::WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

/// Skill 安装源目录选择：双端原生目录选择器，选中的路径交确认中心确认。
#[tauri::command]
async fn select_skill_directory(window: tauri::WebviewWindow) -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel::<Option<String>>();
    let result = window.run_on_main_thread(move || {
        let picked = rfd::FileDialog::new()
            .set_title("选择包含 SKILL.md 的 Skill 目录")
            .pick_folder()
            .map(|path| path.to_string_lossy().into_owned());
        let _ = tx.send(picked);
    });
    if result.is_err() {
        return None;
    }
    rx.recv().ok().flatten()
}

#[tauri::command]
async fn fetch_skill(skill: String) -> Result<skill_runtime::FetchOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manifest = manifest::load();
        skill_runtime::fetch_skill(&manifest, &skill)
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn fetch_skills(skills: Vec<String>) -> Result<Vec<skill_runtime::FetchOutcome>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manifest = manifest::load_cached();
        let mut ids: Vec<String> = manifest
            .fetch_task_ids()
            .into_iter()
            .filter(|id| skills.contains(id))
            .collect();
        if ids.is_empty() {
            ids = skills;
        }
        skill_runtime::fetch_skills(manifest, &ids)
    })
    .await
    .map_err(|error| error.to_string())
}

/// 手动/自动刷新使用：执行 manifest 中全部取数任务，壳层按当前分区回读。
#[tauri::command]
async fn fetch_all_skills() -> Result<Vec<skill_runtime::FetchOutcome>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manifest = manifest::load_cached();
        let ids = manifest.fetch_task_ids();
        skill_runtime::fetch_skills(manifest, &ids)
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn read_skill_data(skill: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = skill_runtime::data_dir().join(format!("{skill}.json"));
        std::fs::read(path)
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
    })
    .await
    .ok()
    .flatten()
}

/// 历史周报存档：~/.boss-jarvis/data/weekly-summary/yyyy-MM-dd.json，倒序。
#[tauri::command]
async fn weekly_summary_dates() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(weekly_summary_dates_sync)
        .await
        .unwrap_or_default()
}

fn weekly_summary_dates_sync() -> Vec<String> {
    let dir = skill_runtime::data_dir().join("weekly-summary");
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dates: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                return None;
            }
            path.file_stem().and_then(|stem| stem.to_str().map(String::from))
        })
        .filter(|date| date.len() == 10 && date.as_bytes().get(4) == Some(&b'-'))
        .collect();
    dates.sort_by(|a, b| b.cmp(a));
    dates
}

#[tauri::command]
async fn read_weekly_summary_archive(date: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || read_weekly_summary_archive_sync(date))
        .await
        .ok()
        .flatten()
}

fn read_weekly_summary_archive_sync(date: String) -> Option<String> {
    if date.len() != 10 || !date.bytes().all(|b| b.is_ascii_digit() || b == b'-') {
        return None;
    }
    let path = skill_runtime::data_dir().join("weekly-summary").join(format!("{date}.json"));
    std::fs::read_to_string(path).ok()
}

/// 审计留痕：~/.codex/workbench-audit/yyyy-MM-dd/audit.jsonl，只读。
#[tauri::command]
async fn audit_log_dates() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(audit_log_dates_sync)
        .await
        .unwrap_or_default()
}

fn audit_log_dates_sync() -> Vec<String> {
    let root = match paths::home_dir() {
        Some(home) => home.join(".codex").join("workbench-audit"),
        None => return Vec::new(),
    };
    let Ok(entries) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    let mut dates: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| {
            name.len() == 10
                && name.as_bytes().get(4) == Some(&b'-')
                && name.as_bytes().get(7) == Some(&b'-')
                && name.bytes().all(|byte| byte.is_ascii_digit() || byte == b'-')
        })
        .collect();
    dates.sort_by(|a, b| b.cmp(a));
    dates
}

#[tauri::command]
async fn read_audit_log(date: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || read_audit_log_sync(date))
        .await
        .ok()
        .flatten()
}

fn read_audit_log_sync(date: String) -> Option<String> {
    if date.len() != 10 || !date.bytes().all(|byte| byte.is_ascii_digit() || byte == b'-') {
        return None;
    }
    let path = paths::home_dir()?
        .join(".codex")
        .join("workbench-audit")
        .join(&date)
        .join("audit.jsonl");
    std::fs::read_to_string(path).ok()
}

#[tauri::command]
async fn approve_todo(skill: String, title: String, comment: String, approve: bool) -> Result<command_runtime::CommandOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        command_runtime::approve_todo(&skill, &title, &comment, approve)
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn toggle_skill(skill_id: String, enable: bool) -> Result<command_runtime::CommandOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        command_runtime::toggle_skill(&skill_id, enable)
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn install_skill(source: String) -> Result<command_runtime::CommandOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        command_runtime::install_skill(&source)
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn uninstall_skill(skill_id: String) -> Result<command_runtime::CommandOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        command_runtime::uninstall_skill(&skill_id)
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn mark_mail_read(message_id: i64) -> Result<command_runtime::CommandOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        command_runtime::mark_mail_read(message_id)
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_mail_reply(
    to: String,
    subject: String,
    body_summary: String,
    reply_basis: String,
    sender: String,
) -> Result<command_runtime::CommandOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        command_runtime::open_mail_reply(&to, &subject, &body_summary, &reply_basis, &sender)
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn read_skill_env() -> std::collections::HashMap<String, String> {
    tauri::async_runtime::spawn_blocking(command_runtime::read_skill_env)
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn write_skill_env(values: std::collections::HashMap<String, String>) -> Result<command_runtime::CommandOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || command_runtime::write_skill_env(&values))
        .await
        .map_err(|error| error.to_string())
}

/// 助手模型调用：OpenAI 兼容 chat/completions；凭证从 skill-env 读取，不经过前端。
#[tauri::command]
async fn llm_chat(messages: Vec<serde_json::Value>, tools: Vec<serde_json::Value>) -> llm_runtime::LlmChatOutcome {
    let env = command_runtime::read_skill_env();
    let read = |key: &str| env.get(key).cloned().unwrap_or_default();
    let model = {
        let value = read("COMPANY_LLM_MODEL");
        if value.is_empty() { "qwen3.7-plus".to_string() } else { value }
    };
    let client = llm_runtime::CompanyLlmClient {
        base_url: read("COMPANY_LLM_BASE_URL"),
        api_key: read("COMPANY_LLM_API_KEY"),
        model,
    };
    client
        .chat(llm_runtime::LlmChatArgs { messages, tools })
        .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            data_dir,
            toggle_maximize,
            select_skill_directory,
            fetch_skills,
            fetch_all_skills,
            fetch_skill,
            read_skill_data,
            read_daily_briefing_report,
            weekly_summary_dates,
            read_weekly_summary_archive,
            audit_log_dates,
            read_audit_log,
            approve_todo,
            toggle_skill,
            install_skill,
            uninstall_skill,
            mark_mail_read,
            open_mail_reply,
            read_skill_env,
            write_skill_env,
            llm_chat
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
