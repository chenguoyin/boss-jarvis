// Skill 输出契约：壳与 Skill 的唯一接口，字段与语义双端一致。
// 与 docs/skill-output-contract.md 一一对应，改动契约前先改文档。

export type Level = "urgent" | "attention" | "normal";
export type Mode = "read_only" | "write_pending" | "draft_only";

export interface ContractItem {
  title?: string;
  source?: string;
  time?: string;
  level?: Level;
  sender?: string;
  amount?: number;
  basis?: string;
  suggestedAction?: string;
  [key: string]: unknown;
}

export interface SkillEnvelope {
  ok: boolean;
  skill: string;
  mode: Mode;
  sourceSystem?: string;
  fetchedAt?: string;
  count?: number;
  homepageItems?: ContractItem[];
  items?: ContractItem[];
  missingFields?: string[];
  unavailableSources?: string[];
  bossView?: Record<string, unknown>;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 解析 Skill JSON；缺失或解析失败返回 null，UI 显示“未获取”，不猜测数据。
export function parseSkillJson(text: string): SkillEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return null;
    const mode = parsed.mode;
    if (mode !== "read_only" && mode !== "write_pending" && mode !== "draft_only") {
      return null;
    }
    return parsed as SkillEnvelope;
  } catch {
    return null;
  }
}

// “未获取”判定的唯一出口：字段为 undefined / null 即未获取，禁止填 0 或空串冒充。
export function isMissing(value: unknown): boolean {
  return value === undefined || value === null;
}
