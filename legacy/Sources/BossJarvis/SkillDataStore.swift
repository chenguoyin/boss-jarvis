import Foundation

/// Skill 输出契约的通用包络。字段与 docs/skill-output-contract.md 保持一致。
struct SkillEnvelope {
    let ok: Bool
    let skill: String
    let mode: String?
    let sourceSystem: String?
    let fetchedAt: Date?
    let count: Int?
    let items: [SkillItem]
    let homepageItems: [SkillItem]
    let missingFields: [String]
    let unavailableSources: [String]
    let raw: [String: Any]

    var fetchedAtLabel: String {
        guard let fetchedAt else { return "未获取" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: fetchedAt)
    }
}

/// 契约中的条目。金额、日期、人名一律保留源系统原始值，App 不做加工。
struct SkillItem: Identifiable {
    let id = UUID()
    let title: String
    let source: String?
    let sender: String?
    let time: String?
    let level: RiskLevel?
    let amount: Double?
    let basis: String?
    let suggestedAction: String?
}

/// 从 `~/.boss-jarvis/data/` 读取各 Skill 的 JSON 输出。只读，不写。
final class SkillDataStore {
    private let baseDirectory: URL
    private let fileManager = FileManager.default

    init(baseDirectory: URL? = nil) {
        if let baseDirectory {
            self.baseDirectory = baseDirectory
        } else if let override = ProcessInfo.processInfo.environment["BOSS_JARVIS_DATA_DIR"], !override.isEmpty {
            self.baseDirectory = URL(fileURLWithPath: override, isDirectory: true)
        } else {
            self.baseDirectory = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent(".boss-jarvis/data", isDirectory: true)
        }
    }

    /// 读取某个 Skill 的输出。文件缺失或解析失败时返回 nil，调用方显示“未获取”。
    func load(skill name: String) -> SkillEnvelope? {
        let url = baseDirectory.appendingPathComponent(name + ".json")
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data),
              let json = object as? [String: Any] else {
            return nil
        }
        return Self.parse(json)
    }

    static func parse(_ json: [String: Any]) -> SkillEnvelope {
        let fetchedAt: Date? = {
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            func parseDate(_ string: String?) -> Date? {
                guard let string else { return nil }
                return iso.date(from: string) ?? ISO8601DateFormatter().date(from: string)
            }
            if let date = parseDate(json["fetchedAt"] as? String) {
                return date
            }
            // 部分 Skill（如 company-mail）采集时间记录在 audit.collectedAt
            if let audit = json["audit"] as? [String: Any] {
                return parseDate(audit["collectedAt"] as? String)
            }
            return nil
        }()
        return SkillEnvelope(
            ok: json["ok"] as? Bool ?? false,
            skill: json["skill"] as? String ?? "",
            mode: json["mode"] as? String,
            sourceSystem: json["sourceSystem"] as? String,
            fetchedAt: fetchedAt,
            count: json["count"] as? Int,
            items: parseItems(json["items"]),
            homepageItems: parseItems(json["homepageItems"]),
            missingFields: json["missingFields"] as? [String] ?? [],
            unavailableSources: json["unavailableSources"] as? [String] ?? [],
            raw: json
        )
    }

    private static func parseItems(_ value: Any?) -> [SkillItem] {
        guard let array = value as? [[String: Any]] else { return [] }
        return array.compactMap { entry in
            guard let title = entry["title"] as? String, !title.isEmpty else { return nil }
            let level = RiskLevel(skillValue: entry["level"] as? String)
            return SkillItem(
                title: title,
                source: entry["source"] as? String,
                sender: entry["sender"] as? String,
                time: entry["time"] as? String,
                level: level,
                amount: entry["amount"] as? Double,
                basis: SkillDataStore.textValue(from: entry["basis"]),
                suggestedAction: SkillDataStore.textValue(from: entry["suggestedAction"])
            )
        }
    }

    static func textValue(from value: Any?) -> String? {
        if let text = value as? String {
            return text
        }
        if let list = value as? [Any] {
            let parts = list.compactMap { $0 as? String }.filter { !$0.isEmpty }
            return parts.isEmpty ? nil : parts.joined(separator: "；")
        }
        return nil
    }
}

// MARK: - oa-todo 适配

struct OATodoItem: Identifiable {
    let id = UUID()
    let title: String
    let source: String
    let creator: String
    let sender: String
    let time: String
    /// 附加分析：优先级、风险点、建议、详情摘要。全部来自 oa-todo 契约 items 的 analysis 字段。
    var analysis: OATodoAnalysis?

