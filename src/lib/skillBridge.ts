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

export function readMailSignature(): Promise<string> {
  return invoke<string>("read_mail_signature");
}

export function writeMailSignature(value: string): Promise<CommandOutcome> {
  return invoke<CommandOutcome>("write_mail_signature", { value });
}

/** 打开虹翼数智「部门看板」：Rust 侧新建/复用专用 WebView 窗口并自动完成 OA 单点（见 docs/hongyi-dashboard-in-app.md）。 */
export function openHongyiDashboard(): Promise<string> {
  return invoke<string>("open_hongyi_dashboard");
}

/** 在 App 内容区内显示配置的虹翼 URL 页面（面板窗口自跑 OA 单点后整页直达；URL 由 HONGYI_EXTERNAL_URL 配置，默认部门看板）。 */
export function openHongyiInApp(): Promise<string> {
  return invoke<string>("open_hongyi_in_app");
}

/** 打开前上报「虹翼外链」分区内容区占位左上角（CSS 逻辑 px），面板窗口据此与其它分区内容对齐。 */
export function setHongyiSlot(left: number, top: number): Promise<void> {
  return invoke<void>("hongyi_embed_set_slot", { left, top });
}

/** 地址栏跳转：内嵌页直达同源目标（会话有效则直接导航，会话失效自动补跑 OA 单点后直达）。 */
export function hongyiEmbedNavigate(target: string): Promise<string> {
  return invoke<string>("hongyi_embed_navigate", { target });
}

/** 内嵌页当前实际 URL（地址栏同步用；无内嵌页返回 null）。 */
export function hongyiEmbedCurrentUrl(): Promise<string | null> {
  return invoke<string | null>("hongyi_embed_current_url");
}

/** 刷新内嵌页。 */
export function hongyiEmbedReload(): Promise<void> {
  return invoke<void>("hongyi_embed_reload");
}

/** 关闭 App 主窗口内嵌的虹翼页面（切换分区时由前端调用）。 */
export function closeHongyiEmbed(): Promise<void> {
  return invoke<void>("close_hongyi_embed");
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

export function openHongyiWithAuth(): Promise<void> {
  return invoke<void>("open_hongyi_with_auth");
}
