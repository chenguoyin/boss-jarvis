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
