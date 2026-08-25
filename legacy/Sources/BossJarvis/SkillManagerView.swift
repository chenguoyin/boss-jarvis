import AppKit
import SwiftUI

/// Skill 管理页。数据来自 skill-manager 的 list 输出，展示注册、启用、运行状态。
/// 启停点击后立即执行；安装、卸载进入确认中心确认后执行。
struct SkillManagerView: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let result: SkillManagerResult?
    let onToggleNow: (ManagedSkill) -> Void
    let queuedSkillIDs: Set<String>
    let onEnqueueInstall: (String) -> Void
    let onEnqueueUninstall: (ManagedSkill) -> Void

    var body: some View {
        if let result {
            content(result)
        } else {
            UnavailableCard(
                title: "Skill 管理",
                detail: "未获取到数据。请先运行 skill-manager，把输出 JSON 写入数据目录后刷新。",
                systemImage: "briefcase"
            )
        }
    }

    private func content(_ result: SkillManagerResult) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            header(result)
            installBar

            if result.items.isEmpty {
                Text("未注册任何 Skill")
                    .font(configuration.bodyFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 40)
            } else {
                VStack(spacing: 0) {
                    columnHeader
                    Divider().overlay(Color.jarvisLine)
                    ForEach(Array(result.items.enumerated()), id: \.element.id) { index, skill in
                        row(skill, index: index + 1)
                        if skill.id != result.items.last?.id {
                            Divider().overlay(Color.jarvisLine.opacity(0.6))
                        }
                    }
                }
                .padding(.top, 16)
            }
        }
        .padding(24)
        .jarvisCard(cornerRadius: 20)
    }

    private func header(_ result: SkillManagerResult) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Skill 管理")
                    .font(configuration.titleFont())
                    .foregroundStyle(Color.jarvisText)
                Text("共 \(result.count) 个 · 启用 \(result.enabledCount) 个 · 采集 \(formatted(result.fetchedAt))")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            Spacer()
            Text("安装、卸载需确认后执行")
                .font(configuration.captionFont(weight: .semibold))
                .foregroundStyle(Color.jarvisAmber)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color.jarvisAmber.opacity(0.12))
                .clipShape(Capsule())
        }
    }

    /// 安装入口：弹出目录选择器，选中后进入确认中心执行。
    private var installBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "plus.circle")
                .foregroundStyle(Color.jarvisGreen)
                .frame(width: 20)

            Button {
                pickAndInstall()
            } label: {
                Text(installTitle)
                    .font(configuration.captionFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisGreen)
            }
            .buttonStyle(.plain)
            .help("选择包含 SKILL.md 的本地目录，进入确认中心确认后安装")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(Color.jarvisCard)
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color.jarvisLine))
        .padding(.top, 14)
    }

    private var installTitle: String {
        "选择目录并安装"
    }

    private func pickAndInstall() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.message = "选择包含 SKILL.md 的 Skill 目录"
        panel.prompt = "安装"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        onEnqueueInstall(url.path)
    }

    private var columnHeader: some View {
        HStack(spacing: 0) {
            Text("#").frame(width: 36, alignment: .leading)
            Text("Skill").frame(maxWidth: .infinity, alignment: .leading)
            Text("生命周期").frame(width: 90, alignment: .leading)
            Text("运行状态").frame(width: 90, alignment: .leading)
            Text("").frame(width: 104, alignment: .trailing)
        }
        .font(configuration.captionFont(weight: .semibold))
        .foregroundStyle(Color.jarvisMuted)
        .padding(.vertical, 8)
    }

    private func row(_ skill: ManagedSkill, index: Int) -> some View {
        HStack(spacing: 0) {
            Text("\(index)")
                .foregroundStyle(Color.jarvisMuted)
                .frame(width: 36, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                Text(skill.name)
                    .font(configuration.bodyFont(weight: .medium))
                    .foregroundStyle(Color.jarvisText)
                    .lineLimit(1)
                Text(skill.descriptionText.isEmpty ? "未获取" : skill.descriptionText)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(skill.lifecycleTitle)
                .foregroundStyle(skill.lifecycleLevel.tint)
                .frame(width: 90, alignment: .leading)

            Text(skill.runtimeStatus.isEmpty ? "未获取" : skill.runtimeStatus)
                .frame(width: 90, alignment: .leading)

            HStack(spacing: 6) {
                if queuedSkillIDs.contains(skill.id) {
                    Text("已入队")
                        .font(configuration.captionFont(weight: .semibold))
                        .foregroundStyle(Color.jarvisMuted)
                } else {
                    HStack(spacing: 6) {
                        Button {
                            onToggleNow(skill)
                        } label: {
                            Image(systemName: skill.isEnabled ? "pause.circle" : "play.circle")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(skill.isEnabled ? Color.jarvisAmber : Color.jarvisGreen)
                                .frame(width: 28, height: 28)
                                .background((skill.isEnabled ? Color.jarvisAmber : Color.jarvisGreen).opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .help(skill.isEnabled ? "点击立即停用" : "点击立即启用")

                        Button {
                            onEnqueueUninstall(skill)
                        } label: {
                            Image(systemName: "trash.circle")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(Color.jarvisRed)
                                .frame(width: 28, height: 28)
                            .background(Color.jarvisRed.opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .help("拟卸载：进入确认中心，确认后代码归档不删除")
                    }
                }
            }
            .frame(width: 104, alignment: .trailing)
        }
        .font(configuration.bodyFont())
        .foregroundStyle(Color.jarvisMuted)
        .padding(.vertical, 10)
    }

    private func formatted(_ date: Date?) -> String {
        guard let date else { return "未获取" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: date)
    }
}
