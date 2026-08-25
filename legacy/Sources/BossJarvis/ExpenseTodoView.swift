import SwiftUI

/// 资金费用页。当前数据来源为 OA 待办中来源系统含"智能财务/费控/资金"的单据，只读展示。
/// 费控系统独立 Skill 接入后，此页切换为费控数据源。
struct ExpenseTodoView: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let result: OATodoResult?

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter
    }()

    private let expenseKeywords = ["智能财务", "费控", "资金", "报销", "差旅费", "备用金"]

    private var expenseItems: [OATodoItem] {
        guard let result else { return [] }
        return result.items.filter { item in
            expenseKeywords.contains { item.source.contains($0) || item.title.contains($0) }
        }
    }

    var body: some View {
        if let result {
            content(result)
        } else {
            UnavailableCard(
                title: "资金费用",
                detail: "未获取到数据。请先运行 oa-todo Skill 后刷新；费控系统独立 Skill 接入后此页切换为费控数据源。",
                systemImage: "creditcard"
            )
        }
    }

    private func content(_ result: OATodoResult) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("资金费用")
                        .font(configuration.titleFont())
                        .foregroundStyle(Color.jarvisText)
                    Text("共 \(expenseItems.count) 条 · 来源：OA 待办（智能财务/费控/资金类） · 采集 \(result.fetchedAt.map { Self.timeFormatter.string(from: $0) } ?? "未获取")")
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisMuted)
                }
                Spacer()
            }

            if expenseItems.isEmpty {
                Text("当前待办中没有资金费用类单据")
                    .font(configuration.bodyFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
            } else {
                VStack(spacing: 0) {
                    Text("#")
                        .font(configuration.captionFont(weight: .semibold))
                        .foregroundStyle(Color.jarvisMuted)
                        .frame(width: 36, alignment: .center)
                    ForEach(Array(expenseItems.enumerated()), id: \.element.id) { index, item in
                        expenseRow(item, index: index + 1)
                    }
                }
                .padding(.top, 16)
            }
        }
        .padding(24)
        .jarvisCard(cornerRadius: 20)
    }

    private func expenseRow(_ item: OATodoItem, index: Int) -> some View {
        HStack(spacing: 0) {
            Text("\(index)")
                .font(configuration.captionFont())
                .foregroundStyle(Color.jarvisFaint)
                .frame(width: 36, alignment: .center)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(configuration.bodyFont(weight: .medium))
                    .foregroundStyle(Color.jarvisText)
                    .lineLimit(2)
                HStack(spacing: 10) {
                    Text(item.source)
                    if !item.sender.isEmpty {
                        Text("· \(item.sender)")
                    }
                    if !item.time.isEmpty {
                        Text("· \(item.time)")
                    }
                }
                .font(configuration.captionFont())
                .foregroundStyle(Color.jarvisMuted)
            }
            Spacer()
            Text(item.analysis?.priorityLabel ?? "未分析")
                .font(configuration.captionFont(weight: .semibold))
                .foregroundStyle(item.analysis?.riskLevel.tint ?? Color.jarvisMuted)
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { Color.jarvisLine.frame(height: 0.5) }
    }
}
