//! 虹翼数智「部门看板」App 内快捷打开（OA 单点）。
//!
//! 事实依据见 docs/hongyi-dashboard-in-app.md（2026-09-02 Playwright 实测）：
//! - AUTH/x-sid 会话绑定标签页 sessionStorage，冷开直达 URL / 注入 Cookie 均失败（401 或转门户登录页），
//!   因此必须由承载展示的同一个 WebView 窗口自己跑完整条 OA → 虹翼单点链路；
//! - 已实测可行的单标签流程：登录 OA → 注入 `window.open` 补丁（改为同窗导航）→ 点击 OA 首页
//!   「虹翼数智」锚点 → OA 签发 chGT JWT 并经 blob 表单 POST `sei-basic/sso/login?authType=chGT` →
//!   302 落点 `sei-portal-web/#/sso/subPageTurnPage…` → 门户 DashBoard → hash 导航部门看板路由。
//!
//! 本模块只读浏览；凭证仅从 ~/.boss-jarvis/skill-env.conf 读取（不硬编码、不入库、不进日志）。
//! 每次打开写审计留痕（audit-log）。

use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub(crate) const WINDOW_LABEL: &str = "hongyi-dashboard";
pub(crate) const WINDOW_TITLE: &str = "虹翼数智 · 部门看板";
pub(crate) const OA_HOME_URL: &str = "https://oa.changhong.com";
const DASHBOARD_HASH: &str = "#/rcsit-prc-web/report/departmentDashboard";
/// 统一 Chrome-like UA：验证链路基于 Chromium 完成；WebKit/WebView2 混用时避免被站点按 UA 差异处理。
pub(crate) const WEBVIEW_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

pub(crate) const SLEEP_MS: u64 = 1500;
pub(crate) const EVAL_TIMEOUT: Duration = Duration::from_secs(8);

// ---------------------------------------------------------------------------
// 页面状态探针：每次返回当前 URL 与正文特征，供 Rust 侧分阶段驱动。
// ---------------------------------------------------------------------------
pub(crate) const STATE_JS: &str = r#"(() => {
  try {
    const t = (document.body && document.body.innerText) || '';
    const loc = location.href;
    const has = (re) => re.test(t);
    return {
      url: loc,
      oaHost: loc.indexOf('oa.changhong.com') >= 0,
      loginForm: !!document.querySelector('input[placeholder="请输入您的账号"]'),
      oaHome: has(/快捷导航|待办|已办|待阅|已阅/) || loc.indexOf('sd-frame') >= 0,
      portal: loc.indexOf('sei-portal-web') >= 0 && loc.indexOf('user/login') < 0,
      portalLogin: loc.indexOf('user/login') >= 0,
      dashboard: loc.indexOf('departmentDashboard') >= 0 && has(/部门看板|项目管理|销售管理|报表中心/),
      bad: has(/未登录|无权访问|401/) || loc.indexOf('/401') >= 0,
      bodyLen: t.length,
      hasPortalBiz: /项目管理|销售管理|报表中心|部门看板/.test(t)
    };
  } catch (e) { return { __error: String(e && e.message || e) }; }
})()"#;

pub(crate) const LOGIN_JS: &str = r#"(() => {
  try {
    const u = document.querySelector('input[placeholder="请输入您的账号"]');
    const p = document.querySelector('input[placeholder="请输入您的密码"]');
    if (!u || !p) return { ok: false, reason: 'no-form' };
    const setVal = (el, v) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setVal(u, __USER__);
    setVal(p, __PASS__);
    const btn = Array.from(document.querySelectorAll('button')).find(b => /登\s*录/.test(b.innerText || ''));
    if (btn) btn.click();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
})()"#;

/// window.open 补丁 + 点击「虹翼数智」：把 OA 弹出的 blob 单点页改到同一窗口内导航（已实测可行）。
pub(crate) const OPEN_ENTRY_JS: &str = r#"(() => {
  try {
    window.open = function (url) {
      if (url) window.location.href = url;
      return { closed: false, close() {}, focus() {}, blur() {}, postMessage() {} };
    };
    const els = Array.from(document.querySelectorAll('a'));
    const target = els.find(el => {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      return t.indexOf('虹翼数智') === 0;
    });
    if (!target) return { ok: false, reason: 'no-entry' };
    target.click();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
})()"#;

