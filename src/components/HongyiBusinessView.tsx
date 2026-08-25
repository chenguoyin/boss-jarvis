import { BarChart3, Grid3x3, Sun } from "lucide-react";
import type { HongyiSnapshot } from "@/lib/hongyiBusiness";

interface Props {
  snapshot: HongyiSnapshot;
}

function GridSection({
  icon,
  title,
  items,
  highlightTitles = [],
}: {
  icon: React.ReactNode;
  title: string;
  items: Array<{ label: string; value: string }>;
  highlightTitles?: string[];
}) {
  return (
    <section>
      <div className="jv-hongyi-section-title">
        {icon}
        {title}
      </div>
      <div className="jv-hongyi-grid">
        {items.map((item) => {
          const alert = highlightTitles.includes(item.label);
          return (
            <div key={item.label} className={alert ? "jv-hongyi-metric jv-hongyi-alert" : "jv-hongyi-metric"}>
              <div className="jv-caption jv-muted">{item.label}</div>
              <div className="jv-title">{item.value}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function HongyiBusinessView({ snapshot }: Props) {
  if (snapshot.todayMetrics === null && snapshot.overview === null) {
    return (
      <div className="jv-card">
        <div className="jv-empty">
          <BarChart3 size={40} strokeWidth={1.5} />
          <div className="jv-title">经营情况</div>
          <div className="jv-body jv-muted">
            未获取到虹翼经营数据。请先运行 hongyi-today-metrics / hongyi-business-overview Skill 后刷新。
          </div>
        </div>
      </div>
    );
  }

  const today = snapshot.todayMetrics;
  const overview = snapshot.overview;
  const hasDashboard =
    overview !== null &&
    (overview.monthRevenueText !== null ||
      overview.quarterRevenueText !== null ||
      overview.yearRevenueText !== null ||
      overview.monthProfitText !== null ||
      overview.yearProfitText !== null ||
      overview.yearGrossMarginText !== null ||
      overview.yearGrossMarginRateText !== null ||
      overview.receivableBalanceText !== null ||
      overview.overdueReceivableText !== null);

  return (
    <div className="jv-card">
      <div className="jv-skill-header">
        <div>
          <div className="jv-title">经营情况</div>
          <div className="jv-caption jv-muted">来源：虹翼系统 · 采集 {snapshot.fetchedAt}</div>
        </div>
        <span className={`jv-pill jv-hongyi-status-${snapshot.riskLevel}`}>{snapshot.statusValue}</span>
      </div>

      {snapshot.hasDataQualityIssues && (
        <div className="jv-hongyi-quality">
          <div className="jv-caption jv-level-urgent">
            虹翼数据未完整获取（{snapshot.failedSourceCount} 个来源）
          </div>
          {snapshot.dataQualityIssues.slice(0, 6).map((issue, index) => (
            <div key={index} className="jv-caption">{issue}</div>
          ))}
        </div>
      )}

      {today !== null && (
        <GridSection
          icon={<Sun size={15} strokeWidth={2} />}
          title="今日专项"
          items={[
            { label: "今日项目", value: String(today.projectsCount) },
            { label: "今日客户申请", value: String(today.customerApplicationsCount) },
            { label: "今日收入确认", value: String(today.revenueConfirmationsCount) },
            { label: "收入金额", value: today.totalRevenueAmountText ?? "未获取" },
          ]}
        />
      )}

      {overview !== null && hasDashboard && (
        <GridSection
          icon={<Grid3x3 size={15} strokeWidth={2} />}
          title="部门看板"
          items={[
            { label: "本月收入(万元)", value: overview.monthRevenueText ?? "未获取" },
            { label: "本季收入(万元)", value: overview.quarterRevenueText ?? "未获取" },
            { label: "年度收入(万元)", value: overview.yearRevenueText ?? "未获取" },
            { label: "本月利润(万元)", value: overview.monthProfitText ?? "未获取" },
            { label: "年度利润(万元)", value: overview.yearProfitText ?? "未获取" },
            { label: "本年累计毛利(万元)", value: overview.yearGrossMarginText ?? "未获取" },
            { label: "毛利率", value: overview.yearGrossMarginRateText ?? "未获取" },
            { label: "应收余额(万元)", value: overview.receivableBalanceText ?? "未获取" },
            { label: "逾期金额(万元)", value: overview.overdueReceivableText ?? "未获取" },
          ]}
          highlightTitles={["年度利润(万元)", "逾期金额(万元)"]}
        />
      )}

      {overview !== null && (
        <GridSection
          icon={<BarChart3 size={18} strokeWidth={2} />}
          title="经营总览"
          items={[
            { label: "收入条目", value: String(overview.revenueCount) },
            { label: "回款条目", value: String(overview.collectionCount) },
            { label: "项目毛利", value: String(overview.marginCount) },
            { label: "项目进度", value: String(overview.projectCount) },
            { label: "客户变化", value: String(overview.customerCount) },
            { label: "首页关注", value: String(overview.homepageCount) },
          ]}
        />
      )}
    </div>
  );
}
