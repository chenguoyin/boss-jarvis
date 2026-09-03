# 虹翼数智「部门看板」App 内快捷打开（OA 单点）—— 详细步骤记录

> 状态：已实施第一版（2026-09-02），macOS 实机冒烟通过；Windows WebView2 与 UI 按钮点击路径待人工验证。
> `src-tauri/src/hongyi_dashboard.rs` 命令 + 前端入口已落地并通过 `cargo check/test`、`tsc`、`vite build`、
> design/shell 检查；真实 WKWebView 窗口全链路成功（见第 5 节「实机验收」）。
> 目的：在 Boss Jarvis App 内一键打开虹翼数智固定页
> `https://hongyi.changhong.com/rcsit-prc-web/#/rcsit-prc-web/report/departmentDashboard`，
> 自动完成 OA 单点链路，并把链路参数、Cookie、实现步骤记录为本仓库唯一事实来源。
> 本文档只记录形态与步骤，**不出现** JWT / Cookie / Token 明文（凭证仍只在 `~/.boss-jarvis/skill-env.conf` 与各 Skill storage 本地保存）。

---

## 1. 现状

- 侧栏「虹翼外链」（`src/lib/sections.ts` 的 `hongyi-external`）当前渲染的是经营数据视图 `HongyiBusinessOverview`（`src/App.tsx`），并非虹翼页面本身。
- `src/components/HongyiExternalView.tsx` 存在一份 iframe 残稿：把 `x-sid` 拼到 URL query、再 `postMessage` 认证信息——跨源 iframe 无法注入 Cookie / 写入目标源 sessionStorage，**该做法不可行**，属待清理/待替换。
- 已有 Skill 资产可复用：`oa-todo` 共享 OA 登录（`~/.codex/skills/.shared/`）、`hongyi-*` 系列已实现「OA 单点 → 虹翼」取数与 api-gateway 直连（x-sid header 模板），全部只读。

## 2. OA → 虹翼数智 单点链路（2026-09-02 实测事实）

完整链路在一次浏览器会话内即可复现（无感约 10–20 s）：

| 步骤 | 动作 | 说明 |
|---|---|---|
| 1 | 登录 OA `https://oa.changhong.com` | 账号/密码表单；登录后首页 `/#/sd-frame/oa-ch`，出现「待办/快捷导航」等 |
| 2 | OA 首页点击「虹翼数智」 | DOM 为 `<a target="_blank">`（**无 href**，`onclick` 由 SPA 处理），`target="_blank"` |
| 3 | OA 签发 chGT JWT | OA 内部先后请求 `/api/oa/v1/auth/getSsoToken`、`/api1/singleLoginServlet` 等，产出一个**短效 JWT（chGT，分钟级 TTL）**；`singleLoginServlet` 入参 `token` 的来源与动态获取见 §2.5 |
| 4 | OA `window.open(blob:https://oa.changhong.com/…)` | blob 页 = 自动提交表单页 |
| 5 | **表单 POST 到虹翼** | `POST https://hongyi.changhong.com/api-gateway/sei-basic/sso/login?authType=chGT`，body（form-urlencoded）仅一字段：`token=<JWT>`。JWT payload ≈ `{"payload":"{\"name\":\"<OA账号>\"}"}`（实测账号为 OA 账号数字串，如 `20290926`） |
| 6 | **302 落点（关键参数）** | `Location: https://hongyi.changhong.com/sei-portal-web/#/sso/subPageTurnPage?rd=<随机>&authType=chGT&sid=<新生成UUID>&token=<同JWT>` |
| 7 | 门户 SPA 完成登录 | 消费 `sid/token` 后落点 **`https://hongyi.changhong.com/sei-portal-web/#/DashBoard`** |
| 8 | 打开部门看板 | 同一标签内把 hash 改为 `#/rcsit-prc-web/report/departmentDashboard` → 门户微前端加载 rcsit-prc-web 并渲染看板（菜单：基础配置/项目管理/销售管理/报表中心…）。实测最终 URL：`https://hongyi.changhong.com/sei-portal-web/#/rcsit-prc-web/report/departmentDashboard` |