pub(crate) const NAV_DASHBOARD_JS: &str = r#"(() => {
  try { location.hash = __HASH__; return { ok: true }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
})()"#;

// ---------------------------------------------------------------------------
// OA 会话快照（免登录复用）：
// 2026-09-02 实测（Playwright）：新版 OA（虹云通）登录后 Cookie 为空，登录态全部放在
// localStorage（xm-accessToken / xm-refreshToken）+ sessionStorage（vuex / sd-ssoToken），
// 其中 sessionStorage 随窗口/标签销毁。仅 localStorage 直达会回登录页；把两份 token 在
// 文档启动时注入可免登录直达 OA 首页（portal-home）。凭证失效（服务端过期）时 OA 仍会
// 回登录页 → 走自动登录兜底并刷新快照。
// 快照只落 ~/.boss-jarvis/oa-session-snapshot.json（0600），只覆盖 OA 域 token 键，
// 不采集虹翼门户 AUTH/x-sid（那部分会话仍只活在专用窗口内）。
// ---------------------------------------------------------------------------
/// 读取当前 OA 页面（须位于 oa.changhong.com）的 token 快照，JSON 字符串返回。
pub(crate) const SNAPSHOT_READ_JS: &str = r#"(() => {
  try {
    const pick = (store, re) => {
      const out = {};
      for (let i = 0; i < store.length; i += 1) {
        const k = store.key(i);
        if (re.test(k)) out[k] = store.getItem(k);
      }
      return out;
    };
    return {
      localStorage: pick(localStorage, /xm-|token|sso|user/i),
      sessionStorage: pick(sessionStorage, /vuex|sso|token|user/i)
    };
  } catch (e) { return { __error: String(e && e.message || e) }; }
})()"#;

/// 文档启动注入模板：__SNAPSHOT__ 替换为 {"localStorage":{...},"sessionStorage":{...}}。
const OA_SESSION_INIT_JS: &str = r#"(() => {
  try {
    const d = __SNAPSHOT__;
    const ls = d.localStorage || {};
    const ss = d.sessionStorage || {};
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    for (const k in ss) { try { sessionStorage.setItem(k, ss[k]); } catch (e) {} }
  } catch (e) {}
})();"#;

fn snapshot_path() -> std::path::PathBuf {
    crate::paths::oa_session_snapshot_path()
}

fn load_oa_snapshot() -> Option<Value> {
    let content = std::fs::read_to_string(snapshot_path()).ok()?;
    let value: Value = serde_json::from_str(&content).ok()?;
    if value.get("sessionStorage").and_then(Value::as_object).is_some() {
        Some(value)
    } else {
        None
    }
}

/// 把 SNAPSHOT_READ_JS 采集到的 token 快照落盘（0600）；供窗口版与内嵌版共用。
/// 内嵌版（hongyi_embed）只消费其中的 sd-ssoToken（公共凭证直连换票）；窗口版还会在文档
/// 启动时整份注入以跳过 OA 登录页。失败静默（快照只是优化，不影响主流程）。
pub(crate) fn persist_oa_snapshot(payload: Value) {
    let mut payload = payload;
    if payload.get("localStorage").and_then(Value::as_object).is_none()
        || payload.get("sessionStorage").and_then(Value::as_object).is_none()
    {
        return;
    }
    if let Some(map) = payload.as_object_mut() {
        map.insert("savedAt".to_string(), Value::String(crate::runtime_log::iso_now()));
    }
    if let Ok(text) = serde_json::to_string_pretty(&payload) {
        if let Some(parent) = snapshot_path().parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        #[cfg(not(target_os = "windows"))]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::write(&snapshot_path(), text);
            let _ = std::fs::set_permissions(&snapshot_path(), std::fs::Permissions::from_mode(0o600));
        }
        #[cfg(target_os = "windows")]
        let _ = std::fs::write(&snapshot_path(), text);
    }
}

