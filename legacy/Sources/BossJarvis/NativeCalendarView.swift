import SwiftUI

/// 日历提醒页。数据来自 native-calendar Skill 的 JSON 输出，只读展示。
struct NativeCalendarView: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let result: NativeCalendarResult?
    @State private var selectedEvent: NativeCalendarEvent?
    @State private var selectedReminder: NativeCalendarReminder?

    var body: some View {
        if let result {
            content(result)
        } else {
            UnavailableCard(
                title: "日历提醒",
                detail: "未获取到数据。请先运行 native-calendar Skill，把输出 JSON 写入数据目录后刷新。",
                systemImage: "calendar"
            )
        }
    }

    private func content(_ result: NativeCalendarResult) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            header(result)

            if result.events.isEmpty && result.reminders.isEmpty {
                Text("今日没有日历事件和提醒")
                    .font(configuration.bodyFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 40)
            } else {
                VStack(spacing: 0) {
                    if !result.events.isEmpty {
                        sectionTitle("sun.max", "今日日程", count: result.events.count)
                        eventHeader
                        Divider().overlay(Color.jarvisLine)
                        ForEach(Array(result.events.enumerated()), id: \.element.id) { index, event in
                            eventRow(event, index: index + 1)
                            if event.id != result.events.last?.id {
                                Divider().overlay(Color.jarvisLine.opacity(0.6))
                            }
                        }
                    }
                    if !result.reminders.isEmpty {
                        sectionTitle("bell", "提醒事项", count: result.reminders.count)
                            .padding(.top, 20)
                        reminderHeader
                        Divider().overlay(Color.jarvisLine)
                        ForEach(Array(result.reminders.enumerated()), id: \.element.id) { index, reminder in
                            reminderRow(reminder, index: index + 1)
                            if reminder.id != result.reminders.last?.id {
                                Divider().overlay(Color.jarvisLine.opacity(0.6))
                            }
                        }
                    }
                }
                .padding(.top, 16)
            }
        }
        .padding(24)
        .jarvisCard(cornerRadius: 20)
        .sheet(item: $selectedEvent) { event in
            NativeCalendarEventDetailSheet(event: event)
                .environmentObject(configuration)
        }
        .sheet(item: $selectedReminder) { reminder in
            NativeCalendarReminderDetailSheet(reminder: reminder)
                .environmentObject(configuration)
        }
    }

    private func header(_ result: NativeCalendarResult) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text("日历提醒")
                    .font(configuration.titleFont())
                    .foregroundStyle(Color.jarvisText)
                Text("今日日程 \(result.summaryEventCount) 项 · 提醒 \(result.summaryReminderCount) 项 · 逾期提醒 \(result.summaryOverdueReminderCount) 项 · 首页推荐 \(result.summaryHomepageItems) 项 · 来源：macOS Calendar / Reminders · 采集 \(NativeCalendarFormat.formatted(result.fetchedAt))")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            Spacer()
            Text("只读展示")
                .font(configuration.captionFont(weight: .semibold))
                .foregroundStyle(Color.jarvisGreen)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color.jarvisGreen.opacity(0.12))
                .clipShape(Capsule())
        }
    }

    private func sectionTitle(_ icon: String, _ title: String, count: Int) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Color.jarvisBlue)
            Text("\(title)（\(count)）")
                .font(configuration.bodyFont(weight: .semibold))
                .foregroundStyle(Color.jarvisText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var eventHeader: some View {
        HStack(spacing: 0) {
            Text("#").frame(width: 36, alignment: .leading)
            Text("日程").frame(maxWidth: .infinity, alignment: .leading)
            Text("日历").frame(width: 140, alignment: .leading)
            Text("时间").frame(width: 170, alignment: .leading)
            Text("级别").frame(width: 64, alignment: .leading)
        }
        .font(configuration.captionFont(weight: .semibold))
        .foregroundStyle(Color.jarvisMuted)
        .padding(.vertical, 8)
        .padding(.top, 8)
    }

    private func eventRow(_ event: NativeCalendarEvent, index: Int) -> some View {
        Button {
            selectedEvent = event
        } label: {
            HStack(spacing: 0) {
                Text("\(index)")
                    .foregroundStyle(Color.jarvisMuted)
                    .frame(width: 36, alignment: .leading)
                VStack(alignment: .leading, spacing: 4) {
                    Text(event.title)
                        .font(configuration.bodyFont(weight: .medium))
                        .foregroundStyle(Color.jarvisText)
                        .lineLimit(1)
                    if !event.reasons.isEmpty {
                        Text(event.reasons.joined(separator: "；"))
                            .font(configuration.captionFont())
                            .foregroundStyle(Color.jarvisMuted)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(event.calendar)
                    .frame(width: 140, alignment: .leading)
                    .lineLimit(1)
                Text(event.isAllDay ? "全天" : NativeCalendarFormat.timeRange(event.start, event.end))
                    .frame(width: 170, alignment: .leading)
                    .lineLimit(1)
                Text(NativeCalendarFormat.levelTitle(event.priority))
                    .foregroundStyle(event.priorityLevel.tint)
                    .frame(width: 64, alignment: .leading)
            }
            .font(configuration.bodyFont())
            .foregroundStyle(Color.jarvisMuted)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("点击查看日历详情")
    }

    private var reminderHeader: some View {
        HStack(spacing: 0) {
            Text("#").frame(width: 36, alignment: .leading)
            Text("提醒").frame(maxWidth: .infinity, alignment: .leading)
            Text("截止时间").frame(width: 170, alignment: .leading)
            Text("级别").frame(width: 64, alignment: .leading)
        }
        .font(configuration.captionFont(weight: .semibold))
        .foregroundStyle(Color.jarvisMuted)
        .padding(.vertical, 8)
        .padding(.top, 8)
    }

    private func reminderRow(_ reminder: NativeCalendarReminder, index: Int) -> some View {
        Button {
            selectedReminder = reminder
        } label: {
            HStack(spacing: 0) {
                Text("\(index)")
                    .foregroundStyle(Color.jarvisMuted)
                    .frame(width: 36, alignment: .leading)
                VStack(alignment: .leading, spacing: 4) {
                    Text(reminder.title)
                        .font(configuration.bodyFont(weight: .medium))
                        .foregroundStyle(Color.jarvisText)
                        .lineLimit(1)
                    if !reminder.notes.isEmpty {
                        Text(reminder.notes)
                            .font(configuration.captionFont())
                            .foregroundStyle(Color.jarvisMuted)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(reminder.due.isEmpty ? "未获取" : NativeCalendarFormat.shortTime(reminder.due))
                    .frame(width: 170, alignment: .leading)
                Text(NativeCalendarFormat.levelTitle(reminder.priority))
                    .foregroundStyle(reminder.priorityLevel.tint)
                    .frame(width: 64, alignment: .leading)
            }
            .font(configuration.bodyFont())
            .foregroundStyle(Color.jarvisMuted)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("点击查看提醒详情")
    }
}

// MARK: - 格式化

/// 列表与详情弹层共用的展示格式化，缺失字段统一显示“未获取”。
enum NativeCalendarFormat {
    static func levelTitle(_ raw: String) -> String {
        switch raw {
        case "red": "紧急"
        case "yellow": "关注"
        case "green": "正常"
        default: "未获取"
        }
    }

    static func timeRange(_ start: String, _ end: String) -> String {
        let s = shortTime(start)
        let e = shortTime(end)
        if s == "未获取" && e == "未获取" { return "未获取" }
        return "\(s) - \(e)"
    }

    static func shortTime(_ iso: String) -> String {
        guard let date = date(from: iso) else { return "未获取" }
        return formatDate(date, format: "HH:mm")
    }

    static func fullTime(_ iso: String) -> String {
        guard let date = date(from: iso) else { return "未获取" }
        return formatDate(date, format: "yyyy-MM-dd HH:mm:ss")
    }

    static func formatted(_ date: Date?) -> String {
        guard let date else { return "未获取" }
        return formatDate(date, format: "yyyy-MM-dd HH:mm:ss")
    }

    private static func date(from iso: String) -> Date? {
        guard !iso.isEmpty else { return nil }
        return ISO8601DateFormatter().date(from: iso)
    }

    private static func formatDate(_ date: Date, format: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = format
        return formatter.string(from: date)
    }
}

// MARK: - 详情弹层

/// 日程行点击后的详情弹层：只读展示完整时间、来源日历和推荐理由。
struct NativeCalendarEventDetailSheet: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let event: NativeCalendarEvent
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            Divider().overlay(Color.jarvisLine)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    section("标题", icon: "doc.text", tint: .jarvisBlue, text: event.title)
                    section("时间", icon: "clock", tint: .jarvisBlue, text: event.isAllDay ? "全天" : NativeCalendarFormat.timeRange(event.start, event.end))
                    section("日历", icon: "calendar", tint: .jarvisBlue, text: event.calendar)
                    section("级别", icon: "flag", tint: event.priorityLevel.tint, text: NativeCalendarFormat.levelTitle(event.priority))
                    section("推荐理由", icon: "sparkles", tint: .jarvisPurple, text: event.reasons.isEmpty ? "未获取" : event.reasons.joined(separator: "\n"))
                }
                .padding(.vertical, 4)
            }
        }
        .padding(24)
        .frame(width: 520, height: 420)
        .background(Color.jarvisCard)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text("日历详情")
                    .font(configuration.titleFont())
                    .foregroundStyle(Color.jarvisText)
                Text(event.title)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .lineLimit(1)
            }
            Spacer()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.jarvisMuted)
            }
            .buttonStyle(.plain)
            .help("关闭")
        }
    }

    private func section(_ title: String, icon: String, tint: Color, text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(tint)
                Text(title)
                    .font(configuration.bodyFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisText)
            }
            Text(text)
                .font(configuration.bodyFont())
                .foregroundStyle(Color.jarvisText)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(Color.jarvisCardSoft)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

