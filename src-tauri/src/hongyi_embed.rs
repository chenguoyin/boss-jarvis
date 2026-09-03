//! 虹翼页面「App 内容区内直显」（2026-09-02 v2）：在主窗口内容区挂一个**子 WebView**
//! （Tauri 多 webview，feature=unstable），由它自己跑完整条 OA → 虹翼单点链路后，直接打开
//! 「配置的目标 URL」页面本身（原样显示、无地址栏）。
//!
//! 承载史：① unstable add_child 子 WebView（有 hide/show 闪退）；② 无边框独立 WebviewWindow
//! 贴主窗（2026-09-02 改，白板/点击失焦掉绘制/拖动异常，平台窗口合成顽疾，无法稳定）；
//! → 回到 ① 的 child WebView v2：**真内嵌随主窗一起绘制，天然免疫“点击主窗/拖动白板”**；
//! “隐藏”不再用 hide/show（当年闪退源），改 **set_bounds 缩到 1×1**——会话/页面保留、
//! 无 hide/show 交替；进入时按内容区实测锚点放大显示。
//!
//! 事实依据（2026-09-02 Playwright 实测，见 docs/hongyi-dashboard-in-app.md）：
//! - AUTH/x-sid 会话绑定承载窗口，冷开直达 URL / Cookie 直连页面均 401，必须由展示侧同一个
//!   WebView 跑完链路；
//! - 同一 WebView 内「整页导航到同源独立 URL」可行（sessionStorage 保留）——最后一步先整页直达
//!   配置的目标 URL；若被门户 SPA 兜回（停留在 sei-portal-web），自动改走门户 hash 路由。
//! - 优先「公共 OA 登录凭证直连」：复用 skills 根目录（exe 同级 skills/ > 环境变量 >
//!   manifest skillsRoot）下 .shared/oa-session.json 的 sd-ssoToken
//!   （OA access_token，裸 JWT，exp 判活）→ 在 OA 同源页面用**同步 XHR** 调 /api1/singleLoginServlet
//!   换 chGT 票据 → 表单 POST 直达虹翼门户（必须同步脚本：async 返回值无法被 eval 序列化）。
//!   失败才回退页面登录链路。
//!
//! 布局：前端在「虹翼外链」分区 header 之下渲染占位并量取左上角上报（hongyi_embed_set_slot），
//! child 按其铺到内容区（右/下留 28），与 skill 管理页等内容页一致；CHILD_* 仅兜底。
//! 主窗 resize 由 Rust 事件同步；child 随主窗移动无需处理。
//!
//! 凭证仅从 ~/.boss-jarvis/skill-env.conf 与 skills 根目录 .shared/ 读取（不硬编码、不入日志）；
//! 每次打开/关闭写审计（audit-log）。

use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Rect, Webview, WebviewBuilder,
    WebviewUrl,
};

use crate::hongyi_dashboard::{
    js_string, log_phase, LOGIN_JS, OA_HOME_URL, OPEN_ENTRY_JS, STATE_JS, WEBVIEW_UA,
};

/// 内嵌子 WebView label。
pub const CHILD_LABEL: &str = "hongyi-in-app";
/// 默认目标：部门看板（与 hongyi-external 技能 DEFAULT_URL 一致）。
pub const DEFAULT_TARGET_URL: &str =
    "https://hongyi.changhong.com/rcsit-prc-web/#/rcsit-prc-web/report/departmentDashboard";
/// 配置键：系统配置里可写 HONGYI_EXTERNAL_URL 覆盖（URL 配置化，后续可改）。
const TARGET_ENV_KEY: &str = "HONGYI_EXTERNAL_URL";
/// 只允许打开同源（hongyi.changhong.com）页面：单点会话只对该域有效，
/// 也避免把 OA/虹翼会话带出到其它站点。
const ALLOWED_HOST: &str = "hongyi.changhong.com";
/// 几何兜底（逻辑像素，相对主窗内容；实际以前端 slot 上报为准）。
const CHILD_LEFT: f64 = 101.0;
const CHILD_TOP: f64 = 118.0;
const CHILD_PAD_RIGHT: f64 = 28.0;
const CHILD_PAD_BOTTOM: f64 = 28.0;
/// 隐藏态：缩到 1×1 置于左上角（会话/页面保留；不再用 hide/show）。
const HIDDEN_RECT: (f64, f64, f64, f64) = (0.0, 0.0, 1.0, 1.0);

const SLEEP_MS: u64 = 1500;
const EVAL_TIMEOUT: Duration = Duration::from_secs(8);

