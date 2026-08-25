import SwiftUI

/// 确认中心：所有写操作的统一入口。
/// 每条记录展示「拟执行动作 + 依据」，用户确认或跳过；本页不直接执行任何写操作。
struct ConfirmationCenterView: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    @EnvironmentObject private var viewModel: DashboardViewModel
    let actions: [PendingWriteAction]
    let onSkip: (UUID) -> Void
    let onConfirm: (UUID) -> Void
    let onBatchConfirm: ([UUID]) -> Void
    let onBatchSkip: ([UUID]) -> Void
    @State private var selectedIDs: Set<UUID> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            if pendingItems.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.shield")
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(Color.jarvisMuted)
                    Text("当前没有待确认的写操作")
                        .font(configuration.bodyFont())
                        .foregroundStyle(Color.jarvisMuted)
                    Text("审批、Skill 启停等动作会先进入这里，确认后才执行。")
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisFaint)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 48)
            } else {
                batchToolbar
                VStack(spacing: 12) {
                    ForEach(pendingItems) { action in
                        actionCard(action)
                    }
                }
                .padding(.top, 16)
            }

            if !settledItems.isEmpty {
                Text("已处理")
                    .font(configuration.captionFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisMuted)
                    .padding(.top, 22)
                VStack(spacing: 8) {
                    ForEach(settledItems) { action in
                        settledRow(action)
                    }
                }
                .padding(.top, 10)
            }
        }
        .padding(24)
        .jarvisCard(cornerRadius: 20)
    }

    private var pendingItems: [PendingWriteAction] {
        actions.filter { $0.state == .pending }
    }

    private var settledItems: [PendingWriteAction] {
        actions.filter { $0.state != .pending }
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text("确认中心")
                    .font(configuration.titleFont())
                    .foregroundStyle(Color.jarvisText)
                Text("写操作不自动执行 · 确认后才执行 · 全部留痕可追溯")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            Spacer()
            Text("\(pendingItems.count) 项待确认")
                .font(configuration.captionFont(weight: .semibold))
                .foregroundStyle(pendingItems.isEmpty ? Color.jarvisGreen : Color.jarvisAmber)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background((pendingItems.isEmpty ? Color.jarvisGreen : Color.jarvisAmber).opacity(0.12))
                .clipShape(Capsule())
        }
    }

    private var batchToolbar: some View {
        HStack(spacing: 12) {
            if !viewModel.batchProgressText.isEmpty {
                HStack(spacing: 6) {
                    ProgressView()
                        .controlSize(.small)
                    Text(viewModel.batchProgressText)
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisBlue)
                        .lineLimit(1)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color.jarvisBlue.opacity(0.08))
                .clipShape(Capsule())
                .help(viewModel.batchProgressText)
            }

            Button {
                if selectedIDs.count == pendingItems.count {
                    selectedIDs.removeAll()
                } else {
                    selectedIDs = Set(pendingItems.map(\.id))
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: selectedIDs.count == pendingItems.count && !pendingItems.isEmpty ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 15, weight: .semibold))
                    Text(selectedIDs.count == pendingItems.count && !pendingItems.isEmpty ? "取消全选" : "全选")
                        .font(configuration.captionFont(weight: .semibold))
                }
            }
            .buttonStyle(.borderless)
            .foregroundStyle(Color.jarvisMuted)
            .disabled(viewModel.isExecutingBatch)
            .help("选中或取消所有待确认动作")

            Text("已选 \(selectedIDs.count) / \(pendingItems.count)")
                .font(configuration.captionFont())
                .foregroundStyle(Color.jarvisFaint)

            Spacer()

            Button {
                let ids = Array(selectedIDs)
                selectedIDs.removeAll()
                onBatchSkip(ids)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
            }
            .buttonStyle(.borderless)
            .foregroundStyle(Color.jarvisMuted)
            .disabled(selectedIDs.isEmpty)
            .help("跳过所选动作")

            Button {
                let ids = Array(selectedIDs)
                selectedIDs.removeAll()
                onBatchConfirm(ids)
            } label: {
                HStack(spacing: 6) {
                    if viewModel.isExecutingBatch {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "checkmark")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    Text(viewModel.isExecutingBatch ? "执行中..." : "执行所选")
                        .font(configuration.captionFont(weight: .semibold))
                }
            }
            .buttonStyle(.borderless)
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(selectedIDs.isEmpty || viewModel.isExecutingBatch ? Color.jarvisMuted.opacity(0.4) : Color.jarvisBlue)
            .clipShape(Capsule())
            .disabled(selectedIDs.isEmpty || viewModel.isExecutingBatch)
            .help("逐项串行执行所选动作，全部留痕")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.jarvisCardSoft)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.jarvisLine))
        .padding(.top, 16)
    }

    private func actionCard(_ action: PendingWriteAction) -> some View {
        let primaryActionTitle = action.kind == .approval ? "确认提交" : "确认执行"
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Button {
                    if selectedIDs.contains(action.id) {
                        selectedIDs.remove(action.id)
                    } else {
                        selectedIDs.insert(action.id)
                    }
                } label: {
                    Image(systemName: selectedIDs.contains(action.id) ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(selectedIDs.contains(action.id) ? Color.jarvisBlue : Color.jarvisFaint)
                }
                .buttonStyle(.borderless)
                .help("选中后可批量执行或跳过")

                Image(systemName: action.kind.systemImage)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(action.state.level.tint)
                    .frame(width: 34, height: 34)
                    .background(action.state.level.tint.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(action.actionTitle)
                        .font(configuration.bodyFont(weight: .medium))
                        .foregroundStyle(Color.jarvisText)
                        .lineLimit(2)
                    Text(action.kind.title + " · " + shortTime(action.createdAt))
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisMuted)
                }

                Spacer()

                Text(action.state.title)
                    .font(configuration.captionFont(weight: .semibold))
                    .foregroundStyle(action.state.level.tint)
            }

            if let summary = action.executionSummary {
                HStack(alignment: .top, spacing: 8) {
                    Text("执行")
                        .font(configuration.captionFont(weight: .semibold))
                        .foregroundStyle(action.state == .executed ? Color.jarvisGreen : Color.jarvisAmber)
                    Text(summary)
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.jarvisCardSoft)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            HStack(alignment: .top, spacing: 8) {
                Text("依据")
                    .font(configuration.captionFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisMuted)
                Text(action.basis.isEmpty ? "未获取" : action.basis)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.jarvisCardSoft)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            HStack(spacing: 10) {
                Button {
                    onSkip(action.id)
                } label: {
                    Label("跳过", systemImage: "xmark")
                        .font(configuration.captionFont(weight: .semibold))
                }
                .buttonStyle(.borderless)
                .foregroundStyle(Color.jarvisMuted)
                .frame(maxWidth: .infinity, minHeight: 34)
                .background(Color.jarvisText.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                Button {
                    onConfirm(action.id)
                } label: {
                    Label(primaryActionTitle, systemImage: "checkmark")
                        .font(configuration.captionFont(weight: .semibold))
                }
                .buttonStyle(.borderless)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 34)
                .background(Color.jarvisBlue)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .help("确认后进入执行预备，写操作仍由对应 Skill 完成并留痕")
            }
        }
        .padding(14)
        .background(Color.jarvisCardSoft)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.jarvisLine))
    }

    private func settledRow(_ action: PendingWriteAction) -> some View {
        HStack(spacing: 10) {
            Image(systemName: action.kind.systemImage)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Color.jarvisMuted)
            Text(action.actionTitle)
                .font(configuration.captionFont())
                .foregroundStyle(Color.jarvisMuted)
                .lineLimit(1)
            Spacer()
            Text(action.state.title)
                .font(configuration.captionFont(weight: .semibold))
                .foregroundStyle(action.state.level.tint)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(Color.jarvisCardSoft)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func shortTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: date)
    }
}
