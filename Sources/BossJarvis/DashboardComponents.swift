import SwiftUI

/// 新版首页容器：按用户配置渲染模块顺序与显隐。
struct RedesignedDashboard: View {
    @ObservedObject var viewModel: DashboardViewModel
    @EnvironmentObject private var configuration: SystemConfiguration

    private let columns = [
        GridItem(.flexible(), spacing: 16, alignment: .top),
        GridItem(.flexible(), spacing: 16, alignment: .top)
    ]

    /// 结论条通栏 → 待办/聚合两列 → 风险/邮件两列 → 经营速览通栏垫底。
    var body: some View {
        VStack(spacing: 18) {
            if isVisible(.verdict) {
                VerdictBanner(viewModel: viewModel)
            }

            let upperCards: [HomeModule] = [.todo, .summary].filter(isVisible)
            let lowerCards: [HomeModule] = [.risk, .mail].filter(isVisible)

            LazyVGrid(columns: columns, spacing: 18) {
                ForEach(upperCards, id: \.rawValue) { module in
                    moduleView(module)
                }
            }

            LazyVGrid(columns: columns, spacing: 18) {
                ForEach(lowerCards, id: \.rawValue) { module in
                    moduleView(module)
                }
            }

            if isVisible(.metrics) {
                BusinessMetricsPanel(viewModel: viewModel)
            }
        }
    }

    private func isVisible(_ module: HomeModule) -> Bool {
        !configuration.hiddenHomeModules.contains(module)
    }

    @ViewBuilder
    private func moduleView(_ module: HomeModule) -> some View {
        switch module {
        case .verdict:
            VerdictBanner(viewModel: viewModel)
        case .todo:
            TodoRemindersPanel(viewModel: viewModel)
        case .summary:
            AggregatePanel(viewModel: viewModel)
        case .metrics:
            BusinessMetricsPanel(viewModel: viewModel)
        case .risk:
            RiskPanel(viewModel: viewModel)
        case .mail:
            HomeMailPanel(viewModel: viewModel)
        }
    }
}

// MARK: - 模块 0 全局结论条

private struct VerdictBanner: View {
    @ObservedObject var viewModel: DashboardViewModel
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 9, height: 9)
                Text(statusText)
                    .font(configuration.captionFont(weight: .bold))
                    .foregroundStyle(Color.jarvisMuted)
                Spacer()
                Text("数据更新于 \(viewModel.homeDataUpdatedText)")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisFaint)
            }

            Text(headline)
                .font(configuration.titleFont(weight: .bold))
                .foregroundStyle(Color.jarvisText)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                ForEach(Array(chips.enumerated()), id: \.offset) { _, chip in
                    HStack(spacing: 4) {
                        Text(chip.value).bold()
                        Text(chip.label)
                    }
                    .font(configuration.captionFont(weight: .semibold))
                    .foregroundStyle(chip.level == .urgent ? Color.jarvisRed : chip.level == .attention ? Color.jarvisAmber : Color.jarvisMuted)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.jarvisCardSoft)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color.jarvisLine))
                }

                Spacer()
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.jarvisVerdict)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.jarvisLine, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.055), radius: 24, x: 0, y: 13)
    }

    private var headline: AttributedString {
        let text = viewModel.homeHeadlineText
        var attributed = AttributedString(text)
        // 数字放大强调：直接用 Text 拼接，避免 AttributedString 索引转换。
        if let regex = try? Regex("[0-9]+") {
            var result = AttributedString()
            var cursor = text.startIndex
            for match in text.matches(of: regex) {
                let matchRange = match.range
                guard matchRange.lowerBound >= cursor else { continue }
                result += AttributedString(String(text[cursor..<matchRange.lowerBound]))
                var number = AttributedString(String(text[matchRange]))
                number.foregroundColor = .jarvisText
                number.font = .system(size: configuration.dataSize * 0.55, weight: .bold)
                result += number
                cursor = matchRange.upperBound
            }
            if cursor < text.endIndex {
                result += AttributedString(String(text[cursor..<text.endIndex]))
            }
            attributed = result
        }
        return attributed
    }

    private var chips: [(value: String, label: String, level: RiskLevel)] {
        viewModel.homeHeadlineChips
    }

    private var statusColor: Color {
        viewModel.homeHeadlineCounts.urgent > 0 ? .jarvisRed : viewModel.homeHeadlineCounts.total > 0 ? .jarvisAmber : .jarvisGreen
    }

    private var statusText: String {
        viewModel.homeHeadlineCounts.urgent > 0 ? "需要行动" : viewModel.homeHeadlineCounts.total > 0 ? "需要关注" : "今日无紧急事项"
    }
}

