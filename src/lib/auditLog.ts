export interface AuditLogEntry {
  auditId: string;
  timestampText: string;
  displayTime: string;
  actor: string;
  skill: string;
  sourceSystem: string;
  actionType: string;
  mode: string;
  status: string;
  targetTitle: string;
  resultSummary: string;
  requestSummary: string;
}

export interface AuditLogResult {
  dates: string[];
  selectedDate: string;
  entries: AuditLogEntry[];
  onSelectDate: (date: string) => void;
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
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// JSONL 只读解析；单行坏行跳过，不阻塞其余留痕展示。
export function parseAuditLog(jsonl: string | null): AuditLogEntry[] {
  if (jsonl === null || jsonl === "") return [];
  const entries: AuditLogEntry[] = [];
  for (const line of jsonl.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const row = record(JSON.parse(line));
      entries.push({
        auditId: text(row.auditId) || "未获取",
        timestampText: text(row.timestamp),
        displayTime: fullTime(text(row.timestamp)),
        actor: text(row.actor) || "未获取",
        skill: text(row.skill) || "未获取",
        sourceSystem: text(row.sourceSystem),
        actionType: text(row.actionType) || "unspecified",
        mode: text(row.mode) || "未获取",
        status: text(row.status) || "未获取",
        targetTitle: text(record(row.target).title),
        resultSummary: text(row.resultSummary),
        requestSummary: text(row.requestSummary),
      });
    } catch {
      continue;
    }
  }
  return entries.reverse();
}
