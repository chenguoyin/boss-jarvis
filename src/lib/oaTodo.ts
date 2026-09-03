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
  verdict: string;
  verdictTone: "ok" | "stop" | "caution";
  adviceBody: string;
  detail: string;
}

export interface OATodoField {
  label: string;
  name: string;
  value: string;
}

export interface OATodoAttachment {
  text: string;
  href: string;
}

export interface OATodoDocumentDetail {
  sourceSystem: string;
  openedBySso: boolean;
  url: string;
  host: string;
  pageTitle: string;
  bodyPreview: string;
  bodyTextLength: number;
  fields: OATodoField[];
  tables: string[][][];
  attachments: OATodoAttachment[];
  amounts: number[];
  dates: string[];
}

export interface OATodoTargetRef {
  systemSign: string;
  executeSign: string;
  flowType: string;
  flowWorkId: string;
  instanceCode: string;
  orderId: string;
  taskId: string;
  url: string;
  appUrl: string;
  apiUrl: string;
  nodeType: string;
  nodeName: string;
}

export type AnalysisStatus = "analyzing" | "completed" | "failed" | "pending";

export interface OATodoItem {
  title: string;
  source: string;
  creator: string;
  sender: string;
  time: string;
  targetRef: OATodoTargetRef | null;
  documentDetail: OATodoDocumentDetail | null;
  analysis: OATodoAnalysis | null;
  analysisStatus: AnalysisStatus;
  analyzeError: string;
  displaySender: string;
}

export interface OATodoResult {
  total: number;
  count: number;
  items: OATodoItem[];
  fetchedAt: string;
  hasCountMismatch: boolean;
  analysisStatus: AnalysisStatus;
  analysisProgress: { total: number; done: number; failed?: number } | null;
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
  const suggestion = text(json.suggestion) || "审批前核验详情和附件";
  const verdict = parseVerdict(suggestion);
  return {
    priority: text(json.priority) || "P4",
    priorityLabel: text(json.priorityLabel) || "待核验",
    riskLevel: riskLevel(json.riskLevel),
    riskPoints: Array.isArray(json.riskPoints)
      ? json.riskPoints.filter((item): item is string => typeof item === "string" && item !== "")
      : ["详情未获取"],
    suggestion,
    verdict: verdict.label,
    verdictTone: verdict.tone,
    adviceBody: verdict.body,
    detail: text(json.detail) || "详情未获取",
  };
}

// 从建议文案中拆出结论徽标与说明正文：结论进带色框，说明不进框。
function parseVerdict(suggestion: string): { label: string; tone: "ok" | "stop" | "caution"; body: string } {
  const normalized = suggestion.trim();
  const match = normalized.match(/^(建议同意|建议不同意|建议退回|建议暂缓|建议优先处理|建议有条件处理|建议有条件同意)/);
  if (!match) return { label: "待核验", tone: "caution", body: normalized };
  const label = match[1];
  const tone = label === "建议同意" ? "ok" : label === "建议不同意" || label === "建议退回" ? "stop" : "caution";
  const body = normalized.slice(label.length).replace(/^[。.：:，,]s*/, "").trim();
  return { label, tone, body };
}

function fieldFrom(value: unknown): OATodoField | null {
  const json = record(value);
  const valueText = text(json.value);
  if (valueText === "") return null;
  const label = text(json.label).replace(/：$/, "");
  const name = text(json.name);
  return {
    label: label || name || "字段",
    name,
    value: valueText,
  };
}

function tableFrom(value: unknown): string[][] | null {
  if (!Array.isArray(value)) return null;
  const rows = value
    .filter(Array.isArray)
    .map((row) => row.map(text).filter((cell) => cell !== ""))
    .filter((row) => row.length > 0);
  return rows.length > 0 ? rows : null;
}

function attachmentFrom(value: unknown): OATodoAttachment | null {
  const json = record(value);
  const label = text(json.text) || text(json.href);
  if (label === "") return null;
  return { text: label, href: text(json.href) };
}

function documentDetailFrom(value: unknown): OATodoDocumentDetail | null {
  const json = record(value);
  if (Object.keys(json).length === 0) return null;
  const fields = Array.isArray(json.fields)
    ? json.fields.map(fieldFrom).filter((item): item is OATodoField => item !== null)
    : [];
  const tables = Array.isArray(json.tables)
    ? json.tables.map(tableFrom).filter((item): item is string[][] => item !== null)
    : [];
  const attachments = Array.isArray(json.attachments)
    ? json.attachments.map(attachmentFrom).filter((item): item is OATodoAttachment => item !== null)
    : [];
  const bodyPreview = text(json.bodyPreview);
  if (fields.length === 0 && tables.length === 0 && attachments.length === 0 && bodyPreview === "") {
    return null;
  }
  return {
    sourceSystem: text(json.sourceSystem),
    openedBySso: json.openedBySso === true,
    url: text(json.url),
    host: text(json.host),
    pageTitle: text(json.pageTitle),
    bodyPreview,
    bodyTextLength: numberOr(json.bodyTextLength, bodyPreview.length),
    fields,
    tables,
    attachments,
    amounts: Array.isArray(json.amounts) ? json.amounts.filter((item): item is number => typeof item === "number") : [],
    dates: Array.isArray(json.dates) ? json.dates.map(text).filter((item) => item !== "") : [],
  };
}

