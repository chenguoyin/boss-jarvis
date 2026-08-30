//! 运行日志落盘工具：取数（fetch.log）与写命令（actions.log）共用。
//! 日志目录 ~/.boss-jarvis/logs/，单文件上限 2MB，超限归档一代（*.1）。
use std::path::{Path, PathBuf};

pub const LOG_MAX_BYTES: u64 = 2 * 1024 * 1024;

/// 追加一行日志；目录缺失自动创建，写失败静默忽略（日志不阻断主流程）。
pub fn append_log_line(file_name: &str, line: &str) {
    let dir = crate::paths::logs_dir();
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join(file_name);
    rotate_log_if_needed(&path);
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        use std::io::Write;
        let _ = file.write_all(line.as_bytes());
    }
}

fn rotate_log_if_needed(path: &Path) {
    let Ok(meta) = std::fs::metadata(path) else {
        return;
    };
    if meta.len() <= LOG_MAX_BYTES {
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

/// 日志内字符串截断：保留头部（ERROR 行通常在最前），按字符边界截。
pub fn truncate_head(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &s[..end])
}

/// UTC ISO8601（秒级）时间戳；与审计/取数日志口径一致。
pub fn iso_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86400;
    let rem = secs % 86400;
    let (h, mi, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
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
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m, d, h, mi, s)
}
