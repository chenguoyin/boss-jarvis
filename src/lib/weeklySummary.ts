import { formatDateTime } from "./datetime";

export interface WeeklySummaryCategory {
  name: string;
  count: number;
}

export interface WeeklySummaryEvent {
  date: string;
  time: string;
  title: string;
}

export interface WeeklySummary {
  isOK: boolean;
  errorText: string;
  generatedAt: string;
  reportDate: string;
  rangeStart: string;
  rangeEnd: string;
  oaCount: number;
  oaByCategory: WeeklySummaryCategory[];
  executedCount: number;
  redRiskCount: number;
  reminderCount: number;
  redRiskSummary: string;
  attendanceTopPerson: string;
  attendanceTopCount: number;
  attendancePersonCount: number;
  attendanceTotal: number;
  nextWeekEvents: WeeklySummaryEvent[];
  focusPoints: string[];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" && value !== "" ? value : "";
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const fullTime = (iso: unknown): string => {
  const formatted = formatDateTime(iso);
  return formatted === "未获取" ? "未知时间" : formatted;
};

export function parseWeeklySummary(raw: unknown): WeeklySummary | null {
  const json = record(raw);
  const reportDate = text(json.reportDate);
  if (reportDate === "") return null;
  const summary = record(json.summary);
  const categories = Object.entries(record(summary.oaByCategory))
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const events = Array.isArray(json.nextWeekEvents)
    ? json.nextWeekEvents
        .map((value) => {
          const event = record(value);
          const date = text(event.date);
          const title = text(event.title);
          if (date === "" || title === "") return null;
          return { date, time: text(event.time), title };
        })
        .filter((value): value is WeeklySummaryEvent => value !== null)
    : [];
  const focusPoints = Array.isArray(json.focusPoints)
    ? json.focusPoints.filter((value): value is string => typeof value === "string" && value !== "")
    : [];

  return {
    isOK: json.ok === true,
    errorText: text(json.error),
    generatedAt: fullTime(json.generatedAt),
    reportDate,
    rangeStart: text(json.rangeStart) || reportDate,
    rangeEnd: text(json.rangeEnd) || reportDate,
    oaCount: numberOr(summary.oaCount, 0),
    oaByCategory: categories,
    executedCount: numberOr(summary.executedCount, 0),
    redRiskCount: numberOr(summary.redRiskCount, 0),
    reminderCount: numberOr(summary.reminderCount, 0),
    redRiskSummary: text(summary.redRiskSummary),
    attendanceTopPerson: text(summary.attendanceTopPerson),
    attendanceTopCount: numberOr(summary.attendanceTopCount, 0),
    attendancePersonCount: numberOr(summary.attendancePersonCount, 0),
    attendanceTotal: numberOr(summary.attendanceTotal, 0),
    nextWeekEvents: events,
    focusPoints,
  };
}
