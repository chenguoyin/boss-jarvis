import type { SkillEnvelope } from "./contract";
import { formatDateTime } from "./datetime";

export type ReminderLevel = "urgent" | "attention" | "normal" | "missing";

export interface ReminderItem {
  title: string;
  source: string;
  sourceType: string;
  time: string;
  level: ReminderLevel;
  basis: string[];
  suggestedAction: string;
}

export interface ReminderResult {
  count: number;
  homepageItems: ReminderItem[];
  unavailableSourceLabels: string[];
  fetchedAt: string;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim())
    : [];
}

function level(value: unknown): ReminderLevel {
  const normalized = text(value).toLowerCase();
  if (normalized === "urgent" || normalized === "red") return "urgent";
  if (normalized === "attention" || normalized === "yellow") return "attention";
  if (normalized === "normal" || normalized === "green") return "normal";
  return "missing";
}

function items(value: unknown): ReminderItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const row = record(entry);
      const title = text(row.title);
      if (title === "") return null;
      return {
        title,
        source: text(row.source),
        sourceType: text(row.sourceType),
        time: text(row.time),
        level: level(row.level),
        basis: stringList(row.basis),
        suggestedAction: text(row.suggestedAction),
      };
    })
    .filter((item): item is ReminderItem => item !== null);
}

const fullTime = formatDateTime;

export function parseReminderCenter(envelope: SkillEnvelope | null): ReminderResult | null {
  if (envelope === null || !envelope.ok) return null;
  const raw = envelope as unknown as Record<string, unknown>;
  const homepageItems = items(raw.homepageItems);
  const unavailableSources = Array.isArray(raw.unavailableSources) ? raw.unavailableSources : [];
  return {
    count: typeof raw.count === "number" && Number.isFinite(raw.count) ? raw.count : homepageItems.length,
    homepageItems,
    unavailableSourceLabels: unavailableSources
      .map((entry) => text(record(entry).source))
      .filter((source) => source !== ""),
    fetchedAt: fullTime(raw.fetchedAt),
  };
}
