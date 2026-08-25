import AppKit
import SwiftUI

struct ContentView: View {
    @ObservedObject var viewModel: DashboardViewModel
    @EnvironmentObject private var configuration: SystemConfiguration
    @State private var showsModuleCustomizer = false
    @State private var showsAssistant = false

    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 0) {
                NavigationRail(selectedSection: $viewModel.selectedSection)
                    .environmentObject(viewModel)
                    .frame(width: 72)

                Rectangle()
                    .fill(Color.jarvisLine)
                    .frame(width: 1)
                    .frame(maxHeight: .infinity)
                    .ignoresSafeArea(.container, edges: .top)

                VStack(spacing: 0) {
                    TopBar(
                        sectionTitle: viewModel.selectedSection,
                        isReloading: viewModel.isReloading,
                        fetchActivity: viewModel.fetchActivity,
                        lastRefreshedAt: viewModel.lastRefreshedAt,
                        nextAutoRefreshAt: viewModel.nextAutoRefreshAt,
                        fetchFailures: viewModel.fetchFailures,
                        onRefreshNow: {
                            viewModel.refreshNow()
                        },
                        onOpenSettings: {
                            viewModel.selectedSection = "系统配置"
                        },
                        showsCustomize: viewModel.selectedSection == "驾驶舱",
                        onOpenCustomizer: { showsModuleCustomizer = true },
                        onOpenAssistant: { showsAssistant = true }
                    )
                        .environmentObject(configuration)
                        .frame(height: 60)

                    Group {
                        switch viewModel.selectedSection {
                        case "OA 待办":
                            sectionScroll {
                                sectionHeader(title: "OA 待办") {
                                    skillRefreshButton(["oa-todo"])
                                }
                                failureBanner(for: ["oa-todo"])
                                OATodoView(
                                    result: viewModel.oaTodo,
                                    onApprove: { item, comment in
                                        viewModel.executeOAApprovalDirectly(item, comment: comment, approve: true)
                                    },
                                    onReject: { item, comment in
                                        viewModel.executeOAApprovalDirectly(item, comment: comment, approve: false)
                                    },
                                    approvalStatus: viewModel.oaApprovalStatus
                                )
                            }
                        case "邮件":
                            sectionScroll {
                                sectionHeader(title: "邮件") {
                                    skillRefreshButton(["company-mail"])
                                }
                                failureBanner(for: ["company-mail"])
                                MailView(
                                    result: viewModel.companyMail,
                                    onOpenReply: { viewModel.openMailReply($0) },
                                    onMarkRead: { viewModel.markMailRead($0) },
                                    replyStatus: viewModel.mailReplyStatus,
                                    readStatus: viewModel.mailReadStatus,
                                    replyingMailIDs: viewModel.replyingMailIDs,
                                    lastMailReplySucceeded: viewModel.lastMailReplySucceeded
                                )
                            }
                        case "日历提醒":
                            sectionScroll {
                                sectionHeader(title: "日历提醒") {
                                    skillRefreshButton(["native-calendar"])
                                }
                                failureBanner(for: ["native-calendar"])
                                NativeCalendarView(result: viewModel.nativeCalendar)
                            }
                        case "每日晨报":
                            sectionScroll {
                                sectionHeader(title: "每日晨报") {
                                    skillRefreshButton(["daily-briefing"])
                                }
                                failureBanner(for: ["daily-briefing"])
                                BriefingView(briefing: viewModel.briefing)
                            }
                        case "审计日志":
                            sectionScroll {
                                sectionHeader(title: "审计日志") {
                                    refreshButton
                                }
                                AuditLogView(
                                    dates: viewModel.auditDates,
                                    entries: viewModel.auditEntries,
                                    selectedDate: viewModel.selectedAuditDate,
                                    onSelectDate: { viewModel.selectAuditDate($0) },
                                    onRefresh: { viewModel.reloadLocalOnly() }
                                )
                            }
                        case "每周总结":
                            sectionScroll {
                                sectionHeader(title: "每周总结") {
                                    skillRefreshButton(["weekly-summary"])
                                }
                                failureBanner(for: ["weekly-summary"])
                                WeeklySummaryView(
                                    dates: viewModel.weeklySummaryDates,
                                    summary: viewModel.weeklySummary,
                                    selectedDate: viewModel.selectedWeeklySummaryDate,
                                    onSelectDate: { viewModel.selectWeeklySummaryDate($0) }
                                )
                            }
                        case "Skill 管理":
                            sectionScroll {
                                sectionHeader(title: "Skill 管理") {
                                    skillRefreshButton(["skill-manager"])
                                }
                                failureBanner(for: ["skill-manager"])
                                SkillManagerView(
                                    result: viewModel.skillManager,
                                    onToggleNow: { viewModel.toggleSkill($0) },
                                    queuedSkillIDs: viewModel.queuedSkillIDs,
                                    onEnqueueInstall: { viewModel.enqueueSkillInstall(source: $0) },
                                    onEnqueueUninstall: { viewModel.enqueueSkillUninstall($0) }
                                )
                            }
                        case "经营情况":
                            sectionScroll {
                                sectionHeader(title: "经营情况") {
                                    skillRefreshButton(["hongyi-today-metrics", "hongyi-business-overview"])
                                }
                                failureBanner(for: ["hongyi-today-metrics", "hongyi-business-overview"])
                                HongyiBusinessView(snapshot: viewModel.hongyiSnapshot)
                            }
                        case "资金费用":
                            sectionScroll {
                                sectionHeader(title: "资金费用") {
                                    skillRefreshButton(["oa-todo"])
                                }
                                failureBanner(for: ["oa-todo"])
                                ExpenseTodoView(result: viewModel.oaTodo)
                            }
                        case "确认中心":
                            sectionScroll {
                                sectionHeader(title: "确认中心") {
                                    refreshButton
                                }
                                ConfirmationCenterView(
                                    actions: viewModel.pendingActions,
                                    onSkip: { viewModel.skip(actionID: $0) },
                                    onConfirm: { viewModel.confirm(actionID: $0) },
                                    onBatchConfirm: { viewModel.confirm(actionIDs: $0) },
                                    onBatchSkip: { viewModel.skip(actionIDs: $0) }
                                )
                            }
                        case "驾驶舱":
                            sectionScroll {
                                failureBanner(for: dashboardFetchSkills)
                                RedesignedDashboard(viewModel: viewModel)
                            }
                        case "系统配置":
                            ScrollView {
                                SettingsView(configuration: configuration, onAutoRefreshChange: { enabled, interval in
                                    viewModel.configureAutoRefresh(enabled: enabled, intervalMinutes: interval)
                                })
                                    .padding()
                            }
                        default:
                            sectionScroll {
                                UnavailableCard(
                                    title: viewModel.selectedSection,
                                    detail: "该模块尚未接入真实数据，将在后续阶段实现。",
                                    systemImage: "square.dashed"
                                )
                            }
                        }
                    }
                    .environmentObject(viewModel)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.jarvisPanel)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .background(Color.jarvisApp)
        }
        .ignoresSafeArea(.container, edges: .top)
        .background(Color.jarvisPage)
        .preferredColorScheme(configuration.theme.colorScheme)
        .sheet(isPresented: $showsModuleCustomizer) {
            HomeModuleCustomizer(configuration: configuration)
        }
        .sheet(isPresented: $showsAssistant) {
            AssistantChatPanel(viewModel: viewModel, configuration: configuration)
                .environmentObject(configuration)
        }
        .background(
            // ⌘K 快捷键：隐藏按钮承载键值，弹出助手面板。
            Button("") { showsAssistant = true }
                .keyboardShortcut("k", modifiers: .command)
                .opacity(0)
                .frame(width: 0, height: 0)
                .accessibilityHidden(true)
        )
    }

    private func skillRefreshButton(_ skills: [String]) -> some View {
        Button {
            viewModel.refreshSkills(skills)
        } label: {
            HStack(spacing: 6) {
                if viewModel.isReloading {
                    Text(viewModel.fetchActivity ?? "正在获取，请稍候...")
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisMuted)
                        .lineLimit(1)
                    SpinningRefreshIcon(isSpinning: true, color: .jarvisMuted)
                } else {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.jarvisMuted)
                        .frame(width: 30, height: 30)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isReloading)
        .help("调用 Skill 获取真实数据")
    }

    private var refreshButton: some View {
        Button {
            viewModel.reloadLocalOnly()
        } label: {
            HStack(spacing: 6) {
                if viewModel.isReloading {
                    Text(viewModel.fetchActivity ?? "正在获取，请稍候...")
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisMuted)
                        .lineLimit(1)
                    SpinningRefreshIcon(isSpinning: true, color: .jarvisMuted)
                } else {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.jarvisMuted)
                        .frame(width: 30, height: 30)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isReloading)
        .help("重新加载 Skill 数据")
    }

    private func sectionScroll<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        ScrollView {
            VStack(spacing: 28) {
                content()
            }
                .padding(.top, 14)
                .padding(.leading, 14)
                .padding(.trailing, 28)
                .padding(.bottom, 28)
                .frame(maxWidth: .infinity)
        }
    }

    private func sectionHeader<Actions: View>(title: String, @ViewBuilder actions: () -> Actions) -> some View {
        HStack {
            Text(title)
                .font(configuration.titleFont())
                .foregroundStyle(Color.jarvisText)
            Spacer()
            actions()
        }
    }

    /// 页面顶部取数失败提示；页面相关 Skill 全部取数成功时不渲染。
    @ViewBuilder
    private func failureBanner(for skills: [String]) -> some View {
        let failures = viewModel.fetchFailures(for: skills)
        if !failures.isEmpty {
            FetchFailureBanner(messages: failures)
                .environmentObject(configuration)
        }
    }

    /// 驾驶舱聚合的取数 Skill 全集，与 DashboardViewModel.reload 的取数范围保持一致。
    private var dashboardFetchSkills: [String] {
        ["oa-todo", "reminder-center", "company-mail", "native-calendar", "skill-manager",
         "daily-briefing", "boss-cockpit", "hongyi-today-metrics", "hongyi-business-overview"]
    }

    private static func timeText(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: date)
    }

    private static func countdownText(to date: Date) -> String {
        let remaining = Int(date.timeIntervalSinceNow.rounded())
        if remaining <= 0 { return "即将刷新" }
        let minutes = remaining / 60
        let seconds = remaining % 60
        if minutes > 0 {
            return "\(minutes)分\(String(format: "%02d", seconds))秒"
        }
        return "\(seconds)秒"
    }
}

