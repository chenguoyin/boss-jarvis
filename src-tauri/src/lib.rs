mod manifest;
mod paths;
mod skill_runtime;
mod command_runtime;
mod hongyi_dashboard;
mod hongyi_embed;
mod runtime_log;
mod notify_runtime;
mod llm_runtime;

use std::sync::Arc;
use crate::notify_runtime::set_dock_badge;

/// 打开虹翼数智「部门看板」：新建/复用专用 WebView 窗口，自动完成 OA 单点并导航到看板。
/// 详情与链路事实见 docs/hongyi-dashboard-in-app.md；实现见 hongyi_dashboard.rs。
#[tauri::command]
async fn open_hongyi_dashboard(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || hongyi_dashboard::open(&app))
        .await
        .map_err(|error| error.to_string())?
}

/// 在 App 主窗口内容区嵌入显示配置的虹翼 URL 页面（子 WebView 自跑 OA 单点后整页直达，
/// 实现见 hongyi_embed.rs；URL 通过系统配置 HONGYI_EXTERNAL_URL 覆盖，默认部门看板）。
#[tauri::command]
async fn open_hongyi_in_app(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || hongyi_embed::open_in_app(&app))
        .await
        .map_err(|error| error.to_string())?
}

/// 前端上报「虹翼外链」分区内容区占位左上角（CSS 逻辑 px）：面板窗口据此精确贴位，
/// 与 skill 管理页等内容页布局对齐（2026-09-02 用户要求）。
#[tauri::command]
fn hongyi_embed_set_slot(left: f64, top: f64) -> Result<(), String> {
    hongyi_embed::set_slot(left, top)
}

/// 关闭 App 主窗口内嵌的虹翼页面（隐藏子 WebView；切换分区时由前端调用）。
#[tauri::command]
fn close_hongyi_embed(app: tauri::AppHandle) -> Result<(), String> {
    hongyi_embed::close_in_app_impl(&app)
}

/// 地址栏跳转：内嵌子 WebView 直达同源目标（会话有效则直接导航，失效则先补跑 OA 单点）。
#[tauri::command]
async fn hongyi_embed_navigate(app: tauri::AppHandle, target: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || hongyi_embed::navigate_to(&app, &target))
        .await
        .map_err(|error| error.to_string())?
}

/// 内嵌子 WebView 当前实际 URL（地址栏同步用）。
#[tauri::command]
fn hongyi_embed_current_url(app: tauri::AppHandle) -> Option<String> {
    hongyi_embed::current_url(&app)
}

/// 刷新内嵌的虹翼页面。
#[tauri::command]
fn hongyi_embed_reload(app: tauri::AppHandle) -> Result<(), String> {
    hongyi_embed::reload_embed(&app)
}

/// 使用 Playwright 打开虹翼系统（带认证）
#[tauri::command]
async fn open_hongyi_with_auth() -> Result<(), String> {
    // 脚本随 skills 根目录解析（exe 同级 skills/ > 环境变量 > manifest skillsRoot），
    // 不写死 ~/.codex/skills 这类 home 路径，Windows 便携运行同样成立。
    let script_path = manifest::load_cached()
        .skills_root()
        .join("hongyi-external/open-with-playwright.cjs");
    if !script_path.is_file() {
        return Err(format!(
            "找不到 hongyi-external/open-with-playwright.cjs（skills 根目录 {}）",
            script_path.display()
        ));
    }

    // 使用 Playwright 打开虹翼系统
    std::process::Command::new("node")
        .arg(&script_path)
        .spawn()
        .map_err(|e| format!("启动 Playwright 失败: {}", e))?;

    Ok(())
}

fn fetch_progress_callback(
    app: tauri::AppHandle,
) -> skill_runtime::ProgressCallback {
    use tauri::Emitter;
    // 壳层事件契约：payload 必须是 { skill, label, phase } 对象（useSkillData 按字段解构），
    // 不能发元组，否则前端解构不出、页面刷新按钮前方不显示实时步骤。
    Arc::new(move |skill: String, label: String, phase: String, _detail: String| {
        let _ = app.emit(
            "skill-fetch-progress",
            skill_runtime::FetchProgress { skill, label, phase },
        );
    })
}

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
async fn fetch_skills(
    app: tauri::AppHandle,
    skills: Vec<String>,
) -> Result<Vec<skill_runtime::FetchOutcome>, String> {
    let progress = fetch_progress_callback(app);
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
        skill_runtime::fetch_skills_tracked(manifest, &ids, Some(progress))
    })
    .await
    .map_err(|error| error.to_string())
}

