import SwiftUI

/// OA 待办列表页。数据来自 OA 实时取数与逐条详情分析，
/// 取不到时整块显示“未获取”，不展示任何推测数据。
struct OATodoView: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let result: OATodoResult?
    let onApprove: (OATodoItem, String) -> Void
    let onReject: (OATodoItem, String) -> Void
    var approvalStatus: String?
    @State private var selectedItem: OATodoItem?

    var body: some View {
        if let result {
            content(result)
        } else {
            UnavailableCard(
                title: "OA 待办",
                detail: "未获取到 OA 实时数据，请点击刷新重新从 OA 取数。",
                systemImage: "checklist"
            )
        }
    }

    private func content(_ result: OATodoResult) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            header(result)

            if result.hasCountMismatch {
                Label("分页计数与列表条数不一致，请复核源系统", systemImage: "exclamationmark.triangle")
                    .font(configuration.captionFont(weight: .medium))
                    .foregroundStyle(Color.jarvisAmber)
                    .padding(.top, 10)
            }
            if let approvalStatus {
                Label(approvalStatus, systemImage: approvalStatus.contains("失败") ? "xmark.octagon" : "clock")
                    .font(configuration.captionFont(weight: .medium))
                    .foregroundStyle(approvalStatus.contains("失败") ? Color.jarvisRed : Color.jarvisBlue)
                    .padding(.top, 10)
            }

            if result.items.isEmpty {
                Text("当前没有待办")
                    .font(configuration.bodyFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 40)
            } else {
                VStack(spacing: 0) {
                    columnHeader
                    Divider().overlay(Color.jarvisLine)
                    ForEach(Array(result.items.enumerated()), id: \.element.id) { index, item in
                        row(item, index: index + 1)
                        if item.id != result.items.last?.id {
                            Divider().overlay(Color.jarvisLine.opacity(0.6))
                        }
                    }
                }
                .padding(.top, 16)
            }
        }
        .padding(24)
        .jarvisCard(cornerRadius: 20)
        .sheet(item: $selectedItem) { item in
            OATodoDetailSheet(
                item: item,
                onApprove: onApprove,
                onReject: onReject
            )
            .environmentObject(configuration)
        }
    }

    private func header(_ result: OATodoResult) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text("OA 待办")
                    .font(configuration.titleFont())
                    .foregroundStyle(Color.jarvisText)
                Text("共 \(result.total) 条 · 来源：OA 融合办公平台 · 采集 \(formatted(result.fetchedAt))")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            Spacer()
        }
    }

    private var columnHeader: some View {
        HStack(spacing: 0) {
            Text("#").frame(width: 36, alignment: .leading)
            Text("标题").frame(maxWidth: .infinity, alignment: .leading)
            Text("优先级").frame(width: 56, alignment: .leading)
            Text("风险点").frame(width: 56, alignment: .leading)
            Text("建议").frame(width: 110, alignment: .leading)
            Text("来源系统").frame(width: 100, alignment: .leading)
            Text("发送人").frame(width: 80, alignment: .leading)
            Text("发送时间").frame(width: 130, alignment: .leading)
        }
        .font(configuration.captionFont(weight: .semibold))
        .foregroundStyle(Color.jarvisMuted)
        .padding(.vertical, 8)
    }

    private func row(_ item: OATodoItem, index: Int) -> some View {
        Button {
            selectedItem = item
        } label: {
            HStack(spacing: 0) {
                Text("\(index)")
                    .foregroundStyle(Color.jarvisMuted)
                    .frame(width: 36, alignment: .leading)
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title)
                        .font(configuration.bodyFont(weight: .medium))
                        .foregroundStyle(Color.jarvisText)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                PriorityBadge(analysis: item.analysis)
                    .frame(width: 56, alignment: .leading)
                RiskBadge(analysis: item.analysis)
                    .frame(width: 56, alignment: .leading)
                SuggestionBadge(analysis: item.analysis)
                    .frame(width: 110, alignment: .leading)
                Text(item.source.isEmpty ? "未获取" : item.source)
                    .frame(width: 100, alignment: .leading)
                Text(item.displaySender.isEmpty ? "未获取" : item.displaySender)
                    .frame(width: 80, alignment: .leading)
                Text(item.time.isEmpty ? "未获取" : item.time)
                    .frame(width: 130, alignment: .leading)
            }
            .font(configuration.bodyFont())
            .foregroundStyle(Color.jarvisMuted)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func formatted(_ date: Date?) -> String {
        guard let date else { return "未获取" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: date)
    }
}