function targetRefFrom(value: unknown): OATodoTargetRef | null {
  const json = record(value);
  if (Object.keys(json).length === 0) return null;
  const target = {
    systemSign: text(json.systemSign),
    executeSign: text(json.executeSign),
    flowType: text(json.flowType),
    flowWorkId: text(json.flowWorkId),
    instanceCode: text(json.instanceCode),
    orderId: text(json.orderId),
    taskId: text(json.taskId),
    url: text(json.url),
    appUrl: text(json.appUrl),
    apiUrl: text(json.apiUrl),
    nodeType: text(json.nodeType),
    nodeName: text(json.nodeName),
  };
  return Object.values(target).some((item) => item !== "") ? target : null;
}

const fullTime = formatDateTime;

function analysisStatusFrom(value: unknown): AnalysisStatus {
  const status = text(value);
  if (status === "analyzing") return "analyzing";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "pending";
}

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
          const status = analysisStatusFrom(entry.analysisStatus);
          return {
            title,
            source: text(entry.source),
            creator,
            sender,
            time: text(entry.time),
            targetRef: targetRefFrom(entry.targetRef),
            documentDetail: documentDetailFrom(entry.documentDetail),
            analysis: analysisFrom(entry.analysis),
            analysisStatus: status,
            analyzeError: text(entry.analyzeError),
            displaySender: sender === "" ? creator : sender,
          };
        })
        .filter((value): value is OATodoItem => value !== null)
    : [];
  const count = numberOr(envelope.count, items.length);
  const total = numberOr(envelope.total, items.length);
  
  // 解析整体分析状态
  const analysisStatus = analysisStatusFrom(envelope.analysisStatus);
  const analysisProgress = record(envelope.analysisProgress);
  const progress = analysisProgress.total !== undefined 
    ? { 
        total: numberOr(analysisProgress.total, 0), 
        done: numberOr(analysisProgress.done, 0),
        failed: numberOr(analysisProgress.failed, 0)
      }
    : null;

  return {
    total,
    count,
    items,
    fetchedAt: fullTime(envelope.fetchedAt),
    hasCountMismatch: total !== count,
    analysisStatus,
    analysisProgress: progress,
  };
}

const EXPENSE_KEYWORDS = ["智能财务", "费控", "资金", "报销", "差旅费", "备用金"];

const RISK_WEIGHT: Record<OARiskLevel, number> = {
  urgent: 3,
  attention: 2,
  normal: 1,
  missing: 0,
};

export function groupOATodo(items: OATodoItem[]): { needsAttention: OATodoItem[]; canBatchLater: OATodoItem[] } {
  const needsAttention: OATodoItem[] = [];
  const canBatchLater: OATodoItem[] = [];
  for (const item of sortOATodoForReview(items)) {
    const level = item.analysis?.riskLevel ?? "missing";
    if (level === "urgent" || level === "attention") needsAttention.push(item);
    else canBatchLater.push(item);
  }
  return { needsAttention, canBatchLater };
}

export function filterExpenseItems(result: OATodoResult): OATodoItem[] {
  return result.items.filter((item) =>
    EXPENSE_KEYWORDS.some((keyword) => item.source.includes(keyword) || item.title.includes(keyword)),
  );
}

export interface OATodoOverview {
  total: number;
  urgentCount: number;
  attentionCount: number;
  pendingAnalysisCount: number;
}

export function summarizeOATodo(result: OATodoResult | null): OATodoOverview {
  if (result === null) {
    return { total: 0, urgentCount: 0, attentionCount: 0, pendingAnalysisCount: 0 };
  }
  return {
    total: result.items.length,
    urgentCount: result.items.filter((item) => item.analysis?.riskLevel === "urgent").length,
    attentionCount: result.items.filter((item) => item.analysis?.riskLevel === "attention").length,
    pendingAnalysisCount: result.items.filter((item) => item.analysisStatus === "analyzing" || item.analysis === null).length,
  };
}

export function sortOATodoForReview(items: OATodoItem[]): OATodoItem[] {
  return [...items].sort((a, b) => {
    const aRisk = RISK_WEIGHT[a.analysis?.riskLevel ?? "missing"];
    const bRisk = RISK_WEIGHT[b.analysis?.riskLevel ?? "missing"];
    if (aRisk !== bRisk) return bRisk - aRisk;
    return (a.time ?? "").localeCompare(b.time ?? "");
  });
}
