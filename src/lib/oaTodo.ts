import type { SkillEnvelope } from "./contract";
import { formatDateTime } from "./datetime";

export type OARiskLevel = "urgent" | "attention" | "normal" | "missing";

export const OA_RISK_TITLES: Record<OARiskLevel, string> = {
  urgent: "红色风险",
  attention: "黄色关注",
  normal: "正常",
  missing: "未获取",
};

export interface OATodoAnalysis {
  priority: string;
  priorityLabel: string;
  riskLevel: OARiskLevel;
  riskPoints: string[];
  suggestion: string;
  detail: string;
}

export interface OATodoItem {
  title: string;
  source: string;
  creator: string;
  sender: string;
  time: string;
  analysis: OATodoAnalysis | null;
  displaySender: string;
}

export interface OATodoResult {
  total: number;
  count: number;
  items: OATodoItem[];
  fetchedAt: string;
  hasCountMismatch: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOr(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function riskLevel(value: unknown): OARiskLevel {
  if (value === "red") return "urgent";
  if (value === "yellow") return "attention";
  if (value === "green") return "normal";
  return "missing";
}

function analysisFrom(value: unknown): OATodoAnalysis | null {
  const json = record(value);
  if (Object.keys(json).length === 0) return null;
  return {
    priority: text(json.priority) || "P4",
    priorityLabel: text(json.priorityLabel) || "待核验",
    riskLevel: riskLevel(json.riskLevel),
    riskPoints: Array.isArray(json.riskPoints)
      ? json.riskPoints.filter((item): item is string => typeof item === "string" && item !== "")
      : ["详情未获取"],
    suggestion: text(json.suggestion) || "审批前核验详情和附件",
    detail: text(json.detail) || "详情未获取",
  };
}

const fullTime = formatDateTime;

export function parseOATodo(envelope: SkillEnvelope | null): OATodoResult | null {
  if (envelope === null || !envelope.ok) return null;
  const items = Array.isArray(envelope.items)
    ? envelope.items
        .map((value) => {
          const entry = record(value);
          const title = text(entry.title);
          if (title === "") return null;
          const sender = text(entry.sender);
          const creator = text(entry.creator);
          return {
            title,
            source: text(entry.source),
            creator,
            sender,
            time: text(entry.time),
            analysis: analysisFrom(entry.analysis),
            displaySender: sender === "" ? creator : sender,
          };
        })
        .filter((value): value is OATodoItem => value !== null)
    : [];
  const count = numberOr(envelope.count, items.length);
  const total = numberOr(envelope.total, items.length);
  return {
    total,
    count,
    items,
    fetchedAt: fullTime(envelope.fetchedAt),
    hasCountMismatch: total !== count,
  };
}

const EXPENSE_KEYWORDS = ["智能财务", "费控", "资金", "报销", "差旅费", "备用金"];

export function filterExpenseItems(result: OATodoResult): OATodoItem[] {
  return result.items.filter((item) =>
    EXPENSE_KEYWORDS.some((keyword) => item.source.includes(keyword) || item.title.includes(keyword)),
  );
}