/// 手动/自动刷新使用：执行 manifest 中全部取数任务，壳层按当前分区回读。
#[tauri::command]
async fn fetch_all_skills(
    app: tauri::AppHandle,
) -> Result<Vec<skill_runtime::FetchOutcome>, String> {
    let progress = fetch_progress_callback(app);
    tauri::async_runtime::spawn_blocking(move || {
        let manifest = manifest::load_cached();
        let ids = manifest.fetch_task_ids();
        skill_runtime::fetch_skills_tracked(manifest, &ids, Some(progress))
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
async fn approve_todo(
    skill: String,
    title: String,
    comment: String,
    approve: bool,
    target_ref: Option<serde_json::Value>,
    source: Option<String>,
    sender: Option<String>,
    time: Option<String>,
) -> Result<command_runtime::CommandOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        command_runtime::approve_todo(
            &skill,
            &title,
            &comment,
            approve,
            target_ref,
            source.as_deref(),
            sender.as_deref(),
            time.as_deref(),
        )
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
async fn mark_mail_read(message_id: String) -> Result<command_runtime::CommandOutcome, String> {
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

#[tauri::command]
async fn read_mail_signature() -> String {
    tauri::async_runtime::spawn_blocking(command_runtime::read_mail_signature)
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn write_mail_signature(value: String) -> Result<command_runtime::CommandOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || command_runtime::write_mail_signature(&value))
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

/// 定时巡检/提醒管理：读状态与写操作都走 daily-briefing 的 manage-schedule.cjs。
#[tauri::command]
async fn schedule_status() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(command_runtime::schedule_status)
        .await
        .map_err(|error| error.to_string())?
}

/// 写操作（set-time / install / reload / uninstall）必须经设置页确认后调用。
#[tauri::command]
async fn manage_schedule(action: String, time: Option<String>) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || command_runtime::manage_schedule(&action, time.as_deref()))
        .await
        .map_err(|error| error.to_string())?
}

/// 便携模式自举：exe 同级目录自带 WebView2/node/skills 时自动启用，
/// 双击 exe 即可运行，不依赖 start.bat 预设环境变量。
fn setup_portable_env() {
    let Ok(current_exe) = std::env::current_exe() else { return };
    let Some(exe_dir) = current_exe.parent() else { return };
    let _ = std::env::set_current_dir(exe_dir);

    // WebView2 固定版运行时：WebView2/Microsoft.WebView2.FixedVersionRuntime.*/
    if std::env::var_os("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER").is_none() {
        if let Ok(entries) = std::fs::read_dir(exe_dir.join("WebView2")) {
            for entry in entries.flatten() {
                let dir = entry.path();
                let is_runtime = dir
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.starts_with("Microsoft.WebView2.FixedVersionRuntime"))
                    .unwrap_or(false);
                if is_runtime && dir.join("msedgewebview2.exe").exists() {
                    std::env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", &dir);
                    break;
                }
            }
        }
    }

    // 便携 Node：node/node.exe 前置到 PATH。
    let node_dir = exe_dir.join("node");
    if node_dir.join("node.exe").exists() {
        let separator = if cfg!(windows) { ";" } else { ":" };
        let path = std::env::var_os("PATH").map(|value| value.to_string_lossy().into_owned());
        let new_path = match path {
            Some(existing) => format!("{}{}{}", node_dir.display(), separator, existing),
            None => node_dir.display().to_string(),
        };
        std::env::set_var("PATH", new_path);
    }

    // Playwright 浏览器缓存：存在才启用，已设置时不覆盖。
    if std::env::var_os("PLAYWRIGHT_BROWSERS_PATH").is_none()
        && exe_dir.join("playwright-browsers").exists()
    {
        std::env::set_var("PLAYWRIGHT_BROWSERS_PATH", exe_dir.join("playwright-browsers"));
    }
    // 便携包必须使用 exe 同级 Skill，不继承系统里可能残留的旧路径。
    if exe_dir.join("skills").exists() {
        std::env::set_var("BOSS_JARVIS_SKILLS_ROOT", exe_dir.join("skills"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    setup_portable_env();
    tauri::Builder::default()
        .setup(|app| {
            hongyi_embed::init(app.handle());
            // 冒烟钩子（仅本地验证用，验证后移除）：BOSS_JARVIS_SMOKE_HONGYI=1 时启动后自动打开虹翼部门看板。
            if std::env::var("BOSS_JARVIS_SMOKE_HONGYI").as_deref() == Ok("1") {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn_blocking(move || {
                    std::thread::sleep(std::time::Duration::from_millis(4000));
                    let _ = hongyi_dashboard::open(&handle);
                });
            }
            Ok(())
        })
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
            read_mail_signature,
            write_mail_signature,
            llm_chat,
            schedule_status,
            manage_schedule,
            set_dock_badge,
            open_hongyi_with_auth,
            open_hongyi_dashboard,
            open_hongyi_in_app,
            close_hongyi_embed,
            hongyi_embed_set_slot,
            hongyi_embed_navigate,
            hongyi_embed_current_url,
            hongyi_embed_reload
        ])
        .on_window_event(|window, event| {
            // 虹翼外链窗口已停在门户（会话仍活）时，点关闭改为隐藏保活：
            // 下次打开免 OA 重登、免重跑单点（会话继续活在原窗口内）。
            if window.label() != hongyi_dashboard::WINDOW_LABEL {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if hongyi_dashboard::window_session_alive(window) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