fn save_oa_snapshot(window: &WebviewWindow) {
    let Ok(value) = eval_json(window, SNAPSHOT_READ_JS) else {
        return;
    };
    if value.get("__error").is_some() {
        return;
    }
    persist_oa_snapshot(value);
}

/// 供 ensure_window 使用：把磁盘快照包成文档启动注入脚本（无快照时注入空对象，静默无副作用）。
fn oa_session_init_script() -> String {
    let payload = load_oa_snapshot().unwrap_or_else(|| serde_json::json!({}));
    OA_SESSION_INIT_JS.replace("__SNAPSHOT__", &payload.to_string())
}

/// 窗口已停在虹翼门户（sei-portal-web）时视为“会话仍活”：关闭改隐藏保活，下次打开免重登。
pub(crate) fn window_session_alive(window: &tauri::Window) -> bool {
    window
        .get_webview(WINDOW_LABEL)
        .and_then(|webview| webview.url().ok())
        .map(|url| url.to_string().contains("sei-portal-web"))
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// eval 辅助：eval_with_callback 的结果经 JSON 序列化回调；异常需在 JS 内自兜底。
// ---------------------------------------------------------------------------
fn eval_json(window: &WebviewWindow, js: &str) -> Result<Value, String> {
    let (tx, rx) = mpsc::channel::<String>();
    window
        .eval_with_callback(js.to_string(), move |result: String| {
            let _ = tx.send(result);
        })
        .map_err(|error| format!("页面脚本派发失败：{error}"))?;
    let raw = rx
        .recv_timeout(EVAL_TIMEOUT)
        .map_err(|_| "页面脚本执行超时（窗口可能已关闭）".to_string())?;
    serde_json::from_str(&raw).map_err(|_| "页面脚本返回无法解析".to_string())
}

fn state(window: &WebviewWindow) -> Result<Value, String> {
    let value = eval_json(window, STATE_JS)?;
    if value.get("__error").is_some() {
        return Err(format!("页面状态读取失败：{}", value.get("__error").and_then(Value::as_str).unwrap_or("未知")));
    }
    Ok(value)
}

pub(crate) fn flag(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool) == Some(true)
}

/// 轮询窗口状态直到 `pred` 为真或超时；返回最后一次成功读取的状态。
/// 页面导航瞬间（如 blob 表单 POST / 302 落地）eval 可能短暂失败，属正常抖动：
/// 容忍连续失败直到超时，避免把“正在跳转”误判为故障。
fn wait_for<F>(window: &WebviewWindow, mut pred: F, timeout: Duration, label: &str) -> Result<Value, String>
where
    F: FnMut(&Value) -> bool,
{
    let started = Instant::now();
    let mut last_ok: Option<Value> = None;
    loop {
        match state(window) {
            Ok(current) => {
                if pred(&current) {
                    return Ok(current);
                }
                last_ok = Some(current);
            }
            Err(error) => {
                if last_ok.is_none() && started.elapsed() >= timeout {
                    return Err(format!("等待{label}超时：{error}"));
                }
            }
        }
        if started.elapsed() >= timeout {
            let url = last_ok
                .as_ref()
                .and_then(|v| v.get("url").and_then(Value::as_str))
                .unwrap_or("?");
            return Err(format!("等待{label}超时（当前页面：{url}）"));
        }
        std::thread::sleep(Duration::from_millis(SLEEP_MS));
    }
}

fn audit(status: &str, summary: &str, error: &str) {
    let payload = serde_json::json!({
        "skill": "hongyi-dashboard",
        "actionType": "open",
        "mode": "read_only",
        "status": status,
        "sourceSystem": "Boss Jarvis Tauri",
        "target": { "title": "虹翼数智 · 部门看板" },
        "resultSummary": summary,
        "error": error,
    });
    crate::command_runtime::record_audit(payload);
}