/// 取配置的目标 URL（每次打开时读取，支持热改）。
fn target_url() -> String {
    let env = crate::command_runtime::read_skill_env();
    env.get(TARGET_ENV_KEY)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value.starts_with("http"))
        .unwrap_or_else(|| DEFAULT_TARGET_URL.to_string())
}

// ---------------------------------------------------------------------------
// eval 辅助（子 WebView 版）：eval_with_callback 结果经 JSON 序列化回调。
// ---------------------------------------------------------------------------
fn eval_json(webview: &Webview, js: &str) -> Result<Value, String> {
    let (tx, rx) = mpsc::channel::<String>();
    webview
        .eval_with_callback(js.to_string(), move |result: String| {
            let _ = tx.send(result);
        })
        .map_err(|error| format!("页面脚本派发失败：{error}"))?;
    let raw = rx
        .recv_timeout(EVAL_TIMEOUT)
        .map_err(|_| "页面脚本执行超时（内嵌页可能已隐藏/关闭）".to_string())?;
    serde_json::from_str(&raw).map_err(|_| "页面脚本返回无法解析".to_string())
}

fn state(webview: &Webview) -> Result<Value, String> {
    let value = eval_json(webview, STATE_JS)?;
    if value.get("__error").is_some() {
        return Err(format!(
            "页面状态读取失败：{}",
            value
                .get("__error")
                .and_then(Value::as_str)
                .unwrap_or("未知")
        ));
    }
    Ok(value)
}

fn flag(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool) == Some(true)
}

/// 轮询子 WebView 状态直到 `pred` 为真或超时（逻辑同 hongyi_dashboard::wait_for）。
fn wait_for<F>(webview: &Webview, mut pred: F, timeout: Duration, label: &str) -> Result<Value, String>
where
    F: FnMut(&Value) -> bool,
{
    let started = Instant::now();
    let mut last_ok: Option<Value> = None;
    loop {
        match state(webview) {
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

// ---------------------------------------------------------------------------
// 虹翼面板窗口（无边框 WebviewWindow）生命周期与贴位
// ---------------------------------------------------------------------------

/// 内嵌子 WebView（存在即返回——即使处于 1×1 隐藏态，页面与会话仍保留）。
fn child_of(app: &AppHandle) -> Option<Webview> {
    let window = app.get_window("main")?;
    window
        .webviews()
        .into_iter()
        .find(|webview| webview.label() == CHILD_LABEL)
}

/// 前端每次打开前上报的「嵌入锚点」（虹翼分区内容区左上角，相对主窗内容，CSS 逻辑 px）。
/// 左/上实测（跟随 React header 真实高度），右/下留 28 与 .jv-content padding 一致——
/// 主窗 resize 后仍精确对齐 skill 管理页等内容页（2026-09-02 用户要求对齐）。
static SLOT: std::sync::OnceLock<std::sync::Mutex<Option<(f64, f64)>>> = std::sync::OnceLock::new();

fn slot_anchor() -> Option<(f64, f64)> {
    let slot = SLOT.get_or_init(|| std::sync::Mutex::new(None));
    slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).clone()
}

/// 前端在「虹翼外链」分区渲染出内容区占位后调用：上报其左上角（相对主窗口内容，CSS 逻辑 px）。
pub fn set_slot(left: f64, top: f64) -> Result<(), String> {
    let slot = SLOT.get_or_init(|| std::sync::Mutex::new(None));
    let mut guard = slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = Some((left, top));
    // 排障用：确认网页贴位用的真实坐标（无敏感信息）。
    log_phase(&format!("嵌入锚点上报：left={left:.0} top={top:.0}"));
    Ok(())
}

/// child 在**主窗内容内**的目标矩形（逻辑像素）：左上 = slot 锚点（兜底 CHILD_*），
/// 宽高 = 主窗逻辑尺寸 - 左/上 - 右/下留边(28)。child 是主窗子视图，无需屏幕坐标。
fn content_rect(app: &AppHandle) -> Result<Rect, String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    let scale = window
        .scale_factor()
        .map_err(|error| format!("读取缩放因子失败：{error}"))?;
    let physical_size = window
        .inner_size()
        .map_err(|error| format!("读取主窗口尺寸失败：{error}"))?;
    let logical_w = physical_size.width as f64 / scale;
    let logical_h = physical_size.height as f64 / scale;
    let (left, top) = slot_anchor().unwrap_or((CHILD_LEFT, CHILD_TOP));
    let width = (logical_w - left - CHILD_PAD_RIGHT).max(0.0);
    let height = (logical_h - top - CHILD_PAD_BOTTOM).max(0.0);
    Ok(Rect {
        position: LogicalPosition::new(left, top).into(),
        size: LogicalSize::new(width, height).into(),
    })
}

/// child 是否处于显示态（true=贴内容区；false=1×1 隐藏）。resize 时据此决定放大还是保持隐藏，
/// 避免在其它分区时把隐藏 child 撑大盖住当前内容。
fn visible_flag() -> &'static std::sync::atomic::AtomicBool {
    static VISIBLE: std::sync::OnceLock<std::sync::atomic::AtomicBool> =
        std::sync::OnceLock::new();
    VISIBLE.get_or_init(|| std::sync::atomic::AtomicBool::new(false))
}

