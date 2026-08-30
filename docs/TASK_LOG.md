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
