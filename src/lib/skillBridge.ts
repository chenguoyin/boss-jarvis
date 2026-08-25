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