/// 侧边导航与顶栏面包屑共用的分区映射。
let appSections: [(title: String, icon: String)] = [
    ("驾驶舱", "rectangle.grid.2x2"),
    ("每日晨报", "sun.horizon"),
    ("OA 待办", "checklist"),
    ("经营情况", "chart.line.uptrend.xyaxis"),
    ("资金费用", "creditcard"),
    ("邮件", "envelope"),
    ("日历提醒", "calendar"),
    ("每周总结", "calendar.badge.clock"),
    ("Skill 管理", "briefcase"),
    ("审计日志", "shield")
]

private func appSectionIcon(for title: String) -> String? {
    if let section = appSections.first(where: { $0.title == title }) {
        return section.icon
    }
    return title == "系统配置" ? "gearshape" : nil
}

private struct NavigationRail: View {
    @Binding var selectedSection: String
    @EnvironmentObject private var configuration: SystemConfiguration
    @EnvironmentObject private var viewModel: DashboardViewModel
    @State private var showsAbout = false

    var body: some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: 24)

            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 2) {
                    ForEach(appSections, id: \.title) { section in
                        NavRailButton(
                            title: section.title,
                            systemName: section.icon,
                            badge: badge(for: section.title),
                            isActive: selectedSection == section.title
                        ) {
                            selectedSection = section.title
                        }
                        .environmentObject(configuration)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }

            Spacer()

            Button { showsAbout = true } label: {
                if let url = Bundle.main.url(forResource: "BrandIcon", withExtension: "png"),
                   let image = NSImage(contentsOf: url) {
                    Image(nsImage: image)
                        .resizable()
                        .interpolation(.high)
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 40, height: 40)
                } else {
                    Text("B")
                        .font(configuration.titleFont(weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 46, height: 46)
                        .background(LinearGradient(colors: [.jarvisBlue, .jarvisPurple], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .clipShape(Circle())
                }
            }
            .buttonStyle(JarvisButtonStyle(variant: .icon))
            .help("关于 Boss Jarvis")
            .padding(.bottom, 18)
            .sheet(isPresented: $showsAbout) { AboutView() }
        }
        .background(Color.jarvisApp)
    }

    /// 徽标只展示真实数量；数据未获取时不显示。
    private func badge(for title: String) -> Int? {
        switch title {
        case "OA 待办":
            return viewModel.oaTodo?.total
        case "邮件":
            return viewModel.mailNeedsReplyCount
        default:
            return nil
        }
    }
}