    /// 发送人为空时回退创建人，与 oa-todo SKILL.md 的汇报规则一致。
    var displaySender: String { sender.isEmpty ? creator : sender }
}

/// 单条待办的风险分析结果，字段全部来自 read-todo-detail 的只读详情。
struct OATodoAnalysis {
    let priority: String
    let priorityLabel: String
    let riskLevel: RiskLevel
    let riskPoints: [String]
    let suggestion: String
    let detail: String
}

struct OATodoResult {
    let total: Int
    let count: Int
    let items: [OATodoItem]
    let fetchedAt: Date?

    /// total 与 count 不一致时视为数据质量问题，标注但不阻断。
    var hasCountMismatch: Bool { total != count }
}

extension SkillDataStore {
    /// 解析 oa-todo 输出。只认契约 items（每项含 analysis），不再读旁路文件或旧 rows。
    func loadOATodo() -> OATodoResult? {
        guard let envelope = load(skill: "oa-todo"), envelope.ok else { return nil }
        return Self.parseOATodo(envelope)
    }

    /// 解析聚合输出的 analysis 字段（已由 oa-todo 规整好，App 直接采用）。
    private static func parseItemAnalysis(_ value: Any?) -> OATodoAnalysis? {
        guard let json = value as? [String: Any] else { return nil }
        return OATodoAnalysis(
            priority: json["priority"] as? String ?? "P4",
            priorityLabel: json["priorityLabel"] as? String ?? "待核验",
            riskLevel: RiskLevel(skillValue: json["riskLevel"] as? String) ?? .missing,
            riskPoints: json["riskPoints"] as? [String] ?? ["详情未获取"],
            suggestion: json["suggestion"] as? String ?? "审批前核验详情和附件",
            detail: json["detail"] as? String ?? "详情未获取"
        )
    }

    static func parseOATodo(_ envelope: SkillEnvelope) -> OATodoResult {
        let raw = envelope.raw
        // 契约：items 数组内每项带 title/source/creator/sender/time/analysis
        let rawItems = raw["items"] as? [[String: Any]] ?? []
        let items: [OATodoItem] = rawItems.compactMap { entry in
            guard let title = (entry["title"] as? String)?.trimmingCharacters(in: .whitespaces), !title.isEmpty else { return nil }
            return OATodoItem(
                title: title,
                source: entry["source"] as? String ?? "",
                creator: entry["creator"] as? String ?? "",
                sender: entry["sender"] as? String ?? "",
                time: entry["time"] as? String ?? "",
                analysis: parseItemAnalysis(entry["analysis"])
            )
        }
        let total: Int = {
            if let value = raw["total"] as? Int { return value }
            if let value = raw["total"] as? String { return Int(value) ?? items.count }
            return items.count
        }()
        return OATodoResult(
            total: total,
            count: raw["count"] as? Int ?? items.count,
            items: items,
            fetchedAt: envelope.fetchedAt
        )
    }
}

// MARK: - 虹翼经营数据适配

struct HongyiTodayMetrics {
    let projectsCount: Int
    let customerApplicationsCount: Int
    let revenueConfirmationsCount: Int
    let totalRevenueAmount: Double?
    let totalRevenueAmountText: String?
    let sourceCount: Int
    let failedSourceCount: Int
    let dataQualityIssues: [String]
    let fetchedAt: Date?

    var hasAnyData: Bool {
        projectsCount > 0 || customerApplicationsCount > 0 || revenueConfirmationsCount > 0 || (totalRevenueAmount ?? 0) != 0
    }

    var hasDataQualityIssues: Bool { failedSourceCount > 0 || !dataQualityIssues.isEmpty }
}

struct HongyiBusinessOverview {
    let totalCount: Int
    let homepageCount: Int
    let revenueCount: Int
    let collectionCount: Int
    let marginCount: Int
    let projectCount: Int
    let customerCount: Int
    let monthRevenueText: String?
    let quarterRevenueText: String?
    let yearRevenueText: String?
    let monthProfitText: String?
    let yearProfitText: String?
    let yearGrossMarginText: String?
    let yearGrossMarginRateText: String?
    let receivableBalanceText: String?
    let overdueReceivableText: String?
    let sourceCount: Int
    let failedSourceCount: Int
    let dataQualityIssues: [String]
    let fetchedAt: Date?

