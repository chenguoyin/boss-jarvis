import type { SkillEnvelope } from "./contract";

export interface HongyiTodayMetrics {
  projectsCount: number;
  customerApplicationsCount: number;
  revenueConfirmationsCount: number;
  totalRevenueAmount: number | null;
  totalRevenueAmountText: string | null;
  failedSourceCount: number;
  dataQualityIssues: string[];
}

export interface HongyiOverview {
  totalCount: number;
  homepageCount: number;
  revenueCount: number;
  collectionCount: number;
  marginCount: number;
  projectCount: number;
  customerCount: number;
  monthRevenueText: string | null;
  quarterRevenueText: string | null;
  yearRevenueText: string | null;
  monthProfitText: string | null;
  yearProfitText: string | null;
  yearGrossMarginText: string | null;
  yearGrossMarginRateText: string | null;
  receivableBalanceText: string | null;
  overdueReceivableText: string | null;
  failedSourceCount: number;
  dataQualityIssues: string[];
}

export interface HongyiSnapshot {
  todayMetrics: HongyiTodayMetrics | null;
  overview: HongyiOverview | null;
  fetchedAt: string;
  statusValue: string;
  riskLevel: "urgent" | "attention" | "normal" | "missing";
  failedSourceCount: number;
  dataQualityIssues: string[];
  hasDataQualityIssues: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numericOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function issuesFrom(value: unknown): string[] {
  const quality = record(value);
  const issues = Array.isArray(quality.issues)
    ? quality.issues.filter((item): item is string => typeof item === "string" && item !== "")
    : [];
  return Array.from(new Set(issues)).sort();
}

function fullTime(iso: unknown): string {
  if (typeof iso !== "string" || iso === "") return "未获取";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未获取";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function hasTodayAnyData(today: HongyiTodayMetrics): boolean {
  return (
    today.projectsCount > 0 ||
    today.customerApplicationsCount > 0 ||
    today.revenueConfirmationsCount > 0 ||
    (today.totalRevenueAmount ?? 0) !== 0
  );
}

function hasOverviewAnyData(overview: HongyiOverview): boolean {
  const hasDashboard =
    overview.monthRevenueText !== null ||
    overview.quarterRevenueText !== null ||
    overview.yearRevenueText !== null ||
    overview.monthProfitText !== null ||
    overview.yearProfitText !== null ||
    overview.yearGrossMarginText !== null ||
    overview.yearGrossMarginRateText !== null ||
    overview.receivableBalanceText !== null ||
    overview.overdueReceivableText !== null;
  return (
    overview.totalCount > 0 ||
    overview.revenueCount > 0 ||
    overview.collectionCount > 0 ||
    overview.marginCount > 0 ||
    overview.projectCount > 0 ||
    overview.customerCount > 0 ||
    hasDashboard
  );
}

export function buildHongyiSnapshot(
  todayEnvelope: SkillEnvelope | null,
  overviewEnvelope: SkillEnvelope | null,
): HongyiSnapshot {
  let todayMetrics: HongyiTodayMetrics | null = null;
  let overview: HongyiOverview | null = null;

  if (todayEnvelope?.ok) {
    const view = record(todayEnvelope.bossView);
    const metricsView = record(view.todayMetrics);
    if (Object.keys(metricsView).length > 0) {
      todayMetrics = {
        projectsCount: numberOr(metricsView.projectsCount, 0),
        customerApplicationsCount: numberOr(metricsView.customerApplicationsCount, 0),
        revenueConfirmationsCount: numberOr(metricsView.revenueConfirmationsCount, 0),
        totalRevenueAmount: numericOrNull(metricsView.totalRevenueAmount),
        totalRevenueAmountText: textOrNull(metricsView.totalRevenueAmountText),
        failedSourceCount: numberOr(record(view.dataQuality).failedSourceCount, 0),
        dataQualityIssues: issuesFrom(view.dataQuality),
      };
    }
  }

  if (overviewEnvelope?.ok) {
    const view = record(overviewEnvelope.bossView);
    const overviewView = record(view.overview);
    if (Object.keys(overviewView).length > 0) {
      const dashboard = record(overviewView.departmentDashboard);
      overview = {
        totalCount: numberOr(overviewView.totalCount, 0),
        homepageCount: numberOr(overviewView.homepageCount, 0),
        revenueCount: numberOr(overviewView.revenueCount, 0),
        collectionCount: numberOr(overviewView.collectionCount, 0),
        marginCount: numberOr(overviewView.marginCount, 0),
        projectCount: numberOr(overviewView.projectCount, 0),
        customerCount: numberOr(overviewView.customerCount, 0),
        monthRevenueText: textOrNull(dashboard.monthRevenueText),
        quarterRevenueText: textOrNull(dashboard.quarterRevenueText),
        yearRevenueText: textOrNull(dashboard.yearRevenueText),
        monthProfitText: textOrNull(dashboard.monthProfitText),
        yearProfitText: textOrNull(dashboard.yearProfitText),
        yearGrossMarginText: textOrNull(dashboard.yearGrossMarginText),
        yearGrossMarginRateText: textOrNull(dashboard.yearGrossMarginRateText),
        receivableBalanceText: textOrNull(dashboard.receivableBalanceText),
        overdueReceivableText: textOrNull(dashboard.overdueReceivableText),
        failedSourceCount: numberOr(record(view.dataQuality).failedSourceCount, 0),
        dataQualityIssues: issuesFrom(view.dataQuality),
      };
    }
  }

  const failedSourceCount =
    (todayMetrics?.failedSourceCount ?? 0) + (overview?.failedSourceCount ?? 0);
  const dataQualityIssues = Array.from(
    new Set([...(todayMetrics?.dataQualityIssues ?? []), ...(overview?.dataQualityIssues ?? [])]),
  ).sort();
  const hasDataQualityIssues = failedSourceCount > 0 || dataQualityIssues.length > 0;
  const hasAnyData =
    (todayMetrics !== null && hasTodayAnyData(todayMetrics)) ||
    (overview !== null && hasOverviewAnyData(overview));

  let statusValue: string;
  let riskLevel: HongyiSnapshot["riskLevel"];
  if (todayMetrics === null && overview === null) {
    statusValue = "未获取";
    riskLevel = "missing";
  } else if (hasDataQualityIssues && !hasAnyData) {
    statusValue = "未获取";
    riskLevel = "missing";
  } else if (hasDataQualityIssues) {
    statusValue = "部分未获取";
    riskLevel = "attention";
  } else if ((overview?.homepageCount ?? 0) > 0) {
    riskLevel = "attention";
    statusValue = "已接入";
  } else {
    statusValue = "已接入";
    riskLevel = "normal";
  }

  return {
    todayMetrics,
    overview,
    fetchedAt: fullTime(overviewEnvelope?.fetchedAt ?? todayEnvelope?.fetchedAt),
    statusValue,
    riskLevel,
    failedSourceCount,
    dataQualityIssues,
    hasDataQualityIssues,
  };
}