> 用户提供的“固定地址”`/rcsit-prc-web/#/rcsit-prc-web/report/departmentDashboard` 是该应用独立部署形态；门户内等价路由为上述第 8 步。

### 2.1 登录后写入的 Cookie（`hongyi.changhong.com`，均为持久型）

| 名称 | 属性 |
|---|---|
| `JSESSIONID` | path `/`，httpOnly |
| `sei_local` | path `/`，httpOnly，secure |
| `x-sid` | path `/`，httpOnly，secure（**注意：x-sid 同时是 cookie**） |
| `SEI_CLIENT` | path `/`，httpOnly，secure |

### 2.2 sessionStorage（标签页级，门户 SPA 自写）

`AUTH`（base64 的 URL 编码 JSON 登录响应）、`CURRENT_USER`、`POLICY`、`x-sid`、`ENABLE_*` 等。
`sessionStorage['x-sid']` 形态：`base64(URL编码("\"<UUID>\""))`（decode 后为带引号 UUID，去引号即明文 UUID，形如 `5C942F19-…-…-…-0242C0A84403`）。
api-gateway 直连取数用**明文 UUID 作请求头**：`x-sid: <UUID>`、`x-project: rcsit-prc`（模板样例见 `hongyi-business-storage.json` 的 `apiTemplates[*].headers`）。

### 2.3 决定性约束（架构依据，均实测）

- 冷开直达 URL（无任何会话）：`https://hongyi.changhong.com/rcsit-prc-web/#/rcsit-prc-web/401` → 正文「对不起！你未登录系统，无权访问!」。
- 仅注入 hongyi Cookie（无 sessionStorage）冷开：同上 401。
- 携带完整 storageState（Cookie+origins）冷开：仍 401。
- 同浏览器**新标签**冷开门户（带 Cookie）：被重定向到 `sei-portal-web/#/user/login`（门户自有登录页，含「企业微信登录」入口）。
- 结论：**AUTH/x-sid 等会话绑定标签页 sessionStorage**，且 `sso/login` 的 chGT JWT 由 OA 当次签发、分钟级有效。因此：
  - ❌ 壳层 `<iframe>`：跨源无法注入 Cookie / 写目标源 sessionStorage；
  - ❌ “外部预热 + 往 WebView 灌 Cookie/x-sid”：会话无法跨标签/跨进程转移；
  - ✅ **必须让承载展示的同一个 WebView/窗口自己跑完整条链路**，sessionStorage 与 Cookie 天然落在该窗口。

### 2.4 验证过的可行单标签流程（Playwright 复现，即推荐方案的雏形）

1. 同一 `page` 登录 OA；
2. `page.evaluate` 注入：`window.open = (u) => { window.location.href = u; return {closed:false, close(){}, focus(){}}; }`；
3. 点击 OA 首页文本「虹翼数智」的锚点 → blob 表单在**同窗**自动提交 → 302 → 门户登录（无需弹新窗/新标签）；
4. 轮询至 URL 含 `sei-portal-web` 且正文出现门户信号（`项目管理/销售管理/报表中心` 或 `DashBoard`）；
5. `eval("location.hash = '#/rcsit-prc-web/report/departmentDashboard'")` → 看板渲染成功（正文含业务菜单与看板）。

复现脚本：`/tmp/hongyi-sso-explore.cjs` / `…2.cjs` / `…3.cjs`（临时探测脚本，未入库；步骤要点已记录于本文）。

### 2.5 `singleLoginServlet` 的入参 `token` 来源（2026-09-02 实测澄清：动态取，勿固定样例）

