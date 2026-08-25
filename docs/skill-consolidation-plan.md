# Boss Jarvis Skill 收敛整理规划

## 目标

把“业务理解、数据加工、分析判断、执行动作”尽量收敛到各 Skill 内，App 只保留：

- 启动 Skill 进程
- 读取 Skill 输出的 JSON / JSONL
- 做 UI 展示和用户确认
- 调用 Skill 提供的明确命令入口

原则是：**App 不重新解释业务数据，不临时拼业务规则，不复制 Skill 的分析逻辑。**

## 收敛进度（2026-08-24 更新）

第二阶段（oa-todo + company-mail）与第三阶段（虹翼 + 晨报）的核心收敛已完成，
App 侧的旧契约兼容回退已删除：

- `oa-todo`：`fetch-todo-with-analysis.cjs` 直接输出带 `analysis` 的契约 items；
  App 删除了 `oa-todo-analysis.json` 旁路文件读取与旧 rows 解析。
- `company-mail`：回复草稿由 `generate-reply-draft.cjs` 在 Skill 侧生成
  （model-router 大模型优先，本地模板兜底），App 无内置文案。
- `hongyi-today-metrics` / `hongyi-business-overview`：Skill 输出 `bossView`，
  App 删除了旧 `metrics`/`summary`/`items` 字段的回退解析，无 `bossView` 视为未获取。
- `daily-briefing`：App 只读 `boss-cockpit.json` 的 `bossView`，
  删除了旧 `homepage`/`ranked`/`sources` 回退。

App 侧仍保留的、属于展示层合理边界的逻辑：

- 首页模块的排序与映射（Top 3 红黄绿排序、来源→页面跳转映射）。
- 展示辅助（发送人回退创建人、时间格式化、未获取占位）。
- 确认中心队列状态与按钮交互。

## 当前结论（原始评估，部分已过时）

这份 App 现在并不是“少量胶水代码 + 多个纯 Skill”，而是已经有一部分 Skill 逻辑渗进了 Swift 代码。需要整理的不是单个脚本，而是整条边界：

- **Skill 应该负责**：取数、字段解释、风险分析、摘要生成、口径判断、写操作执行、审计写入。
- **App 应该负责**：展示、确认、按钮交互、队列状态、异常提示。

## 本次 APP 涉及的 Skill 清单

### 已接入，App 会真实调用

- `oa-todo`  
  功能：读取 OA 待办、读取待办详情、做审批前风险分析、执行同意/不同意审批。  
  当前状态：App 里既有取数，也有详情分析，还有一部分分析结果在 Swift 侧二次拼装。

- `spm-todo`  
  功能：通过 OA 单点进入业务协作平台，读取 SPM 待办，并处理审批/退回等写操作。  
  当前状态：App 已经通过审批分支接入，但取数链路还没完全独立成 Skill 输出。

- `company-mail`  
  功能：读取未读邮件、判断是否需回复、生成回复草稿、打开邮件客户端回复窗口、点击主题后标记已读。  
  当前状态：取数和动作都已在 App 中使用，但“拟回复文案”这类业务生成逻辑还在 App 里。

- `native-calendar`  
  功能：读取 macOS 日历和提醒事项，生成今日日程与提醒输入。  
  当前状态：App 只读其输出，边界相对清晰。

- `reminder-center`  
  功能：聚合 OA、邮件、日历、提醒，生成统一提醒清单和优先级。  
  当前状态：App 只读其输出，边界相对清晰。

- `hongyi-today-metrics`  
  功能：获取虹翼今日项目数、客户申请数、收入确认笔数和金额。  
  当前状态：App 读取其 JSON，但一部分字段映射和展示口径在 Swift 里。

- `hongyi-business-overview`  
  功能：汇总虹翼经营情况，关注收入、回款、毛利、项目进度、客户变化。  
  当前状态：App 读取其 JSON，但一部分经营口径、部门看板字段提取在 Swift 里。

- `daily-briefing`  
  功能：定时巡检上游 Skill，生成晨报 Markdown 和老板驾驶舱 JSON。  
  当前状态：App 读取晨报产物，但“怎么启动巡检、配置时间、安装 LaunchAgent”还有一部分环境感知在 App 里。

- `skill-manager`  
  功能：Skill 的安装、启用、停用、卸载、权限声明、运行状态查看。  
  当前状态：App 已经在管理页接入，但 Skill 注册表、启停规则、状态解释仍有部分在 App 里。

- `audit-log`  
  功能：记录取数、分析、审批、邮件、Skill 管理动作的审计留痕。  
  当前状态：App 只读 audit.jsonl，但“动作命名、状态分类、摘要组织”还有一部分在 App 里。

### 有预留，但未完整接入

- `ai-chat-dispatcher`  
  功能：把老板自然语言指令路由到各 Skill。  
  当前状态：App 首页有 AI 对话入口，但还没看到完整的调度闭环。

- `risk-scoring`  
  功能：对上游 Skill 结果做统一风险评分。  
  当前状态：目前更多体现在设计方向里，App 侧还没有完整作为主链路接入。

- `boss-priority`  
  功能：对事项做老板视角优先级排序，决定哪些进首页。  
  当前状态：同上，偏预留。