/// 把 child 摆到内容区（显示态）。
fn show_child(app: &AppHandle) -> Result<(), String> {
    if let Some(child) = child_of(app) {
        let rect = content_rect(app)?;
        child
            .set_bounds(rect)
            .map_err(|error| format!("内嵌页尺寸同步失败：{error}"))?;
        visible_flag().store(true, std::sync::atomic::Ordering::Relaxed);
    }
    Ok(())
}

/// 把 child 缩到 1×1 左上角（隐藏态；会话/页面保留，不用 hide/show——v2 防闪退与白板）。
fn hide_child(app: &AppHandle) -> Result<(), String> {
    if let Some(child) = child_of(app) {
        let (x, y, w, h) = HIDDEN_RECT;
        let rect = Rect {
            position: LogicalPosition::new(x, y).into(),
            size: LogicalSize::new(w, h).into(),
        };
        child
            .set_bounds(rect)
            .map_err(|error| format!("内嵌页隐藏失败：{error}"))?;
    }
    visible_flag().store(false, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

/// 注册主窗口 resize 监听：内容区 child 随窗口尺寸同步（child 随主窗移动，无需 Moved）。
pub fn init(app: &AppHandle) {
    let app_handle = app.clone();
    if let Some(window) = app.get_window("main") {
        window.on_window_event(move |event| {
            use tauri::WindowEvent;
            if let WindowEvent::Resized(_) = event {
                let _ = if visible_flag().load(std::sync::atomic::Ordering::Relaxed) {
                    show_child(&app_handle)
                } else {
                    hide_child(&app_handle)
                };
            }
        });
    }
}

/// 有且只有一个内嵌子 WebView：存在则返回，否则创建（初始置于隐藏位，进入后再 show_child）。
/// window.add_child 内部走主线程通道；加锁防并发双建。
fn ensure_child(app: &AppHandle) -> Result<Webview, String> {
    if let Some(child) = child_of(app) {
        return Ok(child);
    }
    static CREATE_LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    let create_lock = CREATE_LOCK.get_or_init(|| std::sync::Mutex::new(()));
    let _guard = create_lock
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    // 双检：等锁期间可能已被别的调用创建。
    if let Some(child) = child_of(app) {
        return Ok(child);
    }
    let window = app
        .get_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    let oa_url: tauri::Url = OA_HOME_URL
        .parse()
        .map_err(|error| format!("OA 地址解析失败：{error}"))?;
    let (x, y, w, h) = HIDDEN_RECT;
    let builder = WebviewBuilder::new(CHILD_LABEL, WebviewUrl::External(oa_url))
        .user_agent(WEBVIEW_UA);
    window
        .add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(w, h))
        .map_err(|error| format!("内嵌 WebView 创建失败（当前平台可能不支持多 webview）：{error}"))
}

// ---------------------------------------------------------------------------
// 审计 / 单飞
// ---------------------------------------------------------------------------

fn audit(target: &str, status: &str, summary: &str, error: &str) {
    let payload = serde_json::json!({
        "skill": "hongyi-dashboard",
        "actionType": "open_in_app",
        "mode": "read_only",
        "status": status,
        "sourceSystem": "Boss Jarvis Tauri",
        "target": { "title": "虹翼页面（App 内嵌）", "url": target },
        "resultSummary": summary,
        "error": error,
    });
    crate::command_runtime::record_audit(payload);
}

/// busy 单飞守卫：取得即视为占用，**Drop 时自动复位**。
/// （2026-09-02 修复：旧实现只 drop 锁、从不把标志设回 false，导致第二次起 open 全部短路、
/// close 永远空等——日志里 09:47 起连续十几分钟「等待其结束后再隐藏」即此 bug，且与用户
/// 「打开虹翼窗口后切换左侧功能卡死」吻合。）
fn acquire_busy() -> Result<BusyGuard, String> {
    static BUSY: std::sync::OnceLock<std::sync::Mutex<bool>> = std::sync::OnceLock::new();
    let busy = BUSY.get_or_init(|| std::sync::Mutex::new(false));
    let mut guard = busy.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if *guard {
        return Err("busy".to_string());
    }
    *guard = true;
    Ok(BusyGuard(guard))
}

/// RAII：guard 离开作用域即把 busy 标志复位为 false。
struct BusyGuard(std::sync::MutexGuard<'static, bool>);
impl Drop for BusyGuard {
    fn drop(&mut self) {
        *self.0 = false;
    }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/// 是否已停在目标页面（严格比对整页 URL；兜底只认「已离开门户、同源子应用页面正文已渲染」，
/// 门户 DashBoard（sei-portal-web）不算到达目标，避免“能进系统但没落到指定 URL”误报成功）。
fn on_target(state: &Value, target: &str) -> bool {
    let url = state.get("url").and_then(Value::as_str).unwrap_or("");
    if flag(state, "bad") || flag(state, "portalLogin") {
        return false;
    }
    if url == target {
        return true;
    }
    url.starts_with(&format!("https://{ALLOWED_HOST}"))
        && !url.contains("/user/login")
        && !url.contains("sei-portal-web")
        && state.get("bodyLen").and_then(Value::as_u64).unwrap_or(0) > 100
}

// ---------------------------------------------------------------------------
// 公共 OA 登录凭证直连（换票在 WebView 内完成，凭证不入日志/审计）
// ---------------------------------------------------------------------------

/// base64url 解码（JWT payload 用；不新增第三方依赖）。
fn b64url_decode(input: &str) -> Option<Vec<u8>> {
    fn idx(byte: u8) -> Option<u32> {
        match byte {
            b'A'..=b'Z' => Some((byte - b'A') as u32),
            b'a'..=b'z' => Some((byte - b'a' + 26) as u32),
            b'0'..=b'9' => Some((byte - b'0' + 52) as u32),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let mut out = Vec::new();
    let mut acc: u32 = 0;
    let mut bits: u32 = 0;
    for byte in input.bytes().filter(|byte| *byte != b'=') {
        acc = (acc << 6) | idx(byte)?;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((acc >> bits) & 0xFF) as u8);
            acc &= (1u32 << bits) - 1;
        }
    }
    Some(out)
}

/// 读共享 OA 登录凭证：skills 根目录下 .shared/oa-session.json 的 sd-ssoToken（裸 JWT），
/// 且 exp 未过期才返回（失效/缺失返回 None，由调用方回退页面登录）。不打印明文。
/// 路径随 skills 根目录解析（exe 同级 skills/ > 环境变量 > manifest skillsRoot），
/// 不写死 ~/.codex/skills，Windows 便携运行与 macOS 开发同一条解析链。
fn shared_oa_token() -> Option<String> {
    let path = crate::manifest::load_cached()
        .skills_root()
        .join(".shared")
        .join("oa-session.json");
    let content = std::fs::read_to_string(path).ok()?;
    let session: Value = serde_json::from_str(&content).ok()?;
    let obj = session.as_object()?;
    let token = ["sd-ssoToken", "ssoToken", "token", "access_token"]
        .iter()
        .find_map(|key| obj.get(*key).and_then(Value::as_str))
        .filter(|value| value.split('.').count() == 3)?;
    let exp = token
        .split('.')
        .nth(1)
        .and_then(|part| b64url_decode(part))
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .and_then(|payload| payload.get("exp").and_then(Value::as_u64));
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    exp.is_some_and(|value| value > now).then(|| token.to_string())
}

/// 在 OA 同源页面：用公共 access_token 调 singleLoginServlet 换 chGT 票据 →
/// 构造隐藏表单 POST 直达虹翼门户（同源同步 XHR 无 CORS、当场返回响应）。
/// 注意：必须用**同步脚本**（不是 async IIFE）——eval 回调只对同步返回值做 JSON 序列化，
/// Promise 会返回「无法解析」导致直连失败（2026-09-02 日志定位）。
const DIRECT_SSO_JS: &str = r#"(() => {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://oa.changhong.com/api1/singleLoginServlet', false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ op: 'getLoginData', token: __TOKEN__, root: { sys: 'hxht', url: '' } }));
    const text = xhr.responseText || '';
    const action = (text.match(/action\s*=\s*["']([^"']+)["']/i) || [])[1];
    const token = (text.match(/name\s*=\s*["']token["'][^>]*?value\s*=\s*["']([^"']*)["']/i)
                || text.match(/value\s*=\s*["']([^"']*)["'][^>]*?name\s*=\s*["']token["']/i)
                || [])[1];
    if (!action || !token) {
      return { ok: false, reason: 'unexpected-ticket-response', status: xhr.status, length: text.length };
    }
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = action;
    form.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'token';
    input.value = token;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: String((error && error.message) || error).slice(0, 120) };
  }
})()"#;

/// 公共凭证直连失败/回退前：确保子 WebView 回到 OA 页面（表单提交/导航后可能已离开 OA 域）。
fn back_to_oa(webview: &Webview) -> Result<(), String> {
    let on_oa = state(webview)
        .map(|s| {
            s.get("url")
                .and_then(Value::as_str)
                .unwrap_or("")
                .contains("oa.changhong.com")
        })
        .unwrap_or(false);
    if !on_oa {
        let oa_url: tauri::Url = OA_HOME_URL
            .parse()
            .map_err(|error| format!("OA 地址解析失败：{error}"))?;
        webview
            .navigate(oa_url)
            .map_err(|error| format!("导航到 OA 失败：{error}"))?;
        std::thread::sleep(Duration::from_millis(4000));
        let _ = wait_for(webview, |s| flag(s, "oaHost"), Duration::from_secs(90), "OA 页面加载")?;
        log_phase("内嵌页：已回到 OA 页面");
    }
    Ok(())
}

/// 主流程（阻塞线程内运行；逐阶段驱动直到整页落到 target）。
fn drive(webview: &Webview, user: &str, pass: &str, target: &str) -> Result<String, String> {
    // S0：整页导航回 OA（保证起点干净；已有 OA Cookie 则直接首页）。
    let oa_url: tauri::Url = OA_HOME_URL
        .parse()
        .map_err(|error| format!("OA 地址解析失败：{error}"))?;
    webview
        .navigate(oa_url)
        .map_err(|error| format!("导航到 OA 失败：{error}"))?;
    std::thread::sleep(Duration::from_millis(4000));
    let _ = wait_for(webview, |s| flag(s, "oaHost"), Duration::from_secs(90), "OA 页面加载")?;
    log_phase("内嵌页：OA 页面已加载");

    // S0.5：公共 OA 登录凭证直连（优先）——复用共享 sd-ssoToken 换票直达虹翼门户，
    // 跳过 OA 页面填表/点击；凭证缺失/过期/换票失败时回退 S1 页面登录链路。
    // 配置 HONGYI_DIRECT_SSO=0 可关闭直连（调试/对比用）。
    let env = crate::command_runtime::read_skill_env();
    let direct_enabled = env.get("HONGYI_DIRECT_SSO").map_or(true, |v| v.trim() != "0");
    if let Some(token) = shared_oa_token().filter(|_| direct_enabled) {
        log_phase("内嵌页：检测到公共 OA 登录凭证，尝试直连单点");
        let direct = eval_json(webview, &DIRECT_SSO_JS.replace("__TOKEN__", &js_string(&token)));
        match direct {
            Ok(result) if flag(&result, "ok") => {
                log_phase("内嵌页：chGT 票据已提交，等待虹翼门户登录");
                let booted = wait_for(
                    webview,
                    |s| flag(s, "dashboard") || (flag(s, "portal") && flag(s, "hasPortalBiz")),
                    Duration::from_secs(60),
                    "门户登录",
                );
                match booted {
                    Ok(_) => {
                        log_phase("内嵌页：公共凭证直连单点成功，开始整页导航到目标 URL");
                        match land_and_observe(
                            webview,
                            target,
                            Duration::from_secs(90),
                            "目标页面加载",
                        ) {
                            Ok(summary) => return Ok(summary),
                            Err(error) => log_phase(&format!(
                                "内嵌页：直连后落地目标页失败（{error}），回退页面登录重试"
                            )),
                        }
                    }
                    Err(error) => log_phase(&format!(
                        "内嵌页：直连门户未就绪（{error}），回退页面登录"
                    )),
                }
            }
            other => {
                let reason = match other {
                    Ok(value) => value
                        .get("reason")
                        .and_then(Value::as_str)
                        .unwrap_or("未知")
                        .to_string(),
                    Err(error) => error,
                };
                log_phase(&format!("内嵌页：公共凭证直连未成功（{reason}），回退页面登录"));
            }
        }
        back_to_oa(webview)?;
    } else {
        log_phase("内嵌页：无有效公共 OA 登录凭证或已关闭直连，走页面登录");
    }

    // S1：OA 首页或登录表单。
    let mut login_attempted = false;
    let initial = state(webview)?;
    if flag(&initial, "loginForm") {
        if user.is_empty() || pass.is_empty() {
            return Err("OA 未配置账号或密码：请先在「系统配置」填写 OA_USERNAME/OA_PASSWORD 后重试。".to_string());
        }
        let login_js = LOGIN_JS
            .replace("__USER__", &js_string(user))
            .replace("__PASS__", &js_string(pass));
        let result = eval_json(webview, &login_js)?;
        if flag(&result, "ok") {
            login_attempted = true;
            log_phase("内嵌页：OA 自动登录已提交");
        } else {
            let reason = result.get("reason").and_then(Value::as_str).unwrap_or("未知");
            return Err(format!("OA 登录表单处理失败：{reason}（请检查系统配置或稍后重试）"));
        }
    } else {
        log_phase("内嵌页：检测到已有 OA 会话，无需登录");
    }

    let home = wait_for(
        webview,
        |s| flag(s, "oaHome"),
        Duration::from_secs(if login_attempted { 120 } else { 90 }),
        "OA 首页就绪",
    )
    .map_err(|error| format!("{error}；若自动登录失败，请稍后重试"))?;
    if flag(&home, "loginForm") {
        return Err("OA 自动登录未成功：请稍后重试或检查系统配置的账号密码。".to_string());
    }
    log_phase("内嵌页：OA 首页就绪");

    // S2：window.open 补丁 + 点击「虹翼数智」→ 门户单点登录。
    let open_result = eval_json(webview, OPEN_ENTRY_JS)?;
    if !flag(&open_result, "ok") {
        let reason = open_result.get("reason").and_then(Value::as_str).unwrap_or("未知");
        return Err(format!("未找到 OA 首页「虹翼数智」入口：{reason}（请确认后重试）"));
    }
    log_phase("内嵌页：已点击「虹翼数智」入口，等待虹翼门户单点登录");

    let after_open = wait_for(
        webview,
        |s| flag(s, "dashboard") || flag(s, "portal") || flag(s, "portalLogin") || flag(s, "bad"),
        Duration::from_secs(180),
        "虹翼门户单点登录",
    )
    .map_err(|error| format!("{error}；若停在中间页请重试"))?;
    if flag(&after_open, "portalLogin") {
        return Err("虹翼门户要求重新登录（会话失效）：请重试。".to_string());
    }
    if flag(&after_open, "bad") {
        return Err("虹翼门户返回未登录/无权访问：请重试。".to_string());
    }
    if on_target(&after_open, target) {
        log_phase("内嵌页：目标页面已直接就绪");
        return Ok("虹翼页面已在 App 内显示。".to_string());
    }
    log_phase("内嵌页：门户登录完成，等待门户 DashBoard 真正就绪");

    // S2.5：门户 DashBoard 渲染完成（正文出现业务菜单/正文已长）后再整页导航——过早导航会与门户
    // SPA 的登录回调竞争：会话/sessionStorage 未落盘时目标页会 401，或被门户自身跳转覆盖。
    if !flag(&after_open, "dashboard") {
        let ready = wait_for(
            webview,
            |s| flag(s, "hasPortalBiz") || flag(s, "dashboard"),
            Duration::from_secs(60),
            "门户 DashBoard 渲染",
        );
        match ready {
            Ok(_) => {}
            Err(error) => log_phase(&format!(
                "内嵌页：门户 DashBoard 就绪等待未通过（继续尝试导航）：{error}"
            )),
        }
        std::thread::sleep(Duration::from_millis(2000));
    }
    log_phase("内嵌页：开始整页导航到目标 URL");

    // S3：整页导航到目标 URL（同 WebView 内同源整页导航，会话保留，已实测）。
    land_and_observe(webview, target, Duration::from_secs(150), "目标页面加载")
}

/// 整页导航到目标并观察落地（双策略）：
/// 1) 首选「整页直达」目标 URL（同 WebView 内同源整页导航，Chromium 已实测；地址栏即目标地址）；
///    若多次直达仍停留在门户（sei-portal-web，说明被门户 SPA 兜回），
/// 2) 自动改用「门户 hash 路由」方式落到目标路由（macOS WKWebView 实机验证过的路径），
///    至少保证看板内容正确展示。
/// - 出现未登录/无权访问（bad）或门户登录页 → `SSO_NEEDED`，由调用方补跑单点；
/// - 超时 → 报当前地址。
fn land_and_observe(
    webview: &Webview,
    target: &str,
    timeout: Duration,
    label: &str,
) -> Result<String, String> {
    let target_url: tauri::Url = target
        .parse()
        .map_err(|error| format!("目标地址解析失败：{error}"))?;
    // 门户 hash 兜底用的路由片段（首个 # 之后，如 /rcsit-prc-web/report/departmentDashboard）。
    let fragment = target.find('#').map(|index| target[index..].to_string());
    let mut full_retries = 0u32;
    let mut hash_retries = 0u32;
    let mut hash_tried = false;
    let mut last_retry = Instant::now();
    let started = Instant::now();
    let mut last_url = String::from("?");

    webview
        .navigate(target_url.clone())
        .map_err(|error| format!("导航到目标页面失败：{error}"))?;
    log_phase("内嵌页：整页直达目标 URL（策略 1）");

    loop {
        if started.elapsed() >= timeout {
            return Err(format!("等待{label}超时（当前页面：{last_url}）"));
        }
        std::thread::sleep(Duration::from_millis(SLEEP_MS));
        match state(webview) {
            Ok(current) => {
                last_url = current
                    .get("url")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| String::from("?"));
                if flag(&current, "bad") || flag(&current, "portalLogin") {
                    return Err("SSO_NEEDED".to_string());
                }
                // 策略 1 成功：整页落到目标地址。
                if last_url == target {
                    log_phase("内嵌页：目标页面加载完成");
                    return Ok("虹翼页面已在 App 内显示。".to_string());
                }
                // 门户 hash 兜底成功：门户地址已带上目标路由片段且正文渲染。
                if hash_tried {
                    if let Some(fragment) = &fragment {
                        let on_fragment = fragment.len() > 2
                            && last_url.contains(&fragment[1..])
                            && (flag(&current, "hasPortalBiz") || flag(&current, "dashboard"))
                            && current
                                .get("bodyLen")
                                .and_then(Value::as_u64)
                                .unwrap_or(0)
                                > 100;
                        if on_fragment {
                            log_phase("内嵌页：目标路由已在门户内展示（hash 兜底成功）");
                            return Ok("虹翼页面已在 App 内显示（经门户路由）。".to_string());
                        }
                    }
                }
                // 整页直达的成功兜底：已离开门户、落到同源子应用页面且正文渲染。
                if on_target(&current, target) {
                    log_phase("内嵌页：目标页面加载完成（落地地址与输入略有差异，按同源页面处理）");
                    return Ok("虹翼页面已在 App 内显示（最终地址与目标略有差异）。".to_string());
                }
                // 仍停留在门户：目标导航未生效。
                if last_url.contains("sei-portal-web") {
                    if !hash_tried && full_retries >= 2 {
                        // 策略 1 反复不生效 → 切门户 hash 路由（macOS 实机验证路径）。
                        hash_tried = true;
                        last_retry = Instant::now();
                        log_phase("内嵌页：整页直达未生效，改走门户 hash 路由（策略 2）");
                        apply_fragment(webview, fragment.as_deref())?;
                    } else if hash_tried {
                        if last_retry.elapsed() >= Duration::from_secs(10) && hash_retries < 3 {
                            hash_retries += 1;
                            last_retry = Instant::now();
                            log_phase("内嵌页：hash 路由仍未就绪，重试设置路由片段");
                            apply_fragment(webview, fragment.as_deref())?;
                        }
                    } else if last_retry.elapsed() >= Duration::from_secs(10) && full_retries < 4 {
                        full_retries += 1;
                        last_retry = Instant::now();
                        log_phase(&format!(
                            "内嵌页：仍停留在门户（{last_url}），第 {full_retries} 次重试整页直达"
                        ));
                        let _ = webview.navigate(target_url.clone());
                    }
                }
            }
            Err(_) => {
                // 导航瞬间 eval 抖动属正常，继续等待。
            }
        }
    }
}

/// 在门户 SPA 内通过 location.hash 落到目标路由（与独立窗口版 hongyi_dashboard 相同机制）。
fn apply_fragment(webview: &Webview, fragment: Option<&str>) -> Result<(), String> {
    let Some(fragment) = fragment else {
        return Err("目标地址缺少路由片段（#），无法走门户 hash 导航。".to_string());
    };
    if fragment.len() <= 1 {
        return Ok(());
    }
    let js = crate::hongyi_dashboard::NAV_DASHBOARD_JS.replace("__HASH__", &js_string(fragment));
    let _ = eval_json(webview, &js)?;
    Ok(())
}

/// 完整打开流程（含 OA 单点）：快路径「child 已停在目标页」直接放大显示，否则跑 drive。
fn try_open(app: &AppHandle, target: &str) -> Result<String, String> {
    let existed = child_of(app).is_some();
    let child = ensure_child(app)?;
    // 复用既有 child（上一次关闭只缩到 1×1）→ 放大前稍作稳定。
    if existed {
        std::thread::sleep(Duration::from_millis(150));
    }
    show_child(app)?;

    // 快路径：已停在目标页面 → 不重跑 OA 单点。
    if let Ok(current) = state(&child) {
        if on_target(&current, target) {
            log_phase("虹翼页面已就绪，直接显示（跳过单点）");
            return Ok("虹翼页面已在 App 内显示。".to_string());
        }
    }

    let env = crate::command_runtime::read_skill_env();
    let user = env.get("OA_USERNAME").cloned().unwrap_or_default();
    let pass = env.get("OA_PASSWORD").cloned().unwrap_or_default();
    drive(&child, &user, &pass, target)
}

/// 打开默认（配置）目标。命令入口，单飞（busy 锁覆盖整个驱动过程）。
pub fn open_in_app(app: &AppHandle) -> Result<String, String> {
    let target = target_url();
    let _guard = match acquire_busy() {
        Ok(guard) => guard,
        Err(_) => return Ok("正在 App 内打开虹翼页面，请稍候…".to_string()),
    };
    let result = try_open(app, &target);
    match &result {
        Ok(summary) => {
            log_phase(&format!("内嵌打开成功：{summary}"));
            audit(&target, "success", summary, "");
        }
        Err(error) => {
            log_phase(&format!("内嵌打开失败：{error}"));
            audit(&target, "failed", "虹翼页面内嵌打开失败", error);
        }
    }
    result
}

fn validate_target(raw: &str) -> Result<String, String> {
    let target = raw.trim().to_string();
    if !target.starts_with("https://") {
        return Err("请输入以 https:// 开头的完整地址。".to_string());
    }
    let parsed = tauri::Url::parse(&target).map_err(|_| "地址格式无法解析。".to_string())?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "地址缺少域名。".to_string())?;
    if host != ALLOWED_HOST {
        return Err(format!(
            "仅支持 {ALLOWED_HOST} 域名下的页面（单点会话只对该域有效）。"
        ));
    }
    Ok(target)
}

/// 跳转目标：已有会话则直接整页导航；落地遇未登录/会话失效则补跑 OA 单点后直达目标。
/// 命令入口，单飞（busy 锁覆盖全程，与打开互斥）。
pub fn navigate_to(app: &AppHandle, raw_target: &str) -> Result<String, String> {
    let target = match validate_target(raw_target) {
        Ok(value) => value,
        Err(error) => return Err(error),
    };
    let _guard = match acquire_busy() {
        Ok(guard) => guard,
        Err(_) => return Ok("正在单点登录中，稍候再试跳转…".to_string()),
    };
    let result = (|| -> Result<String, String> {
        let child = ensure_child(app)?;
        show_child(app)?;

        // 已停在目标页 → 直接显示。
        if let Ok(current) = state(&child) {
            if on_target(&current, &target) {
                return Ok("已在该地址。".to_string());
            }
        }
        // 直接整页导航；落地遇未登录态则补跑 OA 单点后直达。
        match land_and_observe(&child, &target, Duration::from_secs(40), "目标页面加载") {
            Ok(summary) => Ok(summary),
            Err(error) if error == "SSO_NEEDED" => {
                log_phase("跳转遇到未登录态，补跑 OA 单点后直达目标");
                try_open(app, &target)
            }
            Err(error) => Err(format!("{error}；若提示未登录请稍后重试")),
        }
    })();

    match &result {
        Ok(summary) => audit(&target, "success", &format!("跳转：{summary}"), ""),
        Err(error) => audit(&target, "failed", "跳转失败", error),
    }
    result
}

/// 内嵌 child 当前实际 URL（无 child 返回 None）。
pub fn current_url(app: &AppHandle) -> Option<String> {
    child_of(app).and_then(|child| child.url().ok().map(|url| url.to_string()))
}

/// 刷新当前虹翼页面。
pub fn reload_embed(app: &AppHandle) -> Result<(), String> {
    if let Some(child) = child_of(app) {
        child
            .eval("location.reload(); true;")
            .map_err(|error| format!("刷新失败：{error}"))?;
    }
    Ok(())
}

/// 关闭虹翼内嵌页：缩到 1×1 隐藏（页面与门户会话保留，再次进入直接复用）。
/// 不做 busy 等待、不用 hide/show（v2：缩尺寸隐藏——保留会话且避免 unstable hide/show 与
/// 独立窗口的绘制问题；驱动即使仍在跑也照常完成并记日志）。
pub fn close_in_app_impl(app: &AppHandle) -> Result<(), String> {
    hide_child(app)?;
    log_phase("虹翼页面已隐藏（1×1 占位，会话保留，再次进入直接复用）");
    audit(
        DEFAULT_TARGET_URL,
        "success",
        "虹翼内嵌页已隐藏（保留会话，下次进入直接复用）",
        "",
    );
    Ok(())
}
