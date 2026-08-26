import type { SkillEnvelope } from "./contract";
import { formatDateTime } from "./datetime";

export interface DailyBriefing {
  generatedAt: string;
  today: string;
  headline: string;
  total: number;
  mustDoNow: number;
  focusToday: number;
  watchList: number;
  hiddenLowPriority: number;
  unavailableSources: number;
  mustDoItems: string[];
  focusItems: string[];
  watchItems: string[];
  sourceLabels: string[];
  scheduleTime: string | null;
  scheduleInstalled: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x !== "");
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const fullTime = formatDateTime;

// 契约：只认 boss-cockpit 的 bossView；无 bossView 视为未获取，不回退解析旧格式。
export function parseDailyBriefing(envelope: SkillEnvelope): DailyBriefing | null {
  const bossView = record(envelope.bossView);
  if (Object.keys(bossView).length === 0) return null;
  const summary = record(bossView.summary);
  const sections = record(bossView.sections);
  const schedule = record(bossView.schedule);
  return {
    generatedAt: fullTime(summary.generatedAt),
    today: typeof summary.today === "string" && summary.today !== "" ? summary.today : "未获取",
    headline: typeof summary.headline === "string" && summary.headline !== "" ? summary.headline : "未获取",
    total: numberOr(summary.total, 0),
    mustDoNow: numberOr(summary.mustDoNow, 0),
    focusToday: numberOr(summary.focusToday, 0),
    watchList: numberOr(summary.watchList, 0),
    hiddenLowPriority: numberOr(summary.hiddenLowPriority, 0),
    unavailableSources: numberOr(summary.unavailableSources, 0),
    mustDoItems: stringList(sections.mustDoNow),
    focusItems: stringList(sections.focusToday),
    watchItems: stringList(sections.watchList),
    sourceLabels: stringList(bossView.sourceLabels),
    scheduleTime: typeof schedule.configuredTime === "string" ? schedule.configuredTime : null,
    scheduleInstalled: schedule.installed === true,
  };
}