// MARK: - 模块 1 今日待办提醒

private struct TodoRemindersPanel: View {
    @ObservedObject var viewModel: DashboardViewModel
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        HomePanel(
            title: "今日待办提醒",
            subtitle: "按紧急度排序 · 只列 Top 3",
            systemImage: "exclamationmark.bubble",
            markTint: urgentCount > 0 ? .jarvisRed : .jarvisGreen,
            trailing: CountPill(value: urgentCount, label: "项紧急", level: urgentCount > 0 ? .urgent : .normal),
            footer: "来源：统一提醒中心 · 更新 \(viewModel.reminders?.fetchedAtLabel ?? "未获取")"
        ) {
            if viewModel.homeTodoItems.isEmpty {
                PositiveEmptyState(
                    title: "今日无紧急事项",
                    detail: "低优先级提醒已在后台归档，可随时查看"
                )
            } else {
                VStack(spacing: 0) {
                    ForEach(viewModel.homeTodoItems) { item in
                        TodoRow(item: item) {
                            viewModel.selectedSection = item.targetSection
                        }
                        if item.id != viewModel.homeTodoItems.last?.id {
                            Divider().padding(.leading, 20)
                        }
                    }
                }
            }
        }
    }

    private var urgentCount: Int {
        viewModel.homeTodoItems.filter { $0.level == .urgent }.count
    }
}

private struct TodoRow: View {
    let item: HomeTodoItem
    let action: () -> Void
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(item.level.tint)
                    .frame(width: 4)
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title)
                        .font(configuration.titleFont(weight: .bold))
                        .foregroundStyle(Color.jarvisText)
                        .lineLimit(2)
                    HStack(spacing: 8) {
                        Text(item.sourceLabel)
                        Text(item.timeLabel)
                        Text(item.detailLabel)
                    }
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
                }
                Spacer()
                Text("去处理")
                    .font(configuration.controlFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisBlue)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 20)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("去处理：" + item.title)
    }
}

// MARK: - 模块 2 今日需处理事项

private struct AggregatePanel: View {
    @ObservedObject var viewModel: DashboardViewModel
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        HomePanel(
            title: "今日需处理事项",
            subtitle: "跨系统聚合 · 点击进入对应系统",
            systemImage: "list.bullet",
            markTint: .jarvisBlue,
            trailing: CountPill(value: totalCount, label: "项待办", level: totalCount > 0 ? .attention : .normal),
            footer: "来源：OA / 企业邮箱 / 日历提醒 · 更新 \(viewModel.homeDataUpdatedText)"
        ) {
            VStack(spacing: 0) {
                ForEach(viewModel.homeAggregateItems) { item in
                    AggregateRow(item: item) {
                        viewModel.selectedSection = item.targetSection
                    }
                    if item.id != viewModel.homeAggregateItems.last?.id {
                        Divider().padding(.leading, 20)
                    }
                }
            }
            if let briefing = viewModel.briefing, briefing.hiddenLowPriority > 0 {
                Text("低优先级已折叠 \(briefing.hiddenLowPriority) 项")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisFaint)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
            }
        }
    }

    private var totalCount: Int {
        viewModel.homeAggregateItems.reduce(0) { $0 + ($1.count ?? 0) }
    }
}

private struct AggregateRow: View {
    let item: HomeAggregateItem
    let action: () -> Void
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(item.count.map(String.init) ?? "未获取")
                    .font(configuration.titleFont(weight: .bold))
                    .foregroundStyle(item.level.tint)
                    .frame(minWidth: 32, alignment: .trailing)
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.title)
                        .font(configuration.titleFont(weight: .semibold))
                        .foregroundStyle(Color.jarvisText)
                    Text(item.detail)
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisMuted)
                        .lineLimit(1)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(configuration.captionFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisFaint)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("查看" + item.title)
    }
}