private struct NavRailButton: View {
    let title: String
    let systemName: String
    let badge: Int?
    let isActive: Bool
    let action: () -> Void

    @EnvironmentObject private var configuration: SystemConfiguration
    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            ZStack {
                Image(systemName: systemName)
                    .font(.system(size: 15, weight: .regular))
                    .symbolRenderingMode(.monochrome)
                    .frame(width: 24, height: 24)
                    .frame(width: 52, height: 52)

                if let badge {
                    Text(String(badge))
                        .font(configuration.captionFont(weight: .bold))
                        .foregroundStyle(.black)
                        .frame(minWidth: 18, minHeight: 18)
                        .padding(.horizontal, 2)
                        .background(Color(red: 0.97, green: 0.87, blue: 0.36))
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(.white.opacity(0.82), lineWidth: 1))
                        .offset(x: 17, y: -13)
                }
            }
        }
        .buttonStyle(JarvisButtonStyle(variant: .nav(active: isActive, hovering: isHovering)))
        .contentShape(Rectangle())
        .onHover { isHovering = $0 }
        .accessibilityIdentifier("nav-" + title)
        .background(TooltipView(title))
    }
}

private struct TooltipView: NSViewRepresentable {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        view.toolTip = text
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        nsView.toolTip = text
    }
}

