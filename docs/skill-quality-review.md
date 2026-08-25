# Skill 质量审查报告（老板视角）

审查日期：2026-08-24

## 审查范围与基准

- 审查对象为 boss-jarvis 消费链路上的 15 个业务 Skill：oa-todo、spm-todo、company-mail、native-calendar、reminder-center、hongyi-today-metrics、hongyi-business-overview、daily-briefing、personal-workspace-agent、risk-scoring、boss-priority、ai-chat-dispatcher、skill-manager、audit-log、model-router。
- 审查基准以各 Skill 的 SKILL.md 为唯一基准，对照 docs/skill-output-contract.md 的输出契约、~/.boss-jarvis/data/ 落盘数据、~/.codex/workbench-reports/latest/ 晨报产物与 ~/.codex/workbench-audit/ 审计留痕。
- 实测均使用只读命令、--sample 或已落盘数据，未做任何真实审批、发信、写入操作。

## 结论总览

| Skill | 目标匹配 | 逻辑完整性 | 边界与异常 | 风险与合规 | 输出质量 | 执行忠实度 | 总体结论 |
|---|---|---|---|---|---|---|---|
| oa-todo | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 通过 |
| spm-todo | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 通过 |
| company-mail | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 通过 |
| native-calendar | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | 有条件通过 |
| reminder-center | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 通过 |
| hongyi-today-metrics | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 通过 |
| hongyi-business-overview | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | 有条件通过 |
| daily-briefing | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | 有条件通过 |
| personal-workspace-agent | ❌ | ⚠️ | ⚠️ | ❌ | ✅ | ❌ | 不通过 |
| risk-scoring | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | 有条件通过 |
| boss-priority | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 通过 |
| ai-chat-dispatcher | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 通过 |
| skill-manager | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 通过 |
| audit-log | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | 有条件通过 |
| model-router | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 通过 |

**总体判断：14 个 Skill 达到可用或修一个小缺陷即可用，personal-workspace-agent 必须整改后才能继续对老板开放。**

## 问题清单

### 🔴 阻断级

**R1. personal-workspace-agent 与全工作台写操作确认红线冲突（自动写提醒）**

- 证据：SKILL.md 第 18 行 "Automatically create unambiguous email-derived Reminders tasks without confirmation"；第 42 行 "Unambiguous time-bound tasks detected in email content are automatically added to Reminders without confirmation"；第 287 行 "Run --write automatically for unambiguous email-derived tasks"。
- 对照：ai-chat-dispatcher SKILL.md 边界 "任何写操作必须进入待确认事项"；native-calendar SKILL.md "创建、修改、删除日历事件或提醒必须先展示拟执行内容并获得确认"；oa-todo SKILL.md "沉默、未反对……都不能替代用户的单独确认"。
- 影响：这个 Skill 在老板无感知的情况下改本机提醒数据，破坏了全工作台最核心的信任承诺；判定"unambiguous"的又是规则脚本，一旦误判即发生真实写入。必须改成与其他 Skill 一致的拟执行卡片 + 确认，才能上线。

**R2. personal-workspace-agent 批量标记邮件已读的例外范围被放大**

- 证据：SKILL.md 第 114-120 行 "After processing the batch, mark its Mail message IDs as read"、"An email with a reported ambiguity or a reply draft awaiting confirmation still counts as processed and may be marked read"。
- 对照：company-mail SKILL.md 例外一只允许 "用户在工作台点击邮件主题查看详情时，直接将该邮件标记为已读"；skill-output-contract.md "用户点击 rows[].id 对应邮件主题时" 才调用 mark-mail-read。
- 影响：把"点击哪封标哪封"的窄例外放大成"整批处理后自动标已读"，含歧义邮件与待确认草稿也会被标已读，未读红灯会被静默熄灭，属于业务风险。

**R3. personal-workspace-agent SKILL.md 硬编码个人手机号与邮箱**

- 证据：SKILL.md 第 109-110 行 "手机：18602850886 / 电子邮箱：guoyin.chen@changhong.com"。
- 影响：Skill 文件位于 ~/.codex/skills，属于可被同步、归档、安装卸载流转的内容；对照 model-router 明确要求密钥不落 Skill、audit-log 声明 "只记录脱敏摘要"。联系方式虽非密钥，但作为固定签名硬编码进可分发文件，违背同一合规口径，且该 Skill 本身就计划对外复用。应移到本地配置（如 company-mail 的 prepare-reply 已有签名机制，可走同一配置源）。

**R4. personal-workspace-agent 文档自相矛盾：资讯模块职责归属混乱**

