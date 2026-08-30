import type { ReminderItem, ReminderResult } from "./reminderCenter";
import type { OATodoResult } from "./oaTodo";
import type { MailMessage, MailResult } from "./mail";
import type { OaScheduleResult } from "./oaSchedule";
import type { DailyBriefing } from "./dailyBriefing";
import type { HongyiSnapshot } from "./hongyiBusiness";
import { formatDateTime } from "./datetime";

export type DashboardLevel = "urgent" | "attention" | "normal" | "missing";

export interface DashboardTodoItem {
  title: string;
  level: DashboardLevel;
  sourceLabel: string;
  timeLabel: string;
  detailLabel: string;
  targetSection: string;
}

export interface DashboardAggregateItem {
  title: string;
  count: number | null;
  detail: string;
  level: DashboardLevel;
  targetSection: string;
}

export interface DashboardMetricItem {
  title: string;
  value: string;
  note: string;
  isMissing: boolean;
}

export interface DashboardRiskItem {
  conclusion: string;
  advice: string;
  sourceLabel: string;
  impact: "high" | "medium";
}

export interface DashboardHeadline {
  statusText: string;
  statusLevel: DashboardLevel;
  text: string;
  chips: Array<{ value: string; label: string; level: DashboardLevel }>;
  updatedAt: string;
}

export interface DashboardSnapshot {
  headline: DashboardHeadline;
  todoItems: DashboardTodoItem[];
  urgentTodoCount: number;
  aggregateItems: DashboardAggregateItem[];
  metricItems: DashboardMetricItem[];
  riskItems: DashboardRiskItem[];
  mailItems: MailMessage[];
  mailNeedsReplyCount: number | null;
  mailRiskLevel: DashboardLevel;
  remindersFetchedAt: string;
  hiddenLowPriority: number;
}

