# Skill 输出契约（Skill Output Contract）

boss-jarvis App 与各 Skill 之间的唯一接口。所有 Skill 的数据通过 JSON 文件交换，App 不直接调用 Playwright 或任何业务系统。

## 交换方式

- Skill 执行后，把 stdout 的 JSON 原样写入数据目录下的 `<skill-name>.json`。
- 数据目录：`~/.boss-jarvis/data/`（可用环境变量 `BOSS_JARVIS_DATA_DIR` 覆盖，便于测试）。
- App 端只读这些 JSON 文件；文件缺失或解析失败时，对应区块显示“未获取”，不得用猜测数据填充。
- 时间戳一律 ISO 8601（本地时区），由 Skill 在 `fetchedAt` 字段给出；App 不自行推断采集时间。

## 通用包络（所有 Skill 必须遵守）

```json
{
  "ok": true,
  "skill": "oa-todo",
  "mode": "read_only",
  "sourceSystem": "OA",
  "fetchedAt": "2026-08-15T09:30:00+08:00",
  "count": 13,
  "homepageItems": [],
  "items": [],
  "missingFields": [],
  "unavailableSources": []
}
```

字段说明：

- `ok`：本次取数是否成功。失败时 App 展示“未获取”并保留上一次成功数据（如有）。
- `skill`：Skill 名，与文件名一致。
- `mode`：`read_only` 或 `write_pending`。写操作在确认前只能以 `write_pending` 进入确认队列。
- `sourceSystem`：来源系统中文名（OA / 虹翼 / 邮箱 / 日历 / 提醒中心）。
- `fetchedAt`：采集时间，ISO 8601。
- `count`：条目总数。
- `homepageItems`：需要进入首页的事项（高优先级、需老板决策）。
- `items`：完整条目列表。
- `missingFields`：本次未能获取的字段名列表，App 以“未获取”标注。
- `unavailableSources`：未能访问的上游来源及原因。

## 条目（item）通用字段

每个 item 建议包含：

- `title`：标题（必填，与源系统一致）。
- `source`：来源系统。
- `time`：时间（源系统原始字符串）。
- `level`：`urgent` / `attention` / `normal`。
- `sender`：发送人/创建人。
- `amount`：金额（数字，取不到则省略该字段并列入 `missingFields`）。
- `basis`：进入首页或定级的依据。
- `suggestedAction`：建议动作。

## 各 Skill 的特化

### oa-todo

分析优先契约（推荐，fetch-todo-with-analysis.cjs 输出）：

```json
{ "total": "13", "count": 13,
  "items": [{ "title": "...", "source": "...", "sender": "...", "time": "...",
              "level": "urgent",
              "analysis": { "priority": "P1", "priorityLabel": "...",
                            "riskLevel": "...", "riskPoints": ["..."],
                            "suggestion": "...", "detail": "..." } }] }
```

- 优先级判定、风险点、处理建议全部在 Skill 侧完成；P1/P2/P3 颜色映射（red/yellow/green）也由 Skill 给出。
- App 端只读展示，不再做任何优先级推断。

兼容契约（旧，read-todo-detail.cjs 列表模式输出）：

```json
{ "total": "13", "count": 13,
  "rows": [["标题","来源系统","创建人","发送人","发送时间"]] }
```

- `rows` 为 OA 列表原始行；此时分析来自旁路文件（历史方案，已废弃）。
- 自 2026-08-24 起 App 不再解析旧 rows 与旁路文件，只认 `items` 契约。
- `total` 与 `count` 不一致时视为数据质量问题，App 标注但不阻断展示。

### reminder-center

- `items` 为聚合后的提醒，含 `level`（红/黄/绿对应 urgent/attention/normal）、`basis`、`suggestedAction`。
- 未接入的来源列入 `unavailableSources`，首页显示“未获取”而非 0。

### hongyi-today-metrics

```json
{ "metrics": {
    "todayProjects": { "count": 0, "items": [] },
    "todayCustomerApplications": { "count": 0, "items": [] },
    "todayRevenueConfirmations": { "count": 0, "totalRevenueAmount": 0, "items": [] } } }
```

- `date` 为运行当天（源系统日期口径）。
- 今日收入确认为 0 时产出一条 attention 级 homepageItem，提示“需关注收入确认节奏”。

- 老板视角口径由 Skill 在 `bossView` 给出（推荐契约）：

```json
{ "bossView": {
    "todayMetrics": { "projectsCount": 0, "customerApplicationsCount": 0,
                      "revenueConfirmationsCount": 0,
                      "totalRevenueAmount": 0, "totalRevenueAmountText": "0.00" },
    "dataQuality": { "failedSourceCount": 0, "issues": [] } } }
```

- App 优先读 `bossView`；无 `bossView` 时回退解析旧 `metrics` 字段。
- 数字文本格式（如金额小数位）由 Skill 决定，App 不做二次格式化。

### hongyi-business-overview

```json
{ "summary": { "total": 0 }, "items": [],
  "bossView": {
    "overview": {
      "totalCount": 0, "homepageCount": 0,
      "revenueCount": 0, "collectionCount": 0, "marginCount": 0,
      "projectCount": 0, "customerCount": 0,
      "departmentDashboard": {
        "monthRevenueText": null, "monthProfitText": null,
        "yearProfitText": null, "yearGrossMarginText": null,
        "receivableBalanceText": null,
        "yearGrossMarginRateText": null, "overdueReceivableText": null } },
    "dataQuality": { "failedSourceCount": 0, "issues": [] } } }
```