- **语义**：`POST https://oa.changhong.com/api1/singleLoginServlet`，body 为 JSON
  `{"op":"getLoginData","token":<JWT>,"root":{"sys":"hxht","url":…}}`。其中 `token` **不是固定样例值**，
  而是 **OA 登录时服务端动态下发的 `access_token`**：登录后前端落 `sessionStorage['sd-ssoToken']`（**裸 JWT**），
  `localStorage['xm-accessToken']` 为同源值（普通业务 API 请求头写作 `Authorization: Bearer <token>`）。
- **claims 同构（实测比对）**：OA 登录态 `sd-ssoToken` 与接口分析用样例的载荷键集一致
  `[name,email,phone,emp_no,access_uuid,refresh_uuid,nbf,exp]`，`iss=changhong.com`，HS256，**有效期 24h**（nbf→exp）。
- **OA 登录接口链**（2026-09-02 由 `oa.changhong.com/js/app.1c2e8f4f.js` 反推）：
  1. `GET api/ott` → `{id, token}`（一次性防重放参数）；
  2. `POST api/login`，body `{username, password: SM4(ott…, 明文密码), device:"WE"}` → `{access_token, refresh_token, licenseCode…}`；
  3. 会话过期前业务 API 均用该 `access_token`；刷新令牌为 `localStorage['xm-refreshToken']`。
- **动态获取三路径（按推荐序，均勿硬编码）**：
  1. **复用共享登录态**：`~/.codex/skills/.shared/oa-login.cjs` 的 `readSessionToken()` / `isSharedSessionValid()`
     （读 token 并按 `exp` 判活）→ 用该裸 JWT 直接调 `singleLoginServlet`。**已实测可行**：换票返回 157 字符 chGT 自动提交表单。
  2. **已登录 OA 的 WebView 内**：`evaluate` 读 `sessionStorage['sd-ssoToken']` 即得（无需另走 SM4/验证码）。
  3. **全新登录**：走 `api/ott` + `api/login`（含 SM4 加密与可能的验证码/风控），仅当前两条失效时使用。
- **注意事项**：
  - 传给 `singleLoginServlet` 的必须是**裸 JWT，不带 `Bearer ` 前缀**（前缀只用于普通业务 API 请求头）；
  - 24h 过期后可用 `refresh_token` 续期或重新登录；任一 token 失效都会让第 ①/② 步报 `errcode:-2 参数校验失败`；
  - 本仓库不出现任何 token 明文（凭证只存 `skill-env.conf` 与 Skill storage，本文档同守该红线）。

## 3. 推荐实现方案

> 2026-09-02 最终澄清：用户要求「把配置的 URL 页面直接显示到 App 里面，不转成其它视图」，
> 且目标 URL 是配置的、后续会变 → 主路径改为主窗口内容区**内嵌子 WebView 直显配置 URL 页面本身**
> （见 §3.1）；本节「独立次生 WebView 窗口」保留为兼容路径，两套 Rust 驱动共用同一链路事实。

**Tauri 次生 WebView 窗口 + 壳（Rust）驱动整条链路**（兼容路径），单标签流程（与 2.4 一致）。
初版交互形态：**点击侧栏「虹翼外链」分区即自动打开**——
导航一次点击直达窗口，无额外按钮步骤：

1. 前端：点击侧栏「虹翼外链」（`handleSectionSelect`）→ 进入分区由 `useEffect` 自动触发
   `openHongyiDashboard()`；重复点击已激活分区同样触发（重开/聚焦）；打开失败时分区顶栏显示
   「重新打开」按钮，其余时间只显示状态文案；下方保留原「虹翼经营情况」数据卡（不丢既有视图）。