    var hasAnyData: Bool {
        totalCount > 0 || revenueCount > 0 || collectionCount > 0 || marginCount > 0 || projectCount > 0 || customerCount > 0 || hasDepartmentDashboardData
    }

    var hasDepartmentDashboardData: Bool {
        monthRevenueText != nil || quarterRevenueText != nil || yearRevenueText != nil
            || monthProfitText != nil || yearProfitText != nil
            || yearGrossMarginText != nil || yearGrossMarginRateText != nil
            || receivableBalanceText != nil || overdueReceivableText != nil
    }

    var hasDataQualityIssues: Bool { failedSourceCount > 0 || !dataQualityIssues.isEmpty }
}

struct HongyiBusinessSnapshot {
    let todayMetrics: HongyiTodayMetrics?
    let overview: HongyiBusinessOverview?
    let fetchedAt: Date?

    var hasAnyData: Bool {
        todayMetrics?.hasAnyData == true || overview?.hasAnyData == true
    }

    var hasDataQualityIssues: Bool {
        todayMetrics?.hasDataQualityIssues == true || overview?.hasDataQualityIssues == true
    }

    var dataQualityIssues: [String] {
        var issues: [String] = []
        if let todayMetrics {
            issues.append(contentsOf: todayMetrics.dataQualityIssues)
        }
        if let overview {
            issues.append(contentsOf: overview.dataQualityIssues)
        }
        return Array(Set(issues)).sorted()
    }

    var failedSourceCount: Int {
        (todayMetrics?.failedSourceCount ?? 0) + (overview?.failedSourceCount ?? 0)
    }

    var statusValue: String {
        if todayMetrics == nil && overview == nil {
            return "未获取"
        }
        if hasDataQualityIssues && !hasAnyData {
            return "未获取"
        }
        if hasDataQualityIssues {
            return "部分未获取"
        }
        return "已接入"
    }

    var primaryNote: String {
        if hasDataQualityIssues && !hasAnyData {
            return "虹翼取数失败"
        }
        if failedSourceCount > 0 {
            return "\(failedSourceCount) 个来源未获取"
        }
        if let overview, overview.homepageCount > 0 {
            return "首页关注 \(overview.homepageCount)"
        }
        if todayMetrics != nil || overview != nil {
            return "虹翼数据已接入"
        }
        return "虹翼"
    }

    var secondaryNote: String {
        if let todayMetrics {
            let revenue = todayMetrics.totalRevenueAmountText ?? "金额未获取"
            return "项目 \(todayMetrics.projectsCount) / 客户 \(todayMetrics.customerApplicationsCount) / 收入 \(revenue)"
        }
        if let overview {
            return "收入 \(overview.revenueCount) / 回款 \(overview.collectionCount) / 毛利 \(overview.marginCount)"
        }
        return "收入 / 回款 / 毛利"
    }

    var riskLevel: RiskLevel {
        if overview == nil && todayMetrics == nil {
            return .missing
        }
        if hasDataQualityIssues && !hasAnyData {
            return .missing
        }
        if hasDataQualityIssues {
            return .attention
        }
        if let overview, overview.homepageCount > 0 {
            return .attention
        }
        return .normal
    }

    var detailDescription: String {
        var parts: [String] = []
        if let todayMetrics {
            parts.append("今日项目 \(todayMetrics.projectsCount) 个、客户申请 \(todayMetrics.customerApplicationsCount) 个、收入确认 \(todayMetrics.revenueConfirmationsCount) 笔")
        }
        if let overview {
            parts.append("经营关注 \(overview.homepageCount) 项，收入 \(overview.revenueCount) 项、回款 \(overview.collectionCount) 项、毛利 \(overview.marginCount) 项")
        }
        if hasDataQualityIssues {
            let issueText = dataQualityIssues.prefix(4).joined(separator: "；")
            parts.append(issueText.isEmpty ? "虹翼部分来源未获取" : "数据质量：\(issueText)")
        }
        if parts.isEmpty {
            return "虹翼经营数据未获取，保留占位并等待 Skill 输出。"
        }
        return parts.joined(separator: "；")
    }
}

