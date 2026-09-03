## 2026-08-30 Windows Coremail 直连标记已读便携测试包 v4

### 产物
- `dist-windows/BossJarvis_0.1.0_x64-portable-coremail-read-v4-20260830.zip`
- ZIP SHA-256：`53cfebf451956a965ebe77aad609b5133987e41319f3f92b2cb6cdf24d6e83d7`
- 大小：741,943,994 bytes（约 708 MiB）

### 标记已读行为
- `changhong-mail/mark-mail-read.cjs` 原样接收邮件列表的 `rows[].id`，通过 Coremail `mbox:updateMessageInfos` 将该邮件的 `flags.read` 设为 `true`。
- 优先使用 OA 凭证建立 Coremail HTTP 会话；HTTP 路径失败时通过 Playwright 完成 OA 单点，并调用同一 Coremail 接口。
- macOS 与 Windows 均不调用 Mail、Outlook、AppleScript、Outlook COM 或本地邮件数据库；只有 Coremail 返回 `S_OK` 才报告 `markedRead: true`。

### 验证
- 邮件动作行为测试 14/14 通过，覆盖确认门禁、单 ID 写入、请求协议、HTTP/浏览器路径、失败不误报，以及双平台默认邮件客户端回复。
- Skill 校验、Node 语法、前端 build、设计令牌、壳层、图标检查、Rust 7 项单元测试、`cargo check --lib` 和 Windows x64 交叉编译通过。
- 项目 `lint` 脚本未执行成功：当前依赖中没有可用的 `eslint` 命令；未为本次任务临时新增依赖。
- ZIP 完整性检查通过，共 4,790 个条目；包内 EXE、Coremail 客户端和标记已读脚本哈希与构建产物一致。
- 包内未发现 `windows-outlook-mail`、`company-mail`、`*.local.json`、`skill-env.conf`、会话缓存、`.DS_Store`、`__MACOSX` 或 `undefined`。
- 为避免改变真实邮箱状态，macOS 上未执行真实标记已读；OA/Coremail 实际写入留待目标 Windows 机器验收。

## 2026-08-30 Windows 默认邮件客户端便携测试包 v3

### 产物
- `dist-windows/BossJarvis_0.1.0_x64-portable-default-mail-v3-20260830.zip`
- ZIP SHA-256：`67e30da453c6b2ca9e387ce79d9aa552981734c834a700fd2cb2138cd6da9da5`
- 大小：741,929,277 bytes（约 721 MiB）

### 邮件回复行为
- `changhong-mail/open-confirmed-reply.cjs` 在 macOS 与 Windows 均使用 `mailto:` 打开系统默认邮件客户端。
- Windows 通过 PowerShell `Start-Process` 调用默认协议处理器，不依赖 Outlook COM 或固定 `OUTLOOK.EXE` 路径。
- 仅打开已填入收件人、主题和正文的草稿窗口，绝不自动发送。

### 验证
- 前端 build、设计令牌、壳层检查、Rust 默认测试、Windows x64 交叉编译通过。
- 邮件启动行为测试 6/6 通过；确认门禁、中文/换行编码、双平台启动和失败处理均覆盖。
- ZIP 完整性检查通过，共 4,790 个条目；包内 EXE/DLL/邮件脚本哈希与构建产物一致。
- 包内未发现 `windows-outlook-mail`、`company-mail`、`*.local.json`、`skill-env.conf`、会话缓存、`.DS_Store` 或 `__MACOSX`。
- Windows 默认邮件客户端的实际窗口行为待目标 Windows 机器验收。

## 2026-08-30 Windows 邮件误走 Outlook 旧路由修复

### 根因
- Windows 端提示 `OUTLOOK.EXE not found` 的文本只存在已停用的 Outlook 脚本，当前 `changhong-mail` Coremail 脚本不包含该路径。
- manifest 原先只在编译时内嵌，替换便携包外部 `skills/manifest.json` 无法修正旧 EXE 的路由。
- `BOSS_JARVIS_SKILLS_ROOT` 环境变量原先优先于 EXE 同级 `skills/`，Windows 上的旧环境配置可将新包重新指向已停用脚本。

### 修复
- `manifest.rs` 便携包优先读取 EXE 同级 `skills/manifest.json`，内嵌 manifest 仅作缺失兜底。
- Skill 根目录改为 EXE 同级 `skills/` 优先，便携环境启动时覆盖遗留的 `BOSS_JARVIS_SKILLS_ROOT`。
- 重新交叉编译 Windows EXE，产出 `BossJarvis_0.1.0_x64-portable-coremail-unified-v2-20260830.zip`。

