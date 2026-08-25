import Foundation

/// 每周总结数据，来自 weekly-summary Skill 的 JSON 输出。
struct WeeklySummary: Identifiable {
    let id = UUID()
    let generatedAt: Date?
    let reportDate: String
    let rangeStart: String
    let rangeEnd: String
    let days: Int
    let oaCount: Int
    let oaByCategory: [(name: String, count: Int)]
    let executedCount: Int
    let mailCount: Int
    let redRiskCount: Int
    let reminderCount: Int
    let reminderRedCount: Int
    let redRiskSummary: String
    let attendanceTopPerson: String
    let attendanceTopCount: Int
    let attendancePersonCount: Int
    let attendanceTotal: Int
    let nextWeekEventCount: Int
    let oaItems: [(date: String, title: String, level: String)]
    let riskItems: [(date: String, title: String, level: String)]
    let nextWeekEvents: [(date: String, time: String, title: String)]
    let focusPoints: [String]
    let markdown: String
    let savedPath: String
    let isOK: Bool
    let errorText: String
}

/// 读取 weekly-summary Skill 写入的 weekly-summary.json。
/// 只读，不写入；文件缺失或解析失败时置 nil，界面显示"未获取"。
struct WeeklySummaryStore {
    var dataDirectory: URL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".boss-jarvis/data", isDirectory: true)

    func loadLatest() -> WeeklySummary? {
        let url = dataDirectory.appendingPathComponent("weekly-summary.json")
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data),
              let json = object as? [String: Any] else { return nil }
        return Self.parse(json)
    }

    /// 历史报告日期（yyyy-MM-dd），倒序；无数据返回空数组。
    func availableDates() -> [String] {
        let dir = dataDirectory.appendingPathComponent("weekly-summary", isDirectory: true)
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        return files
            .filter { $0.pathExtension == "json" }
            .map { $0.deletingPathExtension().lastPathComponent }
            .sorted(by: >)
    }

    /// 按报告日期读取历史存档。
    func load(date: String) -> WeeklySummary? {
        let url = dataDirectory
            .appendingPathComponent("weekly-summary", isDirectory: true)
            .appendingPathComponent(date + ".json")
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data),
              let json = object as? [String: Any] else { return nil }
        return Self.parse(json)
    }

    static func parse(_ json: [String: Any]) -> WeeklySummary? {
        guard let reportDate = json["reportDate"] as? String else { return nil }
        let summary = json["summary"] as? [String: Any] ?? [:]
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let generatedAt = (json["generatedAt"] as? String).flatMap { formatter.date(from: $0) }
            ?? ISO8601DateFormatter().date(from: json["generatedAt"] as? String ?? "")
        let oaCategoryItems = summary["oaByCategory"] as? [String: Int] ?? [:]
        let oaByCategory: [(name: String, count: Int)] = oaCategoryItems
            .map { (name: $0.key, count: $0.value) }
            .sorted { $0.count > $1.count }
        let oaItemRows = json["oaItems"] as? [[String: Any]] ?? []
        let oaItems: [(date: String, title: String, level: String)] = oaItemRows.compactMap { item in
            guard let date = item["date"] as? String, let title = item["title"] as? String else { return nil }
            return (date: date, title: title, level: item["level"] as? String ?? "")
        }
        let riskItemRows = json["riskItems"] as? [[String: Any]] ?? []
        let riskItems: [(date: String, title: String, level: String)] = riskItemRows.compactMap { item in
            guard let date = item["date"] as? String, let title = item["title"] as? String else { return nil }
            return (date: date, title: title, level: item["level"] as? String ?? "")
        }
        let eventRows = json["nextWeekEvents"] as? [[String: Any]] ?? []
        let nextWeekEvents: [(date: String, time: String, title: String)] = eventRows.compactMap { item in
            guard let date = item["date"] as? String, let title = item["title"] as? String else { return nil }
            return (date: date, time: item["time"] as? String ?? "", title: title)
        }
        return WeeklySummary(
            generatedAt: generatedAt,
            reportDate: reportDate,
            rangeStart: json["rangeStart"] as? String ?? reportDate,
            rangeEnd: json["rangeEnd"] as? String ?? reportDate,
            days: json["days"] as? Int ?? 7,
            oaCount: summary["oaCount"] as? Int ?? 0,
            oaByCategory: oaByCategory,
            executedCount: summary["executedCount"] as? Int ?? 0,
            mailCount: summary["mailCount"] as? Int ?? 0,
            redRiskCount: summary["redRiskCount"] as? Int ?? 0,
            reminderCount: summary["reminderCount"] as? Int ?? 0,
            reminderRedCount: summary["reminderRedCount"] as? Int ?? 0,
            redRiskSummary: summary["redRiskSummary"] as? String ?? "",
            attendanceTopPerson: summary["attendanceTopPerson"] as? String ?? "",
            attendanceTopCount: summary["attendanceTopCount"] as? Int ?? 0,
            attendancePersonCount: summary["attendancePersonCount"] as? Int ?? 0,
            attendanceTotal: summary["attendanceTotal"] as? Int ?? 0,
            nextWeekEventCount: summary["nextWeekEvents"] as? Int ?? 0,
            oaItems: oaItems,
            riskItems: riskItems,
            nextWeekEvents: nextWeekEvents,
            focusPoints: json["focusPoints"] as? [String] ?? [],
            markdown: json["markdown"] as? String ?? "",
            savedPath: json["savedPath"] as? String ?? "",
            isOK: json["ok"] as? Bool ?? false,
            errorText: json["error"] as? String ?? ""
        )
    }
}
