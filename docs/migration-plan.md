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

落地记录：
- [x] Skill 管理视图（展示层）：`src/components/SkillManagerView.tsx` +
  `src/lib/skillManager.ts`。表格列、生命周期徽标、运行状态、空态/未获取态
  与 legacy `SkillManagerView.swift` 对齐；启停/安装/卸载写操作待 Phase 4 确认中心接入。
- [x] 日历提醒视图（只读 + 详情弹层）：`src/components/NativeCalendarView.tsx` +
  `src/lib/nativeCalendar.ts`。今日日程/提醒两张表、级别映射、行点击详情弹层、
  空态与「未获取」态与 legacy `NativeCalendarView.swift` 对齐。
- [x] 每日晨报视图（只读）：`src/components/BriefingView.tsx` +
  `src/lib/dailyBriefing.ts`。按契约只读 daily-briefing 巡检产物
  `~/.codex/workbench-reports/latest/boss-cockpit.json` 的 `bossView`；
  Rust 命令 `read_daily_briefing_report` 负责读取，巡检按钮复用统一刷新链路；
  KPI 四格、三组事项、来源与定时任务状态、空态与「未获取」态与 legacy 对齐。
- [x] 每周总结视图（只读 + 历史存档）：`src/components/WeeklySummaryView.tsx` +
  `src/lib/weeklySummary.ts`。最新周报读 `weekly-summary.json`，历史日期经
  `weekly_summary_dates` / `read_weekly_summary_archive` 只读存档目录；
  概览 KPI、OA 汇总、风险结论、重点关注、下周排期与 legacy 布局对齐。
- [x] 经营情况视图（只读）：`src/components/HongyiBusinessView.tsx` +
  `src/lib/hongyiBusiness.ts`。今日专项 / 部门看板 / 经营总览三组指标、
  接入状态胶囊、数据质量横幅与「未获取」态与 legacy 对齐；
  口径全部来自 `bossView.todayMetrics` / `bossView.overview`，壳层不解析旧字段。
- [x] OA 待办 / 资金费用视图（只读 + 详情弹层）：
  `src/components/OATodoView.tsx` + `ExpenseTodoView.tsx` + `src/lib/oaTodo.ts`。
  共用 oa-todo 契约解析（items[].analysis），风险级别 red/yellow/green 映射
  urgent/attention/normal；行点击详情弹层、计数不一致提示、发送人回退创建人、
  资金费用按智能财务/费控/资金关键字过滤。审批写操作待 Phase 4 接确认执行链。
- [x] 驾驶舱聚合视图（只读）：`src/components/DashboardView.tsx` +
  `src/lib/dashboard.ts` + `src/lib/reminderCenter.ts`。结论条与四枚状态胶囊、
  Top3 待办提醒、OA/邮件/日历跨系统聚合行、风险提示与 AI 建议、待回复邮件、
  虹翼经营速览五卡；聚合口径与 legacy 对齐，缺数据一律「未获取」不填 0。
- [x] 审计日志视图（只读）：`src/components/AuditLogView.tsx` +
  `src/lib/auditLog.ts`。Rust 命令 `audit_log_dates` / `read_audit_log` 只读
  `~/.codex/workbench-audit/<date>/audit.jsonl`，按时间倒序渲染全链路留痕，
  支持日期下拉切换与刷新。

### Phase 4：确认中心 / 审计 / 配置
- 行为一致：OA 详情弹层点同意/不同意即确认直接执行并审计；Skill 启停/AI 写操作先进确认中心；邮件只标记已读/打开草稿，绝不自动发送

落地记录：
- [x] Rust 写操作命令层：`src-tauri/src/command_runtime.rs`。
  `approve_todo`（OA/SPM 审批直达执行）、`toggle_skill`（启停）、
  `mark_mail_read`（单封已读）、`open_mail_reply`（三段式生成草稿→加工→打开
  回复窗口，绝不代发）；全部经 audit-log Skill 写留痕。
- [x] manifest 动作注册：`skills/manifest.json` 为 skill-manager/audit-log 补
  actions 映射；`manifest.rs` 按 common/platform 解析当前平台的动作脚本。
- [x] OA 审批弹层：`OATodoView.tsx` 详情内审批意见 + 同意/不同意，点击即真实
  执行并显示结果；不经过确认中心中转，与 legacy 行为一致。
- [x] 邮件写操作：`MailView.tsx` 点主题标记该封已读并从列表隐藏；详情弹层
  「回复」走三段草稿链路，只打开客户端回复窗口；驾驶舱待回复卡同步接线。
- [x] 确认中心：`ConfirmationCenterView.tsx` + `src/lib/confirmationCenter.ts`。
  Skill 启停入队（不直接执行），批量勾选串行执行、跳过、已处理留档；
  入口与 legacy 一致不走侧栏，Skill 管理页触发后直达。
- [x] 系统配置：`SettingsView.tsx` 三态主题、标题/正文字号滑条（12-24 / 10-20，
  默认 14/12）持久化；OA 账号/LLM/NODE_PATH 读写 `~/.boss-jarvis/skill-env.conf`，
  密码与 API Key 默认遮蔽，凭证不进源码。
- [x] 设计令牌补齐 `--jv-on-accent`（亮暗各一）用于蓝底主按钮文字，
  避免暗色主题对比度回退。

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
- 确认中心不进侧栏（与 legacy 一致）；当前入口为 Skill 管理页启停动作直达，
  后续可按需在驾驶舱聚合卡补「待确认」入口。
