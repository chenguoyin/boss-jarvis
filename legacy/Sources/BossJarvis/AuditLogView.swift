import SwiftUI

/// 审计日志页：读取 audit-log 的 JSONL 留痕，只读展示。
struct AuditLogView: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let dates: [String]
    let entries: [AuditLogEntry]
    let selectedDate: String
    let onSelectDate: (String) -> Void
    let onRefresh: () -> Void
    @State private var isHoveringRefresh = false

    var body: some View {
        if dates.isEmpty {
            UnavailableCard(
                title: "审计日志",
                detail: "未获取到审计留痕。各 Skill 取数、分析、确认、执行时会自动写入。",
                systemImage: "shield"
            )
        } else {
            VStack(alignment: .leading, spacing: 0) {
                header
                if entries.isEmpty {
                    Text("当日暂无审计记录")
                        .font(configuration.bodyFont())
                        .foregroundStyle(Color.jarvisMuted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                } else {
                    table
                }
            }
            .padding(24)
            .jarvisCard(cornerRadius: 20)
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text("审计日志")
                    .font(configuration.titleFont())
                    .foregroundStyle(Color.jarvisText)
                Text("共 \(entries.count) 条 · 取数 / 分析 / 拟执行 / 确认 / 实际执行全链路留痕")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            Spacer()
            Picker("日期", selection: Binding(get: { selectedDate }, set: onSelectDate)) {
                ForEach(dates, id: \.self) { date in
                    Text(date).tag(date)
                }
            }
            .labelsHidden()
            .frame(width: 130)
            Button(action: onRefresh) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(isHoveringRefresh ? Color.jarvisText : Color.jarvisMuted)
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            .onHover { isHoveringRefresh = $0 }
            .help("刷新审计日志")
        }
    }

    private var table: some View {
        VStack(spacing: 0) {
            columnHeader
            Divider().overlay(Color.jarvisLine)
            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                row(entry, index: index + 1)
                if entry.id != entries.last?.id {
                    Divider().overlay(Color.jarvisLine.opacity(0.6))
                }
            }
        }
        .padding(.top, 16)
    }

    private var columnHeader: some View {
        HStack(spacing: 0) {
            Text("#").frame(width: 36, alignment: .leading)
            Text("时间").frame(width: 90, alignment: .leading)
            Text("Skill").frame(width: 110, alignment: .leading)
            Text("动作").frame(width: 80, alignment: .leading)
            Text("对象").frame(maxWidth: .infinity, alignment: .leading)
            Text("结果").frame(width: 180, alignment: .leading)
            Text("状态").frame(width: 60, alignment: .leading)
        }
        .font(configuration.captionFont(weight: .semibold))
        .foregroundStyle(Color.jarvisMuted)
        .padding(.vertical, 8)
    }

    private func row(_ entry: AuditLogEntry, index: Int) -> some View {
        HStack(spacing: 0) {
            Text("\(index)")
                .foregroundStyle(Color.jarvisMuted)
                .frame(width: 36, alignment: .leading)
            Text(shortTime(entry.timestamp))
                .frame(width: 90, alignment: .leading)
            Text(entry.skill)
                .frame(width: 110, alignment: .leading)
            Text(entry.actionTitle)
                .frame(width: 80, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.targetTitle.isEmpty ? objectFallback(entry) : entry.targetTitle)
                    .lineLimit(1)
                if !entry.resultSummary.isEmpty {
                    Text(entry.resultSummary)
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisFaint)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(entry.mode)
                .frame(width: 180, alignment: .leading)
            Text(entry.status == "success" ? "成功" : entry.status)
                .foregroundStyle(entry.statusLevel.tint)
                .frame(width: 60, alignment: .leading)
        }
        .font(configuration.bodyFont())
        .foregroundStyle(Color.jarvisMuted)
        .padding(.vertical, 10)
        .help(helpText(entry))
    }

    private func shortTime(_ date: Date?) -> String {
        guard let date else { return "未获取" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: date)
        }

    private func helpText(_ entry: AuditLogEntry) -> String {
        var parts = ["系统：" + entry.sourceSystem]
        if !entry.requestSummary.isEmpty { parts.append("请求：" + entry.requestSummary) }
        if !entry.resultSummary.isEmpty { parts.append("结果：" + entry.resultSummary) }
        parts.append("审计 ID：" + entry.auditId)
        return parts.joined(separator: " ")
    }

    /// 对象列兜底：取数/分析类记录没有具体对象标题，展示来源系统而不是“未获取”。
    private func objectFallback(_ entry: AuditLogEntry) -> String {
        entry.sourceSystem.isEmpty ? "—" : entry.sourceSystem
    }
}
