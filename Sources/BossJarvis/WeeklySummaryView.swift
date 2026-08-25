import SwiftUI

/// 每周总结页：按业务维度展示周报内容（OA、风险、邮件、提醒、下周计划）。
struct WeeklySummaryView: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let dates: [String]
    let summary: WeeklySummary?
    let selectedDate: String
    let onSelectDate: (String) -> Void

    var body: some View {
        if let summary, summary.isOK {
            VStack(alignment: .leading, spacing: 16) {
                headerCard(summary)
                overviewCard(summary)
                oaCard(summary)
                riskCard(summary)
                focusCard(summary)
                nextWeekCard(summary)
            }
        } else if let summary, !summary.isOK {
            UnavailableCard(
                title: "每周总结",
                detail: "生成失败：" + (summary.errorText.isEmpty ? "未知原因" : summary.errorText),
                systemImage: "calendar.badge.clock"
            )
        } else {
            UnavailableCard(
                title: "每周总结",
                detail: "未获取到周报数据。请点击页面上方刷新按钮生成。",
                systemImage: "calendar.badge.clock"
            )
        }
    }

    // MARK: - 头部

    private func headerCard(_ summary: WeeklySummary) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("每周工作总结")
                        .font(configuration.titleFont())
                        .foregroundStyle(Color.jarvisText)
                    Text("\(summary.rangeStart) ~ \(summary.rangeEnd) · 生成 \(formatted(summary.generatedAt))")
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisMuted)
                }
                Spacer()
                if !dates.isEmpty {
                    Picker("日期", selection: Binding(get: { selectedDate }, set: onSelectDate)) {
                        ForEach(dates, id: \.self) { date in
                            Text(date).tag(date)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 130)
                }
            }
        }
        .padding(24)
        .jarvisCard(cornerRadius: 20)
    }

    // MARK: - 概览数字

    private func overviewCard(_ summary: WeeklySummary) -> some View {
        card("本周概览", icon: "square.grid.2x2") {
            HStack(spacing: 12) {
                kpi("OA 单据", String(summary.oaCount), "doc.text")
                kpi("已执行", String(summary.executedCount), "checkmark.circle")
                kpi("高风险", String(summary.redRiskCount), "exclamationmark.triangle")
                kpi("提醒", String(summary.reminderCount), "bell")
            }
            if !summary.oaByCategory.isEmpty {
                HStack(spacing: 8) {
                    ForEach(displayCategories(summary), id: \.name) { cat in
                        Text("\(cat.name) \(cat.count)")
                            .font(configuration.captionFont())
                            .foregroundStyle(Color.jarvisMuted)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.jarvisBlue.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
                .padding(.top, 4)
            }
        }
    }

    // MARK: - OA 单据

    private func oaCard(_ summary: WeeklySummary) -> some View {
        card("OA 单据处理", icon: "doc.text") {
            if summary.oaCount == 0 {
                emptyRow("本周无待处理 OA 单据")
            } else {
                conclusionRow("本周共 \(summary.oaCount) 项：" + displayCategories(summary).map { "\($0.name) \($0.count) 项" }.joined(separator: "、"))
                if summary.attendancePersonCount > 0 {
                    conclusionRow("考勤异常 \(summary.attendancePersonCount) 人共 \(summary.attendanceTotal) 笔，其中 \(summary.attendanceTopPerson) \(summary.attendanceTopCount) 笔，建议关注考勤纪律。")
                }
                conclusionRow("明细见每日晨报，此处只做汇总。")
            }
        }
    }

    // MARK: - 风险

    private func riskCard(_ summary: WeeklySummary) -> some View {
        card("风险与规避", icon: "exclamationmark.triangle") {
            if summary.redRiskCount == 0 {
                emptyRow("本周无高风险事项")
            } else {
                conclusionRow("本周高风险 \(summary.redRiskCount) 项：\(summary.redRiskSummary)。")
                if !summary.attendanceTopPerson.isEmpty {
                    conclusionRow("主要集中在 \(summary.attendanceTopPerson) 的考勤异常（\(summary.attendanceTopCount) 笔），建议要求团队负责人跟进。")
                }
                conclusionRow("均已进入驾驶舱待办视图，可逐项确认。")
            }
        }
    }

    private func conclusionRow(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "circle.fill")
                .font(.system(size: 6))
                .foregroundStyle(Color.jarvisBlue)
                .padding(.top, 5)
            Text(text)
                .font(configuration.bodyFont())
                .foregroundStyle(Color.jarvisText)
        }
        .padding(.vertical, 3)
    }

    /// 展示用分类：考勤异常单独存字段，拼进分类列表保证总数一致。
    private func displayCategories(_ summary: WeeklySummary) -> [(name: String, count: Int)] {
        var items = summary.oaByCategory
        if summary.attendanceTotal > 0 {
            items.insert((name: "考勤异常", count: summary.attendanceTotal), at: 0)
        }
        return items.sorted { $0.count > $1.count }
    }

    // MARK: - 重点关注

    private func focusCard(_ summary: WeeklySummary) -> some View {
        card("重点关注", icon: "eye") {
            if summary.focusPoints.isEmpty {
                emptyRow("无特别关注事项")
            } else {
                ForEach(summary.focusPoints, id: \.self) { point in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: "circle.fill")
                            .font(.system(size: 6))
                            .foregroundStyle(Color.jarvisBlue)
                            .padding(.top, 5)
                        Text(point)
                            .font(configuration.bodyFont())
                            .foregroundStyle(Color.jarvisText)
                    }
                    .padding(.vertical, 3)
                }
            }
        }
    }

    // MARK: - 下周计划

    private func nextWeekCard(_ summary: WeeklySummary) -> some View {
        card("下周排期", icon: "calendar.badge.clock") {
            if summary.nextWeekEvents.isEmpty {
                emptyRow("下周日历暂无已排事项")
            } else {
                ForEach(summary.nextWeekEvents, id: \.title) { event in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(event.date)
                            .font(configuration.captionFont())
                            .foregroundStyle(Color.jarvisFaint)
                            .frame(width: 84, alignment: .leading)
                        Text(event.time.isEmpty ? "" : event.time)
                            .font(configuration.captionFont())
                            .foregroundStyle(Color.jarvisMuted)
                            .frame(width: 44, alignment: .leading)
                        Text(event.title)
                            .font(configuration.bodyFont())
                            .foregroundStyle(Color.jarvisText)
                    }
                    .padding(.vertical, 3)
                }
            }
        }
    }

    // MARK: - 组件

    private func card<Content: View>(_ title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.jarvisBlue)
                Text(title)
                    .font(configuration.bodyFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisText)
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .jarvisCard(cornerRadius: 20)
    }

    private func kpi(_ title: String, _ value: String, _ icon: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color.jarvisBlue)
                Text(title)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            Text(value)
                .font(configuration.controlFont())
                .foregroundStyle(Color.jarvisText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.jarvisBlue.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func emptyRow(_ text: String) -> some View {
        Text(text)
            .font(configuration.captionFont())
            .foregroundStyle(Color.jarvisFaint)
    }

    private func levelDot(_ level: String) -> some View {
        Circle()
            .fill(levelTint(level))
            .frame(width: 7, height: 7)
    }

    private func levelTint(_ level: String) -> Color {
        switch level {
        case "red": return .jarvisRed
        case "yellow": return .jarvisAmber
        default: return .jarvisBlue
        }
    }

    private func formatted(_ date: Date?) -> String {
        guard let date else { return "未知时间" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: date)
    }
}
