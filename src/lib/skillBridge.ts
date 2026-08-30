import { invoke } from "@tauri-apps/api/core";
import { parseSkillJson, type SkillEnvelope } from "./contract";

export interface FetchOutcome {
  skill: string;
  ok: boolean;
  error: string;
}

export async function fetchDataDir(): Promise<string> {
  return invoke<string>("data_dir");
}

export function toggleMaximize(): Promise<void> {
  return invoke<void>("toggle_maximize");
}

export async function selectSkillDirectory(): Promise<string | null> {
  return invoke<string | null>("select_skill_directory");
}

export async function fetchSkills(skills: string[]): Promise<FetchOutcome[]> {
  if (skills.length === 0) return [];
  return invoke<FetchOutcome[]>("fetch_skills", { skills });
}

export async function fetchAllSkills(): Promise<FetchOutcome[]> {
  return invoke<FetchOutcome[]>("fetch_all_skills");
}

export async function readSkillData(skill: string): Promise<SkillEnvelope | null> {
  const text = await invoke<string | null>("read_skill_data", { skill });
  return text === null ? null : parseSkillJson(text);
}

export async function readDailyBriefingReport(): Promise<SkillEnvelope | null> {
  const text = await invoke<string | null>("read_daily_briefing_report");
  return text === null ? null : parseSkillJson(text);
}

export async function listWeeklySummaryDates(): Promise<string[]> {
  return invoke<string[]>("weekly_summary_dates");
}

export async function readWeeklySummaryArchive(date: string): Promise<unknown> {
  const text = await invoke<string | null>("read_weekly_summary_archive", { date });
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function listAuditLogDates(): Promise<string[]> {
  return invoke<string[]>("audit_log_dates");
}

export async function readAuditLog(date: string): Promise<string | null> {
  return invoke<string | null>("read_audit_log", { date });
}

export interface CommandOutcome {
  ok: boolean;
  summary: string;
}

export function approveTodo(input: {
  skill: string;
  title: string;
  comment: string;
  approve: boolean;
  targetRef?: unknown;
  source?: string;
  sender?: string;
  time?: string;
}): Promise<CommandOutcome> {
  return invoke<CommandOutcome>("approve_todo", input);
}

export function toggleSkill(skillId: string, enable: boolean): Promise<CommandOutcome> {
  return invoke<CommandOutcome>("toggle_skill", { skillId, enable });
}

export function installSkill(source: string): Promise<CommandOutcome> {
  return invoke<CommandOutcome>("install_skill", { source });
}

export function uninstallSkill(skillId: string): Promise<CommandOutcome> {
  return invoke<CommandOutcome>("uninstall_skill", { skillId });
}

export function markMailRead(messageId: number | string): Promise<CommandOutcome> {
  return invoke<CommandOutcome>("mark_mail_read", { messageId });
}

export function openMailReply(message: {
  to: string;
  subject: string;
  bodySummary: string;
  replyBasis: string;
  sender: string;
}): Promise<CommandOutcome> {
  return invoke<CommandOutcome>("open_mail_reply", message);
}

export function readSkillEnv(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("read_skill_env");
}

export function writeSkillEnv(values: Record<string, string>): Promise<CommandOutcome> {
  return invoke<CommandOutcome>("write_skill_env", { values });
}

export interface LlmChatOutcome {
  ok: boolean;
  error: string;
  message: Record<string, unknown>;
}

export function llmChat(
  messages: Record<string, unknown>[],
  tools: unknown[],
): Promise<LlmChatOutcome> {
  return invoke<LlmChatOutcome>("llm_chat", { messages, tools });
}

export interface ScheduleStatus {
  ok: boolean;
  action: string;
  label?: string;
  plist?: string;
  configFile?: string;
  configuredTime?: string;
  installed?: boolean;
  loaded?: boolean;
  diagnostics?: unknown;
  [key: string]: unknown;
}

export interface ScheduleCommandResult {
  ok: boolean;
  action?: string;
  time?: string;
  note?: string;
  loaded?: boolean;
  removed?: boolean;
  configFile?: string;
  [key: string]: unknown;
}

export type ScheduleAction = "set-time" | "install" | "reload" | "uninstall";

export function scheduleStatus(): Promise<ScheduleStatus> {
  return invoke<ScheduleStatus>("schedule_status");
}

export function manageSchedule(
  action: ScheduleAction,
  time?: string,
): Promise<ScheduleCommandResult> {
  return invoke<ScheduleCommandResult>("manage_schedule", { action, time });
}

export function setDockBadge(count: number | null): Promise<void> {
  return invoke<void>("set_dock_badge", { count });
}