2. Rust 命令 `open_hongyi_dashboard` 单飞执行（并发打开直接返回“正在打开…”）：
   - 快路径：`hongyi-dashboard` 窗口已存在且停留在部门看板（URL 含 `sei-portal-web` +
     `departmentDashboard`）→ 仅 `show`+`set_focus`，不再重跑 OA 单点；
   - 否则新建/复用窗口并 `navigate` 到 OA 首页，阶段驱动：
     1. 登录页检测（`input[placeholder="请输入您的账号"]`）→ 从 `skill-env.conf` 读
        `OA_USERNAME/OA_PASSWORD`（不硬编码）自动填表登录；
     2. OA 首页就绪 → `eval` 注入 `window.open` 补丁 → 点击「虹翼数智」锚点；
     3. 轮询至 `sei-portal-web`（门户）→ `eval` 改 hash 到 `#/rcsit-prc-web/report/departmentDashboard`；
     4. 正文出现部门看板信号即成功；超时/`user/login`/401 返回阶段化中文错误。
3. 阶段日志落 `~/.boss-jarvis/logs/hongyi-open.log`（无凭证）；每次打开成功/失败写 audit-log。
4. 二次打开：OA Cookie 仍在窗口存储则跳过登录直达；门户 sessionStorage 绑定标签，
   每次真开都会重跑 SSO（约 10–20 s）；窗口已在看板时只聚焦、不重登。

### 3.1 内容区内嵌直显配置 URL（2026-09-02 v2 后的主路径）

> 承载层演进（详见 §5.3）：① add_child 子 WebView（v1，hide/show 闪退）→
> ② 无边框独立窗口贴内容区（点击/拖动主窗白板、失焦掉绘制，平台窗口合成顽疾，弃）→
> **③ child WebView v2（当前）**：真内嵌随主窗一起绘制，天然免疫「点击主窗/拖动白板」；
> 隐藏改用 set_bounds 1×1（会话保留、无 hide/show）。登录驱动/直连/落地双策略全程不变。

用户要求「直接打开页面而不是转成其它视图」，且 URL 是配置的、后续会变——因此不做原生数据卡片转换，
而是由虹翼面板窗口（无边框 WebviewWindow，贴主窗口内容区、看起来就是 App 的一部分）自己跑完整条
链路后**整页导航到配置的 URL 页面本身**：

1. 交互：点击侧栏「虹翼外链」→ 自动在 App 内容区嵌入目标页面（OA 单点由 Rust 驱动，优先
   公共凭证直连）；退出入口 = 分区头「×」/ 顶栏「返回」/ 切换其它分区（退出=缩到 1×1，
   页面与会话保留）；打开失败分区内显示「重新打开」。下方原生视图（经营数据卡）退出后可见。
2. 布局（2026-09-02 三次反馈收敛为「按 OA 待办页的区域嵌入」）：左侧导航宽 72、顶栏高 60
   （AGENTS.md 尺寸约定）。嵌入态顶部保留一行 React 分区头（44px，标题 + 状态 + 返回按钮，与
   OA 待办等分区的 header 一致、不遮挡），虹翼面板窗口贴分区头下方的内容区（左缘 x=101、
   上缘 y=118，右/下各留 28，与其它分区正文区域一致，不遮顶栏/分区头，也不会撑大主窗口）；
   随主窗口 `Resized`/`Moved` 同步贴位。退出后恢复分区原生内容（标题 + 经营卡片），两态干净切换。
