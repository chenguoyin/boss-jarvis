import Foundation

/// 晨报摘要数据，来自 daily-briefing 的 boss-cockpit.json。
struct DailyBriefing: Identifiable {
    let id = UUID()
    let generatedAt: Date?
    let today: String
    let headline: String
    let total: Int
    let mustDoNow: Int
    let focusToday: Int
    let watchList: Int
    let hiddenLowPriority: Int
    let unavailableSources: Int
    let markdown: String
    let mustDoItems: [String]
    let focusItems: [String]
    let watchItems: [String]
    let sourceLabels: [String]
    /// daily-briefing bossView 给出的定时任务状态；旧产物无 bossView 时为 nil。
    let scheduleTime: String?
    let scheduleInstalled: Bool

    var riskLevel: RiskLevel {
        if mustDoNow > 0 { return .urgent }
        if focusToday > 0 || unavailableSources > 0 { return .attention }
        return .normal
    }
}

/// 读取 ~/.codex/workbench-reports/latest/boss-cockpit.json。
struct BriefingStore {
    var reportDirectory: URL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".codex/workbench-reports/latest", isDirectory: true)

    func loadLatest() -> DailyBriefing? {
        let url = reportDirectory.appendingPathComponent("boss-cockpit.json")
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data),
              let json = object as? [String: Any] else { return nil }
        // 契约：只认 daily-briefing 给出的 bossView；无 bossView 视为未获取，不回退解析旧格式。
        guard let bossView = json["bossView"] as? [String: Any] else { return nil }
        return briefingFromBossView(bossView)
    }

    /// 老板视角契约：字段解释和定时任务状态都由 daily-briefing 给出，App 直接渲染。
    private func briefingFromBossView(_ bossView: [String: Any]) -> DailyBriefing {
        let summary = bossView["summary"] as? [String: Any] ?? [:]
        let sections = bossView["sections"] as? [String: Any] ?? [:]
        let schedule = bossView["schedule"] as? [String: Any]
        return DailyBriefing(
            generatedAt: date(from: summary["generatedAt"] as? String ?? ""),
            today: summary["today"] as? String ?? "未获取",
            headline: summary["headline"] as? String ?? "未获取",
            total: summary["total"] as? Int ?? 0,
            mustDoNow: summary["mustDoNow"] as? Int ?? 0,
            focusToday: summary["focusToday"] as? Int ?? 0,
            watchList: summary["watchList"] as? Int ?? 0,
            hiddenLowPriority: summary["hiddenLowPriority"] as? Int ?? 0,
            unavailableSources: summary["unavailableSources"] as? Int ?? 0,
            markdown: "",
            mustDoItems: sections["mustDoNow"] as? [String] ?? [],
            focusItems: sections["focusToday"] as? [String] ?? [],
            watchItems: sections["watchList"] as? [String] ?? [],
            sourceLabels: bossView["sourceLabels"] as? [String] ?? [],
            scheduleTime: schedule?["configuredTime"] as? String,
            scheduleInstalled: schedule?["installed"] as? Bool ?? false
        )
    }

    private func date(from raw: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
    }
}