extension SkillDataStore {
    func loadHongyiTodayMetrics() -> HongyiTodayMetrics? {
        guard let envelope = load(skill: "hongyi-today-metrics"), envelope.ok else { return nil }
        let bossView = envelope.raw["bossView"] as? [String: Any]
        let sourceResults = envelope.raw["sourceResults"] as? [[String: Any]] ?? []
        // 契约：bossView.todayMetrics 由 Skill 给出展示口径与数据质量结论，App 直接读，不回退解析旧字段。
        guard let view = bossView, let metricsView = view["todayMetrics"] as? [String: Any] else { return nil }
        let quality = view["dataQuality"] as? [String: Any]
        return HongyiTodayMetrics(
            projectsCount: metricsView["projectsCount"] as? Int ?? 0,
            customerApplicationsCount: metricsView["customerApplicationsCount"] as? Int ?? 0,
            revenueConfirmationsCount: metricsView["revenueConfirmationsCount"] as? Int ?? 0,
            totalRevenueAmount: Self.numericValue(from: metricsView["totalRevenueAmount"]),
            totalRevenueAmountText: metricsView["totalRevenueAmountText"] as? String,
            sourceCount: sourceResults.count,
            failedSourceCount: quality?["failedSourceCount"] as? Int ?? Self.failedSourceCount(in: sourceResults),
            dataQualityIssues: (quality?["issues"] as? [String]) ?? Self.dataQualityIssues(from: envelope.missingFields, sourceResults: sourceResults),
            fetchedAt: envelope.fetchedAt
        )
    }

    func loadHongyiBusinessOverview() -> HongyiBusinessOverview? {
        guard let envelope = load(skill: "hongyi-business-overview"), envelope.ok else { return nil }
        let bossView = envelope.raw["bossView"] as? [String: Any]
        let fetch = envelope.raw["fetch"] as? [String: Any]
        let sourceResults = fetch?["sourceResults"] as? [[String: Any]] ?? envelope.raw["sourceResults"] as? [[String: Any]] ?? []
        // 契约：看板口径、KPI 计数、数据质量全部由 Skill 在 bossView 解释，App 直接读，不回退解析旧字段。
        guard let view = bossView, let overviewView = view["overview"] as? [String: Any] else { return nil }
        let dashboard = overviewView["departmentDashboard"] as? [String: Any] ?? [:]
        let quality = view["dataQuality"] as? [String: Any]
        let dashboardText: (String) -> String? = { key in dashboard[key] as? String }
        return HongyiBusinessOverview(
            totalCount: overviewView["totalCount"] as? Int ?? envelope.count ?? envelope.items.count,
            homepageCount: overviewView["homepageCount"] as? Int ?? envelope.homepageItems.count,
            revenueCount: overviewView["revenueCount"] as? Int ?? 0,
            collectionCount: overviewView["collectionCount"] as? Int ?? 0,
            marginCount: overviewView["marginCount"] as? Int ?? 0,
            projectCount: overviewView["projectCount"] as? Int ?? 0,
            customerCount: overviewView["customerCount"] as? Int ?? 0,
            monthRevenueText: dashboardText("monthRevenueText"),
            quarterRevenueText: dashboardText("quarterRevenueText"),
            yearRevenueText: dashboardText("yearRevenueText"),
            monthProfitText: dashboardText("monthProfitText"),
            yearProfitText: dashboardText("yearProfitText"),
            yearGrossMarginText: dashboardText("yearGrossMarginText"),
            yearGrossMarginRateText: dashboardText("yearGrossMarginRateText"),
            receivableBalanceText: dashboardText("receivableBalanceText"),
            overdueReceivableText: dashboardText("overdueReceivableText"),
            sourceCount: sourceResults.count,
            failedSourceCount: quality?["failedSourceCount"] as? Int ?? Self.failedSourceCount(in: sourceResults),
            dataQualityIssues: (quality?["issues"] as? [String]) ?? Self.dataQualityIssues(from: envelope.missingFields, sourceResults: sourceResults),
            fetchedAt: envelope.fetchedAt
        )
    }

    func loadHongyiBusinessSnapshot() -> HongyiBusinessSnapshot {
        let today = loadHongyiTodayMetrics()
        let overview = loadHongyiBusinessOverview()
        return HongyiBusinessSnapshot(
            todayMetrics: today,
            overview: overview,
            fetchedAt: overview?.fetchedAt ?? today?.fetchedAt
        )
    }

    private static func failedSourceCount(in sourceResults: [[String: Any]]) -> Int {
        sourceResults.filter { ($0["status"] as? String) != "success" }.count
    }

    private static func dataQualityIssues(from missingFields: [String], sourceResults: [[String: Any]]) -> [String] {
        var issues = missingFields
        for result in sourceResults where (result["status"] as? String) != "success" {
            let name = result["name"] as? String ?? "虹翼来源"
            let error = result["error"] as? String ?? "未获取"
            issues.append("\(name):\(error)")
        }
        return Array(Set(issues)).sorted()
    }