private struct AboutView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        VStack(spacing: 0) {
            if let url = Bundle.main.url(forResource: "BrandIcon", withExtension: "png"),
               let image = NSImage(contentsOf: url) {
                Image(nsImage: image)
                    .resizable()
                    .interpolation(.high)
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 96, height: 96)
            }

            Text("Boss Jarvis")
                .font(configuration.titleFont(weight: .bold))
                .foregroundStyle(Color.jarvisText)
                .padding(.top, 20)

            Text("BOSS AI 工作台")
                .font(configuration.bodyFont())
                .foregroundStyle(Color.jarvisMuted)
                .padding(.top, 4)

            Text("版本 0.1.0 (1)")
                .font(configuration.captionFont())
                .foregroundStyle(Color.jarvisFaint)
                .padding(.top, 6)

            VStack(alignment: .leading, spacing: 10) {
                aboutRow("驾驶舱", "10 秒掌握全局，待办、邮件、经营、风险一屏看完")
                aboutRow("每日晨报", "AI 自动汇总今日要事，出门前 3 分钟心里有数")
                aboutRow("OA 待办", "长虹 OA 审批直接处理，同意或不同意一键提交")
                aboutRow("经营情况", "虹翼系统实时数据，收入、利润、应收尽在掌握")
                aboutRow("邮件日历", "待回复邮件和今日日程，不漏一条重要事项")
            }
            .padding(.horizontal, 28)
            .padding(.top, 24)

            Text("数据来源：OA、虹翼、Mail、日历。所有操作留痕审计，写操作需确认后执行。")
                .font(configuration.captionFont())
                .foregroundStyle(Color.jarvisFaint)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)
                .padding(.top, 20)

            Button {
                dismiss()
            } label: {
                Text("好")
                    .font(configuration.bodyFont(weight: .medium))
                    .foregroundStyle(.white)
                    .frame(width: 64, height: 28)
                    .background(
                        LinearGradient(
                            colors: [Color(red: 0.24, green: 0.24, blue: 0.26), Color(red: 0.12, green: 0.12, blue: 0.13)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Color.white.opacity(0.14), lineWidth: 0.5))
                    .shadow(color: .black.opacity(0.18), radius: 6, x: 0, y: 3)
            }
            .buttonStyle(.plain)
                .padding(.top, 24)
                .padding(.bottom, 24)
        }
        .frame(width: 360)
        .background(Color.jarvisApp)
    }

    private func aboutRow(_ title: String, _ desc: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(Color.jarvisBlue)
                .frame(width: 5, height: 5)
                .padding(.top, 5)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(configuration.bodyFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisText)
                Text(desc)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
        }
    }
}