// MARK: - 模块 3 经营情况速览

private struct BusinessMetricsPanel: View {
    @ObservedObject var viewModel: DashboardViewModel
    @EnvironmentObject private var configuration: SystemConfiguration

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 12), count: 5)

    var body: some View {
        HomePanel(
            title: "经营情况速览",
            subtitle: "今日 · 本月 · 年度 · 虹翼口径",
            systemImage: "chart.line.uptrend.xyaxis",
            markTint: .jarvisGreen,
            trailing: CountPill(value: missingCount, label: "项未获取", level: missingCount > 0 ? .attention : .normal),
            footer: "来源：虹翼系统 · 更新 \(viewModel.hongyiSnapshot.fetchedAt == nil ? "未获取" : viewModel.homeDataUpdatedText) · 点击进入经营情况页"
        ) {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(viewModel.homeMetricItems) { metric in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(metric.title)
                                .font(configuration.captionFont(weight: .semibold))
                                .foregroundStyle(Color.jarvisMuted)
                            Spacer()
                        }
                        Text(metric.value)
                            .font(configuration.titleFont(weight: .bold))
                            .foregroundStyle(metric.isMissing ? Color.jarvisFaint : Color.jarvisText)
                            .lineLimit(2)
                        Text(metric.note)
                            .font(configuration.captionFont())
                            .foregroundStyle(metric.isMissing ? Color.jarvisAmber : Color.jarvisMuted)
                            .lineLimit(2)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
                    .background(Color.jarvisCardSoft)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.jarvisLine))
                }
            }
            .padding(16)
            .onTapGesture { viewModel.selectedSection = "经营情况" }
        }
    }

    private var missingCount: Int {
        viewModel.homeMetricItems.filter(\.isMissing).count
    }
}

// MARK: - 模块 4 风险提示与建议

private struct RiskPanel: View {
    @ObservedObject var viewModel: DashboardViewModel
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        HomePanel(
            title: "风险提示与建议",
            subtitle: "影响程度分级 · AI 建议可直接采纳",
            systemImage: "shield.lefthalf.filled",
            markTint: .jarvisAmber,
            trailing: CountPill(value: highCount, label: "高影响", level: highCount > 0 ? .urgent : .normal),
            footer: "来源：统一提醒中心 / 邮件分析 / 虹翼 · 更新 \(viewModel.homeDataUpdatedText)"
        ) {
            if viewModel.homeRiskItems.isEmpty {
                PositiveEmptyState(
                    title: "当前无高风险项",
                    detail: "应收、项目与合同风险均在阈值内，持续监控中"
                )
            } else {
                VStack(spacing: 12) {
                    ForEach(viewModel.homeRiskItems) { risk in
                        RiskRow(risk: risk)
                    }
                }
                .padding(16)
            }
        }
    }

    private var highCount: Int {
        viewModel.homeRiskItems.filter { $0.impact == .high }.count
    }
}