/// 数据缺失占位卡。只陈述事实，不编造内容。
struct UnavailableCard: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let title: String
    let detail: String
    let systemImage: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(Color.jarvisMuted)
            Text(title + " · 未获取")
                .font(configuration.titleFont())
                .foregroundStyle(Color.jarvisText)
            Text(detail)
                .font(configuration.bodyFont())
                .foregroundStyle(Color.jarvisMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 56)
        .jarvisCard(cornerRadius: 20)
    }
}


// MARK: - 单据详情弹层

/// 行点击后的详情弹层：只读展示分析详情，审批动作直接执行真实提交。
struct OATodoDetailSheet: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let item: OATodoItem
    let onApprove: (OATodoItem, String) -> Void
    let onReject: (OATodoItem, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var comment: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            Divider().overlay(Color.jarvisLine)
            if let analysis = item.analysis {
                detailSections(analysis)
            } else {
                Text("该单据暂无实时风险分析，请刷新 OA 后重试。")
                    .font(configuration.bodyFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            Spacer()
            approvalBar
        }
        .padding(24)
        .frame(width: 640, height: 520)
        .background(Color.jarvisCard)
        .onAppear {
            comment = item.analysis?.suggestion == "未分析" ? "" : (item.analysis?.suggestion ?? "")
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(configuration.titleFont())
                    .foregroundStyle(Color.jarvisText)
                    .lineLimit(2)
                Text("来源：\(item.source) · 发送人：\(item.displaySender) · \(item.time)")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            Spacer()
            if let analysis = item.analysis {
                HStack(spacing: 6) {
                    Text(analysis.priority)
                        .font(configuration.captionFont(weight: .bold))
                        .foregroundStyle(Color.jarvisText)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.jarvisBlue.opacity(0.12))
                        .clipShape(Capsule())
                    Circle().fill(analysis.riskLevel.tint).frame(width: 8, height: 8)
                }
            }
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

    private func detailSections(_ analysis: OATodoAnalysis) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                section("单据详情", icon: "doc.text", tint: .jarvisBlue, text: analysis.detail)
                VStack(alignment: .leading, spacing: 8) {
                    sectionHeader("风险点", icon: "exclamationmark.triangle", tint: analysis.riskLevel.tint)
                    ForEach(Array(analysis.riskPoints.enumerated()), id: \.offset) { index, risk in
                        HStack(alignment: .top, spacing: 8) {
                            Text("\(index + 1)")
                                .font(configuration.captionFont())
                                .foregroundStyle(Color.jarvisMuted)
                                .frame(width: 20, alignment: .trailing)
                            Text(risk)
                                .font(configuration.bodyFont())
                                .foregroundStyle(Color.jarvisText)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(12)
                .background(Color.jarvisCardSoft)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                section("审核建议", icon: "checkmark.seal", tint: .jarvisGreen, text: analysis.suggestion)
            }
            .padding(.vertical, 4)
        }
    }

    private func section(_ title: String, icon: String, tint: Color, text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionHeader(title, icon: icon, tint: tint)
            Text(text)
                .font(configuration.bodyFont())
                .foregroundStyle(Color.jarvisText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(Color.jarvisCardSoft)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func sectionHeader(_ title: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(tint)
            Text(title)
                .font(configuration.bodyFont(weight: .semibold))
                .foregroundStyle(Color.jarvisText)
        }
    }

    private var approvalBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("审批意见")
                .font(configuration.captionFont(weight: .semibold))
                .foregroundStyle(Color.jarvisMuted)
            HStack(spacing: 10) {
                TextField("输入审批意见", text: $comment, axis: .vertical)
                    .font(configuration.bodyFont())
                    .lineLimit(2...4)
                    .padding(8)
                    .background(Color.jarvisCardSoft)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color.jarvisLine))
                Button {
                    onApprove(item, comment)
                    dismiss()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 15, weight: .semibold))
                        Text("同意")
                            .font(configuration.bodyFont(weight: .semibold))
                    }
                    .foregroundStyle(.white)
                    .frame(height: 34)
                    .padding(.horizontal, 14)
                    .background(Color.jarvisGreen)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
                .help("同意：立即提交真实审批")
                Button {
                    onReject(item, comment)
                    dismiss()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .semibold))
                        Text("不同意")
                            .font(configuration.bodyFont(weight: .semibold))
                    }
                    .foregroundStyle(Color.jarvisRed)
                    .frame(height: 34)
                    .padding(.horizontal, 14)
                    .background(Color.jarvisRed.opacity(0.12))
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color.jarvisRed.opacity(0.35)))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
                .help("不同意/退回：立即提交真实审批")
            }
        }
    }
}