    private static func numericValue(from value: Any?) -> Double? {
        if let number = value as? NSNumber {
            return number.doubleValue
        }
        if let string = value as? String {
            let trimmed = string.replacingOccurrences(of: ",", with: "")
            return Double(trimmed)
        }
        return nil
    }
}

// MARK: - company-mail 适配

/// 单封未读邮件。所有文本字段保留 company-mail Skill 的原始输出，不做加工。
struct MailMessage: Identifiable {
    let id: Int
    let sender: String
    let subject: String
    let receivedAt: Date?
    let receivedAtText: String
    let bodySummary: String
    let bodyHtml: String
    let urgency: RiskLevel?
    let needsReply: Bool
    let replyBasis: String

    /// 时间戳在源 JSON 里是 ISO 8601；解析失败时回退原始字符串。
    var displayTime: String { receivedAtText.isEmpty ? "未获取" : receivedAtText }
}

struct CompanyMailResult {
    let count: Int
    let items: [MailMessage]
    let fetchedAt: Date?

    var needsReplyItems: [MailMessage] { items.filter(\.needsReply) }
    var needsReplyCount: Int { needsReplyItems.count }
    var hasUrgent: Bool { items.contains { $0.urgency == .urgent } }
    var hasAttention: Bool { items.contains { $0.urgency == .attention } }
}

extension SkillDataStore {
    /// 解析 company-mail 的 rows。文件缺失或 ok=false 时返回 nil，调用方显示“未获取”。
    func loadCompanyMail() -> CompanyMailResult? {
        guard let envelope = load(skill: "company-mail"), envelope.ok else { return nil }
        return Self.parseCompanyMail(envelope)
    }

    static func parseCompanyMail(_ envelope: SkillEnvelope) -> CompanyMailResult {
        let rows = envelope.raw["rows"] as? [[String: Any]] ?? []
        let items: [MailMessage] = rows.compactMap { row in
            guard let id = row["id"] as? Int,
                  let subject = row["subject"] as? String, !subject.isEmpty else {
                return nil
            }
            let analysis = row["analysis"] as? [String: Any]
            let receivedAtText = row["receivedAt"] as? String ?? ""
            let fallbackText = row["receivedAtText"] as? String ?? ""
            let receivedAt: Date? = {
                guard !receivedAtText.isEmpty else { return nil }
                let iso = ISO8601DateFormatter()
                iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                return iso.date(from: receivedAtText) ?? ISO8601DateFormatter().date(from: receivedAtText)
            }()
            return MailMessage(
                id: id,
                sender: row["sender"] as? String ?? "",
                subject: subject,
                receivedAt: receivedAt,
                receivedAtText: receivedAtText.isEmpty ? fallbackText : receivedAtText,
                bodySummary: row["bodySummary"] as? String ?? "",
                bodyHtml: row["bodyHtml"] as? String ?? "",
                urgency: RiskLevel(skillValue: analysis?["urgency"] as? String),
                needsReply: analysis?["needsReply"] as? Bool ?? false,
                replyBasis: analysis?["replyBasis"] as? String ?? ""
            )
        }
        return CompanyMailResult(
            count: envelope.raw["count"] as? Int ?? items.count,
            items: items,
            fetchedAt: envelope.fetchedAt
        )
    }
}

// MARK: - skill-manager 适配

/// Skill 注册表条目。生命周期与运行状态原文保留 skill-manager 的输出。
struct ManagedSkill: Identifiable {
    let id: String
    let name: String
    let descriptionText: String
    let lifecycleStatus: String
    let runtimeStatus: String
    let enabledOnDisk: Bool

    var isEnabled: Bool { lifecycleStatus == "enabled" }

    var lifecycleTitle: String {
        switch lifecycleStatus {
        case "enabled": "启用"
        case "disabled": "停用"
        case "installed": "已安装"
        default: lifecycleStatus.isEmpty ? "未获取" : lifecycleStatus
        }
    }

    var lifecycleLevel: RiskLevel {
        switch lifecycleStatus {
        case "enabled": .normal
        case "installed": .attention
        case "disabled": .missing
        default: .missing
        }
    }
}

struct SkillManagerResult {
    let count: Int
    let items: [ManagedSkill]
    let fetchedAt: Date?