private struct TopBar: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let sectionTitle: String
    let isReloading: Bool
    let fetchActivity: String?
    let lastRefreshedAt: Date?
    let nextAutoRefreshAt: Date?
    let fetchFailures: [String]
    let onRefreshNow: () -> Void
    let onOpenSettings: () -> Void
    let showsCustomize: Bool
    let onOpenCustomizer: () -> Void
    let onOpenAssistant: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            Text("Boss Jarvis")
                .font(configuration.titleFont(weight: .bold))
                .foregroundStyle(Color.jarvisText)

            HStack(spacing: 6) {
                Image(systemName: "chevron.right")
                    .font(configuration.captionFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisFaint)
                if let icon = appSectionIcon(for: sectionTitle) {
                    Image(systemName: icon)
                        .font(configuration.bodyFont(weight: .medium))
                        .foregroundStyle(Color.jarvisMuted)
                }
                Text(sectionTitle)
                    .font(configuration.bodyFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisText)
            }

            Spacer()

            HStack(alignment: .center, spacing: 10) {
                Button(action: onOpenAssistant) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                        Text("搜索事项、客户、合同、Skill")
                            .foregroundStyle(Color.jarvisMuted)
                        Spacer()
                        Text("⌘ K")
                            .font(configuration.captionFont(weight: .bold))
                            .foregroundStyle(Color.jarvisFaint)
                    }
                    .font(configuration.bodyFont())
                    .frame(width: 260, height: 36)
                    .padding(.horizontal, 12)
                    .background(Color.jarvisCard)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.jarvisLine))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("打开 Jarvis 助手（⌘K）")

                IconButton(systemName: "gearshape", help: "系统配置") {
                    onOpenSettings()
                }
                IconButton(systemName: "arrow.up.left.and.arrow.down.right", help: "放大/还原") {
                    NSApp.keyWindow?.zoom(nil)
                }
                refreshControl

                ThemePicker()

                if showsCustomize {
                    IconButton(systemName: "slider.horizontal.3", help: "调整首页模块排序与显隐") {
                        onOpenCustomizer()
                    }
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            NSApp.keyWindow?.zoom(nil)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 28)
        .background(Color.jarvisApp)
        .overlay(Rectangle().fill(Color.jarvisLine).frame(height: 1), alignment: .bottom)
    }

    /// 刷新状态只占一个图标位，状态文案放 tooltip，避免挤占顶部空间。
    private var refreshControl: some View {
        Button(action: onRefreshNow) {
            refreshStatusIcon
        }
        .buttonStyle(JarvisButtonStyle(variant: .iconPlain))
        .disabled(isReloading)
        .help(refreshStatusText)
    }

    private var refreshStatusIcon: some View {
        Group {
            if isReloading {
                SpinningRefreshIcon(isSpinning: true)
            } else if !fetchFailures.isEmpty {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.jarvisRed)
            } else if nextAutoRefreshAt != nil {
                Image(systemName: "clock.arrow.circlepath")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.jarvisMuted)
            } else if lastRefreshedAt != nil {
                Image(systemName: "checkmark.circle")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.jarvisGreen)
            }
        }
        .frame(width: 30, height: 30)
        .help(refreshStatusText)
    }

    private var refreshStatusText: String {
        if isReloading { return fetchActivity ?? "正在获取，请稍候..." }
        if !fetchFailures.isEmpty { return "部分数据未获取：" + fetchFailures.joined(separator: "；") }
        if let next = nextAutoRefreshAt { return "下次刷新 \(Self.countdownText(to: next))" }
        if let last = lastRefreshedAt { return "最近刷新 \(Self.timeText(from: last))" }
        return "自动刷新状态"
    }

    private static func timeText(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: date)
    }

    private static func countdownText(to date: Date) -> String {
        let remaining = Int(date.timeIntervalSinceNow.rounded())
        if remaining <= 0 { return "即将刷新" }
        let minutes = remaining / 60
        let seconds = remaining % 60
        if minutes > 0 {
            return "\(minutes)分\(String(format: "%02d", seconds))秒"
        }
        return "\(seconds)秒"
    }
}

private struct ThemePicker: View {
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTheme.allCases) { theme in
                Button {
                    configuration.theme = theme
                } label: {
                    Image(systemName: theme.iconName)
                        .font(.system(size: 15, weight: configuration.theme == theme ? .semibold : .regular))
                        .foregroundStyle(configuration.theme == theme ? Color.jarvisText : Color.jarvisMuted)
                        .frame(width: 34, height: 26)
                        .background(configuration.theme == theme ? Color.jarvisCard : .clear)
                        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                        .shadow(color: configuration.theme == theme ? .black.opacity(0.08) : .clear, radius: 4, x: 0, y: 2)
                }
                .buttonStyle(.plain)
                .help(theme.title)
            }
        }
        .padding(2)
        .background(Color.jarvisPanel)
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(Color.jarvisLine))
    }
}