/// 打开（或复用）窗口并把 OA 会话导航到 OA 首页起点，等待上一流程结束后由调用方驱动。
/// WKWebView/NSWindow 必须在主线程创建：用 AppHandle::run_on_main_thread 调度，当前工作线程等待结果。
fn ensure_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let oa_url: tauri::Url = OA_HOME_URL
        .parse()
        .map_err(|error| format!("OA 地址解析失败：{error}"))?;
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.navigate(oa_url);
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(window);
    }
    let (tx, rx) = mpsc::channel::<Result<WebviewWindow, String>>();
    let app_handle = app.clone();
    // 文档启动注入 OA 会话快照（若无快照则为空对象，静默无副作用）：新窗口免登录直达 OA 首页。
    let init_script = oa_session_init_script();
    app.run_on_main_thread(move || {
        let result = WebviewWindowBuilder::new(&app_handle, WINDOW_LABEL, WebviewUrl::External(oa_url))
            .title(WINDOW_TITLE)
            .inner_size(1440.0, 920.0)
            .min_inner_size(1080.0, 720.0)
            .focused(true)
            .user_agent(WEBVIEW_UA)
            .initialization_script(init_script)
            .build()
            .map_err(|error| format!("打开虹翼窗口失败：{error}"));
        let _ = tx.send(result);
    })
    .map_err(|error| format!("窗口创建调度失败：{error}"))?;
    rx.recv_timeout(Duration::from_secs(15))
        .map_err(|_| "窗口创建超时".to_string())?
}

pub(crate) fn log_phase(message: &str) {
    crate::runtime_log::append_log_line(
        "hongyi-open.log",
        &format!("{} {}\n", crate::runtime_log::iso_now(), message),
    );
}

pub(crate) fn js_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

/// 主流程（阻塞线程内运行；窗口关闭等可恢复场景按用户取消处理）。
fn drive(window: &WebviewWindow, user: &str, pass: &str) -> Result<String, String> {
    // S0：等待 OA 页面就绪（window.open 重导航会短暂中断，多等一轮更稳）。
    std::thread::sleep(Duration::from_millis(4000));
    let _ = wait_for(window, |s| flag(s, "oaHost"), Duration::from_secs(90), "OA 页面加载")?;
    log_phase("OA 页面已加载");

    // S1：OA 首页 或 登录表单（已有会话 Cookie 则直接到首页）。
    let mut login_attempted = false;
    let initial = state(window)?;
    if flag(&initial, "loginForm") {
        if user.is_empty() || pass.is_empty() {
            return Err("OA 未配置账号或密码：请先在「系统配置」填写 OA_USERNAME/OA_PASSWORD 后重试。".to_string());
        }
        let login_js = LOGIN_JS
            .replace("__USER__", &js_string(user))
            .replace("__PASS__", &js_string(pass));
        let result = eval_json(window, &login_js)?;
        if flag(&result, "ok") {
            login_attempted = true;
            log_phase("OA 自动登录已提交");
        } else {
            let reason = result.get("reason").and_then(Value::as_str).unwrap_or("未知");
            return Err(format!("OA 登录表单处理失败：{reason}（请在窗口内手动登录或检查系统配置）"));
        }
    } else {
        log_phase("检测到已有 OA 会话，无需登录");
    }

    let home = wait_for(
        window,
        |s| flag(s, "oaHome"),
        Duration::from_secs(if login_attempted { 120 } else { 90 }),
        "OA 首页就绪",
    )
    .map_err(|error| {
        format!("{error}；若自动登录失败，请在窗口内手动登录 OA 后点「重试」")
    })?;
    if flag(&home, "loginForm") {
        return Err("OA 自动登录未成功：请在窗口内手动登录后点「重试」，或检查系统配置的账号密码。".to_string());
    }
    log_phase("OA 首页就绪");
    // 会话快照已可用（登录或复用均含 token）→ 尝试落盘供下次打开免登录（失败静默不影响主流程）。
    save_oa_snapshot(window);
    log_phase("OA 会话快照已刷新（下次打开免登录）");

    // S2：注入 window.open 补丁并点击「虹翼数智」，等待门户登录完成（blob 表单 POST → 302）。
    let open_result = eval_json(window, OPEN_ENTRY_JS)?;
    if !flag(&open_result, "ok") {
        let reason = open_result.get("reason").and_then(Value::as_str).unwrap_or("未知");
        return Err(format!("未找到 OA 首页「虹翼数智」入口：{reason}（请确认 OA 首页可见后重试）"));
    }
    log_phase("已点击「虹翼数智」入口，等待虹翼门户单点登录");

    let after_open = wait_for(
        window,
        |s| flag(s, "dashboard") || flag(s, "portal") || flag(s, "portalLogin") || flag(s, "bad"),
        Duration::from_secs(180),
        "虹翼门户单点登录",
    )
    .map_err(|error| format!("{error}；若浏览器停在中间页，请关闭窗口后重试"))?;

    if flag(&after_open, "portalLogin") {
        return Err("虹翼门户要求重新登录（会话失效）：请重试，若持续出现请检查 OA 登录态。".to_string());
    }
    if flag(&after_open, "bad") {
        return Err("虹翼门户返回未登录/无权访问：请重试。".to_string());
    }
    if flag(&after_open, "dashboard") {
        log_phase("部门看板已直接就绪");
        return Ok("虹翼部门看板已打开。".to_string());
    }
    log_phase("虹翼门户已登录（sei-portal-web），导航部门看板路由");

    // S3：门户 DashBoard 就绪 → hash 导航到部门看板路由。
    let nav_js = NAV_DASHBOARD_JS.replace("__HASH__", &js_string(DASHBOARD_HASH));
    let _ = eval_json(window, &nav_js)?;
    let _ = wait_for(
        window,
        |s| flag(s, "dashboard"),
        Duration::from_secs(90),
        "部门看板加载",
    )
    .map_err(|error| format!("{error}；窗口内可手工从门户菜单进入「部门看板」。"))?;
    log_phase("部门看板加载完成");
    Ok("虹翼部门看板已打开。".to_string())
}