/// 提醒事项行点击后的详情弹层：只读展示完整截止时间、备注和推荐理由。
struct NativeCalendarReminderDetailSheet: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let reminder: NativeCalendarReminder
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            Divider().overlay(Color.jarvisLine)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    section("标题", icon: "doc.text", tint: .jarvisBlue, text: reminder.title)
                    section("截止时间", icon: "clock", tint: .jarvisBlue, text: reminder.due.isEmpty ? "未获取" : NativeCalendarFormat.fullTime(reminder.due))
                    section("级别", icon: "flag", tint: reminder.priorityLevel.tint, text: NativeCalendarFormat.levelTitle(reminder.priority))
                    section("备注", icon: "note.text", tint: .jarvisPurple, text: reminder.notes.isEmpty ? "未获取" : reminder.notes)
                    section("推荐理由", icon: "sparkles", tint: .jarvisPurple, text: reminder.reasons.isEmpty ? "未获取" : reminder.reasons.joined(separator: "\n"))
                }
                .padding(.vertical, 4)
            }
        }
        .padding(24)
        .frame(width: 520, height: 420)
        .background(Color.jarvisCard)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text("提醒详情")
                    .font(configuration.titleFont())
                    .foregroundStyle(Color.jarvisText)
                Text(reminder.title)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .lineLimit(1)
            }
            Spacer()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.jarvisMuted)
            }
            .buttonStyle(.plain)
            .help("关闭")
        }
    }

    private func section(_ title: String, icon: String, tint: Color, text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(tint)
                Text(title)
                    .font(configuration.bodyFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisText)
            }
            Text(text)
                .font(configuration.bodyFont())
                .foregroundStyle(Color.jarvisText)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(Color.jarvisCardSoft)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}