    var enabledCount: Int { items.filter(\.isEnabled).count }
}

extension SkillDataStore {
    /// 解析 skill-manager 的 items。文件缺失或 ok=false 时返回 nil。
    func loadSkillManager() -> SkillManagerResult? {
        guard let envelope = load(skill: "skill-manager"), envelope.ok else { return nil }
        return Self.parseSkillManager(envelope)
    }

    static func parseSkillManager(_ envelope: SkillEnvelope) -> SkillManagerResult {
        let rawItems = envelope.raw["items"] as? [[String: Any]] ?? []
        let items: [ManagedSkill] = rawItems.compactMap { entry in
            guard let id = entry["id"] as? String, !id.isEmpty else { return nil }
            let runtime = entry["runtime"] as? [String: Any]
            return ManagedSkill(
                id: id,
                name: entry["name"] as? String ?? id,
                descriptionText: entry["description"] as? String ?? "",
                lifecycleStatus: entry["lifecycleStatus"] as? String ?? "",
                runtimeStatus: runtime?["status"] as? String ?? "",
                enabledOnDisk: entry["enabledOnDisk"] as? Bool ?? false
            )
        }
        return SkillManagerResult(
            count: envelope.raw["count"] as? Int ?? items.count,
            items: items,
            fetchedAt: envelope.fetchedAt
        )
    }
}

// MARK: - native-calendar

struct NativeCalendarEvent: Identifiable {
    let id: String
    let title: String
    let calendar: String
    let start: String
    let end: String
    let isAllDay: Bool
    let priority: String
    let reasons: [String]

    var priorityLevel: RiskLevel {
        RiskLevel(skillValue: priority) ?? .normal
    }
}

struct NativeCalendarReminder: Identifiable {
    let id: String
    let title: String
    let notes: String
    let due: String
    let priority: String
    let reasons: [String]

    var priorityLevel: RiskLevel {
        RiskLevel(skillValue: priority) ?? .normal
    }
}

struct NativeCalendarResult {
    let date: String
    let events: [NativeCalendarEvent]
    let reminders: [NativeCalendarReminder]
    let summaryEventCount: Int
    let summaryReminderCount: Int
    let summaryHomepageItems: Int
    let summaryOverdueReminderCount: Int
    let fetchedAt: Date?

    var hasHomepageItems: Bool { summaryHomepageItems > 0 }
}

extension SkillDataStore {
    func loadNativeCalendar() -> NativeCalendarResult? {
        guard let envelope = load(skill: "native-calendar"), envelope.ok else { return nil }
        return Self.parseNativeCalendar(envelope)
    }

    static func parseNativeCalendar(_ envelope: SkillEnvelope) -> NativeCalendarResult {
        let raw = envelope.raw
        let events = (raw["events"] as? [[String: Any]] ?? []).compactMap { e -> NativeCalendarEvent? in
            guard let id = e["id"] as? String,
                  let title = e["title"] as? String, !title.isEmpty else { return nil }
            return NativeCalendarEvent(
                id: id,
                title: title,
                calendar: e["calendar"] as? String ?? "未获取",
                start: e["start"] as? String ?? "",
                end: e["end"] as? String ?? "",
                isAllDay: e["isAllDay"] as? Bool ?? false,
                priority: e["priority"] as? String ?? "green",
                reasons: e["reasons"] as? [String] ?? []
            )
        }
        let reminders = (raw["reminders"] as? [[String: Any]] ?? []).compactMap { r -> NativeCalendarReminder? in
            guard let id = r["id"] as? String,
                  let title = r["title"] as? String, !title.isEmpty else { return nil }
            return NativeCalendarReminder(
                id: id,
                title: title,
                notes: r["notes"] as? String ?? "",
                due: r["due"] as? String ?? "",
                priority: r["priority"] as? String ?? "green",
                reasons: r["reasons"] as? [String] ?? []
            )
        }
        let summary = raw["summary"] as? [String: Any] ?? [:]
        return NativeCalendarResult(
            date: raw["date"] as? String ?? "未获取",
            events: events,
            reminders: reminders,
            summaryEventCount: summary["eventCount"] as? Int ?? events.count,
            summaryReminderCount: summary["reminderCount"] as? Int ?? reminders.count,
            summaryHomepageItems: summary["homepageItems"] as? Int ?? 0,
            summaryOverdueReminderCount: summary["overdueReminderCount"] as? Int ?? 0,
            fetchedAt: envelope.fetchedAt
        )
    }
}
