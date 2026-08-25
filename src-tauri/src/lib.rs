mod manifest;
mod paths;
mod skill_runtime;
mod command_runtime;

/// 晨报产物由 daily-briefing 巡检写到 ~/.codex/workbench-reports/latest/，
/// 壳层只读该文件，不解释巡检 stdout。
#[tauri::command]
fn read_daily_briefing_report() -> Option<String> {
    let path = paths::home_dir()?
        .join(".codex")
        .join("workbench-reports")
        .join("latest")
        .join("boss-cockpit.json");
    std::fs::read_to_string(path).ok()
}

/// 集成测试辅助：让 tests/ 复用与命令面相同的取数链路。
pub fn fetch_skill_for_integration(skill: &str) -> skill_runtime::FetchOutcome {
    skill_runtime::fetch_skill(&manifest::load(), skill)
}

pub fn data_dir_for_integration() -> std::path::PathBuf {
    skill_runtime::data_dir()
}

pub fn read_daily_briefing_report_for_integration() -> Option<String> {
    read_daily_briefing_report()
}

pub fn weekly_summary_dates_for_integration() -> Vec<String> {
    weekly_summary_dates()
}

pub fn read_weekly_summary_archive_for_integration(date: String) -> Option<String> {
    read_weekly_summary_archive(date)
}

pub fn toggle_skill_for_integration(skill_id: &str, enable: bool) -> command_runtime::CommandOutcome {
    command_runtime::toggle_skill(skill_id, enable)
}

#[tauri::command]
fn data_dir() -> String {
    skill_runtime::data_dir().to_string_lossy().into_owned()
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

#[tauri::command]
fn fetch_skill(skill: String) -> skill_runtime::FetchOutcome {
    let manifest = manifest::load();
    skill_runtime::fetch_skill(&manifest, &skill)
}

#[tauri::command]
fn fetch_skills(skills: Vec<String>) -> Vec<skill_runtime::FetchOutcome> {
    let manifest = manifest::load();
    manifest
        .fetch_tasks()
        .into_iter()
        .filter(|task| skills.contains(&task.id))
        .map(|task| skill_runtime::fetch_skill(&manifest, &task.id))
        .collect()
}

/// 手动/自动刷新使用：执行 manifest 中全部取数任务，壳层按当前分区回读。
#[tauri::command]
fn fetch_all_skills() -> Vec<skill_runtime::FetchOutcome> {
    let manifest = manifest::load();
    manifest
        .fetch_tasks()
        .into_iter()
        .map(|task| skill_runtime::fetch_skill(&manifest, &task.id))
        .collect()
}

#[tauri::command]
fn read_skill_data(skill: String) -> Option<String> {
    let path = skill_runtime::data_dir().join(format!("{}.json", skill));
    std::fs::read_to_string(path).ok()
}

/// 历史周报存档：~/.boss-jarvis/data/weekly-summary/yyyy-MM-dd.json，倒序。
#[tauri::command]
fn weekly_summary_dates() -> Vec<String> {
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
fn read_weekly_summary_archive(date: String) -> Option<String> {
    if date.len() != 10 || !date.bytes().all(|b| b.is_ascii_digit() || b == b'-') {
        return None;
    }
    let path = skill_runtime::data_dir().join("weekly-summary").join(format!("{date}.json"));
    std::fs::read_to_string(path).ok()
}

/// 审计留痕：~/.codex/workbench-audit/yyyy-MM-dd/audit.jsonl，只读。
#[tauri::command]
fn audit_log_dates() -> Vec<String> {
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
fn read_audit_log(date: String) -> Option<String> {
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
fn approve_todo(skill: String, title: String, comment: String, approve: bool) -> command_runtime::CommandOutcome {
    command_runtime::approve_todo(&skill, &title, &comment, approve)
}

#[tauri::command]
fn toggle_skill(skill_id: String, enable: bool) -> command_runtime::CommandOutcome {
    command_runtime::toggle_skill(&skill_id, enable)
}

#[tauri::command]
fn mark_mail_read(message_id: i64) -> command_runtime::CommandOutcome {
    command_runtime::mark_mail_read(message_id)
}

#[tauri::command]
fn open_mail_reply(
    to: String,
    subject: String,
    body_summary: String,
    reply_basis: String,
    sender: String,
) -> command_runtime::CommandOutcome {
    command_runtime::open_mail_reply(&to, &subject, &body_summary, &reply_basis, &sender)
}

#[tauri::command]
fn read_skill_env() -> std::collections::HashMap<String, String> {
    command_runtime::read_skill_env()
}

#[tauri::command]
fn write_skill_env(values: std::collections::HashMap<String, String>) -> command_runtime::CommandOutcome {
    command_runtime::write_skill_env(&values)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            data_dir,
            toggle_maximize,
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
            mark_mail_read,
            open_mail_reply,
            read_skill_env,
            write_skill_env
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
