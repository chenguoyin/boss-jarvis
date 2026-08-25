mod manifest;
mod paths;
mod skill_runtime;

/// 集成测试辅助：让 tests/ 复用与命令面相同的取数链路。
pub fn fetch_skill_for_integration(skill: &str) -> skill_runtime::FetchOutcome {
    skill_runtime::fetch_skill(&manifest::load(), skill)
}

pub fn data_dir_for_integration() -> std::path::PathBuf {
    skill_runtime::data_dir()
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            data_dir,
            fetch_skills,
            fetch_skill,
            read_skill_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