3. 会话与单点（2026-09-02 增补「公共 OA 凭证直连」优先）：
   a. **公共凭证直连（首选）**：读 `~/.codex/skills/.shared/oa-session.json` 的 `sd-ssoToken`
      （OA access_token，裸 JWT，`exp` 判活；文件缺失/过期则跳过）→ 在 OA 同源页用**同步 XHR**
      `POST /api1/singleLoginServlet`（body `{op:"getLoginData",token,root:{sys:"hxht",url:""}}`）
      换 chGT 票据 → 解析返回表单的 action/token → 隐藏表单 POST 直达门户（§2.5 换票链路，
      同源无 CORS；票据/凭证不经壳层、不入日志；**必须同步脚本**——async 返回值无法被 eval
      序列化，2026-09-02 日志定位为「页面脚本返回无法解析」）→ 门户就绪后落地目标。
   b. **回退页面登录**：凭证缺失/过期/换票失败/落地失败 → 回到 OA 页面走 2.4 页面链路
      （登录表单或已有会话 → 注入 window.open 补丁 → 点击「虹翼数智」→ 门户登录完成）。
   c. **落地双策略**（实机反馈修复）：① 先整页直达目标；② 若被门户 SPA 兜回、多次直达仍停留在
      `sei-portal-web` → 自动改走**门户 hash 路由**（`location.hash` 设目标路由片段，macOS
      WKWebView 实机验证路径）保证看板内容展示。导航前先等门户 DashBoard 正文渲染
      （`hasPortalBiz`/`dashboard`）再发起，避免与登录回调竞争；成功判定排除门户目录
      （“能进门户”不再误报为“已到目标”）。Cookie/Token 仍不经过壳层中转。
   d. **只加载一次**（2026-09-02）：退出只 `hide` 面板窗口（不销毁）——页面与门户会话保留，
      同一运行期内再次进入走快路径直接复用显示，**不重跑单点加载**；仅当页面已离开目标/正文
      显示未登录时快路径不命中，才重跑完整流程。App 重启后面板窗口重建，首次进入仍完整跑一次
      （运行期多次进入不重复）。
4. 目标 URL 配置：读 `~/.boss-jarvis/skill-env.conf` 的 `HONGYI_EXTERNAL_URL`（与 hongyi-external
   技能同键，系统配置可写）；缺省为部门看板 `DEFAULT_TARGET_URL`
   （`…/rcsit-prc-web/#/rcsit-prc-web/report/departmentDashboard`）。换地址只改配置不改代码。
5. 实现：`Cargo.toml` 的 `tauri` 依赖保留 `unstable` feature（多 webview `add_child` 需要）；
   `src-tauri/src/hongyi_embed.rs`（`ensure_child` 串行挂载子 WebView（初始 1×1）+
   `set_slot`/`content_rect` 实测锚点（相对主窗内容）+ `show_child`/`hide_child`
   （显示=贴内容区；隐藏=缩 1×1；resize 据可见标志同步）+ `shared_oa_token`/`DIRECT_SSO_JS`
   公共凭证直连（同步 XHR）+ `drive` 阶段驱动（直连优先、页面登录回退）+ `land_and_observe`
   落地双策略 + `open_in_app` 单飞/快路径 + `close_in_app_impl` 1×1 隐藏保留会话
   （busy 守卫 RAII Drop 自动复位）；`lib.rs` 注册 open/close/set_slot（navigate/current/reload
   保留未接 UI）；前端 `skillBridge.setHongyiSlot` 打开前上报内容区占位左上角。
   `lib.rs` 注册 `open_hongyi_in_app` / `close_hongyi_embed`，setup 里 `hongyi_embed::init` 注册
   主窗口 resize/move/关闭事件（移动/缩放贴位、主窗关闭连带关面板）；
   前端 `src/lib/skillBridge.ts` 增 `openHongyiInApp()/closeHongyiEmbed()`，`App.tsx` 分区进入自动
   触发、离开自动隐藏、关闭态「打开页面」按钮；`TopBar` 激活时显示「返回」按钮
   （同分区再点不再 toggle hide/show，避免高频交替；退出收敛到分区头「×」/顶栏「返回」/切分区）。
   `hongyi_embed_navigate/current_url/reload` 命令保留未注册到 UI（地址栏已移除）。
   原独立窗口命令 `open_hongyi_dashboard` 保留未动。
6. 平台注意：承载层为无边框 WebviewWindow（稳定 API，本机 tauri 2.11.5；`unstable` feature 仅为
   `get_webview_window` 句柄存在）。面板窗口随主窗口激活在内容区；resize/move 由 Rust 同步贴位，
   用户不可拖动（decorations=false、resizable=false）。WebView 引擎差异（macOS WKWebView /
   Windows WebView2）仍需实机冒烟。