/// 命令入口（Tauri async 包装，实际驱动在 spawn_blocking 线程池，避免阻塞主线程）。
/// 单飞：同一时刻只允许一个打开流程；窗口已停留在部门看板时直接聚焦，不再重复重登。
pub fn open(app: &AppHandle) -> Result<String, String> {
    static BUSY: std::sync::OnceLock<std::sync::Mutex<bool>> = std::sync::OnceLock::new();
    let busy = BUSY.get_or_init(|| std::sync::Mutex::new(false));
    {
        let mut guard = busy.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if *guard {
            return Ok("正在打开虹翼数智窗口，请稍候…".to_string());
        }
        *guard = true;
    }

    let result = (|| -> Result<String, String> {
        // 快路径：窗口已存在且停在部门看板 → 仅聚焦，不重跑 OA 单点。
        if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
            let on_dashboard = window
                .url()
                .map(|url| {
                    let text = url.to_string();
                    text.contains("sei-portal-web") && text.contains("departmentDashboard")
                })
                .unwrap_or(false);
            if on_dashboard {
                let _ = window.show();
                let _ = window.set_focus();
                return Ok("虹翼部门看板已在窗口打开。".to_string());
            }
        }
        let window = ensure_window(app)?;
        let env = crate::command_runtime::read_skill_env();
        let user = env.get("OA_USERNAME").cloned().unwrap_or_default();
        let pass = env.get("OA_PASSWORD").cloned().unwrap_or_default();
        drive(&window, &user, &pass)
    })();

    {
        let mut guard = busy.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        *guard = false;
    }
    match &result {
        Ok(summary) => {
            log_phase(&format!("打开成功：{summary}"));
            audit("success", summary, "");
        }
        Err(error) => {
            log_phase(&format!("打开失败：{error}"));
            audit("failed", "虹翼部门看板打开失败", error);
        }
    }
    result
}