### 验证
- manifest 定向测试、`cargo check --lib`、TypeScript、Vite build、设计令牌与布局检查通过。
- Windows PE32+ GUI EXE 交叉编译通过。
- ZIP 完整性通过；包内无 `windows-outlook-mail` / `company-mail` / `skill-env.conf`，EXE 与 Coremail 脚本哈希与本地产物一致。

## 2026-08-26 Windows Skill 取数 node.exe 弹窗修复

### 问题
Windows 上通过 Skill 取数（Playwright 等）时，node.exe 会弹出控制台窗口。

### 根因
Tauri GUI 进程自身没有控制台；Rust 直接 spawn 控制台子系统的 node.exe 时，
Windows 会为其新建一个控制台窗口。

### 修复
- src-tauri/src/skill_runtime.rs：新增 hide_child_console()，Windows 下给
  std::process::Command 加 CREATE_NO_WINDOW（0x0800_0000），非 Windows 为 no-op。
  在 run_with_timeout、record_audit_failure 的 spawn 前调用。
- src-tauri/src/command_runtime.rs：record_audit 的 spawn 前同样调用该函数。

### 验证
- macOS cargo check --lib 通过。
- cargo xwin build --release --target x86_64-pc-windows-msvc --features custom-protocol
  交叉编译通过，产出 PE32+ GUI exe。

## 2026-08-26 Jarvis 助手消息重复显示修复

### 问题
Jarvis 助手里每发一句话，用户消息气泡显示两次。

### 根因
两层叠加：
1. 消息重复添加：组件 send() 先把用户消息加进列表，runAssistantTurn 内部又 emit 一次同样消息。
2. 运行实例是旧包：用户实际运行的是 src-tauri/target/release/bundle/macos/Boss Jarvis.app（修复前构建），源码修复不生效。

### 修复
- src/components/AssistantChatPanel.tsx：send() 不再自行添加用户消息，统一由 runAssistantTurn emit。
- 重新执行 npm run tauri build，让打包产物包含修复。

### 验证
- npx tsc --noEmit 通过。
- npm run build 通过。
- 重新打包后由用户在打包版窗口实测确认单条显示。

## 2026-08-26 Windows 交叉编译产物

### 产物
- dist-windows/BossJarvis_0.1.0_x64-portable.zip:绿色版(exe + dll + 说明),在 macOS 上交叉编译产出。

### 交叉编译链路
- cargo-xwin 已安装;llvm-rc 从 llvm-mingw release 下载到 ~/.local/bin。
- scripts/cargo-xwin-shim.mjs:让 tauri build --runner 走 cargo xwin。
- src-tauri/tauri.windows.conf.json:Windows 打包配置(当前 targets 为 nsis)。

### 已知限制
- NSIS 安装包无法在 macOS 上生成:Tauri 打 NSIS 包时强制调用 makensis.exe(Windows 二进制),
  本机无 sudo 装 brew nsis,且 brew nsis 也无法产出 Windows 安装包的签名流程。
- 正式安装包需在 Windows 机器上执行 npm run tauri build。

## 2026-08-29 上线复盘：跨平台验证 + Windows 便携版重打包

### 修复
- 邮件来源文案：Windows 取数脚本 sourceSystem 改为 "Windows Mail"（windows-outlook-mail/scripts/fetch-outlook-mail.ps1），macOS 脚本为 "macOS Mail"；MailView 兜底文案 "邮件"。
- runtime_log.rs iso_now() 分钟位误用月份的 bug，fetch.log 时间线恢复可信。
- command_runtime.rs 重复 let started 编译告警修复；冒烟测试 company-mail 更名为 changhong-mail。
- skill_runtime.rs：OA 系 Skill（oa-todo/spm-todo/oa-schedule/reminder-center/daily-briefing/hongyi-*）共享 OA 登录会话，并发互踢导致 150s 超时；改为串行组（占一个并行槽），其余 Skill 并行。
- oa-todo/read-todo-detail.cjs 两个真实 bug：analyzeEiapPage 里 saveSharedLogin(ctx, page) 引用了作用域不存在的 page（ReferenceError 直接炸掉整个取数）→ 改为 eiapPage；extractEiapDetail 弹窗 8s 窗口过后不再轮询 → 追加 8s 新标签轮询，减少"详情页未打开"误判。