### 3.2 界面简化与持久化（2026-09-02 用户三点要求）

1. **隐藏地址栏**：不再显示任何工具条/输入框；虹翼面板窗口贴在分区头下方的内容区内（§3.1 布局），
   顶部保留一行分区头（标题+状态+返回）。换目标地址一律走配置 `HONGYI_EXTERNAL_URL`
   （系统配置可改）；退出入口 = 分区头「×」/ 顶栏「返回」/ 侧栏与分区切换。
2. **只加载一次完整流程**：退出（切分区/返回按钮）只 `hide` 面板窗口，保留页面与门户会话；
   再次进入直接复用显示。完整单点链路只在首次进入、页面失效（快路径不命中）或 App 重启后跑。
3. **OA 登录采用公共凭证直连**：复用 OA 共享登录态 `~/.codex/skills/.shared/oa-session.json`
   的 `sd-ssoToken`（24h JWT，exp 判活）→ 换 chGT 票据 → 表单 POST 直达门户（见 §3.1-3a），
   不再每次在 OA 页面填表/点击；凭证失效才回退页面登录。审计：打开成功/失败/关闭各写一条。

## 4. 备选方案（记录在案，不推荐为主路径）

| 方案 | 结论 |
|---|---|
| 现状 iframe + 认证参数拼接/postMessage（`HongyiExternalView.tsx`） | 不可行，跨源无法注入 Cookie/写 sessionStorage；建议删除残稿 |
| 冷直达 URL / 外部预热后灌 Cookie | 实测 401 或转门户登录页 |
| 反向工程 OA `/api1/singleLoginServlet` 自行签发 chGT JWT 后直接 POST | 可行但更脆（依赖 OA 内部接口契约），仅作 B 计划 |

## 5. 实施清单（2026-09-02 已实施第一版）

### 5.1 第一版：独立次生 WebView 窗口（§3 兼容路径）

- [x] 文档落地：本文档完成（即本条）。
- [x] Rust：`src-tauri/src/hongyi_dashboard.rs`（`ensure_window` 主线程调度新建/复用 `hongyi-dashboard` 窗口 + `drive` 分阶段驱动；`open` 单飞锁 + 「窗口已在看板则仅聚焦」快路径）；`lib.rs` 注册命令 `open_hongyi_dashboard`（保留现有 `open_hongyi_with_auth` 兼容入口）；`command_runtime::record_audit` 提为 `pub(crate)` 供复用。
- [x] 前端：`src/lib/skillBridge.ts` 增加 `openHongyiDashboard()`；**点击侧栏「虹翼外链」即自动打开**（进入分区 `useEffect` 触发 + 重复点击已激活分区兜底 `handleSectionSelect`；失败显示「重新打开」按钮；下方保留「虹翼经营情况」数据卡；沿用 `jv-*` 令牌与字号类，无新增色值/字号）。
- [ ] ~~`skills/manifest.json` 补 action~~：**不适用**。窗口驱动是原生 Rust 命令（Tauri 直接管理 WebView），不走 Skill 脚本；manifest 的 action 必须指向真实脚本，凭空声明会触发启动校验报错。若日后需要 CLI 入口再补脚本。
- [x] 静态验证：`npx tsc --noEmit`、`npm run build`、`npm run check:design`、`npm run check:shell`、`cargo check --lib`、`cargo test`（默认套件）全部通过。
- [x] macOS 实机冒烟（2026-09-02）：`BOSS_JARVIS_SMOKE_HONGYI=1 npm run tauri dev`（临时 setup 钩子自动触发命令，验证后已移除）→ 真实 WKWebView 窗口跑通全链路，`~/.boss-jarvis/logs/hongyi-open.log` 记录：`OA 页面已加载 → OA 自动登录已提交 → OA 首页就绪 → 已点击「虹翼数智」入口 → 虹翼门户已登录（sei-portal-web）→ 部门看板加载完成 → 打开成功`。
- [ ] 实机验收（待做）：
  - 点击侧栏「虹翼外链」→ 自动打开窗口并落到部门看板（人工点一次确认前端自动触发链路）；再次进入只聚焦不重登；失败态「重新打开」按钮；
  - 首次手动登录 / 二次打开跳过 OA 登录 / 凭证错误与断网提示 / 窗口关闭重开；
  - Windows WebView2 同链路冒烟；
  - 看板可交互（切菜单、看数据）；
  - audit-log 留痕核对。
