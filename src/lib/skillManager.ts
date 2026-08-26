import { isMissing, type SkillEnvelope } from "./contract";
import { formatDateTime } from "./datetime";

export interface ManagedSkill {
  id: string;
  name: string;
  description: string;
  lifecycleStatus: string;
  runtimeStatus: string;
  enabledOnDisk: boolean;
}

export interface SkillManagerResult {
  count: number;
  enabledCount: number;
  items: ManagedSkill[];
  fetchedAt: string;
}

type Level = "normal" | "attention" | "missing";

export function lifecycleTitle(status: string): string {
  if (status === "enabled") return "启用";
  if (status === "disabled") return "停用";
  if (status === "installed") return "已安装";
  return status === "" ? "未获取" : status;
}

export function lifecycleLevel(status: string): Level {
  if (status === "enabled") return "normal";
  if (status === "installed") return "attention";
  return "missing";
}

export function displayOrMissing(value: unknown): string {
  if (isMissing(value)) return "未获取";
  if (typeof value === "string" && value === "") return "未获取";
  return String(value);
}

export function parseSkillManager(envelope: SkillEnvelope): SkillManagerResult {
  const raw = envelope.items ?? [];
  const items: ManagedSkill[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = record.id;
    if (typeof id !== "string" || id === "") continue;
    const runtime = record.runtime;
    const runtimeStatus =
      typeof runtime === "object" && runtime !== null
        ? String((runtime as Record<string, unknown>).status ?? "")
        : "";
    items.push({
      id,
      name: typeof record.name === "string" && record.name !== "" ? record.name : id,
      description: typeof record.description === "string" ? record.description : "",
      lifecycleStatus: typeof record.lifecycleStatus === "string" ? record.lifecycleStatus : "",
      runtimeStatus: runtimeStatus === "null" ? "" : runtimeStatus,
      enabledOnDisk: record.enabledOnDisk === true,
    });
  }
  return {
    count: typeof envelope.count === "number" ? envelope.count : items.length,
    enabledCount: items.filter((item) => item.lifecycleStatus === "enabled").length,
    items,
    fetchedAt: typeof envelope.fetchedAt === "string" && envelope.fetchedAt !== ""
      ? formatDateTime(envelope.fetchedAt)
      : "未获取",
  };
}
