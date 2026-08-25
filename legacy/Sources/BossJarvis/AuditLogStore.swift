import Foundation

/// 单条审计记录，对应 audit-log Skill 写入的 JSONL 字段。
struct AuditLogEntry: Identifiable {
    let id = UUID()
    let auditId: String
    let timestamp: Date?
    let timestampText: String
    let actor: String
    let skill: String
    let sourceSystem: String
    let actionType: String
    let mode: String
    let status: String
    let targetTitle: String
    let resultSummary: String
    let requestSummary: String

    var actionTitle: String {
        let names = [
            "fetch_data": "取数",
            "analyze": "分析",
            "propose_write": "拟执行",
            "confirm_write": "确认",
            "execute_write": "实际执行",
            "skill_lifecycle": "Skill 生命周期",
            "model_call": "模型调用"
        ]
        return names[actionType] ?? actionType
    }

    var statusLevel: RiskLevel {
        if status == "success" { return .normal }
        if status == "pending" { return .attention }
        return .urgent
    }
}

/// 读取 ~/.codex/workbench-audit/ 下按日期分区的 audit.jsonl。
/// 只读，不写入；文件缺失或解析失败时置空，界面显示“未获取”。
struct AuditLogStore {
    var rootDirectory: URL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".codex/workbench-audit", isDirectory: true)

    /// 可用日期（目录名），降序。空数组表示从未记录过审计。
    func availableDates() -> [String] {
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: rootDirectory.path) else { return [] }
        return names.filter(isDateShape).sorted(by: >)
    }

    private func isDateShape(_ value: String) -> Bool {
        guard value.count == 10 else { return false }
        let parts = value.split(separator: "-")
        return parts.count == 3
            && parts[0].count == 4
            && parts[1].count == 2
            && parts[2].count == 2
            && parts.allSatisfy { $0.allSatisfy { $0.isNumber } }
    }

    func load(date: String) -> [AuditLogEntry] {
        let url = rootDirectory.appendingPathComponent(date, isDirectory: true)
            .appendingPathComponent("audit.jsonl")
        guard let data = try? Data(contentsOf: url) else { return [] }
        guard let text = String(data: data, encoding: .utf8) else { return [] }
        // JSONL 按写入顺序是时间正序；界面按倒序展示，最新一条在最上面。
        return Array(text
            .split(separator: "\n")
            .compactMap { Self.parseLine(String($0)) }
            .reversed())
    }

    static func parseLine(_ line: String) -> AuditLogEntry? {
        guard let data = line.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let json = object as? [String: Any] else { return nil }
        let target = json["target"] as? [String: Any]
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let rawTime = json["timestamp"] as? String ?? ""
        let date = formatter.date(from: rawTime) ?? ISO8601DateFormatter().date(from: rawTime)
        return AuditLogEntry(
            auditId: json["auditId"] as? String ?? "未获取",
            timestamp: date,
            timestampText: rawTime,
            actor: json["actor"] as? String ?? "未获取",
            skill: json["skill"] as? String ?? "未获取",
            sourceSystem: json["sourceSystem"] as? String ?? "未获取",
            actionType: json["actionType"] as? String ?? "unspecified",
            mode: json["mode"] as? String ?? "未获取",
            status: json["status"] as? String ?? "未获取",
            targetTitle: target?["title"] as? String ?? "",
            resultSummary: json["resultSummary"] as? String ?? "",
            requestSummary: json["requestSummary"] as? String ?? ""
        )
    }
}