- [ ] 风险单列实测：WKWebView/WebView2 引擎差异（当前已统一 Chrome-like UA，macOS 冒烟通过；Windows 待实测）；OA 登录态跨重启持久性；WebView 是否触发风控。
- [ ] 备注：窗口创建必须在主线程 —— `ensure_window` 已通过 `AppHandle::run_on_main_thread` 调度（直接跨线程 `WebviewWindowBuilder::build` 会失败）；驱动阶段日志落 `~/.boss-jarvis/logs/hongyi-open.log` 便于排障（无凭证内容）。

### 5.2 增补：主窗口内嵌子 WebView（2026-09-02，§3.1 主路径）

- [x] 文档：§3.1 落地（即本条）。
- [x] Rust：`Cargo.toml` `tauri` 加 `unstable` feature；新增 `src-tauri/src/hongyi_embed.rs`
      （`ensure_child` 串行挂载 + `content_rect`/`place_child` + `drive` 阶段驱动 + 单飞/快路径 + 关闭复用）；
      `lib.rs` 注册 `open_hongyi_in_app` / `close_hongyi_embed` 命令与 setup `init`（主窗口 resize 同步）；
      复用 `hongyi_dashboard.rs` 的 JS 常量与工具（改 `pub(crate)`），`hongyi_dashboard.rs` 原逻辑未动。
- [x] 前端：`skillBridge.ts` 增 `openHongyiInApp()/closeHongyiEmbed()`；`App.tsx`「虹翼外链」分区
      进入自动内嵌打开、离开自动隐藏、失败「重新打开」、关闭态「打开页面」按钮；沿用 `jv-*` 令牌，
      无新增色值/字号。
- [x] 静态验证：`npx tsc --noEmit`、`npm run build`、`npm run check:design`、`npm run check:shell`、
      `cargo check` 全部通过。
- [x] 地址栏增补又移除（2026-09-02）：先加地址栏（几何 x=73/y=104 + `on_page_load` 推送 URL +
      2s 轮询 + 回车跳转），随后按用户要求**隐藏地址栏**：几何回到 x=73/y=60 铺满、React 移除地址栏
      UI/轮询/跳转处理器、CSS 清理，页面即界面。
- [x] 三要求改造（2026-09-02）：① 隐藏地址栏（分区头「×」/顶栏「返回」作退出入口）；② 关闭只 hide
      不 about:blank——页面与门户会话保留，再次进入快路径直接复用不重跑；③ 公共 OA 凭证直连
      （`shared_oa_token` exp 校验 + `DIRECT_SSO_JS` 在 OA 同源页换票表单 POST 直达门户，
      失败回退页面登录；`HONGYI_DIRECT_SSO=0` 可关）；`cargo check`、`tsc`、`build`、design/shell
      检查通过。
- [x] 布局与稳定性修复（2026-09-02 用户反馈）：内嵌区域改回「OA 待办页正文位」（x=101/y=118，
      右/下留 28，分区头 44 行不被遮、不再整窗铺满）；关闭命令与打开/驱动走同一 busy 锁串行 +
      复用 child show 前稳定 150ms，防「第 2 次点击闪退」（hide/show 与驱动并发）；直连等待收紧
      （门户 60s / 落地 90s），失败即回退页面登录，日志分段可排障。