### Windows 便携版重打包（dist-windows/BossJarvis_0.1.0_x64-portable-20260829.zip）
- exe/dll 用 cargo xwin 重新交叉编译（llvm-mingw 工具链修复 llvm-lib/llvm-rc 后成功）。
- 内置：WebView2 固定版 152.0.4191.53、Node 22.11.0、Playwright 1.62.1、Chromium 151（rev 1234）、skills 全量（含 windows-outlook-mail 与 .shared 登录助手），manifest.json 由 include_str! 内嵌进 exe，脚本随包携带。
- 校验：manifest 声明的 26 个脚本全部存在；.DS_Store 清理。

### 验证
- npx tsc --noEmit、npm run build、cargo check --lib、默认 cargo test 通过。
- oa-todo 单机脚本 47s 成功（ok=true，0 analyzeError）。
- 全量真实数据冒烟（fetch_all_smoke --ignored）：前两次失败分别因与两个 cargo 构建抢 CPU 导致 OA 超时、以及上述 page ReferenceError；修复后重跑中。

### 风险
- Outlook COM 回复打开、WebView2 固定版加载等 Windows 侧行为需用户在 Windows 机器实测。
- NSIS 安装包仍需 Windows 机器构建（macOS 无法产出 makensis 流程）。

## 2026-09-02 虹翼部门看板 App 内快捷打开：SSO 链路探索

### 结论（Playwright 实测，只读）
- OA→虹翼数智单点链路：登录 oa.changhong.com → 首页点「虹翼数智」（`<a target="_blank">` 无 href，SPA onClick）→ OA 签发短效 chGT JWT → `window.open(blob:)` 自动表单页 → `POST hongyi.changhong.com/api-gateway/sei-basic/sso/login?authType=chGT`（body 仅 `token=<JWT>`）→ 302 `sei-portal-web/#/sso/subPageTurnPage?…&sid=<UUID>&token=<JWT>` → 门户 DashBoard。
- 登录态：cookie `JSESSIONID/sei_local/x-sid/SEI_CLIENT`（hongyi.changhong.com）+ 标签页 sessionStorage `AUTH/CURRENT_USER/x-sid/POLICY` 等；x-sid 同时是 httpOnly cookie 与 sessionStorage（base64(URL编码带引号 UUID)），api-gateway 直连用明文 UUID header。
- 部门看板 = 门户内 hash 路由 `#/rcsit-prc-web/report/departmentDashboard`（微前端加载 rcsit-prc-web）。
- 约束：AUTH/x-sid 绑定标签页 sessionStorage；冷开直达 URL、仅注入 Cookie、带完整 storageState、同浏览器新标签，全部 401 或转门户 `user/login`。iframe/灌 Cookie 方案不可行。
- 可行单标签流程（已复现）：登录 OA → 注入 `window.open` 补丁改为同窗导航 → 点「虹翼数智」→ 门户登录 → hash 导航部门看板。
- 方案：Tauri 次生 WebView 窗口 + Rust 阶段驱动整链路；详见 docs/hongyi-dashboard-in-app.md（参数/Cookie/实施/验收清单唯一来源）。

### 实施（同日，第一版）
- 新增 src-tauri/src/hongyi_dashboard.rs：命令 open_hongyi_dashboard → 新建/复用 `hongyi-dashboard` WebView 窗口（Chrome-like UA）→ 阶段驱动：等待 OA → 自动填表登录（凭证读 skill-env.conf）→ 注入 window.open 补丁并点击「虹翼数智」→ 等待 sei-portal-web → hash 导航部门看板；wait_for 容忍页面跳转瞬间 eval 失败；成功/失败均写 audit-log；阶段日志落 ~/.boss-jarvis/logs/hongyi-open.log。
- lib.rs 注册命令（保留 open_hongyi_with_auth）；command_runtime::record_audit 提为 pub(crate) 复用。
- macOS 坑：WKWebView/NSWindow 必须主线程创建 → ensure_window 经 AppHandle::run_on_main_thread 调度（直接跨线程 build 会失败）。
- 前端：skillBridge.openHongyiDashboard()；点击侧栏「虹翼外链」即自动打开（进入分区 useEffect 触发 + 重复点击已激活分区兜底；失败显示「重新打开」按钮，下方保留「虹翼经营情况」数据卡）；不涉及 manifest（原生命令不走 Skill 脚本）。
- Rust 加固：open() 单飞锁（并发直接返回“正在打开…”）；窗口已停留在部门看板时快路径仅 show+set_focus，不重跑 OA 单点；ensure_window 主线程调度（见上）。
- 验证：cargo check --lib / cargo test、tsc --noEmit、npm run build、check:design、check:shell 全通过。
- macOS 实机冒烟通过（2026-09-02）：BOSS_JARVIS_SMOKE_HONGYI=1 npm run tauri dev（临时 setup 钩子，验证后已移除）→ 真实 WKWebView 全链路成功（hongyi-open.log：OA 自动登录→点击入口→门户 sei-portal-web→部门看板加载完成）。
- 待做：UI 按钮点击人工确认、二次打开跳过 OA 登录、Windows WebView2 冒烟、看板可交互与 audit 核对。