// MARK: - 列表内联图标列

/// 优先级列：P1-P4 胶囊 + tooltip。
struct PriorityBadge: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let analysis: OATodoAnalysis?

    var body: some View {
        if let analysis {
            Text(analysis.priority)
                .font(configuration.captionFont(weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 30)
                .padding(.vertical, 2)
                .background(tint.opacity(0.12))
                .clipShape(Capsule())
                .help("优先级 " + analysis.priority + "（" + analysis.priorityLabel + "）")
        } else {
            Image(systemName: "questionmark.circle")
                .font(.system(size: 15))
                .foregroundStyle(Color.jarvisFaint)
                .help("未分析")
        }
    }

    private var tint: Color {
        switch analysis?.priority {
        case "P1": .jarvisRed
        case "P2": .jarvisAmber
        case "P3", "P4": .jarvisBlue
        default: .jarvisMuted
        }
    }
}

/// 风险点列：等级色点 + tooltip 列出全部风险。
struct RiskBadge: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let analysis: OATodoAnalysis?

    var body: some View {
        if let analysis {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 15))
                    .foregroundStyle(analysis.riskLevel.tint)
                Text(analysis.riskLevel.title)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            .help(analysis.riskPoints.joined(separator: " / "))
        } else {
            Image(systemName: "questionmark.circle")
                .font(.system(size: 15))
                .foregroundStyle(Color.jarvisFaint)
                .help("未分析")
        }
    }

    private var icon: String {
        switch analysis?.riskLevel {
        case .urgent: "exclamationmark.triangle.fill"
        case .attention: "exclamationmark.circle"
        case .normal: "checkmark.circle"
        case .missing: "questionmark.circle"
        case nil: "questionmark.circle"
        }
    }
}

/// 建议列：简短建议 + tooltip 全文。
struct SuggestionBadge: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let analysis: OATodoAnalysis?

    var body: some View {
        if let analysis {
            HStack(spacing: 5) {
                Image(systemName: "checkmark.seal")
                    .font(.system(size: 15))
                    .foregroundStyle(Color.jarvisGreen)
                Text(shortText)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .lineLimit(1)
            }
            .help(analysis.suggestion)
        } else {
            Image(systemName: "questionmark.circle")
                .font(.system(size: 15))
                .foregroundStyle(Color.jarvisFaint)
                .help("未分析")
        }
    }

    private var shortText: String {
        guard let analysis else { return "未分析" }
        if analysis.suggestion.count > 8 {
            return String(analysis.suggestion.prefix(8)) + "…"
        }
        return analysis.suggestion
    }
}