function parseTime(value: string): Date | null {
  if (value === "" || value === "未获取") return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (match === null) return null;
  const parsed = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function levelOrder(level: DashboardLevel): number {
  if (level === "urgent") return 0;
  if (level === "attention") return 1;
  if (level === "normal") return 2;
  return 3;
}

function reminderTime(value: string): string {
  if (value === "") return "未获取";
  const formatted = formatDateTime(value);
  return formatted === "未获取" ? value : formatted;
}

function targetSectionForSource(source: string): string {
  if (source === "OA 待办" || source === "OA 审批" || source === "OA") return "oa-todo";
  if (source === "邮件" || source === "企业邮箱") return "mail";
  if (source === "虹翼" || source === "经营") return "business";
  return "calendar";
}

function latestTime(values: Array<string | null>): string {
  const dates = values
    .filter((value): value is string => value !== null && value !== "未获取")
    .map(parseTime)
    .filter((date): date is Date => date !== null);
  if (dates.length === 0) return "未获取";
  const latest = dates.reduce((acc, item) => (item > acc ? item : acc), dates[0]);
  return formatDateTime(latest);
}

function todoFromReminder(item: ReminderItem): DashboardTodoItem {
  return {
    title: item.title,
    level: item.level,
    sourceLabel: item.source === "" ? "统一提醒" : item.source,
    timeLabel: reminderTime(item.time),
    detailLabel: item.basis.length > 0 ? item.basis.join("；") : "按紧急度置顶",
    targetSection: targetSectionForSource(item.source),
  };
}

function mailRisk(mail: MailResult | null): DashboardLevel {
  if (mail === null) return "missing";
  if (mail.hasUrgent) return "urgent";
  if (mail.needsReplyCount > 0 || mail.hasAttention) return "attention";
  return "normal";
}

function needsReplyItems(mail: MailResult | null): MailMessage[] {
  return mail === null ? [] : mail.items.filter((item) => item.needsReply);
}

export function buildDashboardSnapshot(input: {
  reminders: ReminderResult | null;
  oaTodo: OATodoResult | null;
  mail: MailResult | null;
  calendar: OaScheduleResult | null;
  briefing: DailyBriefing | null;
  hongyi: HongyiSnapshot;
}): DashboardSnapshot {
  const { reminders, oaTodo, mail, calendar, briefing, hongyi } = input;
  const sortedReminders = [...(reminders?.homepageItems ?? [])].sort((a, b) => {
    if (a.level !== b.level) return levelOrder(a.level) - levelOrder(b.level);
    return 0;
  });
  const todoItems = sortedReminders.slice(0, 3).map(todoFromReminder);
  const urgentReminders = (reminders?.homepageItems ?? []).filter((item) => item.level === "urgent").length;
  const mailItems = needsReplyItems(mail).slice(0, 3);
  const mailNeedsReply = mail === null ? null : mail.needsReplyCount;
  const mailLevel = mailRisk(mail);
  const calendarTodayCount = calendar?.summaryEventCount ?? calendar?.events.length ?? 0;

  const aggregateItems: DashboardAggregateItem[] = [
    {
      title: "OA 审批",
      count: oaTodo?.total ?? null,
      detail: oaTodo === null ? "OA 待办未获取" : `OA 待办 ${oaTodo.total} 项，点击进入审批`,
      level: (oaTodo?.total ?? 0) > 0 ? "urgent" : "normal",
      targetSection: "oa-todo",
    },
    {
      title: "邮件待回复",
      count: mailNeedsReply,
      detail: mail === null ? "邮件数据未获取" : `未读 ${mail.count} 封，其中需回复 ${mail.needsReplyCount} 封`,
      level: mailLevel === "urgent" ? "urgent" : (mailNeedsReply ?? 0) > 0 ? "attention" : "normal",
      targetSection: "mail",
    },
    {
      title: "今日会议 / 日程",
      count: calendarTodayCount,
      detail: calendar === null
        ? "日程数据未获取"
        : `今日日程 ${calendarTodayCount} 项 · 来源 OA`,
      level: "normal",
      targetSection: "calendar",
    },
  ];

  const today = hongyi.todayMetrics;
  const overview = hongyi.overview;
  const metricItems: DashboardMetricItem[] = [
    {
      title: "今日收入确认",
      value: today === null
        ? "未获取"
        : `${today.revenueConfirmationsCount} 笔 / ${today.totalRevenueAmountText ?? "金额未获取"}`,
      note: today === null ? "今日专项未获取" : "来源：虹翼今日专项",
      isMissing: today === null,
    },
    {
      title: "本月收入",
      value: overview?.monthRevenueText ?? "未获取",
      note: overview?.monthRevenueText == null ? "部门看板字段待接入" : "单位：万元",
      isMissing: overview?.monthRevenueText == null,
    },
    {
      title: "年度利润",
      value: overview?.yearProfitText ?? "未获取",
      note: overview?.yearProfitText == null ? "部门看板字段待接入" : "单位：万元",
      isMissing: overview?.yearProfitText == null,
    },
    {
      title: "应收余额",
      value: overview?.receivableBalanceText ?? "未获取",
      note: overview?.receivableBalanceText == null ? "取数字段待虹翼 Skill 输出" : "单位：万元",
      isMissing: overview?.receivableBalanceText == null,
    },
    {
      title: "逾期应收",
      value: overview?.overdueReceivableText ?? "未获取",
      note: overview?.overdueReceivableText == null ? "接入后超阈值自动标红" : "单位：万元",
      isMissing: overview?.overdueReceivableText == null,
    },
  ];

  const riskPool = (reminders?.homepageItems ?? []).filter(
    (item) => item.level === "urgent" || item.level === "attention",
  );
  const riskItems: DashboardRiskItem[] = riskPool.slice(0, 4).map((item) => ({
    conclusion: item.title,
    advice: item.suggestedAction === "" ? "进入来源系统确认处理动作。" : item.suggestedAction,
    sourceLabel: [item.source, reminderTime(item.time)].filter((value) => value !== "").join(" · "),
    impact: item.level === "urgent" ? "high" : "medium",
  }));
  if ((overview?.homepageCount ?? 0) > 0) {
    riskItems.push({
      conclusion: `虹翼经营关注 ${overview?.homepageCount ?? 0} 项待处理`,
      advice: "进入经营情况页逐项确认收入、回款与项目风险。",
      sourceLabel: `虹翼经营总览 · ${hongyi.fetchedAt}`,
      impact: "medium",
    });
  }

  const mustDo = briefing?.mustDoNow ?? 0;
  const focusToday = briefing?.focusToday ?? 0;
  const total = mustDo + focusToday;
  const urgent = Math.max(mustDo, urgentReminders);
  const pendingMail = mailNeedsReply ?? 0;
  const headlineText = briefing === null && reminders === null
    ? "首页数据未获取，点击右上角刷新后重试"
    : total === 0
      ? `今日无紧急事项，邮件待回复 ${pendingMail} 封`
      : `今日 ${total} 项需处理，${urgent} 项紧急，邮件 ${pendingMail} 封待回复`;
  const statusLevel: DashboardLevel = urgent > 0 ? "urgent" : total > 0 ? "attention" : "normal";

  return {
    headline: {
      statusText: urgent > 0 ? "需要行动" : total > 0 ? "需要关注" : "今日无紧急事项",
      statusLevel,
      text: headlineText,
      chips: [
        { value: String(urgent), label: "紧急", level: urgent > 0 ? "urgent" : "normal" },
        { value: String(oaTodo?.total ?? 0), label: "OA 审批", level: (oaTodo?.total ?? 0) > 0 ? "urgent" : "normal" },
        { value: String(pendingMail), label: "待回复", level: pendingMail > 0 ? "attention" : "normal" },
        { value: String(calendarTodayCount), label: "今日会议", level: "normal" },
      ],
      updatedAt: latestTime([
        reminders?.fetchedAt ?? null,
        mail?.fetchedAt ?? null,
        oaTodo?.fetchedAt ?? null,
        calendar?.fetchedAt ?? null,
        briefing?.generatedAt ?? null,
        hongyi.fetchedAt === "未获取" ? null : hongyi.fetchedAt,
      ]),
    },
    todoItems,
    urgentTodoCount: todoItems.filter((item) => item.level === "urgent").length,
    aggregateItems,
    metricItems,
    riskItems: riskItems.slice(0, 4),
    mailItems,
    mailNeedsReplyCount: mailNeedsReply,
    mailRiskLevel: mailLevel,
    remindersFetchedAt: reminders?.fetchedAt ?? "未获取",
    hiddenLowPriority: briefing?.hiddenLowPriority ?? 0,
  };
}