## 2026-09-02 恢复侧栏「经营情况」原方式：hongyi-business-overview 技能驱动展示

### 背景
- 侧栏「经营情况」（business 分区）原由 SkillDataView 用 `hongyi-business-overview`（+`hongyi-today-metrics`）落盘信封渲染原版 HongyiBusinessView 概览卡（今日专项 / 部门看板 / 经营总览 + 状态胶囊）。
- 进行中的工作台改动把 `src/components/HongyiBusinessView.tsx` 整体替换为自取数列表组件（读 `result.output.archiveItems`），而真实 Skill 落盘 JSON 的 `archiveItems/homepageItems` 在顶层、无 `output` 字段 → 列表恒为空，「经营情况」页退化为「暂无数据」。

### 修复（按用户要求恢复原方式）
- `src/components/HongyiBusinessView.tsx`：还原为原版 snapshot 概览组件（与 HEAD 一致），仍由两个 hongyi Skill 数据驱动。
- `src/App.tsx`：侧栏「经营情况」经 SkillDataView 渲染原版卡片不变；「虹翼外链」分区未激活（失败/关闭）时的数据卡改用同一原版卡片（App 级 `buildHongyiSnapshot(envelopes)`），并保留刷新按钮（调用 hongyi-business-overview / hongyi-today-metrics）。
- `src/styles/components.css`：删除仅被被替换组件引用的「虹翼经营情况展示」列表样式（jv-hongyi-stats/list/item/pill/more/action 等），原「经营情况」网格样式保留。

### 验证
- `npx tsc --noEmit`、`npm run build`、`npm run check:design`、`npm run check:shell` 全部通过。

## 2026-09-03 Windows oa-todo 取数 TypeError：isSharedSessionValid is not a function

### 现象
- Windows 上运行 oa-todo 取数，3 次重试全部失败：`第 1/3 次失败（isSharedSessionValid is not a function）…`，最终 `ERROR: isSharedSessionValid is not a function`。

### 根因（版本错位，非登录失效）
- `oa-todo/fetch-todo-with-analysis.cjs` → `read-todo-detail.cjs` 的 `launchAndLogin()` 在每次启动浏览器时无条件调用
  `isSharedSessionValid()`（2026-09-02 起要求 `.shared/oa-login.cjs` 导出该能力，用于「快照 JWT 未过期即复用会话」的登录门控）。
- Windows 机器 `%USERPROFILE%\.codex\skills\.shared\oa-login.cjs` 仍是旧版本（2026-09-02 之前，未导出
  `isSharedSessionValid` / `refreshContextSession`）；脚本已更新而共享助手未同步 → 解构得到 `undefined` →
  调用即抛 `TypeError`，与 OA 会话是否有效无关，重试多少次都一样。

### 修复（`~/.codex/skills/oa-todo/read-todo-detail.cjs`，双端复用的唯一来源）
- 共享助手改为命名空间 require + 能力检测，缺失时降级而非 TypeError：
  - `isSharedSessionValid` 缺失 → 视为「快照有效」，交页面实时复核兜底（登录表单持续存在才填表登录），行为收敛到与旧脚本一致；
  - `refreshContextSession` 缺失 → 跳过重注册（新标签页仍由 `newSharedContext` 的 addInitScript 快照兜底）。
- 冒烟验证：mock 旧版助手（无上述两个导出）+ fake chromium，`launchAndLogin()` 正常返回会话、不再抛
  `isSharedSessionValid is not a function`；用当前真实助手跑同样冒烟行为不变。

