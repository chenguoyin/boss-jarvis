import type { ManagedSkill } from "./skillManager";

export type ConfirmationKind =
  | "skillEnable"
  | "skillDisable";

export type ConfirmationState = "pending" | "executed" | "cancelled";

export interface PendingAction {
  id: string;
  kind: ConfirmationKind;
  title: string;
  basis: string;
  skillId: string;
  enable: boolean;
  createdAt: string;
  state: ConfirmationState;
  summary: string | null;
}

function kindTitle(kind: ConfirmationKind): string {
  return kind === "skillEnable" ? "启用 Skill" : "停用 Skill";
}

function nowText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function createSkillToggleAction(skill: ManagedSkill): PendingAction {
  const enable = !skill.enabledOnDisk;
  return {
    id: crypto.randomUUID(),
    kind: enable ? "skillEnable" : "skillDisable",
    title: (enable ? "启用：" : "停用：") + skill.name,
    basis: "当前状态：" + (skill.lifecycleStatus === "" ? "未获取" : lifecycleLabel(skill.lifecycleStatus)),
    skillId: skill.id,
    enable,
    createdAt: nowText(),
    state: "pending",
    summary: null,
  };
}

function lifecycleLabel(status: string): string {
  if (status === "enabled") return "启用";
  if (status === "disabled") return "停用";
  if (status === "installed") return "已安装";
  return status;
}

export function pendingOnly(actions: PendingAction[]): PendingAction[] {
  return actions.filter((action) => action.state === "pending");
}

export function settledOnly(actions: PendingAction[]): PendingAction[] {
  return actions.filter((action) => action.state !== "pending");
}

export function kindLabel(kind: ConfirmationKind): string {
  return kindTitle(kind);
}

export function stateLabel(state: ConfirmationState): string {
  if (state === "pending") return "待确认";
  if (state === "executed") return "已确认";
  return "已跳过";
}

export function stateLevel(state: ConfirmationState): "attention" | "normal" | "missing" {
  if (state === "pending") return "attention";
  if (state === "executed") return "normal";
  return "missing";
}