- 证据：SKILL.md 第 6 行 "由独立的 ai-news-capture 技能负责"、第 43 行 "AI/FDE 资讯收集……由独立的 ai-news-capture 技能负责"；但第 272 行 Execution Timeline 仍列 "Module 2 | News capture and archive"，第 18 行仍声称 "Automate three daily office workflows: schedule/email triage, industry news capture, and end-of-day review"。
- 影响：执行者会同时得到"归我管"与"不归我管"两个指令，实际执行忠实度无法判定；这也是该 Skill 判为不通过的执行忠实度依据。

### 🟡 缺陷级

**Y1. risk-scoring 非法输入时进程退出码为 0，失败不可被调用方感知**

- 证据：实测 node score-items.cjs --source=auto --input '{"items":[]}' 报 ENOENT 崩溃（把 JSON 串当文件路径读取），管道返回码仍为 0；对照 SKILL.md 第 36 行的标准用法为 stdin 管道（cat result.json | node score-items.cjs --source=auto）。
- 影响：调用方若依赖退出码判断成败，会把失败当成功。空数据路径本身正常（实测 stdin 喂 {"items":[]} 输出 ok:true、计数全 0 的合法降级），问题只在失败信号丢失。建议 fail() 里补 process.exitCode = 1。

**Y2. audit-log 出现 skill/sourceSystem 为 "未获取" 的脏记录**

- 证据：实测 list --date today --limit 5 返回两条记录 skill: "未获取"、sourceSystem: "未获取"，resultSummary 为 OA 取数内容。
- 影响：审计留痕的可信度下降，追溯时无法定位责任 Skill。上游应强制传 skill 字段，audit-log 侧建议对缺失字段给出显式告警或拒绝。

**Y3. native-calendar 声明了创建提醒/日历的确认规则，但写入脚本不存在**

- 证据：SKILL.md 第 69 行 "第一版仅实现只读读取，写入脚本待后续补充"；目录实测只有 SKILL.md 与 fetch-today.swift。
- 影响：文档诚实标注了差距，所以风险可控，但按"App 只做展示与确认，业务逻辑全部收敛在 Skill 侧"的收敛原则，写路径目前既不在 App 也不在 Skill，是断链的。目标匹配记 ⚠️。

**Y4. hongyi-business-overview 不支持 --sample，验证与联调只能走真实取数**

- 证据：目录实测无 sample 分支（fetch-business.cjs 仅识别 --raw）；我实测 --sample 时误触发真实 Playwright 取数，已当场终止并清理进程。对照 hongyi-today-metrics SKILL.md 明确提供 --sample（第 48-54 行），spm-todo 亦支持。

**Y5. company-mail / native-calendar / skill-manager 落盘数据缺通用包络字段**

