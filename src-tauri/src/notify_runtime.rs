/// Dock 角标入口：显示“今日紧急优先”条数（mustDoNow），0 或空则清除。
/// macOS 通过 AppKit 设置 Dock 数字角标；Windows 不显示任务栏角标。

#[tauri::command]
pub async fn set_dock_badge(app: tauri::AppHandle, count: Option<i64>) -> Result<(), String> {
    set_dock_badge_inner(&app, count)
}

#[cfg(target_os = "macos")]
fn set_dock_badge_inner(app: &tauri::AppHandle, count: Option<i64>) -> Result<(), String> {
    let label = match count {
        Some(value) if value > 0 => Some(value.to_string()),
        _ => None,
    };
    app.run_on_main_thread(move || {
        if let Some(marker) = objc2::MainThreadMarker::new() {
            let ns_app = objc2_app_kit::NSApplication::sharedApplication(marker);
            let dock_tile = ns_app.dockTile();
            let badge = label.as_deref().map(objc2_foundation::NSString::from_str);
            dock_tile.setBadgeLabel(badge.as_deref());
        }
    })
    .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "macos"))]
fn set_dock_badge_inner(_app: &tauri::AppHandle, _count: Option<i64>) -> Result<(), String> {
    Ok(())
}
