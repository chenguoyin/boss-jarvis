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
  执行明细（skill/action/耗时/退出信息/完整 stdout/stderr）按 JSON Lines 落
  `~/.boss-jarvis/logs/actions.log`（2MB 轮转一代），审批失败时按脚本
  `ERROR:` 行 / stderr JSON 提取可定位原因，界面只给截断摘要与日志位置。
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
- [x] 实机验证与修复（Tauri 窗口 + 集成测试）：
  发现 manifest actions 路径缺少 skill 子目录前缀，导致全部写操作
  解析到不存在的脚本（`~/.codex/skills/record-audit.cjs`）。已统一补齐
  为 `<skill>/<script>.cjs`；同时修复 `record_audit` stdin 未关闭导致
  子进程等 EOF 的死锁风险；`toggle_skill` 失败摘要补目标 Skill 标识。
  新增集成测试 `toggle_skill_failure_writes_audit_trail`（失败路径也必须
  写审计留痕），并在 `manifest.rs` 加载时校验声明脚本存在，缺失立即报错。
  主题/字号持久化经 Playwright 验证：三主题、localStorage、刷新保持、
  恢复默认全部通过；3 主题 × 11 分区共 33 张截图无空白。

### Phase 5：收敛与退役
- [x] 2026-08-26 macOS 实机比对：Tauri 壳 12 分区截图 + 布局实测归档于
  `docs/acceptance/`（导航 72 / 热区 52×52 / 图标 15 / 顶栏 60，
  面包屑垂直居中）。说明：任务描述中的热区 64 与黄金参照源码不符，
  `legacy/ContentView.swift` 与 `DesignSystem.swift` 实际均为 52×52、
  选中背景 42×42，Tauri 版按源码事实对齐。
- [x] 2026-08-26 顶栏与全局行为补齐：
  - 搜索框打开 Jarvis 助手（⌘K/Esc 可开关），助手建议与消息区已就位，
    LLM 调用链为遗留任务。
  - 放大/还原按钮与顶栏空白区双击均触发窗口切换。
  - 刷新支持四态（取数中/失败/排期/成功）与倒计时、最近刷新时间 tooltip；
    自动刷新开关与间隔（5/10/15/30/60 分钟）持久化。
  - 每分区头部补分区级刷新按钮；审计/确认中心为本地重载，其余分区只执行
    本分区声明的 Skill，与 legacy refreshSkills 行为一致。
  - 首页模块自定义（排序/显隐/恢复默认）、关于弹层、导航徽标已接线并持久化。
- [x] 2026-08-26 人工终审并排截图（三主题 × 12 分区）确认无视觉回退，
  删除 `legacy/` 并提交单代码库定稿。

验收证据：
- `docs/acceptance/tauri-shell-metrics.json`：Playwright 实测布局数值。
- `docs/acceptance/tauri-sections-overview.png`：11 个侧栏可达分区截图总览
  （确认中心由 Skill 管理触发后直达，无独立侧栏入口，与 legacy 一致）。

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