- [ ] macOS 实机冒烟（待做）：进入「虹翼外链」→ 内嵌部门看板铺满渲染且可交互；公共凭证直连单点
      成功（日志出现「公共凭证直连单点成功」）；退出再进入不重跑（日志直接快路径）；换目标地址走
      系统配置生效；resize 同步；分区头「×」/顶栏「返回」/切分区退出正常；
      App 重启后首次进入完整跑一次；`add_child` 平台行为确认。
- [ ] Windows WebView2 多 webview 冒烟（待做）。
- [ ] 配置化验证：`skill-env.conf` 写 `HONGYI_EXTERNAL_URL` 换一个同源 URL → 分区内直显新地址。
### 5.3 路线 A：无边框面板窗口贴内容区（2026-09-02 收敛，§3.1 当前主路径）

- [x] 决策：用户多轮不收敛后明确换路线（2026-09-02）：弃用 unstable 多 webview
      （add_child / webview hide-show 的几何错位与闪退均源于 unstable API），改**无边框
      WebviewWindow 贴内容区**——窗口级 show/hide/set_position/set_size 稳定；登录驱动、直连、
      落地双策略、busy 单飞/快路径全部复用，仅承载层变化。
- [x] v1 内嵌版（2026-09-02 上午）：add_child 子 WebView + hide/show 复用会话；几何/直连多次
      迭代（最终 09:23 秒级直达成功）；v1 缺陷：hide/show 交替闪退、unstable 几何怪癖。
- [x] ② 无边框独立窗口版（2026-09-02 下午）：WebviewWindow 贴主窗内容区（parent 子窗 + 绝对
      屏幕坐标 + 实测锚点）；卡死修复（busy RAII）、close 简化、对齐修复均已完成并全绿——
      但用户实测「点击主窗/拖动主窗均白板、失焦掉绘制」，判定平台窗口合成顽疾不可收敛。
- [x] v2 child WebView（2026-09-02 收敛，当前）：回到主窗内嵌 child WebView——
      **真内嵌随主窗一起绘制**（免疫点击/拖动白板）；隐藏 = set_bounds 1×1（不再 hide/show，
      消除 v1 闪退源）；保留全部修复（busy RAII、同步 XHR 直连、实测锚点对齐、close 直达、
      resize 可见标志同步）。cargo check/test 全绿。
- [x] 前端：命令与交互不变（分区头「×」/顶栏「返回」/切分区退出；同分区再点不 toggle）；
      文案注释同步为「面板窗口贴内容区」。
- [x] 静态验证：`cargo check`、`tsc`、`build`、design/shell 检查通过。
- [ ] macOS 实机冒烟（待做）：见 §5.2 末条；重点：贴位观感、反复进出不闪退、直达看板。
- [ ] Windows WebView2 冒烟（待做）。

## 6. 验收清单（待实机/人工确认；驱动链路 macOS 已通）

- [ ] App 内点击侧栏「虹翼外链」→ 面板窗口贴内容区显示配置 URL 页面（§3.1 主路径；OA 单点 macOS
      驱动链路已通，窗口贴位与交互待人工点一次确认）；原独立窗口命令仍可用（兼容路径）
- [x] Cookie/x-sid/Token 不经壳层中转（会话只活在专用面板窗口的 WebView 内）；日志与审计无凭证
      （代码审查）
- [ ] 失败可见可重试（登录失效 / 网络断 / 超时各有明确提示）（待人工）
- [ ] macOS/Windows 同一套代码路径（平台差异只收敛在 manifest/原生适配层）（Windows 待实测）
- [x] 本文档与实现一致，作为后续维护唯一来源

## 7. 安全与审计（遵循 AGENTS.md）

- 不在源码/文档/日志硬编码 OA 账号、密码、JWT、Cookie、Token；凭证只存 `skill-env.conf`。
- 打开动作只读浏览；不在该窗口内自动点击任何审批/写按钮。
- 自动填 OA 密码与既有取数脚本同源；如需收紧可在系统配置提供「自动登录 OA」开关。
- 每次开窗/登录/失败都写审计留痕。
