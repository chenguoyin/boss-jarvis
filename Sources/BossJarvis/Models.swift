import Foundation
import SwiftUI

enum RiskLevel: String, CaseIterable, Identifiable {
    case urgent
    case attention
    case normal
    case missing

    var id: String { rawValue }

    var title: String {
        switch self {
        case .urgent: "红色风险"
        case .attention: "黄色关注"
        case .normal: "正常"
        case .missing: "未获取"
        }
    }

    var tint: Color {
        switch self {
        case .urgent: .jarvisRed
        case .attention: .jarvisAmber
        case .normal: .jarvisGreen
        case .missing: .jarvisBlue
        }
    }

    init?(skillValue: String?) {
        guard let normalized = skillValue?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !normalized.isEmpty else {
            return nil
        }
        switch normalized {
        case "urgent", "red":
            self = .urgent
        case "attention", "yellow":
            self = .attention
        case "normal", "green":
            self = .normal
        case "missing":
            self = .missing
        default:
            return nil
        }
    }
}

// MARK: - 首页模块

/// 首页可自定义的模块集合。排序与显隐由 SystemConfiguration 持久化。
enum HomeModule: String, CaseIterable, Identifiable {
    case verdict
    case todo
    case summary
    case metrics
    case risk
    case mail

    var id: String { rawValue }

    var title: String {
        switch self {
        case .verdict: "全局结论条"
        case .todo: "今日待办提醒"
        case .summary: "今日需处理事项"
        case .metrics: "经营情况速览"
        case .risk: "风险提示与建议"
        case .mail: "待回复邮件"
        }
    }

    var subtitle: String {
        switch self {
        case .verdict: "10 秒掌握今日全局"
        case .todo: "紧急事项 Top 3"
        case .summary: "跨系统聚合计数"
        case .metrics: "5 个核心经营指标"
        case .risk: "分级风险 + AI 建议"
        case .mail: "需回复邮件 Top 3"
        }
    }

    var systemImage: String {
        switch self {
        case .verdict: "sparkles"
        case .todo: "exclamationmark.bubble"
        case .summary: "list.bullet"
        case .metrics: "chart.line.uptrend.xyaxis"
        case .risk: "warningshield"
        case .mail: "envelope"
        }
    }

    /// 结论条与经营速览通栏展示，其余模块两列排布。
    var usesFullWidth: Bool {
        self == .verdict || self == .metrics
    }
}

/// 首页模块 1 的待办条目，来自 reminder-center 的 homepageItems。
struct HomeTodoItem: Identifiable {
    let id = UUID()
    let title: String
    let level: RiskLevel
    let sourceLabel: String
    let timeLabel: String
    /// 截止或判断依据；来源未提供时回退“按紧急度置顶”。
    let detailLabel: String
    let targetSection: String

    var levelOrder: Int {
        switch level {
        case .urgent: 0
        case .attention: 1
        case .normal: 2
        case .missing: 3
        }
    }
}

/// 首页模块 2 的聚合分类（OA 审批 / 邮件待回复 / 今日日程）。
struct HomeAggregateItem: Identifiable {
    let id = UUID()
    let title: String
    let count: Int?
    let detail: String
    let level: RiskLevel
    let targetSection: String
}

/// 首页模块 3 的经营指标卡。
struct HomeMetricItem: Identifiable {
    let id = UUID()
    let title: String
    let value: String
    let note: String
    let level: RiskLevel
    let isMissing: Bool
}

/// 首页模块 4 的风险条目，AI 建议来自源系统 suggestedAction。
struct HomeRiskItem: Identifiable {
    let id = UUID()
    let conclusion: String
    let advice: String
    let sourceLabel: String
    let impact: HomeImpact
}

enum HomeImpact: String {
    case high
    case medium
    case low

    var title: String {
        switch self {
        case .high: "高"
        case .medium: "中"
        case .low: "低"
        }
    }

    var tint: Color {
        switch self {
        case .high: .jarvisRed
        case .medium: .jarvisAmber
        case .low: .jarvisMuted
        }
    }
}

// MARK: - 确认中心

/// 写操作统一入口。所有审批、邮件发送、Skill 启停等动作先入队，用户确认后才执行。
struct PendingWriteAction: Identifiable {
    enum Kind: String {
        case mailReply
        case skillDisable
        case skillEnable
        case skillInstall
        case skillUninstall
        case approval

        var title: String {
            switch self {
            case .mailReply: "邮件回复"
            case .skillDisable: "停用 Skill"
            case .skillEnable: "启用 Skill"
            case .skillInstall: "安装 Skill"
            case .skillUninstall: "卸载 Skill"
            case .approval: "审批动作"
            }
        }

        var systemImage: String {
            switch self {
            case .mailReply: "envelope"
            case .skillDisable, .skillEnable, .skillInstall, .skillUninstall: "briefcase"
            case .approval: "checkmark.shield"
            }
        }
    }

    enum State: String {
        case pending
        case ready
        case executed
        case cancelled

        var title: String {
            switch self {
            case .pending: "待确认"
            case .ready: "草稿已就绪"
            case .executed: "已确认"
            case .cancelled: "已跳过"
            }
        }

        var level: RiskLevel {
            switch self {
            case .pending: .attention
            case .ready: .normal
            case .executed: .normal
            case .cancelled: .missing
            }
        }
    }

    let id = UUID()
    let kind: Kind
    /// 拟执行动作的一句话描述，例如「回复：关于增值税发票明细报表…」。
    let actionTitle: String
    /// 依据，来自源系统的分析结论，原文展示。
    let basis: String
    /// 动作携带的原始负载：邮件 id、收件人、主题或 Skill id。执行阶段使用。
    let payload: [String: String]
    let createdAt: Date
    var state: State = .pending
    /// prepare-reply 等预备步骤产出的草稿文件路径，仅在确认后生成。
    var draftPath: String?
    /// 确认后真实执行的返回摘要；失败时保留待确认状态并展示原因。
    var executionSummary: String?
}
