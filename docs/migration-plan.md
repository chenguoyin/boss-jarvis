# boss-jarvis 单代码库迁移计划

北极星：维护一次、分发两端。仓库只保留一套 Tauri 2 壳（Rust + React/TS），
macOS 与 Windows 共用同一套前端、Rust 核心与设计系统；平台差异只收敛到 Skill 层。

## 权威参照与现状

- 黄金参照（迁移期）：`legacy/` 下的 SwiftUI 版，视觉/交互/行为以它为准，1:1 验收后删除。
- 契约：`docs/skill-output-contract.md` 是壳与 Skill 的唯一接口，字段与语义双端一致。
- 设计系统：`legacy/Sources/BossJarvis/DesignSystem.swift` 的 16 个 `jarvis*` 动态色、
  5 级字号（title/body/caption/control/data）与尺寸约定，1:1 移植到 `src/styles/tokens.css`。
- 旧 Tauri 原型仅存在于废纸篓，不作为事实来源，只作 Phase T 参考。

## Phase 拆分

### Phase 0（当前）：基线 + 脚手架
- [x] git 基线快照 + legacy 迁移 + SwiftUI 在 legacy/ 下构建通过
- [ ] Tauri 2 + React/TS + Vite 脚手架，macOS 空壳跑通
- [ ] `tokens.css` 精确移植 16 色 + 5 字号 + 尺寸/圆角/阴影
- [ ] `skills/manifest.json`：skill → 平台 → 脚本 + runner 类型唯一入口
- [ ] `src/lib/contract.ts` 契约类型 + 解析器
- [ ] lint：禁止 TSX 裸 RGB/白/黑/灰/主色与写死字号

### Phase 1：壳层对齐
- 导航壳（宽 72 / 热区 64 / 选中 42 / 图标 15pt / 徽标右上角）+ 顶栏（高 60）+ 三主题
- 对照 SwiftUI 版逐屏对齐间距/圆角/阴影/滚动/空态与「未获取」态

### Phase 2：契约解析 + 取数链
- 统一契约解析层 + Rust Skill 执行/命令桥 + 数据目录适配（macOS `~/.boss-jarvis/data/`，Windows `%USERPROFILE%\.boss-jarvis\data\`）
- 双端喂同一份契约 JSON，渲染一致

落地记录：
- `src-tauri/src/paths.rs`：数据/日志/凭证路径抽象，macOS 与 Windows 只差这一个文件。
- `src-tauri/src/manifest.rs`：内嵌 `skills/manifest.json`，解析 common/platform 与 fetchArgs；
  platform Skill 在当前平台 pending 时返回明确提示，不静默跳过。
- `src-tauri/src/skill_runtime.rs`：串行取数、150 秒超时（TERM 后 3 秒 KILL）、
  stdout JSON 契约校验、ok=false 落盘并报错、fetch.log 与审计失败留痕。
- `src/lib/skillBridge.ts` + `src/hooks/useSkillData.ts`：前端按分区映射 Skill，
  顶栏刷新触发取数，失败横幅提示；本地 JSON 读取失败一律显示「未获取」。
- 端到端验证：`cargo test --test skill_runtime -- --ignored` 用真实 skill-manager
  取数、落盘并校验契约（依赖本机 `~/.codex/skills`，CI 中跳过）。

### Phase 3：12 视图逐一迁移
- 先数据展示、后写操作；每个视图 macOS 比对通过才完成

### Phase 4：确认中心 / 审计 / 配置
- 行为一致：OA 详情弹层点同意/不同意即确认直接执行并审计；Skill 启停/AI 写操作先进确认中心；邮件只标记已读/打开草稿，绝不自动发送

### Phase 5：收敛与退役
- macOS Tauri 版 1:1 验收通过 → 删除 legacy → 单代码库定稿

### Phase T（尾段单独处理）
- Tauri sidecar 内嵌 node.exe（最终用户零安装，仅依赖 WebView2）
- Playwright `channel:'msedge'`（Windows）
- Outlook COM（内置 PowerShell）或 Microsoft Graph 的邮件/日历 Skill
- Windows CI（`build-windows.yml`）
- 真实 Windows + Outlook 实机验收

## 安全红线（全程保留）
- 凭证只存 `~/.boss-jarvis/skill-env.conf`，不硬编码账号/密码/Key/Token/Cookie。
- OA 审批：详情弹层点「同意/不同意」即确认，直接真实审批并写审计。
- Skill 启停/安装卸载/AI 识别写操作：先进确认中心再执行。
- 邮件：点主题仅标记该封已读；点回复只打开客户端草稿/回复窗口，绝不自动发送。
- 金额/日期/人名只来自源系统；「未获取」不得用猜测数据填充。

## 待定决策
- 确认中心是否显式加入左侧导航（当前 SwiftUI 从驾驶舱入口进入）。