private struct RiskRow: View {
    let risk: HomeRiskItem
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                Text(risk.impact.title)
                    .font(configuration.captionFont(weight: .bold))
                    .foregroundStyle(risk.impact.tint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(risk.impact.tint.opacity(0.12))
                    .clipShape(Capsule())
                Text(risk.conclusion)
                    .font(configuration.bodyFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisText)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(alignment: .top, spacing: 8) {
                Text("AI 建议")
                    .font(configuration.captionFont(weight: .bold))
                    .foregroundStyle(Color.jarvisBlue)
                Text(risk.advice)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text(risk.sourceLabel)
                .font(configuration.captionFont())
                .foregroundStyle(Color.jarvisFaint)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(Color.jarvisCardSoft)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// MARK: - 模块 5 待回复邮件

private struct HomeMailPanel: View {
    @ObservedObject var viewModel: DashboardViewModel
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        HomePanel(
            title: "待回复邮件",
            subtitle: "按紧急度与时间排序 · 前 3 封",
            systemImage: "envelope",
            markTint: .jarvisBlue,
            trailing: CountPill(value: viewModel.mailNeedsReplyCount ?? 0, label: "待回复", level: (viewModel.mailNeedsReplyCount ?? 0) > 0 ? .attention : .normal),
            footer: "来源：企业邮箱 · 更新 \(viewModel.companyMail?.fetchedAt == nil ? "未获取" : viewModel.homeDataUpdatedText) · 回复在邮件客户端打开草稿，由您发送"
        ) {
            if viewModel.homeMailItems.isEmpty {
                PositiveEmptyState(
                    title: "暂无待回复邮件",
                    detail: "未读邮件均已判定为阅读掌握类"
                )
            } else {
                VStack(spacing: 0) {
                    ForEach(viewModel.homeMailItems) { message in
                        MailRow(message: message) {
                            viewModel.openMailReply(message)
                        }
                        if message.id != viewModel.homeMailItems.last?.id {
                            Divider().padding(.leading, 20)
                        }
                    }
                }
            }
        }
    }
}

private struct MailRow: View {
    let message: MailMessage
    let action: () -> Void
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(message.subject)
                    .font(configuration.titleFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisText)
                    .lineLimit(1)
                Text("\(message.sender) · \(message.displayTime)")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .lineLimit(1)
                if !message.replyBasis.isEmpty {
                    Text(message.replyBasis)
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisFaint)
                        .lineLimit(1)
                }
            }
            Spacer()
            Button(action: action) {
                Text("回复")
                    .font(configuration.controlFont(weight: .semibold))
            }
            .buttonStyle(JarvisButtonStyle(variant: .segment))
            .help("在邮件客户端打开回复草稿，不代发")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }
}

// MARK: - 共享组件

struct HomePanel<Content: View>: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let markTint: Color
    let trailing: AnyView
    let footer: String
    @ViewBuilder let content: Content
    @EnvironmentObject private var configuration: SystemConfiguration

    init(
        title: String,
        subtitle: String,
        systemImage: String,
        markTint: Color,
        trailing: some View,
        footer: String,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.subtitle = subtitle
        self.systemImage = systemImage
        self.markTint = markTint
        self.trailing = AnyView(trailing)
        self.footer = footer
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: systemImage)
                    .font(.system(size: configuration.titleSize * 0.92, weight: .semibold))
                    .iconTint(markTint)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(configuration.titleFont(weight: .bold))
                        .foregroundStyle(Color.jarvisText)
                    Text(subtitle)
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisMuted)
                }
                Spacer()
                trailing
            }
            .padding(16)

            content

            Text(footer)
                .font(configuration.captionFont())
                .foregroundStyle(Color.jarvisFaint)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
        }
        .jarvisCard()
    }
}

private struct CountPill: View {
    let value: Int
    let label: String
    let level: RiskLevel
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        HStack(spacing: 4) {
            Text("\(value)").bold()
            Text(label)
        }
        .font(configuration.captionFont(weight: .semibold))
        .foregroundStyle(level.tint)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(level.tint.opacity(0.1))
        .clipShape(Capsule())
    }
}

private struct PositiveEmptyState: View {
    let title: String
    let detail: String
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: configuration.dataSize))
                .foregroundStyle(Color.jarvisGreen)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(configuration.titleFont(weight: .bold))
                    .foregroundStyle(Color.jarvisText)
                Text(detail)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            Spacer()
        }
        .padding(16)
        .background(Color.jarvisGreen.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(16)
    }
}

/// 取数失败提示条：展示在对应页面内容区顶部，说明哪个 Skill 未取到数据及原因。
struct FetchFailureBanner: View {
    let messages: [String]
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("数据未获取", systemImage: "exclamationmark.triangle.fill")
                .font(configuration.captionFont(weight: .bold))
                .foregroundStyle(Color.jarvisRed)
            ForEach(messages, id: \.self) { message in
                Text(message)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.jarvisCardSoft)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color.jarvisRed.opacity(0.4)))
    }
}
