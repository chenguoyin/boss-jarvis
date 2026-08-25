import SwiftUI

/// 经营情况页。数据来自 hongyi-today-metrics 与 hongyi-business-overview 两个 Skill 的 JSON 输出，只读展示。
struct HongyiBusinessView: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let snapshot: HongyiBusinessSnapshot

    var body: some View {
        if snapshot.todayMetrics != nil || snapshot.overview != nil {
            content
        } else {
            UnavailableCard(
                title: "经营情况",
                detail: "未获取到虹翼经营数据。请先运行 hongyi-today-metrics / hongyi-business-overview Skill 后刷新。",
                systemImage: "chart.line.uptrend.xyaxis"
            )
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("经营情况")
                        .font(configuration.titleFont())
                        .foregroundStyle(Color.jarvisText)
                    Text("来源：虹翼系统 · 采集 " + (snapshot.fetchedAt.map { Self.timeFormatter.string(from: $0) } ?? "未获取"))
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisMuted)
                }
                Spacer()
                Text(snapshot.statusValue)
                    .font(configuration.captionFont(weight: .semibold))
                    .foregroundStyle(statusColor)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(statusColor.opacity(0.12))
                    .clipShape(Capsule())
            }

            if snapshot.hasDataQualityIssues {
                qualityBanner
                    .padding(.top, 14)
            }

            if let today = snapshot.todayMetrics {
                sectionTitle("sun.max.fill", "今日专项")
                metricsGrid([
                    ("今日项目", String(today.projectsCount)),
                    ("今日客户申请", String(today.customerApplicationsCount)),
                    ("今日收入确认", String(today.revenueConfirmationsCount)),
                    ("收入金额", today.totalRevenueAmountText ?? "未获取")
                ])
            }

            if let overview = snapshot.overview {
                if overview.hasDepartmentDashboardData {
                    sectionTitle("square.grid.3x3.fill", "部门看板")
                        .padding(.top, 20)
                    metricsGrid([
                        ("本月收入(万元)", overview.monthRevenueText ?? "未获取"),
                        ("本季收入(万元)", overview.quarterRevenueText ?? "未获取"),
                        ("年度收入(万元)", overview.yearRevenueText ?? "未获取"),
                        ("本月利润(万元)", overview.monthProfitText ?? "未获取"),
                        ("年度利润(万元)", overview.yearProfitText ?? "未获取"),
                        ("本年累计毛利(万元)", overview.yearGrossMarginText ?? "未获取"),
                        ("毛利率", overview.yearGrossMarginRateText ?? "未获取"),
                        ("应收余额(万元)", overview.receivableBalanceText ?? "未获取"),
                        ("逾期金额(万元)", overview.overdueReceivableText ?? "未获取")
                    ], highlightTitles: ["年度利润(万元)", "逾期金额(万元)"])
                }

                sectionTitle("chart.bar.fill", "经营总览")
                    .padding(.top, 20)
                metricsGrid([
                    ("收入条目", String(overview.revenueCount)),
                    ("回款条目", String(overview.collectionCount)),
                    ("项目毛利", String(overview.marginCount)),
                    ("项目进度", String(overview.projectCount)),
                    ("客户变化", String(overview.customerCount)),
                    ("首页关注", String(overview.homepageCount))
                ])
            }
        }
        .padding(24)
        .jarvisCard(cornerRadius: 20)
    }

    /// Skill 侧已给出具体失败来源（如“收确认菜单未找到”），页面必须展示，不能只显示未获取数值。
    private var qualityBanner: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("虹翼数据未完整获取（\(snapshot.failedSourceCount) 个来源）", systemImage: "exclamationmark.triangle.fill")
                .font(configuration.captionFont(weight: .bold))
                .foregroundStyle(Color.jarvisRed)
            ForEach(snapshot.dataQualityIssues.prefix(6), id: \.self) { issue in
                Text(issue)
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

    private func sectionTitle(_ systemName: String, _ title: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: systemName)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.jarvisBlue)
            Text(title)
                .font(configuration.bodyFont(weight: .semibold))
                .foregroundStyle(Color.jarvisText)
        }
        .padding(.top, 16)
    }

    private func metricsGrid(_ items: [(String, String)], highlightTitles: [String] = []) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(items, id: \.0) { item in
                let isAlert = highlightTitles.contains(item.0)
                VStack(alignment: .leading, spacing: 6) {
                    Text(item.0)
                        .font(configuration.captionFont())
                        .foregroundStyle(isAlert ? Color.jarvisRed : Color.jarvisMuted)
                    Text(item.1)
                        .font(configuration.titleFont(weight: .semibold))
                        .foregroundStyle(isAlert ? Color.jarvisRed : Color.jarvisText)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Color.jarvisCardSoft)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
        .padding(.top, 12)
    }

    private var statusColor: Color {
        switch snapshot.riskLevel {
        case .urgent:
            return Color.jarvisRed
        case .attention:
            return Color.jarvisAmber
        case .missing:
            return Color.jarvisRed
        case .normal:
            return Color.jarvisGreen
        }
    }

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter
    }()
}