### Windows 侧待做（机器文件同步，非代码问题）
- 用本机最新 `~/.codex/skills` 覆盖 Windows 的 `%USERPROFILE%\.codex\skills`（至少 `.shared/` 与 `oa-todo/` 整目录），
  校验命令（PowerShell）：
  `node -e "const l=require(process.env.USERPROFILE+'/.codex/skills/.shared/oa-login.cjs');console.log(typeof l.isSharedSessionValid,typeof l.refreshContextSession)"`
  应输出 `function function`。便携包方式则重新打包含当前 `.shared` 与 `oa-todo` 的包。

## 2026-09-03 Windows Skill 默认改走 exe 同级 skills/，去除 home 硬编码路径

### 背景（用户要求）
- Windows 上不能依赖 `%USERPROFILE%\.codex\skills` 这类写死路径；运行时默认取**当前运行
  应用程序（exe）同一目录下的 skills/**。此前 Windows 便携包 skills/ 只有 manifest +
  windows-outlook-mail（16 条目），通用 Skill 缺失 → skills_root 回落到 home 路径 →
  机器间不同步导致「isSharedSessionValid is not a function」版本错位（见上一节）。

### 代码改动（src-tauri）
- `manifest.rs::skills_root()`：解析顺序 exe 同级 skills/（存在即用）→ `BOSS_JARVIS_SKILLS_ROOT`
  环境变量 → 平台默认。**Windows 平台默认即 exe 同级 skills/**：即使目录缺失也返回该位置，
  让启动校验清晰报错，绝不回落 `%USERPROFILE%\.codex\skills`；macOS 开发仍用 manifest
  声明的 `~/.codex/skills`。缺失报错追加根目录路径便于定位。
- `lib.rs open_hongyi_with_auth`：脚本路径改经 `manifest::skills_root()` 解析
  （原写死 `$HOME/.codex/skills/hongyi-external/...`）。
- `hongyi_embed.rs` `shared_oa_token()`：`.shared/oa-session.json` 改经 `skills_root()` 解析
  （原写死 `$HOME/.codex/skills/...`）；模块顶部注释同步。

### 脚本改动（~/.codex/skills，双端复用唯一来源；26 个文件）
- 共享登录态/会话文件一律改随 `__dirname` 推导（`../.shared/oa-storage.json`），不再写死
  `/Users/chenguoyin/.codex/skills/...`：oa-todo（fetch-todo-with-analysis/fetch-todo/
  read-todo-detail/read-eiap-detail/eiap-sso/fetch-spm-todo/approve-todo/approve-todo-auto/
  download-todo-attachments 等）、spm-todo（fetch-spm-todo/fetch-spm-detail/approve-todo/
  eiap-sso）、oa-schedule（fetch/delete/create）、hongyi-business-overview、hongyi-today-metrics。
- Skill 根目录优先取 `BOSS_JARVIS_SKILLS_ROOT`（壳层已指向 exe 同级 skills/），最后才回退
  home：reminder-center/aggregate-reminders.cjs、ai-chat-dispatcher/route-command.cjs。
- skill-env.conf 读取改经 `BOSS_JARVIS_DATA_DIR` 父目录推导（Windows 为
  `%USERPROFILE%\.boss-jarvis\skill-env.conf`），回退 os.homedir()：
  approve-oa/approve-chfssc/approve-eiap/approve-newoa。
- hongyi-external/fetch-auth.cjs、open-with-playwright.cjs：storage/cookie 文件随
  `__dirname` 推导。
- 遗留：`DEFAULT_NODE_PATH=/Users/.../npx` 仅为直接命令行运行时 NODE_PATH 缺失的
  macOS 开发兜底（壳层运行必由 skill-env.conf 注入），保留。

### Windows 便携包（dist-windows）
- 新增 `scripts/stage-windows-skills.mjs`（可复现）：以仓库 `skills/manifest.json` 为唯一
  清单，从本地 Skill 源（默认 `~/.codex/skills`，可 `BOSS_JARVIS_SKILLS_SRC` 覆盖）挑选
  manifest 声明的 14 个通用 Skill + 运行时引用的 mail-analysis/hongyi-common + 平台
  windows-outlook-mail（仓库内），写入 exe 同级 skills/；排除 OA/虹翼会话缓存
  （oa-storage/oa-session/hongyi-today-storage/session-cookies 等）与 review-samples.jsonl
  （真实待办样本）、.DS_Store 等；staging 后按 manifest 校验脚本齐全。
- `dist-windows/skills` 已刷新（17 目录、112 脚本、1.3MB），`BossJarvis_0.1.0_Windows-portable.zip`
  已重建（159 条目，含 .shared/oa-login.cjs 与 oa-todo 全量）。
- 运行：`node scripts/stage-windows-skills.mjs` 后对 dist-windows 目录重新 zip。

### 验证
- macOS `cargo check --lib` 通过；Windows 目标交叉 check 因 aws-lc-sys 需要 MSVC C 工具链
  失败（环境限制，与本次改动无关；正式 Windows 构建走既有 cargo xwin 链路）。
- 改动的 26 个脚本全部 `node --check` 通过；旧版共享助手兼容冒烟通过。
- 已知限制：exe 同级 skills/ 需可写（会话缓存运行时回写）；NSIS 安装到只读目录需另行处理。

## 2026-09-03 Windows oa-todo「通过业务系统 URL 打开单据失败：getaddrinfo EAI_FAIL oacenter.changhong.com」

### 定位
- 失败点不是浏览器打开页面，而是打开单据前的 Node https 换票步骤：非 newoa 单据先经
  `backlog-api.cjs getBusinessAction()` POST `https://oacenter.changhong.com/lx/api/.../sendTaskInfo-pc`
  换取带 token 的业务落地 URL，再 goto（read-todo-detail.cjs `openTodoByBusinessUrl`）。
- `getaddrinfo EAI_FAIL` 是 Node 用系统解析器查 `oacenter.changhong.com` 失败（机器 DNS 层错误，
  非代码缺陷；重试多少次都一样）。OA 主站列表走 Chromium 页面请求，与该 Node 直连路径不同，
  所以前面正常、到这步才暴露。
- 对照：公网 DNS 对 `oacenter.changhong.com` 返回内网地址 10.199.48.29（与 oa.changhong.com
  的 10.199.48.101 同 10.199.48.x 网段）；macOS 开发机大量 intranet 域名走 /etc/hosts，
  Windows 机器需能解析并路由到该网段（内网 DNS / EasyConnect / hosts）。

### 改动
- `oa-todo/read-todo-detail.cjs openTodoByBusinessUrl`：DNS/网络类失败（getaddrinfo/ENOTFOUND/
  EAI_/ERR_NAME_NOT_RESOLVED/ETIMEDOUT/ECONNREFUSED）时，在报错里直接附可执行提示
  （检查内网 DNS/EasyConnect；仍失败按 nslookup 实际结果在 hosts 添加
  `10.199.48.29 oacenter.changhong.com` 后重试），approve 链共用同一入口同样受益。
- `dist-windows/skills` 已刷新、`BossJarvis_0.1.0_Windows-portable.zip` 已重建（159 条目）。

### Windows 机器侧排查（真正的修复点）
1. `nslookup oacenter.changhong.com` —— 应返回 10.199.48.x；
2. 解析/路由失败：确认 EasyConnect/内网 VPN 已连接（10.199.48.x 可达）、`ipconfig /flushdns`；
3. 仍失败：管理员 hosts 添加 `10.199.48.29 oacenter.changhong.com`（以实际解析为准）。

## 2026-09-03 Windows「打开回复窗口失败：spawnSync powershell.exe ENOENT」

### 根因
- changhong-mail/open-confirmed-reply.cjs 在 win32 用 `spawnSync('powershell.exe', …)` 起
  PowerShell 调 Start-Process mailto。Node spawn 对不带路径的命令只按 PATH 查找（不做
  CreateProcess 的系统目录回退），GUI 进程 PATH 若不含 System32（便携/受限启动环境常见）
  即 ENOENT；同链路的 `spawnSync('node')` 不受影响是因为壳层把 exe 同级 node 目录前置到了 PATH。

### 改动
- open-confirmed-reply.cjs：新增 `windowsPowershellCommand()`，按
  `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` 拼**绝对路径**（存在才用，
  非常规系统回退裸名），win32 分支改用它 —— 摆脱对 PATH 的依赖；不改任何发送语义
  （仍只打开默认邮件客户端草稿，绝不自动发送）。
- tests/open-confirmed-reply.test.cjs：Windows 用例断言放宽为命令以 powershell.exe 结尾
  （macOS 上回退裸名，Windows 上为绝对路径）。
- 验证：node --test 6/6 通过；以 SystemRoot 指向伪造目录模拟 Windows 分支，确认返回
  %SystemRoot% 绝对路径。dist-windows/skills 已刷新、便携 zip 已重建（159 条目）。