private struct IconButton: View {
    let systemName: String
    let help: String
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 15, weight: .medium))
        }
        .buttonStyle(JarvisButtonStyle(variant: .iconPlain))
        .help(help)
    }
}

/// 首页模块自定义抽屉：上下移排序、开关显隐，配置实时持久化。
private struct HomeModuleCustomizer: View {
    @ObservedObject var configuration: SystemConfiguration
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("自定义首页模块")
                    .font(configuration.titleFont(weight: .bold))
                    .foregroundStyle(Color.jarvisText)
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                }
                .buttonStyle(JarvisButtonStyle(variant: .iconPlain))
                .help("关闭")
            }
            .padding(20)

            Text("用上下按钮排序，开关控制显隐。配置自动保存，重启后仍生效。")
                .font(configuration.captionFont())
                .foregroundStyle(Color.jarvisMuted)
                .padding(.horizontal, 20)
                .padding(.bottom, 12)

            ScrollView {
                VStack(spacing: 8) {
                    ForEach(Array(configuration.homeModuleOrder.enumerated()), id: \.element.rawValue) { index, module in
                        ModuleCustomizerRow(
                            module: module,
                            isHidden: configuration.hiddenHomeModules.contains(module),
                            canMoveUp: index > 0,
                            canMoveDown: index < configuration.homeModuleOrder.count - 1,
                            onMoveUp: { move(module, offset: -1) },
                            onMoveDown: { move(module, offset: 1) },
                            onToggle: { toggle(module) }
                        )
                    }
                }
                .padding(.horizontal, 20)
            }

            HStack {
                Button("恢复默认") {
                    configuration.resetHomeModules()
                }
                Spacer()
                Button("完成") {
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(20)
        }
        .frame(width: 380, height: 480)
        .background(Color.jarvisApp)
    }

    private func move(_ module: HomeModule, offset: Int) {
        guard let index = configuration.homeModuleOrder.firstIndex(of: module) else { return }
        let target = index + offset
        guard configuration.homeModuleOrder.indices.contains(target) else { return }
        var order = configuration.homeModuleOrder
        order.swapAt(index, target)
        configuration.homeModuleOrder = order
    }

    private func toggle(_ module: HomeModule) {
        var hidden = configuration.hiddenHomeModules
        if hidden.contains(module) {
            hidden.remove(module)
        } else {
            hidden.insert(module)
        }
        configuration.hiddenHomeModules = hidden
    }
}

private struct ModuleCustomizerRow: View {
    let module: HomeModule
    let isHidden: Bool
    let canMoveUp: Bool
    let canMoveDown: Bool
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let onToggle: () -> Void
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(module.title)
                    .font(configuration.bodyFont(weight: .semibold))
                    .foregroundStyle(isHidden ? Color.jarvisFaint : Color.jarvisText)
                Text(module.subtitle)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            Spacer()
            Button(action: onMoveUp) {
                Image(systemName: "chevron.up")
            }
            .buttonStyle(JarvisButtonStyle(variant: .iconPlain))
            .disabled(!canMoveUp)
            .help("上移")
            Button(action: onMoveDown) {
                Image(systemName: "chevron.down")
            }
            .buttonStyle(JarvisButtonStyle(variant: .iconPlain))
            .disabled(!canMoveDown)
            .help("下移")
            Toggle("", isOn: Binding(
                get: { !isHidden },
                set: { _ in onToggle() }
            ))
            .labelsHidden()
            .help(isHidden ? "显示模块" : "隐藏模块")
        }
        .padding(12)
        .background(Color.jarvisCard)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.jarvisLine))
    }
}

/// 持续旋转的刷新图标。用 TimelineView 驱动角度，避开状态切换时 repeatForever 不生效的问题。
private struct SpinningRefreshIcon: View {
    var isSpinning: Bool
    var color: Color = .jarvisBlue

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: !isSpinning)) { context in
            let angle = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.2) / 1.2 * 360
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(color)
                .rotationEffect(.degrees(angle))
                .frame(width: 30, height: 30)
        }
    }
}