- `bossView.overview` 为老板视角经营概览；`departmentDashboard` 字段标签与看板口径一致（万元），毛利率挂在毛利额条目、逾期挂在应收条目。
- App 优先读 `bossView`；无 `bossView` 时回退解析旧 `summary`/`items` 字段。
- 取不到的字段为 `null`，App 显示“未获取”，不得填 0。

### company-mail / daily-briefing / audit-log

#### company-mail

- `rows[].bodySummary` 为纯文本摘要，`rows[].bodyHtml` 为清洗后的 HTML 正文（已去除 script/style 与内联事件，限长 200KB）。
- `bodyHtml` 仅用于 App 详情弹层只读渲染；无 HTML 分支的邮件该字段为空字符串，App 回退展示 `bodySummary`。
- App 渲染 HTML 时禁用 JavaScript 并拦截链接跳转。
- 用户点击 `rows[].id` 对应邮件主题时，App 直接调用 company-mail 的 `mark-mail-read.cjs --message-id=<id> --confirmed` 将该邮件标记为已读；脚本通过 AppleScript 由 Mail 自身更新状态，不直接写 Envelope Index。
- 回复正文由 company-mail 的 `generate-reply-draft.cjs` 生成（`{ok, mode: draft_only, subject, draftBody, generator, audit}`）；App 不内置任何回复文案，只负责串联 generate-reply-draft、prepare-reply、open-confirmed-reply。
- 生成采用两级策略：优先经 model-router 调公司大模型按"先分析邮件意图再撰写"的提示词（`reply-prompt.md`）产出结构化回复；模型未配置、失败或限流时回退本地模板。`generator` 字段标明实际来源（`model`/`template`）。金额、日期、人名只允许来自原邮件或回复依据，不得由模型编造。

#### daily-briefing

- 晨报产物为 `~/.codex/workbench-reports/latest/boss-cockpit.json`（由 `run-briefing.cjs` 生成）。
- `boss-cockpit.json` 含 `bossView`（老板视角契约，推荐）：

```json
{ "bossView": {
    "summary": { "today": "", "headline": "", "generatedAt": "",
                 "total": 0, "mustDoNow": 0, "focusToday": 0, "watchList": 0,
                 "hiddenLowPriority": 0, "unavailableSources": 0 },
    "sections": { "mustDoNow": [], "focusToday": [], "watchList": [] },
    "sourceLabels": [],
    "schedule": { "configuredTime": null, "installed": false, "loaded": false } } }
```

- App 优先读 `bossView`；无 `bossView` 时回退解析旧 `homepage`/`ranked`/`sources` 字段（此时定时任务状态显示“未获取”）。
- `schedule` 由 daily-briefing 的 `manage-schedule.cjs status` 给出；App 不硬编码配置文件路径、plist 名称或默认时间。
- `sections` 只给首页展示用的标题数组；排序与评分仍由 `ranked`（boss-priority/risk-scoring）给出。

#### audit-log

待接入时按通用包络扩展，先补本节再实现。

### spm-todo

- `fetch-spm-todo.cjs` 输出含 `bossView`（推荐契约）：

```json
{ "count": 3,
  "bossView": {
    "summary": { "total": 3, "red": 1, "yellow": 1, "green": 1 },
    "topItems": [
      { "title": "服务器采购验收报销", "level": "red",
        "amountText": "186500.00", "ageText": "3天之前",
        "riskTypes": ["大额业务协作待办", "停留关注"] } ] },
  "rows": [ { "...": "原始行 + riskAnalysis" } ] }
```

- 风险判定（金额阈值、停留时长、异常关键词）全部在 Skill 侧的 `analyzeSpmRisk` 完成，App 只读 `riskAnalysis` 与 `bossView`。
- `--sample` 离线模式输出同样的包络，用于不登录真实系统的契约验证。
- 审批执行走 `approve-todo.cjs`，仅在用户在 App 确认后由 `SkillCommandService` 调用；App 侧按 `payload["skill"]=="spm-todo"` 触发。

### 编排层 Skill（不被 App 直接消费）

- `risk-scoring/score-items.cjs`：通用风险评分。输入为上游 skill 的 JSON（stdin 或文件路径，`--source=oa|spm|...`），输出 `items[]`（含 `level` red/yellow/green、`score`、`homepage`、`riskFactors`、`suggestedActions`）。金额必须给数字字段（`amount` 等，单位元）或“金额：xxx”文本；`amountText` 之类自定义文本字段不会被识别。
- `boss-priority/rank-items.cjs`：老板视角排序。输入为 risk-scoring 的输出（或原始条目），输出 `mustDoNow`/`focusToday`/`watchList`/`archiveItems` 四个分桶。
- 这两个 skill 只被 `boss-cockpit/build-cockpit.cjs` 的 `scoreAndRank()` 消费，App 源码不直接引用；评分或排序规则调整只改 skill 侧。
- `ai-chat-dispatcher/route-command.cjs`：对话指令路由。`--message=` 或 stdin 输入自然语言，输出 `primarySkill`、候选、`requiresConfirmation` 与执行计划；不带 `--execute-readonly` 时只路由不执行。写操作（同意/驳回/提交等）一律标记 `requiresConfirmation=true`。SPM 专属标识词（业务协作/EIAP/SPM）有特异性加分，优先于泛化的“待办”。

## 红线

- 金额、日期、人名必须来自源系统，App 端不做任何推测或四舍五入。
- 密码、Cookie、Token、PUserToken 不得出现在 JSON 文件中。
- 写操作 JSON 只描述“拟执行动作 + 依据”，实际执行永远在用户确认之后。
