import type { SkillEnvelope } from "./contract";
import { formatClock, formatDateTime } from "./datetime";

export type CalendarLevel = "normal" | "attention" | "missing";

export interface NativeCalendarEvent {
  id: string;
  title: string;
  calendar: string;
  start: string;
  end: string;
  isAllDay: boolean;
  priority: string;
  reasons: string[];
}

export interface NativeCalendarReminder {
  id: string;
  title: string;
  notes: string;
  due: string;
  priority: string;
  reasons: string[];
}

export interface NativeCalendarResult {
  date: string;
  events: NativeCalendarEvent[];
  reminders: NativeCalendarReminder[];
  summaryEventCount: number;
  summaryReminderCount: number;
  summaryHomepageItems: number;
  summaryOverdueReminderCount: number;
  fetchedAt: string;
}

export function levelTitle(raw: string): string {
  if (raw === "red") return "紧急";
  if (raw === "yellow") return "关注";
  if (raw === "green") return "正常";
  return "未获取";
}

export function levelClass(raw: string): CalendarLevel {
  if (raw === "red") return "missing";
  if (raw === "yellow") return "attention";
  if (raw === "green") return "normal";
  return "missing";
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

export function shortTime(iso: string): string {
  return formatClock(iso);
}

export function fullTime(iso: string): string {
  return formatDateTime(iso);
}

export function timeRange(start: string, end: string): string {
  const s = shortTime(start);
  const e = shortTime(end);
  if (s === "未获取" && e === "未获取") return "未获取";
  return `${s} - ${e}`;
}

export function parseNativeCalendar(envelope: SkillEnvelope): NativeCalendarResult {
  const raw = envelope as unknown as Record<string, unknown>;
  const toRecord = (value: unknown): Record<string, unknown> => {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  };
  const events = (Array.isArray(raw.events) ? raw.events : []).map(toRecord).filter((e) => {
    const id = str(e.id);
    const title = str(e.title);
    return id !== "" && title !== "";
  }).map((e) => ({
    id: str(e.id),
    title: str(e.title),
    calendar: str(e.calendar, "未获取"),
    start: str(e.start),
    end: str(e.end),
    isAllDay: e.isAllDay === true,
    priority: str(e.priority, "green"),
    reasons: strList(e.reasons),
  }));
  const reminders = (Array.isArray(raw.reminders) ? raw.reminders : []).map(toRecord).filter((r) => {
    const id = str(r.id);
    const title = str(r.title);
    return id !== "" && title !== "";
  }).map((r) => ({
    id: str(r.id),
    title: str(r.title),
    notes: str(r.notes),
    due: str(r.due),
    priority: str(r.priority, "green"),
    reasons: strList(r.reasons),
  }));
  const summary = toRecord(raw.summary);
  const num = (value: unknown, fallback: number) => (typeof value === "number" ? value : fallback);
  const fetchedAt = fullTime(str(raw.fetchedAt));
  return {
    date: str(raw.date, "未获取"),
    events,
    reminders,
    summaryEventCount: num(summary.eventCount, events.length),
    summaryReminderCount: num(summary.reminderCount, reminders.length),
    summaryHomepageItems: num(summary.homepageItems, 0),
    summaryOverdueReminderCount: num(summary.overdueReminderCount, 0),
    fetchedAt,
  };
}
