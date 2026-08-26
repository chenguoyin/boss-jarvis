import type { ManagedSkill } from "./skillManager";
import { nowDateTimeText } from "./datetime";

export type ConfirmationKind =
  | "skillEnable"
  | "skillDisable"
  | "skillInstall"
  | "skillUninstall";

export type ConfirmationState = "pending" | "executed" | "cancelled";

export interface PendingAction {
  id: string;
  kind: ConfirmationKind;
  title: string;
  basis: string;
  skillId: string;
  enable: boolean;
  source: string;
  createdAt: string;
  state: ConfirmationState;
  summary: string | null;
}

function kindTitle(kind: ConfirmationKind): string {
  if (kind === "skillEnable") return "启用 Skill";
  if (kind === "skillDisable") return "停用 Skill";
  if (kind === "skillInstall") return "安装 Skill";
  return "卸载 Skill";
}

function nowText(): string {
  return nowDateTimeText();
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
    source: "",
    createdAt: nowText(),
    state: "pending",
    summary: null,
  };
}

export function createSkillInstallAction(source: string): PendingAction {
  return {
    id: crypto.randomUUID(),
    kind: "skillInstall",
    title: "安装 Skill：" + source,
    basis: "安装源目录：" + source + "（安装后启用，可稍后停用）",
    skillId: source,
    enable: true,
    source,
    createdAt: nowText(),
    state: "pending",
    summary: null,
  };
}

export function createSkillUninstallAction(skill: ManagedSkill): PendingAction {
  return {
    id: crypto.randomUUID(),
    kind: "skillUninstall",
    title: "卸载 Skill：" + skill.name,
    basis: "卸载对象：" + skill.id + "；代码归档，不删除历史日志",
    skillId: skill.id,
    enable: false,
    source: "",
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
