import SwiftUI

/// 每日晨报页：读取 daily-briefing 最新产物，只读展示。
struct BriefingView: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let briefing: DailyBriefing?
    @State private var isRunning = false
    @State private var runMessage = ""

    var body: some View {
        if let briefing {
            content(briefing)
        } else {
            UnavailableCard(
                title: "每日晨报",
                detail: "未获取到晨报数据。请先运行 daily-briefing Skill，或点击运行巡检生成今日报告。",
                systemImage: "sun.horizon"
            )
        }
    }

    private func content(_ briefing: DailyBriefing) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            header(briefing)
            kpis(briefing)
            levelSections(briefing)
            if !briefing.sourceLabels.isEmpty {
                sourcesRow(briefing)
            }
        }
        .padding(24)
        .jarvisCard(cornerRadius: 20)
    }

    private func header(_ briefing: DailyBriefing) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text("每日晨报")
                    .font(configuration.titleFont())
                    .foregroundStyle(Color.jarvisText)
                Text("\(briefing.today) · 生成 \(formatted(briefing.generatedAt)) · \(briefing.headline)")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            Spacer()
            HStack(spacing: 8) {
                if isRunning {
                    Text("正在生成每日晨报…")
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisMuted)
                }
                Button {
                    runBriefing()
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.jarvisMuted)
                        .rotationEffect(.degrees(isRunning ? 360 : 0))
                        .animation(isRunning ? .linear(duration: 0.8).repeatForever(autoreverses: false) : .easeInOut(duration: 0.2), value: isRunning)
                        .frame(width: 30, height: 30)
                }
                .buttonStyle(.plain)
                .disabled(isRunning)
                .help("立即运行 daily-briefing 巡检")
            }
        }
    }

    private func kpis(_ briefing: DailyBriefing) -> some View {
        HStack(spacing: 12) {
            kpi("紧急优先", briefing.mustDoNow, .urgent)
            kpi("今日关注", briefing.focusToday, .attention)
            kpi("持续观察", briefing.watchList, .normal)
            kpi("低优先隐藏", briefing.hiddenLowPriority, .missing)
        }
        .padding(.top, 16)
    }

    private func kpi(_ title: String, _ value: Int, _ level: RiskLevel) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(configuration.captionFont())
                .foregroundStyle(Color.jarvisMuted)
            Text(value == 0 && level == .missing ? "未获取" : String(value))
                .font(configuration.controlFont())
                .foregroundStyle(level.tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(level.tint.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    @ViewBuilder
    private func levelSections(_ briefing: DailyBriefing) -> some View {
        let groups: [(String, [String], RiskLevel, String)] = [
            ("紧急优先", briefing.mustDoItems, .urgent, "exclamationmark.triangle"),
            ("今日关注", briefing.focusItems, .attention, "bolt"),
            ("持续观察", briefing.watchItems, .normal, "eye")
        ]
        VStack(spacing: 12) {
            ForEach(groups, id: \.0) { group in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Image(systemName: group.3)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(group.2.tint)
                        Text(group.0)
                            .font(configuration.bodyFont(weight: .semibold))
                            .foregroundStyle(Color.jarvisText)
                        Text("\(group.1.count) 项")
                            .font(configuration.captionFont())
                            .foregroundStyle(Color.jarvisMuted)
                    }
                    if group.1.isEmpty {
                        Text("无")
                            .font(configuration.captionFont())
                            .foregroundStyle(Color.jarvisFaint)
                            .padding(.leading, 21)
                    } else {
                        ForEach(Array(group.1.enumerated()), id: \.offset) { index, title in
                            HStack(alignment: .top, spacing: 8) {
                                Text("\(index + 1)")
                                    .font(configuration.captionFont())
                                    .foregroundStyle(Color.jarvisMuted)
                                    .frame(width: 24, alignment: .trailing)
                                Text(title)
                                    .font(configuration.bodyFont())
                                    .foregroundStyle(Color.jarvisText)
                                    .lineLimit(2)
                            }
                        }
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.jarvisCardSoft)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .padding(.top, 16)
    }

    private func sourcesRow(_ briefing: DailyBriefing) -> some View {
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 8) {
            Image(systemName: "link")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(Color.jarvisMuted)
            Text("数据来源：\(briefing.sourceLabels.joined(separator: " / ")) · 未获取来源 \(briefing.unavailableSources) 个")
                .font(configuration.captionFont())
                .foregroundStyle(Color.jarvisMuted)
        }
            .padding(.top, 14)
        }
        scheduleRow(briefing)
    }

    private func scheduleRow(_ briefing: DailyBriefing) -> some View {
        let time = briefing.scheduleTime ?? "未获取"
        let installed = briefing.scheduleInstalled
        return HStack(spacing: 8) {
            Image(systemName: "timer")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(Color.jarvisMuted)
            Text("定时巡检：每日 " + time + " · " + (installed ? "已安装" : "未安装，需确认后安装"))
                .font(configuration.captionFont())
                .foregroundStyle(installed ? Color.jarvisGreen : Color.jarvisAmber)
        }
        .padding(.top, 10)
    }

    private func runBriefing() {
        guard !isRunning else { return }
        isRunning = true
        runMessage = ""
        let script = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".codex/skills/daily-briefing/run-briefing.cjs").path
        DispatchQueue.global(qos: .userInitiated).async {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = ["node", script]
            process.environment = SkillProcessEnvironment.make()
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = Pipe()
            do {
                try process.run()
                _ = pipe.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
            } catch {}
            DispatchQueue.main.async { isRunning = false }
        }
    }

    private func formatted(_ date: Date?) -> String {
        guard let date else { return "未获取" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: date)
    }
}
