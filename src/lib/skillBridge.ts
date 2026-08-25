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

export async function fetchSkills(skills: string[]): Promise<FetchOutcome[]> {
  if (skills.length === 0) return [];
  return invoke<FetchOutcome[]>("fetch_skills", { skills });
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
