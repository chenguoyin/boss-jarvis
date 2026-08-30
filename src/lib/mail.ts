import type { SkillEnvelope } from "./contract";
import { formatDateTime } from "./datetime";

export type MailLevel = "urgent" | "attention" | "normal" | "missing";

export interface MailMessage {
  id: number | string;
  sender: string;
  subject: string;
  receivedAt: string;
  receivedAtText: string;
  displayTime: string;
  bodySummary: string;
  bodyHtml: string;
  level: MailLevel;
  needsReply: boolean;
  replyBasis: string;
  reminderCandidate: boolean;
  priority: string;
  priorityLabel: string;
}

export interface MailResult {
  count: number;
  items: MailMessage[];
  fetchedAt: string;
  needsReplyCount: number;
  reminderCandidateCount: number;
  hasUrgent: boolean;
  hasAttention: boolean;
  sourceSystem?: string;
}

export function hideMailMessages(result: MailResult, ids: ReadonlySet<number | string>): MailResult {
  if (ids.size === 0) return result;
  const items = result.items.filter((item) => !ids.has(item.id));
  return {
    ...result,
    items,
    count: Math.max(result.count - (result.items.length - items.length), 0),
    needsReplyCount: items.filter((item) => item.needsReply).length,
    reminderCandidateCount: items.filter((item) => item.reminderCandidate).length,
    hasUrgent: items.some((item) => item.level === "urgent"),
    hasAttention: items.some((item) => item.level === "attention"),
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const fullTime = formatDateTime;

function mailLevel(value: unknown): MailLevel {
  const normalized = text(value).toLowerCase();
  if (normalized === "urgent" || normalized === "red") return "urgent";
  if (normalized === "attention" || normalized === "yellow") return "attention";
  if (normalized === "normal" || normalized === "green") return "normal";
  return "missing";
}

export function mailLevelTitle(level: MailLevel): string {
  if (level === "urgent") return "紧急";
  if (level === "attention") return "关注";
  if (level === "normal") return "正常";
  return "未获取";
}

// 解析统一邮件入口 changhong-mail 的 rows；文件缺失或 ok=false 时返回 null，调用方显示"未获取"。
export function parseCompanyMail(envelope: SkillEnvelope | null): MailResult | null {
  if (envelope === null || !envelope.ok) return null;
  const raw = envelope as unknown as Record<string, unknown>;
  const rows = Array.isArray(raw.rows) ? raw.rows : [];
  const items: MailMessage[] = [];
  for (const value of rows) {
    const row = record(value);
    let id: number | string | null = null;
    if (typeof row.id === "number" && Number.isFinite(row.id)) {
      id = row.id;
    } else if (typeof row.id === "string" && row.id.trim() !== "") {
      id = row.id.trim();
    }
    const subject = text(row.subject);
    if (id === null || subject === "") continue;
    const analysis = record(row.analysis);
    const receivedAt = text(row.receivedAt);
    const fallbackTime = text(row.receivedAtText);
    const sender = text(row.sender) || text(row.senderName) || text(row.senderEmail);
    items.push({
      id,
      sender,
      subject,
      receivedAt,
      receivedAtText: receivedAt === "" ? fallbackTime : receivedAt,
      displayTime: receivedAt !== "" ? fullTime(receivedAt) : fallbackTime === "" ? "未获取" : fallbackTime,
      bodySummary: text(row.bodySummary),
      bodyHtml: text(row.bodyHtml),
      level: mailLevel(analysis.urgency),
      needsReply: analysis.needsReply === true,
      replyBasis: text(analysis.replyBasis),
      reminderCandidate: analysis.reminderCandidate === true,
      priority: text(analysis.priority),
      priorityLabel: text(analysis.priorityLabel),
    });
  }
  const count = typeof raw.count === "number" && Number.isFinite(raw.count) ? raw.count : items.length;
  const audit = record(raw.audit);
  const fetchedRaw = text(raw.fetchedAt) === "" ? text(audit.collectedAt) : text(raw.fetchedAt);
  const sourceSystem = text(raw.sourceSystem);
  return {
    count,
    items,
    fetchedAt: fullTime(fetchedRaw),
    needsReplyCount: items.filter((item) => item.needsReply).length,
    reminderCandidateCount: items.filter((item) => item.reminderCandidate).length,
    hasUrgent: items.some((item) => item.level === "urgent"),
    hasAttention: items.some((item) => item.level === "attention"),
    sourceSystem: sourceSystem === "" ? undefined : sourceSystem,
  };
}