- 证据：实测 ~/.boss-jarvis/data/*.json：company-mail.json 无 skill/fetchedAt/count 为 3 但有 rows；native-calendar.json 无 skill 字段（有 date/summary）；skill-manager.json 无 mode/fetchedAt。
- 对照：skill-output-contract.md 通用包络要求所有 Skill 含 skill、mode、sourceSystem、fetchedAt、count、homepageItems、items、missingFields、unavailableSources。
- 影响：App 对这些 Skill 尚未按 bossView 消费（company-mail 走 rows+analysis，calendar 走 events/reminders/summary），当前不阻断展示；但在推进"展示逻辑全部由 Skill 契约给出"的收敛目标下属于契约债。

**Y6. daily-briefing 定时任务状态字段出现结构化值被截断显示**

- 证据：manage-schedule.cjs status 实测 installed:true、loaded:true、configuredTime:"08:30" 正常；但输出含 launchctlPreview 大段原文，而 skill-output-contract.md 对 schedule 字段的约定为结构化布尔值。
- 影响：功能正常，属输出规范瑕疵；建议 status 输出与契约字段一一对应，预览文本另放诊断字段。

**Y7. personal-workspace-agent 与 company-mail 职责大面积重叠**

- 证据：personal-workspace-agent 目录下有 mail_today.swift、mail_junk.swift、mail_mark_read.swift、mail_send.swift、mail_task_import.swift，与 company-mail 的 fetch-unread-mail/generate-reply-draft/prepare-reply/open-confirmed-reply/mark-mail-read 形成两套邮件工具链。
- 影响：同一个"读邮件/标已读/发邮件"动作存在两份实现与两套规则（R1/R2 即因此产生），长期会漂移。建议邮件动作统一收敛到 company-mail，personal-workspace-agent 只做聚合消费。

### 🟢 优化级

**G1. 老板驾驶舱条目时间字段多为"未获取"**

- 证据：~/.codex/workbench-reports/latest/boss-cockpit.md 紧急优先 4 条均显示 "时间：未获取｜优先级：69"，而 OA 条目本身有发送时间（reminder-center 落盘数据 basis 中可见 "发送时间：2026-08-24 09:01"）。
- 影响：不误导但信息量不足；建议 rank 产物透传源时间。

**G2. ai-chat-dispatcher 对"虹翼项目风险"路由到 hongyi-contract-nodes 而非 hongyi-today-metrics / hongyi-business-overview**

- 证据：实测 intent=hongyi_nodes、primarySkill=hongyi-contract-nodes。该 Skill 不在本次 15 个审查对象内，路由本身与 SKILL.md 默认路由表一致，执行忠实度无问题；但"项目风险"语义上更贴近经营概览，可作为路由精度优化。

**G3. skill-manager list 输出 50 个 Skill，包含大量与工作台无关的通用工具**

- 证据：实测 list 返回 count:50。无功能问题；若 App 只展示工作台 Skill，建议增加分类或 scope 过滤，避免老板在管理页看到全部安装物。

## 各 Skill 审查要点

### oa-todo —— 通过

- 基准：读取/分析 OA 待办，审批前强制逐单核验风险，用户单独确认后提交并回验。
- 实测与数据：SKILL.md 第 53-83 行定义完整闭环（分析→展示→确认→提交→刷新验证→汇报）；第 141 行 --confirmed 硬闸门；审计留痕见 audit-log 实测（今天 26 条中 oa-todo fetch_data success）。合同契约与 fetch-todo-with-analysis 输出一致（items[].analysis）。
- 亮点：第 74 行明确"沉默、未反对、历史习惯不能替代确认"，这是全工作台最严格也最正确的红线表述。

### spm-todo —— 通过

- 基准：OA 单点进入 EIAP/SPM，只读取数 + 确认后审批。
- 实测：fetch-spm-todo.cjs --sample 输出 ok:true、count:3，bossView.summary 含 red/yellow/green，topItems 含 riskTypes，与 skill-output-contract.md spm-todo 节完全一致。SKILL.md 第 84 行"风险初筛不能替代审批前详情核验"边界清晰，第 133 行无模型时自动降级规则分析。

### company-mail —— 通过

- 基准：只读取未读、判定是否需回复、两级策略拟稿、确认后打开回复窗口。
- 实测：落盘 company-mail.json 3 封，rows[].analysis 含 needsReply/replyBasis/reasons/urgency，第 77 行"拿不准默认无需回复"的宁漏勿错规则在数据中可验证（自动告警邮件 red 但 needsReply:false）。SKILL.md 第 79-84 行两级草稿策略与 model-router 依赖、模板兜底、generator 标注齐全。

### native-calendar —— 有条件通过

- 基准：只读读取今日日程/提醒 + 写操作需确认。
- 实测：native-calendar.json ok:true，summary.eventCount=4、homepageItems=1、workEventCount=1，与 SKILL.md 首页规则（天气/生日/全天普通事项不进首页）在 reminder-center 聚合数据中可交叉验证（天气条目进 archiveItems）。
- 条件：补上写路径实现（Y3）后，才能声称覆盖 description 中的"从邮件创建提醒候选"完整场景。

### reminder-center —— 通过

- 基准：聚合多源提醒，红黄绿分级，红黄进首页，绿归档，未接来源显式列出。
- 实测：落盘 summary total:23 / red:4 / yellow:6 / green:13 / homepageItems:10，条目含 level/source/basis/suggestedAction；天气与普通日程确在 archiveItems 且 basis 说明原因，与 SKILL.md 第 101 行首页规则一致。

### hongyi-today-metrics —— 通过

- 基准：今日三项专项指标 + bossView 老板口径。
- 实测：fetch-today-metrics.cjs --sample 输出 ok:true、date:2026-08-24（动态当天）、bossView.todayMetrics 与 bossView.dataQuality 结构与契约逐字段一致。

### hongyi-business-overview —— 有条件通过

- 基准：经营概览 + bossView.overview + departmentDashboard。
- 实测：落盘 hongyi-business-overview.json ok:true、bossView 存在，契约字段（departmentDashboard 万元口径、取不到为 null）与 skill-output-contract.md 一致。
- 条件：补 --sample 安全验证模式（Y4），否则每次联调都要动真实系统，既不安全也拖慢回归。

### daily-briefing —— 有条件通过

- 基准：定时只读巡检上游，产出 boss-cockpit.md/json，含 bossView。
- 实测：LaunchAgent installed/loaded、configuredTime 08:30；latest/boss-cockpit.json 含 bossView.summary（mustDoNow:4/focusToday:6/watchList:0/hiddenLowPriority:13/unavailableSources:0）与 sections 三段结构，与契约一致；boss-cockpit.md 人类可读版本同步生成。
- 条件：status 输出与契约 schedule 字段对齐（Y6）。

### personal-workspace-agent —— 不通过

- 基准（自述）：三大日常工作流自动化（含资讯），邮件发送/垃圾清理/资讯归档/复盘写入需确认，明确时间任务自动建提醒。
- 实测：build-cockpit.cjs 只读聚合链路本身健康（bossView 输出完整、低优先级隐藏、写动作转确认卡片），今天晨报即由其生成且审计有记录。
- 但该 Skill 的问题集中在规则与文档层面：R1（自动写提醒）、R2（批量标已读）、R3（硬编码个人信息）、R4（模块归属自相矛盾）、Y7（与 company-mail 双轨）。其中 R1/R2 直接违背全工作台确认红线，属上线阻断。
- 结论：聚合展示能力可用，自动化规则必须整改后再对老板开放。

### risk-scoring —— 有条件通过

- 基准：对上游结构化条目做红黄绿评分，输出 homepageItems/archiveItems/summary。
- 实测：stdin 喂空 items 输出合法空态（ok:true、total:0、三色计数 0、homepageItems:[]），降级路径存在且格式不塌。缺陷仅 Y1（失败退出码为 0）。

### boss-priority —— 通过

- 基准：按金额、紧急度、经营影响、时间窗口排序，输出 mustDoNow/focusToday/watchList。
- 实测：空输入输出四桶全 0 的合法结构，字段与 SKILL.md 输出契约一致；晨报 bossView.summary 的 mustDoNow/focusToday 计数即来自该链路。

### ai-chat-dispatcher —— 通过

- 基准：自然语言→结构化调度计划；只读可直接执行，写操作必须进待确认。
- 实测："生成今日全景"→ personal-workspace-agent、readOnly:true、canExecuteNow:true；"同意第一单审批"→ oa-todo、readOnly:false、requiresConfirmation:true、confirmationItems 生成、canExecuteNow:false；"查看审计日志"→ audit-log 只读。写操作拦截 100% 生效，与 SKILL.md 边界完全一致。

### skill-manager —— 通过

- 基准：Skill 生命周期管理，卸载需显式确认并归档而非删除。
- 实测：list 输出 50 个 Skill 的结构化清单（id/name/description/lifecycleStatus/runtime/enabledOnDisk/dir），与 SKILL.md 第 19-26 行状态模型一致；卸载命令带 --confirm 硬闸门。

### audit-log —— 有条件通过

- 基准：全链路脱敏留痕，支持 append/list。
- 实测：list --date today --limit 5 返回 26 条中 5 条，字段含 auditId/traceId/timestamp/skill/actionType/mode/status/resultSummary/redactions，三段式（propose→confirm→execute）在 oa-todo SKILL.md 中有配套约定。
- 条件：Y2 脏记录问题修复后，留痕才真正可审计。

### model-router —— 通过

- 基准：统一模型入口，密钥本地化，业务 Skill 不各自硬编码。
- 实测：--inspect 输出 configured:true、baseUrlHost:hongxincy.changhong.com、apiKeyConfigured:true 且 apiKeyRedacted:true、model:glm-5.3，无密钥泄露；company-mail 两级策略对其依赖关系与声明一致。

## 能否上线一览

| Skill | 能否上线 | 前置动作 |
|---|---|---|
| oa-todo | ✅ 可上线 | 无 |
| spm-todo | ✅ 可上线 | 无 |
| company-mail | ✅ 可上线 | 无 |
| native-calendar | ⚠️ 只读能力可上线 | 写路径补齐前，App 侧禁用创建入口或明确"暂不支持" |
| reminder-center | ✅ 可上线 | 无 |
| hongyi-today-metrics | ✅ 可上线 | 无 |
| hongyi-business-overview | ✅ 可上线（联调侧补 --sample） | 无阻断 |
| daily-briefing | ✅ 可上线 | 建议修 Y6 |
| personal-workspace-agent | ❌ 不可上线 | R1-R4 全部整改 |
| risk-scoring | ✅ 可上线（内部消费） | 建议修 Y1 |
| boss-priority | ✅ 可上线 | 无 |
| ai-chat-dispatcher | ✅ 可上线 | 无 |
| skill-manager | ✅ 可上线 | 无 |
| audit-log | ⚠️ 可上线但留痕可信度打折 | 建议修 Y2 |
| model-router | ✅ 可上线 | 无 |

## 复审建议

1. personal-workspace-agent 整改 R1-R4 后必须复审，重点复测：邮件任务是否已改为确认卡片、标已读是否收敛到点击例外、个人信息是否移出 SKILL.md、资讯模块表述是否统一指向 ai-news-capture。
2. risk-scoring 修 Y1 后补一条失败用例：输入不存在路径时退出码必须非 0 且输出结构化错误。
3. audit-log 修 Y2 后复跑 list，确认不再出现 skill:"未获取"。
4. native-calendar 补写脚本后，复测确认卡片字段（标题/时间/来源依据/写入位置/是否全天）与 SKILL.md 第 61-69 行一致。
5. 后续新增 Skill 一律先过通用包络 9 字段 + bossView 契约检查，再接 App。

## 修复跟踪（2026-08-24）

本节为审查后的整改记录，不改动上文时点性结论与证据。

| 问题 | 状态 | 处理与验证 |
|---|---|---|
| R1 自动写提醒 | ✅ 已修复 | personal-workspace-agent SKILL.md 重写：硬性规则第 1 条明确"所有写操作必须确认，不存在无歧义自动写入例外"；驾驶舱聚合拆分到独立 boss-cockpit Skill。 |
| R2 批量标已读 | ✅ 已修复 | 硬性规则第 2 条改为"邮件已读只跟点击走"，禁止批量标已读，有歧义或等待回复确认的邮件保持未读。 |
| R3 硬编码个人信息 | ✅ 已修复 | 新 SKILL.md 不再含手机号与邮箱；签名等个人信息从本地配置读取。 |
| R4 资讯归属矛盾 | ✅ 已修复 | 职责边界表明确"AI/FDE 资讯收集与归档归 ai-news-capture"，复盘模板中的要闻段落明确引用其产物。 |
| Y1 risk-scoring 退出码 | 🔄 原报告有误 | 复测确认 fail() 路径实际退出码为 1，原审查中的管道测量方法有误；直接执行用例（不存在路径）复测退出码仍为 1，无需代码改动。 |
| Y2 audit-log 脏记录 | ✅ 已修复 | record-audit.cjs 对缺失 skill 字段的记录直接拒绝（exit 1）；回归验证合法记录（skill=boss-cockpit）正常写入且字段完整。 |
| Y3 native-calendar 写路径 | ⏳ 未处理 | 保持原结论：只读能力可上线，写路径补齐前 App 侧禁用创建入口。 |
| Y4 hongyi-business-overview --sample | ✅ 已修复 | fetch-business.cjs 新增 --sample 分支，输出完整 bossView 契约（含 departmentDashboard），不触发真实登录。 |
| Y5 包络字段缺失 | ✅ 已修复 | company-mail fetch-unread-mail.cjs、skill-manager manage-skills.cjs、native-calendar fetch-today.swift 均补齐 skill/mode/fetchedAt/count/homepageItems/missingFields/unavailableSources。 |
| Y6 晨报 schedule 结构化 | ✅ 已修复 | manage-schedule.cjs 的 launchctlPreview 移入 diagnostics.launchctlPreview，顶层 schedule 字段与契约一致。 |
| Y7 邮件工具链双轨 | ⚠️ 部分修复 | personal-workspace-agent SKILL.md 已声明不再调用 mail_send/mail_mark_read/mail_task_import 等旧脚本；旧脚本文件仍在目录中未删除，建议后续随技能卸载流程清理。 |
| G1 时间字段"未获取" | ✅ 已修复 | risk-scoring scoreOne() 透传 time/deadline/due/dueDate/sentAt/receivedAt；端到端复测首页条目显示真实时间（如"时间：2026-08-24 09:01"）。 |
| G3 skill-manager 全量列表 | ⏳ 未处理 | 保持原结论：属优化项，不阻塞上线。 |

### 拆分记录

- 驾驶舱聚合能力已从 personal-workspace-agent 独立为 boss-cockpit Skill（~/.codex/skills/boss-cockpit/），App 只做展示与确认，聚合、评分、排序、日报生成全部收敛在 boss-cockpit 侧。
- daily-briefing/run-briefing.cjs、ai-chat-dispatcher/route-command.cjs 与其 SKILL.md 路由表已全部改为引用 boss-cockpit；skill-manager list 已显示 boss-cockpit（enabled）。
- personal-workspace-agent 保留职责收敛为：每日工作复盘、本机只读巡检脚本、Obsidian 笔记整理。
