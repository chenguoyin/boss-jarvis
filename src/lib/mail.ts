import type { SkillEnvelope } from "./contract";

export type MailLevel = "urgent" | "attention" | "normal" | "missing";

export interface MailMessage {
  id: number;
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
}

export interface MailResult {
  count: number;
  items: MailMessage[];
  fetchedAt: string;
  needsReplyCount: number;
  hasUrgent: boolean;
  hasAttention: boolean;
}

export function hideMailMessages(result: MailResult, ids: ReadonlySet<number>): MailResult {
  if (ids.size === 0) return result;
  const items = result.items.filter((item) => !ids.has(item.id));
  return {
    ...result,
    items,
    count: Math.max(result.count - (result.items.length - items.length), 0),
    needsReplyCount: items.filter((item) => item.needsReply).length,
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

function fullTime(iso: string): string {
  if (iso === "") return "未获取";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未获取";
  const pad = (n: number) => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate())
    + " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
}

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

// 解析 company-mail 的 rows；文件缺失或 ok=false 时返回 null，调用方显示“未获取”。
export function parseCompanyMail(envelope: SkillEnvelope | null): MailResult | null {
  if (envelope === null || !envelope.ok) return null;
  const raw = envelope as unknown as Record<string, unknown>;
  const rows = Array.isArray(raw.rows) ? raw.rows : [];
  const items: MailMessage[] = [];
  for (const value of rows) {
    const row = record(value);
    const id = typeof row.id === "number" && Number.isFinite(row.id) ? row.id : null;
    const subject = text(row.subject);
    if (id === null || subject === "") continue;
    const analysis = record(row.analysis);
    const receivedAt = text(row.receivedAt);
    const fallbackTime = text(row.receivedAtText);
    items.push({
      id,
      sender: text(row.sender),
      subject,
      receivedAt,
      receivedAtText: receivedAt === "" ? fallbackTime : receivedAt,
      displayTime: receivedAt !== "" ? fullTime(receivedAt) : fallbackTime === "" ? "未获取" : fallbackTime,
      bodySummary: text(row.bodySummary),
      bodyHtml: text(row.bodyHtml),
      level: mailLevel(analysis.urgency),
      needsReply: analysis.needsReply === true,
      replyBasis: text(analysis.replyBasis),
    });
  }
  const count = typeof raw.count === "number" && Number.isFinite(raw.count) ? raw.count : items.length;
  const audit = record(raw.audit);
  const fetchedRaw = text(raw.fetchedAt) === "" ? text(audit.collectedAt) : text(raw.fetchedAt);
  return {
    count,
    items,
    fetchedAt: fullTime(fetchedRaw),
    needsReplyCount: items.filter((item) => item.needsReply).length,
    hasUrgent: items.some((item) => item.level === "urgent"),
    hasAttention: items.some((item) => item.level === "attention"),
  };
}
