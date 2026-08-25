use std::path::PathBuf;

// 数据目录：macOS ~/.boss-jarvis/data/，Windows %USERPROFILE%\.boss-jarvis\data\。
// 平台差异只收敛在路径抽象，业务逻辑不复制。
pub fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("BOSS_JARVIS_DATA_DIR") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    home_dir()
        .map(|h| h.join(".boss-jarvis").join("data"))
        .unwrap_or_else(|| PathBuf::from(".boss-jarvis").join("data"))
}

pub fn logs_dir() -> PathBuf {
    home_dir()
        .map(|h| h.join(".boss-jarvis").join("logs"))
        .unwrap_or_else(|| PathBuf::from(".boss-jarvis").join("logs"))
}

pub fn env_conf_path() -> PathBuf {
    home_dir()
        .map(|h| h.join(".boss-jarvis").join("skill-env.conf"))
        .unwrap_or_else(|| PathBuf::from("skill-env.conf"))
}

pub fn home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

/// 展开 ~ 前缀；skills/manifest.json 的 skillsRoot 使用它。
pub fn expand_tilde(input: &str) -> PathBuf {
    if input == "~" {
        return home_dir().unwrap_or_else(|| PathBuf::from(input));
    }
    if let Some(rest) = input.strip_prefix("~/") {
        if let Some(home) = home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(input)
}
