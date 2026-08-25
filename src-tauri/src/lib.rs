mod manifest;
mod paths;
mod skill_runtime;

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

#[tauri::command]
fn data_dir() -> String {
    skill_runtime::data_dir().to_string_lossy().into_owned()
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            data_dir,
            fetch_skills,
            fetch_skill,
            read_skill_data,
            read_daily_briefing_report,
            weekly_summary_dates,
            read_weekly_summary_archive,
            audit_log_dates,
            read_audit_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