## 现在 App 里不该长期保留的 Skill 逻辑

这些是从代码里看到的、后续应该尽量往 Skill 里收的点：

### 1. OA 分析结果的二次拼装

位置：`SkillCommandService.swift`、`SkillDataStore.swift`

现状：

- App 会对 OA 待办逐条调用 `read-todo-detail.cjs`
- 然后把结果整理成 `OATodoAnalysis`
- 再映射成 P1/P2/P3/P4、风险点、建议、详情摘要

问题：

- 这已经不是纯“读取 JSON”了，而是在 App 里做了一层业务解释。
- 这层解释应该属于 `oa-todo` 的输出契约，而不是 Swift 的补丁逻辑。

建议：

- 让 `oa-todo` 直接输出标准化后的 `analysis` 字段。
- App 只负责展示，不再自己组合“风险点 + 建议 + 详情摘要”。

### 2. 邮件拟回复生成

位置：`DashboardViewModel.swift`

现状：

- `proposedMailReply(for:)` 在 App 里根据主题、摘要、回复依据生成商务回复文案。

问题：

- 这属于 `company-mail` 的能力，不该由 App 代写。

建议：

- 邮件草稿生成统一放到 `company-mail`。
- App 只显示“拟回复草稿”，不自己写文案模板。

### 3. 虹翼经营数据的字段抽取与口径解释

位置：`SkillDataStore.swift`

现状：

- App 对 `hongyi-today-metrics`、`hongyi-business-overview` 的 JSON 做了很多字段提取。
- 例如部门看板、收入、回款、毛利、毛利率、逾期金额等展示口径都在 Swift 里解释。

问题：

- 这会让 Skill 输出变成“半结构化原始料”，App 继续承担业务中台角色。

建议：

- 让虹翼 Skill 直接输出“老板视角摘要”和“看板指标字典”。
- App 只按字段渲染，不再理解“哪个 title 对应哪个经营指标”。

### 4. 统一提醒、晨报、审计的解释层

位置：`DashboardViewModel.swift`、`BriefingStore.swift`、`AuditLogStore.swift`

现状：

- App 会把 reminder-center 的数据再做风险归纳。
- 会把 daily-briefing 的 boss-cockpit.json 拆成多个 UI 模型。
- 会把 audit-log 的 JSONL 逐行解析成 App 的审计记录模型。

问题：

- 这些解析逻辑本质上是“展示模型适配”，但其中夹杂了不少业务语义。

建议：

- Skill 输出尽量就是“视图友好的结构”。
- App 只做轻量映射，不做规则判断。

## 建议的拆分原则

### Skill 侧负责

- 真实取数
- 业务字段解释
- 风险分析
- 汇总摘要
- 首页排序建议
- 审批/回复/启停等执行动作
- 审计写入

### App 侧负责

- 调起 Skill
- 展示 JSON 结果
- 确认中心交互
- 按钮、刷新、错误提示
- 主题、字号、页面状态

## 推荐的整理顺序

### 第一阶段：先理清单

先把所有 Skill 分成三类：

1. 已稳定接入
2. 已接入但边界混乱
3. 预留但未接入

当前看，已经比较清楚的是：

- 稳定接入：`native-calendar`、`reminder-center`、`skill-manager`、`audit-log`
- 边界混乱：`oa-todo`、`company-mail`、`hongyi-today-metrics`、`hongyi-business-overview`、`daily-briefing`
- 预留：`spm-todo`、`ai-chat-dispatcher`、`risk-scoring`、`boss-priority`

### 第二阶段：先收最痛的两块

优先收敛：

1. `oa-todo`
2. `company-mail`

原因：

- 它们都已经深度进入 App 主流程。
- 也最容易继续膨胀成“App 里再写一个 Skill”。

### 第三阶段：再收经营数据和晨报

继续收敛：

- `hongyi-today-metrics`
- `hongyi-business-overview`
- `daily-briefing`

这些 Skill 最适合把“业务口径”和“摘要文案”都收进去。

### 第四阶段：补齐调度与预留能力

最后整理：

- `spm-todo`
- `ai-chat-dispatcher`
- `risk-scoring`
- `boss-priority`

这部分更像“编排层”和“策略层”，适合在底层 Skill 输出稳定后再收。

## 迁移时的验证方式

每个 Skill 收敛后，至少要做三类验证：

1. **Skill 独立可跑**：不依赖 App，也能输出标准 JSON。
2. **App 只读可渲染**：App 拿到 JSON 后能直接展示，不再自己补业务规则。
3. **写操作仍可确认后执行**：审批、回复、启停、安装卸载等动作必须还能走确认中心。

## 我建议的最终形态

最后应该变成：

- Skill 目录里是完整能力包
- App 里只是一个壳和交互层
- 每个 Skill 都遵守统一输出契约
- 业务规则尽量不跨 Skill 和 App 两边重复出现

## 需要你确认的点

这份规划里我先按“Skill 尽量吃业务逻辑，App 只做展示和确认”的方向整理。  
下一步如果要落地，我建议先从 `oa-todo` 和 `company-mail` 开始，因为它们最容易把 App 继续拖复杂。
