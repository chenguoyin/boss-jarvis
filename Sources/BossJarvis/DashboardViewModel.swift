import Foundation

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var selectedSection: String = "驾驶舱"
    @Published private(set) var oaTodo: OATodoResult?
    @Published private(set) var reminders: SkillEnvelope?
    @Published private(set) var hongyiSnapshot: HongyiBusinessSnapshot
    @Published private(set) var companyMail: CompanyMailResult?
    @Published private(set) var skillManager: SkillManagerResult?
    @Published private(set) var nativeCalendar: NativeCalendarResult?
    @Published private(set) var briefing: DailyBriefing?
    @Published private(set) var weeklySummary: WeeklySummary?
    @Published private(set) var weeklySummaryDates: [String] = []
    @Published private(set) var selectedWeeklySummaryDate: String = ""
    @Published private(set) var auditDates: [String] = []
    @Published private(set) var auditEntries: [AuditLogEntry] = []
    @Published private(set) var selectedAuditDate: String = ""
    @Published private(set) var isReloading = false

    /// 邮件页按钮状态：已入队的邮件 id 集合。
    var queuedMailIDs: Set<String> {
        Set(pendingActions.filter { $0.kind == .mailReply && $0.state == .pending }.compactMap { $0.payload["mailID"] })
    }

    /// Skill 管理页按钮状态：已入队启停动作的 Skill id 集合。
    var queuedSkillIDs: Set<String> {
        Set(pendingActions.filter { ($0.kind == .skillEnable || $0.kind == .skillDisable || $0.kind == .skillInstall || $0.kind == .skillUninstall) && $0.state == .pending }.compactMap { $0.payload["skillID"] })
    }
    /// 确认中心队列：审批、Skill 启停等写操作先入队；邮件页回复直达客户端。
    @Published private(set) var pendingActions: [PendingWriteAction] = []
    @Published private(set) var isExecutingBatch = false
    @Published private(set) var batchProgressText: String = ""
    /// OA 待办弹层直达审批的最近一次结果，展示在 OA 待办页头部。
    @Published private(set) var oaApprovalStatus: String?
    @Published private(set) var fetchFailures: [String] = []
    /// 取数过程中的实时动作提示（如“正在同步未读邮件…（第 2/7 项）”），由 Skill 侧声明。
    @Published private(set) var fetchActivity: String?
    @Published private(set) var lastRefreshedAt: Date?
    @Published private(set) var nextAutoRefreshAt: Date?

    private let store: SkillDataStore
    private let briefingStore: BriefingStore
    private let weeklySummaryStore: WeeklySummaryStore
    private let auditStore: AuditLogStore
    private let commandService: any WritesConfirmedActions
    private let fetchService: SkillFetchService
    private var autoRefreshTimer: Timer?
    private var countdownTimer: Timer?
    private var autoRefreshInterval: TimeInterval = SystemConfiguration.defaultAutoRefreshInterval * 60
    private var autoRefreshEnabled = false
    /// 正在标记已读的邮件 id，避免连点重复触发。
    private var markingReadMailIDs: Set<Int> = []
    /// 已在工作台查看过（已标记已读）的邮件 id；重读磁盘数据时继续过滤，
    /// 避免 Mail 数据库同步延迟导致已读邮件在下次 reloadFromDisk 时重新出现。
    private var readMailIDs: Set<Int> = []

    init(store: SkillDataStore = SkillDataStore(), briefingStore: BriefingStore = BriefingStore(), weeklySummaryStore: WeeklySummaryStore = WeeklySummaryStore(), auditStore: AuditLogStore = AuditLogStore(), commandService: any WritesConfirmedActions = SkillCommandService(), fetchService: SkillFetchService = SkillFetchService()) {
        self.store = store
        self.briefingStore = briefingStore
        self.weeklySummaryStore = weeklySummaryStore
        self.auditStore = auditStore
        self.commandService = commandService
        self.fetchService = fetchService
        self.hongyiSnapshot = HongyiBusinessSnapshot(todayMetrics: nil, overview: nil, fetchedAt: nil)
        self.lastRefreshedAt = Date()
        reload()
    }


    // MARK: - 自动刷新

    /// 配置或更新自动刷新。interval 单位为分钟。
    func configureAutoRefresh(enabled: Bool, intervalMinutes: Double) {
        autoRefreshEnabled = enabled
        autoRefreshInterval = intervalMinutes * 60
        autoRefreshTimer?.invalidate()
        countdownTimer?.invalidate()
        guard enabled else {
            nextAutoRefreshAt = nil
            return
        }
        scheduleNextAutoRefresh()
        countdownTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.updateNextAutoRefreshDisplay()
            }
        }
    }

    private func scheduleNextAutoRefresh() {
        nextAutoRefreshAt = Date().addingTimeInterval(autoRefreshInterval)
        autoRefreshTimer = Timer.scheduledTimer(withTimeInterval: autoRefreshInterval, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.reload()
                self.scheduleNextAutoRefresh()
            }
        }
    }

    private func updateNextAutoRefreshDisplay() {
        objectWillChange.send()
    }

    /// 手动全量刷新：立即拉取全部 Skill 数据，并把自动刷新倒计时从头计。
    func refreshNow() {
        guard !isReloading else { return }
        autoRefreshTimer?.invalidate()
        if autoRefreshEnabled {
            scheduleNextAutoRefresh()
        } else {
            nextAutoRefreshAt = nil
        }
        reload()
    }

    /// 刷新 = 各 Skill 真实取数；OA 直接返回实时待办并同步逐条分析，不回读 OA 临时文件。
    func reload() {
        reloadFromDisk()
        guard !isReloading else { return }
        isReloading = true
        fetchActivity = "正在获取数据…"
        fetchService.fetchAll(excluding: ["oa-todo"], onProgress: { [weak self] text in
            Task { @MainActor [weak self] in
                self?.fetchActivity = text
            }
        }) { [weak self] results in
            guard let self else { return }
            let failures = results.filter { !$0.ok }
            self.fetchFailures = failures.map { "\($0.skill): \($0.error)" }
            self.reloadFromDisk()
            self.fetchActivity = "正在获取 OA 待办与审批详情…"
            self.commandService.refetchOATodos { [weak self] freshOATodos in
                guard let self else { return }
                if let freshOATodos {
                    self.oaTodo = freshOATodos
                } else {
                    self.fetchFailures.append("oa-todo: 从 OA 实时取数或详情分析失败")
                }
                self.lastRefreshedAt = Date()
                self.fetchActivity = nil
                self.isReloading = false
            }
        }
    }

    /// 重读非 OA 的本地数据；OA 列表只接受实时取数结果。
    func reloadFromDisk() {
        // OA 列表必须来自当前 OA 实时取数，不走本地数据文件。
        reminders = store.load(skill: "reminder-center").flatMap { $0.ok ? $0 : nil }
        hongyiSnapshot = store.loadHongyiBusinessSnapshot()
        companyMail = store.loadCompanyMail().map { result in
            CompanyMailResult(
                count: max(result.count - result.items.filter { readMailIDs.contains($0.id) }.count, 0),
                items: result.items.filter { !readMailIDs.contains($0.id) },
                fetchedAt: result.fetchedAt
            )
        }
        skillManager = store.loadSkillManager()
        nativeCalendar = store.loadNativeCalendar()
        briefing = briefingStore.loadLatest()
        weeklySummary = weeklySummaryStore.loadLatest()
        weeklySummaryDates = weeklySummaryStore.availableDates()
        // 首次进入默认最新；刷新后若 latest 日期变化则跟随 latest
        if selectedWeeklySummaryDate.isEmpty || weeklySummary?.reportDate != selectedWeeklySummaryDate {
            selectedWeeklySummaryDate = weeklySummary?.reportDate ?? weeklySummaryDates.first ?? ""
        }
        if let summary = weeklySummaryStore.load(date: selectedWeeklySummaryDate) {
            weeklySummary = summary
        }
        auditDates = auditStore.availableDates()
        if selectedAuditDate.isEmpty {
            selectedAuditDate = auditDates.first ?? ""
        }
        auditEntries = auditStore.load(date: selectedAuditDate)
    }

    /// 刷新单个 Skill 的真实数据（给单页刷新用）。
    func refreshSkill(_ name: String) {
        refreshSkill(name, completion: nil)
    }

    /// 依次刷新本页涉及的多个 Skill（给单页刷新用）。
    func refreshSkills(_ names: [String]) {
        refreshSkills(names, completion: nil)
    }

    func refreshSkills(_ names: [String], completion: ((Bool) -> Void)? = nil) {
        guard !names.isEmpty else { completion?(true); return }
        var remaining = names
        let first = remaining.removeFirst()
        refreshSkill(first) { [weak self] _ in
            self?.refreshSkills(remaining, completion: completion)
        }
    }

    /// 只重读本地数据（审计日志等），不触发任何 Skill 取数。
    func reloadLocalOnly() {
        reloadFromDisk()
    }

    /// completion 供 Jarvis 助手等异步调用方拿到执行结果；刷新进行中时立即返回 false。
    func refreshSkill(_ name: String, completion: ((Bool) -> Void)? = nil) {
        guard !isReloading else { completion?(false); return }
        isReloading = true
        if name == "oa-todo" {
            fetchActivity = "正在获取 OA 待办与审批详情…"
            commandService.refetchOATodos { [weak self] freshOATodos in
                guard let self else { return }
                self.fetchFailures.removeAll { $0.hasPrefix("oa-todo:") }
                if let freshOATodos {
                    self.oaTodo = freshOATodos
                    completion?(true)
                } else {
                    self.fetchFailures.append("oa-todo: 从 OA 实时取数失败")
                    completion?(false)
                }
                self.fetchActivity = nil
                self.isReloading = false
            }
            return
        }
        fetchService.fetch(skill: name, onProgress: { [weak self] text in
            Task { @MainActor [weak self] in
                self?.fetchActivity = text
            }
        }) { [weak self] ok, error in
            guard let self else { return }
            self.fetchFailures.removeAll { $0.hasPrefix(name + ":") }
            if !ok {
                let reason = error.isEmpty ? "取数失败" : error
                self.fetchFailures.append(name + ": " + reason)
            }
            self.reloadFromDisk()
            self.fetchActivity = nil
            self.isReloading = false
            completion?(ok)
        }
    }

    /// 指定页面相关 Skill 的取数失败文案；无失败时返回空数组。
    func fetchFailures(for skills: [String]) -> [String] {
        fetchFailures.filter { line in skills.contains { line.hasPrefix($0 + ":") } }
    }

    /// Jarvis 助手上下文快照：把当前工作台各模块数据压缩成文字，随对话注入模型。
    var assistantContextSnapshot: String {
        var lines: [String] = []
        func time(_ date: Date?) -> String {
            guard let date else { return "未获取" }
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
            return formatter.string(from: date)
        }
        if let oaTodo {
            lines.append("OA 待办 \(oaTodo.total) 件（\(time(oaTodo.fetchedAt))）：")
            for item in oaTodo.items.prefix(8) {
                let priority = item.analysis?.priorityLabel ?? ""
                lines.append("- " + item.title + (priority.isEmpty ? "" : "（" + priority + "）"))
            }
        } else {
            lines.append("OA 待办：未获取")
        }
        if let mail = companyMail {
            lines.append("邮件 \(mail.count) 封，其中需回复 \(mail.needsReplyCount) 封（\(time(mail.fetchedAt))）：")
            for message in mail.needsReplyItems.prefix(5) {
                lines.append("- #\(message.id) " + message.subject + "，发件人 " + message.sender)
            }
        } else {
            lines.append("邮件：未获取")
        }
        if let calendar = nativeCalendar {
            lines.append("今日日程 \(calendar.summaryEventCount) 项，提醒 \(calendar.summaryReminderCount) 条（\(time(calendar.fetchedAt))）")
            for event in calendar.events.prefix(5) {
                lines.append("- \(event.start) \(event.title)")
            }
        } else {
            lines.append("日历提醒：未获取")
        }
        let snapshot = hongyiSnapshot
        if let metrics = snapshot.todayMetrics {
            lines.append("今日经营速览：项目立项 \(metrics.projectsCount) 个、客户申请 \(metrics.customerApplicationsCount) 个、收入确认 \(metrics.revenueConfirmationsCount) 笔，金额 \(metrics.totalRevenueAmountText ?? "未获取")（\(time(metrics.fetchedAt))）")
        }
        if let overview = snapshot.overview {
            var overviewParts: [String] = []
            if let value = overview.monthRevenueText { overviewParts.append("本月营收 " + value) }
            if let value = overview.yearRevenueText { overviewParts.append("年度营收 " + value) }
            if let value = overview.yearProfitText { overviewParts.append("年度利润 " + value) }
            if let value = overview.receivableBalanceText { overviewParts.append("应收余额 " + value) }
            if !overviewParts.isEmpty {
                lines.append("经营概况：" + overviewParts.joined(separator: "，") + "（" + time(overview.fetchedAt) + "）")
            }
        }
        if let briefing {
            lines.append("今日晨报（\(time(briefing.generatedAt))）：\(briefing.headline)")
            if !briefing.mustDoItems.isEmpty {
                lines.append("必须立即处理：")
                for item in briefing.mustDoItems.prefix(5) { lines.append("- " + item) }
            }
        } else {
            lines.append("每日晨报：未获取")
        }
        if let skillManager {
            lines.append("Skill 管理：共 \(skillManager.count) 个，启用 \(skillManager.enabledCount) 个（" + skillManager.items.map(\.name).joined(separator: "、") + "）")
        }
        return lines.joined(separator: "\n")
    }

    var reminderSummaryText: String {
        guard let reminders else { return "未获取" }
        return String(reminders.count ?? reminders.items.count)
    }

    var reminderSecondaryText: String {
        guard let reminders else { return "OA / 邮件 / 日历" }
        let unavailable = reminders.unavailableSources.count
        if unavailable > 0 {
            return "\(unavailable) 个来源未获取"
        }
        return "OA / 邮件 / 日历"
    }

    var reminderRiskLevel: RiskLevel {
        guard let reminders else { return .missing }
        if reminders.items.contains(where: { $0.level == .urgent }) {
            return .urgent
        }
        if reminders.items.contains(where: { $0.level == .attention }) {
            return .attention
        }
        return .normal
    }

    var reminderFoundationDetail: String {
        guard let reminders else { return "统一提醒数据未获取，等待 reminder-center 输出。" }
        let count = reminders.count ?? reminders.items.count
        let unavailable = reminders.unavailableSources.count
        if unavailable > 0 {
            return "已接入 \(count) 项提醒，\(unavailable) 个来源未获取。"
        }
        return "已接入 \(count) 项提醒，来源覆盖完整。"
    }

    // MARK: - 邮件摘要

    /// 邮件徽标与卡片统一使用“需回复”数量；未获取时返回 nil 不显示徽标。
    var mailNeedsReplyCount: Int? {
        companyMail?.needsReplyCount
    }

    var mailRiskLevel: RiskLevel {
        guard let companyMail else { return .missing }
        if companyMail.hasUrgent { return .urgent }
        if companyMail.needsReplyCount > 0 || companyMail.hasAttention { return .attention }
        return .normal
    }

    var mailFoundationDetail: String {
        guard let companyMail else { return "邮件数据未获取，等待 company-mail 输出。" }
        let needs = companyMail.needsReplyCount
        if needs > 0 {
            return "未读 \(companyMail.count) 封，\(needs) 封判断需要回复，点击主题同步已读，点击回复直接打开邮件客户端。"
        }
        return "未读 \(companyMail.count) 封，暂无需要回复的邮件。"
    }

    // MARK: - 首页聚合

    /// 模块 1：待办提醒 Top 3，红 > 黄 > 绿，同级保持 Skill 输出顺序。
    var homeTodoItems: [HomeTodoItem] {
        let pool = reminders?.homepageItems ?? []
        return Array(
            pool
                .enumerated()
                .sorted { lhs, rhs in
                    let lhsLevel = lhs.element.level ?? .normal
                    let rhsLevel = rhs.element.level ?? .normal
                    if lhsLevel != rhsLevel {
                        return levelOrder(lhsLevel) < levelOrder(rhsLevel)
                    }
                    return lhs.offset < rhs.offset
                }
                .prefix(3)
                .map { _, item in
                    HomeTodoItem(
                        title: item.title,
                        level: item.level ?? .normal,
                        sourceLabel: item.source ?? "统一提醒",
                        timeLabel: item.time ?? "未获取",
                        detailLabel: item.basis?.isEmpty == false ? item.basis! : "按紧急度置顶",
                        targetSection: Self.section(forReminderSource: item.source)
                    )
                }
        )
    }

    private func levelOrder(_ level: RiskLevel) -> Int {
        switch level {
        case .urgent: 0
        case .attention: 1
        case .normal: 2
        case .missing: 3
        }
    }

    private static func section(forReminderSource source: String?) -> String {
        switch source {
        case "OA 待办", "OA 审批", "OA":
            return "OA 待办"
        case "邮件", "企业邮箱":
            return "邮件"
        case "日历", "日历提醒", "提醒事项":
            return "日历提醒"
        case "虹翼", "经营":
            return "经营情况"
        default:
            return "日历提醒"
        }
    }

    /// 模块 2：跨系统聚合（OA 审批 / 邮件待回复 / 今日日程）。
    var homeAggregateItems: [HomeAggregateItem] {
        [
            HomeAggregateItem(
                title: "OA 审批",
                count: oaTodo?.total,
                detail: oaTodo == nil
                    ? "OA 待办未获取"
                    : "OA 待办 \(oaTodo?.total ?? 0) 项，点击进入审批",
                level: (oaTodo?.total ?? 0) > 0 ? .urgent : .normal,
                targetSection: "OA 待办"
            ),
            HomeAggregateItem(
                title: "邮件待回复",
                count: companyMail?.needsReplyCount,
                detail: companyMail == nil
                    ? "邮件数据未获取"
                    : "未读 \(companyMail?.count ?? 0) 封，其中需回复 \(companyMail?.needsReplyCount ?? 0) 封",
                level: mailRiskLevel == .urgent ? .urgent : ((mailNeedsReplyCount ?? 0) > 0 ? .attention : .normal),
                targetSection: "邮件"
            ),
            HomeAggregateItem(
                title: "今日会议 / 日程",
                count: calendarTodayCount,
                detail: nativeCalendar == nil
                    ? "日历数据未获取"
                    : "今日事件 \(calendarTodayCount) 个 · 逾期提醒 \(nativeCalendar?.summaryOverdueReminderCount ?? 0) 个",
                level: .normal,
                targetSection: "日历提醒"
            )
        ]
    }

    private var calendarTodayCount: Int {
        nativeCalendar?.summaryEventCount ?? nativeCalendar?.events.count ?? 0
    }

    /// 模块 3：经营速览 5 卡，缺字段如实显示未获取。
    var homeMetricItems: [HomeMetricItem] {
        let today = hongyiSnapshot.todayMetrics
        let overview = hongyiSnapshot.overview
        let todayValue = today.map { "\($0.revenueConfirmationsCount) 笔 / \($0.totalRevenueAmountText ?? "金额未获取")" }
        return [
            HomeMetricItem(
                title: "今日收入确认",
                value: todayValue ?? "未获取",
                note: today == nil ? "今日专项未获取" : "来源：虹翼今日专项",
                level: .normal,
                isMissing: today == nil
            ),
            HomeMetricItem(
                title: "本月收入",
                value: overview?.monthRevenueText ?? "未获取",
                note: overview?.monthRevenueText == nil ? "部门看板字段待接入" : "单位：万元",
                level: .normal,
                isMissing: overview?.monthRevenueText == nil
            ),
            HomeMetricItem(
                title: "年度利润",
                value: overview?.yearProfitText ?? "未获取",
                note: overview?.yearProfitText == nil ? "部门看板字段待接入" : "单位：万元",
                level: .normal,
                isMissing: overview?.yearProfitText == nil
            ),
            HomeMetricItem(
                title: "应收余额",
                value: overview?.receivableBalanceText ?? "未获取",
                note: overview?.receivableBalanceText == nil ? "取数字段待虹翼 Skill 输出" : "单位：万元",
                level: .normal,
                isMissing: overview?.receivableBalanceText == nil
            ),
            HomeMetricItem(
                title: "逾期应收",
                value: overview?.overdueReceivableText ?? "未获取",
                note: overview?.overdueReceivableText == nil ? "接入后超阈值自动标红" : "单位：万元",
                level: .normal,
                isMissing: overview?.overdueReceivableText == nil
            )
        ]
    }

    /// 模块 4：风险与 AI 建议，来自提醒中心红黄项 + 虹翼首页关注项。
    var homeRiskItems: [HomeRiskItem] {
        var items: [HomeRiskItem] = []
        let reminderPool = (reminders?.homepageItems ?? []).filter { $0.level == .urgent || $0.level == .attention }
        for item in reminderPool.prefix(4) {
            items.append(
                HomeRiskItem(
                    conclusion: item.title,
                    advice: item.suggestedAction ?? "进入来源系统确认处理动作。",
                    sourceLabel: [item.source, item.time].compactMap { $0 }.joined(separator: " · "),
                    impact: item.level == .urgent ? .high : .medium
                )
            )
        }
        if let overview = hongyiSnapshot.overview, overview.homepageCount > 0 {
            items.append(
                HomeRiskItem(
                    conclusion: "虹翼经营关注 \(overview.homepageCount) 项待处理",
                    advice: "进入经营情况页逐项确认收入、回款与项目风险。",
                    sourceLabel: "虹翼经营总览 · \(hongyiSnapshot.fetchedAt.map { Self.shortTimeLabel(for: $0) } ?? "未获取")",
                    impact: .medium
                )
            )
        }
        return Array(items.prefix(4))
    }

    /// 模块 5：待回复邮件 Top 3。
    var homeMailItems: [MailMessage] {
        Array((companyMail?.needsReplyItems ?? []).prefix(3))
    }

    /// 结论条：需处理总数、紧急数、待回复数。
    var homeHeadlineCounts: (total: Int, urgent: Int, mail: Int) {
        let mustDo = briefing?.mustDoNow ?? 0
        let focus = briefing?.focusToday ?? 0
        let urgentReminders = (reminders?.homepageItems ?? []).filter { $0.level == .urgent }.count
        return (
            total: mustDo + focus,
            urgent: max(mustDo, urgentReminders),
            mail: companyMail?.needsReplyCount ?? 0
        )
    }

    /// 结论条正文：结论先行一句话，缺数据时如实说明。
    var homeHeadlineText: String {
        let counts = homeHeadlineCounts
        if briefing == nil && reminders == nil {
            return "首页数据未获取，点击右上角刷新后重试"
        }
        if counts.total == 0 {
            return "今日无紧急事项，邮件待回复 \(counts.mail) 封"
        }
        return "今日 \(counts.total) 项需处理，\(counts.urgent) 项紧急，邮件 \(counts.mail) 封待回复"
    }

    /// 结论条 KPI chips。
    var homeHeadlineChips: [(value: String, label: String, level: RiskLevel)] {
        let counts = homeHeadlineCounts
        return [
            ("\(counts.urgent)", "紧急", counts.urgent > 0 ? .urgent : .normal),
            ("\(oaTodo?.total ?? 0)", "OA 审批", (oaTodo?.total ?? 0) > 0 ? .urgent : .normal),
            ("\(counts.mail)", "待回复", counts.mail > 0 ? .attention : .normal),
            ("\(calendarTodayCount)", "今日会议", .normal)
        ]
    }

    /// 各数据源最近更新时间的最大值，展示在结论条尾部。
    var homeDataUpdatedText: String {
        let candidates: [Date?] = [
            reminders?.fetchedAt,
            companyMail?.fetchedAt,
            oaTodo?.fetchedAt,
            nativeCalendar?.fetchedAt,
            briefing?.generatedAt,
            hongyiSnapshot.fetchedAt
        ]
        let dates = candidates.compactMap { $0 }
        guard let latest = dates.max() else { return "未获取" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: latest)
    }

    nonisolated static func shortTimeLabel(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: date)
    }

    // MARK: - 确认中心

    /// 邮件直达回复的最近一次结果，展示在邮件页头部。
    @Published private(set) var mailReplyStatus: String?
    /// 正在生成回复草稿的邮件 ID 集合：供 UI 显示等待指示并防止重复点击。
    @Published private(set) var replyingMailIDs: Set<Int> = []
    /// 最近一次回复流程是否成功：详情弹层据此决定自动关闭还是展示失败原因。
    @Published private(set) var lastMailReplySucceeded = false
    /// 标记已读的最近一次结果，展示在邮件页头部。
    @Published private(set) var mailReadStatus: String?
    /// 仅供测试注入邮件列表数据。
    func injectCompanyMailForTesting(_ result: CompanyMailResult?) {
        companyMail = result
    }

    /// 邮件页点击回复后的直达路径：直接在邮件客户端打开回复窗口，不经过确认中心。
    /// 草稿由 company-mail 生成；发送仍由用户在邮件客户端点击，本方法不代发。
    func openMailReply(_ message: MailMessage) {
        guard !replyingMailIDs.contains(message.id) else { return }
        replyingMailIDs.insert(message.id)
        lastMailReplySucceeded = false
        mailReplyStatus = "正在生成回复草稿…"
        commandService.openMailReply(message) { [weak self] ok, summary in
            DispatchQueue.main.async {
                guard let self else { return }
                self.replyingMailIDs.remove(message.id)
                self.lastMailReplySucceeded = ok
                self.mailReplyStatus = summary
                if ok { self.reloadFromDisk() }
            }
        }
    }

    /// Jarvis 助手对话内回复邮件：同一条直达链路，结果回传给对话展示。
    func openMailReply(_ message: MailMessage, completion: @escaping (Bool, String) -> Void) {
        commandService.openMailReply(message, completion: completion)
    }

    /// 点击邮件主题打开详情的同时，直接在 Mail 客户端标记已读，不经过确认中心。
    /// 只作用于被点击的那一封；成功后立即从列表移除，关闭详情即不再显示。
    /// 不立即重跑取数：Mail 的 SQLite 写入有延迟，马上重取可能把已读邮件又带回来。
    func markMailRead(_ message: MailMessage) {
        guard !markingReadMailIDs.contains(message.id) else { return }
        markingReadMailIDs.insert(message.id)
        mailReadStatus = "正在同步已读状态…"
        commandService.markMailRead(message) { [weak self] ok, summary in
            DispatchQueue.main.async {
                guard let self else { return }
                self.markingReadMailIDs.remove(message.id)
                self.mailReadStatus = summary
                if ok {
                    self.readMailIDs.insert(message.id)
                    self.companyMail = self.companyMail.map { result in
                        CompanyMailResult(
                            count: max(result.count - 1, 0),
                            items: result.items.filter { $0.id != message.id },
                            fetchedAt: result.fetchedAt
                        )
                    }
                }
            }
        }
    }

    /// 首页“待确认动作”读真实队列，不再写死。
    var pendingConfirmationCount: Int {
        pendingActions.filter { $0.state == .pending }.count
    }

    /// 把一封邮件的回复动作放入确认队列（仍需汇总确认的场景）。草稿在执行时由 company-mail 生成。
    func enqueueMailReply(_ message: MailMessage) {
        guard !pendingActions.contains(where: { $0.kind == .mailReply && $0.payload["mailID"] == String(message.id) && $0.state == .pending }) else {
            return
        }
        let action = PendingWriteAction(
            kind: .mailReply,
            actionTitle: "回复：\(message.subject)",
            basis: message.replyBasis.isEmpty ? "company-mail 判断需要回复" : message.replyBasis,
            payload: [
                "mailID": String(message.id),
                "to": message.sender,
                "subject": message.subject
            ],
            createdAt: Date()
        )
        pendingActions.append(action)
    }

    /// 把 OA 审批动作放入确认队列。只入队不执行；确认后由 SkillCommandService 提示走 OA 完成实际提交。
    func enqueueOAApproval(_ item: OATodoItem, comment: String, approve: Bool) {
        let verb = approve ? "同意" : "不同意"
        guard !pendingActions.contains(where: { $0.kind == .approval && $0.payload["todoTitle"] == item.title && $0.state == .pending }) else {
            return
        }
        let basisParts: [String] = [
            "来源：\(item.source.isEmpty ? "未获取" : item.source)",
            "风险：\(item.analysis?.riskPoints.joined(separator: "；") ?? "未分析")",
            "建议：\(item.analysis?.suggestion ?? "未分析")"
        ]
        let action = PendingWriteAction(
            kind: .approval,
            actionTitle: "\(verb)：\(item.title)",
            basis: basisParts.joined(separator: "；"),
            payload: [
                "todoTitle": item.title,
                "comment": comment,
                "verb": verb,
                "sender": item.displaySender,
                "time": item.time
            ],
            createdAt: Date()
        )
        pendingActions.append(action)
    }

    /// OA 待办弹层直达审批：入队后立即真实执行，不再跳确认中心。
    /// 弹层内点“同意/不同意”已是明确意图表达；执行记录仍留在确认中心做审计。
    func executeOAApprovalDirectly(_ item: OATodoItem, comment: String, approve: Bool) {
        enqueueOAApproval(item, comment: comment, approve: approve)
        guard let action = pendingActions.last, action.kind == .approval, action.state == .pending else {
            oaApprovalStatus = "已有同标题审批在执行中，请稍候。"
            return
        }
        oaApprovalStatus = "正在提交审批：\(item.title.prefix(40))…"
        confirm(actionID: action.id)
    }

    /// 把 Skill 启停动作放入确认队列。
    func enqueueSkillToggle(_ skill: ManagedSkill) {
        let kind: PendingWriteAction.Kind = skill.isEnabled ? .skillDisable : .skillEnable
        guard !pendingActions.contains(where: { $0.kind == kind && $0.payload["skillID"] == skill.id && $0.state == .pending }) else {
            return
        }
        let verb = skill.isEnabled ? "停用" : "启用"
        let action = PendingWriteAction(
            kind: kind,
            actionTitle: "\(verb)：\(skill.name)",
            basis: "当前状态：\(skill.lifecycleTitle)",
            payload: ["skillID": skill.id, "verb": verb],
            createdAt: Date()
        )
        pendingActions.append(action)
    }

    /// Skill 启停直接执行：按钮点击即生效，结果写入确认中心留档。
    func toggleSkill(_ skill: ManagedSkill) {
        let action = PendingWriteAction(
            kind: skill.isEnabled ? .skillDisable : .skillEnable,
            actionTitle: (skill.isEnabled ? "停用：" : "启用：") + skill.name,
            basis: "直接执行：点击即生效；执行前状态：\(skill.lifecycleTitle)",
            payload: ["skillID": skill.id, "verb": skill.isEnabled ? "停用" : "启用"],
            createdAt: Date()
        )
        pendingActions.append(action)
        confirm(actionID: action.id)
    }

    /// 把 Skill 安装动作放入确认队列。source 为包含 SKILL.md 的本地源目录。
    func enqueueSkillInstall(source: String) {
        let trimmed = source.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let skillID = (trimmed as NSString).lastPathComponent
        guard !pendingActions.contains(where: { $0.kind == .skillInstall && $0.payload["source"] == trimmed && $0.state == .pending }) else {
            return
        }
        let action = PendingWriteAction(
            kind: .skillInstall,
            actionTitle: "安装：\(skillID)",
            basis: "安装源：\(trimmed)，安装后默认启用",
            payload: ["source": trimmed, "skillID": skillID],
            createdAt: Date()
        )
        pendingActions.append(action)
    }

    /// 把 Skill 卸载动作放入确认队列。卸载只是归档代码，不删历史日志与审计记录。
    func enqueueSkillUninstall(_ skill: ManagedSkill) {
        guard !pendingActions.contains(where: { $0.kind == .skillUninstall && $0.payload["skillID"] == skill.id && $0.state == .pending }) else {
            return
        }
        let action = PendingWriteAction(
            kind: .skillUninstall,
            actionTitle: "卸载：\(skill.name)",
            basis: "当前状态：\(skill.lifecycleTitle)；代码将移入本机归档目录，历史日志保留",
            payload: ["skillID": skill.id, "verb": "卸载"],
            createdAt: Date()
        )
        pendingActions.append(action)
    }

    /// 切换审计日志日期并重新加载。
    func selectAuditDate(_ date: String) {
        selectedAuditDate = date
        auditEntries = auditStore.load(date: date)
    }

    /// 切换周报日期后从存档读取；日期无效或解析失败时保持原内容。
    func selectWeeklySummaryDate(_ date: String) {
        selectedWeeklySummaryDate = date
        if let summary = weeklySummaryStore.load(date: date) {
            weeklySummary = summary
        }
    }

    /// 用户确认后调用对应 Skill 命令真实执行，结果写回队列。
    /// 邮件回复只打开回复窗口不代发；OA 审批不在 App 内代点；全部动作状态与摘要可追溯。
    /// 邮件只生成草稿不发送；OA 审批不在 App 内代点；全部动作状态与摘要可追溯。
    func confirm(actionID: UUID) {
        executeBatch([actionID])
    }

    /// 确认执行成功后，同步刷新对应业务队列，保持待办列表与源系统一致。
    /// 审批成功会重跑 OA 取数（真实移除已处理待办）；Skill 启停重载管理清单；邮件重载邮件数据。
    private func syncQueuesAfterExecution(of kind: PendingWriteAction.Kind) {
        switch kind {
        case .approval:
            commandService.refetchOATodos { [weak self] freshOATodos in
                DispatchQueue.main.async {
                    guard let self, let freshOATodos else { return }
                    self.oaTodo = freshOATodos
                }
            }
        case .skillEnable, .skillDisable, .skillInstall, .skillUninstall:
            commandService.refetchSkillManager { [weak self] _ in
                DispatchQueue.main.async {
                    self?.skillManager = self?.store.loadSkillManager()
                }
            }
        case .mailReply:
            DispatchQueue.main.async {
                self.companyMail = self.store.loadCompanyMail()
            }
        }
    }

    /// 用户跳过：保留记录，状态置为已跳过。
    func skip(actionID: UUID) {
        guard let index = pendingActions.firstIndex(where: { $0.id == actionID }) else { return }
        pendingActions[index].state = .cancelled
    }

    /// 批量确认执行：逐项串行执行，避免多个 Playwright 会话争抢同一浏览器上下文。
    func confirm(actionIDs: [UUID]) {
        executeBatch(actionIDs)
    }

    /// 后台串行执行，主线程只做状态回写，避免 Skill 进程阻塞界面。
    private func executeBatch(_ actionIDs: [UUID]) {
        let ids = actionIDs.filter { id in
            pendingActions.contains { $0.id == id && $0.state == .pending }
        }
        guard !ids.isEmpty, !isExecutingBatch else { return }
        isExecutingBatch = true
        let firstTitle = actionTitle(for: ids[0])
        batchProgressText = ids.count == 1
            ? "正在执行：\(firstTitle)"
            : "正在执行第 1/\(ids.count) 项：\(firstTitle)"

        // 先在主线程取出待执行动作，后台只跑进程，结果全部回主线程回写。
        var actions: [PendingWriteAction] = []
        for id in ids {
            if let action = pendingActions.first(where: { $0.id == id }), action.state == .pending {
                actions.append(action)
            }
        }
        let pendingSnapshot = actions
        let totalCount = ids.count
        let commandService = commandService

        Task.detached(priority: .userInitiated) { [weak self] in
            for (offset, action) in pendingSnapshot.enumerated() {
                let outcome = commandService.execute(action)
                await MainActor.run { [weak self] in
                    self?.applyOutcome(ok: outcome.ok, summary: outcome.summary, draftPath: outcome.draftPath, actionID: action.id)
                    let remaining = totalCount - offset - 1
                    self?.batchProgressText = remaining > 0
                        ? "正在执行第 \(offset + 1)/\(totalCount) 项：\(action.actionTitle) · 还剩 \(remaining) 条"
                        : "执行完成：共 \(totalCount) 项"
                    if action.kind == .approval {
                        self?.oaApprovalStatus = outcome.ok ? nil : "审批执行失败：\(outcome.summary)"
                    }
                    if outcome.ok {
                        self?.syncQueuesAfterExecution(of: action.kind)
                    }
                }
            }
            await MainActor.run { [weak self] in
                self?.isExecutingBatch = false
                self?.batchProgressText = ""
            }
        }
    }

    private func actionTitle(for id: UUID) -> String {
        pendingActions.first { $0.id == id }?.actionTitle ?? "写操作"
    }

    private func applyOutcome(ok: Bool, summary: String, draftPath: String?, actionID: UUID) {
        guard let index = pendingActions.firstIndex(where: { $0.id == actionID }) else { return }
        pendingActions[index].state = ok ? .executed : .pending
        pendingActions[index].executionSummary = summary
        if let draftPath {
            pendingActions[index].draftPath = draftPath
        }
    }

    /// 批量跳过。
    func skip(actionIDs: [UUID]) {
        for id in actionIDs {
            skip(actionID: id)
        }
    }

}
