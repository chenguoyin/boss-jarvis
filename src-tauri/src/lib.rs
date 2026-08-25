use std::path::PathBuf;

// 数据目录：macOS ~/.boss-jarvis/data/，Windows %USERPROFILE%.boss-jarvisdata。
// 平台差异仅收敛在路径抽象，业务逻辑不复制。
pub fn boss_jarvis_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("BOSS_JARVIS_DATA_DIR") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    home_dir()
        .map(|h| h.join(".boss-jarvis").join("data"))
        .unwrap_or_else(|| PathBuf::from(".boss-jarvis").join("data"))
}

fn home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

#[tauri::command]
fn data_dir() -> String {
    boss_jarvis_data_dir().to_string_lossy().into_owned()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![data_dir])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
