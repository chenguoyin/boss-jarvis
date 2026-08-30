import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  fetchAllSkills,
  fetchSkills,
  readSkillData,
} from "@/lib/skillBridge";
import type { SkillEnvelope } from "@/lib/contract";

export interface SkillFailure {
  skill: string;
  error: string;
}

export type SkillFetchPhase = "pending" | "running" | "done" | "failed";

export interface SkillFetchStatus {
  skill: string;
  label: string;
  phase: SkillFetchPhase;
}

// 各页面刷新按钮前方的实时步骤文案：优先正在获取项，其次失败数与排队数。
export function buildFetchProgressText(statuses: SkillFetchStatus[]): string {
  const running = statuses.find((status) => status.phase === "running");
  const pendingCount = statuses.filter((status) => status.phase === "pending").length;
  const failedCount = statuses.filter((status) => status.phase === "failed").length;
  if (failedCount > 0) {
    return failedCount === 1 ? "1 项获取失败" : failedCount + " 项获取失败";
  }
  if (running !== undefined) {
    const suffix = pendingCount > 0 ? " · 排队 " + pendingCount + " 项" : "";
    return running.label + " 正在获取…" + suffix;
  }
  if (pendingCount === statuses.length) {
    return statuses.length === 1 ? "排队中…" : "排队中 " + pendingCount + " 项";
  }
  return "已获取 " + statuses.length + " 项";
}

interface FetchProgressPayload {
  skill: string;
  label: string;
  phase: SkillFetchPhase;
}

// 兼容两种壳层 payload 形态：新壳层发 { skill, label, phase } 对象，
// 旧壳层发 [skill, label, phase, detail] 元组；字段缺失时回退 skill id，避免界面出现 undefined。
function normalizeProgressPayload(payload: unknown): FetchProgressPayload | null {
  let skill: unknown;
  let label: unknown;
  let phase: unknown;
  if (Array.isArray(payload)) {
    [skill, label, phase] = payload;
  } else if (payload !== null && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    skill = record.skill;
    label = record.label;
    phase = record.phase;
  } else {
    return null;
  }
  if (typeof skill !== "string" || skill === "") return null;
  const normalizedPhase: SkillFetchPhase =
    phase === "running" || phase === "done" || phase === "failed" ? phase : "pending";
  return {
    skill,
    label: typeof label === "string" && label !== "" ? label : skill,
    phase: normalizedPhase,
  };
}

// 老板视角：把底层脚本错误翻译成可决策的提示，不暴露堆栈细节。
function humanizeError(skill: string, raw: string): string {
  const error = raw.trim();
  const label = skill === "workbench" ? "工作台" : skill;
  if (error.includes("ERR_INTERNET_DISCONNECTED")) {
    return `${label}：网络未连接，请检查网络后重试。`;
  }
  if (/timeout|timed out|超时/i.test(error)) {
    return `${label}：源系统响应超时，已保留上次数据，可稍后重试。`;
  }
  if (error.includes("无法启动 node")) {
    return `${label}：本机 Node 运行环境未就绪，请在系统配置检查运行环境。`;
  }
  if (error.includes("输出不是 JSON")) {
    return `${label}：数据源返回异常，已保留上次数据。`;
  }
  const compact = error.length > 160 ? error.slice(0, 160) + "…" : error;
  return compact === "" ? `${label}：数据未获取。` : `${label}：${compact}`;
}

export function useSkillData(sectionSkills: string[], allSkills: string[]) {
  const [envelopes, setEnvelopes] = useState<Record<string, SkillEnvelope | null>>({});
  const [failures, setFailures] = useState<SkillFailure[]>([]);
  const [isReloading, setIsReloading] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, SkillFetchStatus>>({});
  const sectionSkillsRef = useRef(sectionSkills);
  useEffect(() => {
    sectionSkillsRef.current = sectionSkills;
  }, [sectionSkills]);

  // 合并而非替换：分区切换时保留其它分区的本地缓存，导航徽标不闪断。
  const loadLocal = useCallback(async (skills: string[]) => {
    const entries = await Promise.all(
      skills.map(async (skill) => [skill, await readSkillData(skill)] as const),
    );
    setEnvelopes((current) => ({ ...current, ...Object.fromEntries(entries) }));
  }, []);

  // 启动只读本地契约 JSON，不触发任何 Skill 执行，首屏不转圈。
  // allSkills 已覆盖各分区，切换分区不再重复读同一批文件。
  useEffect(() => {
    void loadLocal(allSkills);
  }, [allSkills, loadLocal]);

  // Rust 在每个 Skill 开始/结束时发 skill-fetch-progress；这里维护逐项实时状态。
  useEffect(() => {
    const unlisten = listen<unknown>("skill-fetch-progress", (event) => {
      const normalized = normalizeProgressPayload(event.payload);
      if (normalized === null) return;
      setStatuses((current) => ({
        ...current,
        [normalized.skill]: normalized,
      }));
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  const refresh = useCallback(
    async (skills: string[]) => {
      const targets = skills.length > 0 ? skills : sectionSkills;
      if (targets.length === 0) {
        await loadLocal([]);
        return;
      }
      setIsReloading(true);
      setFailures([]);
      setStatuses({});
      setActivity(targets.length === 1 ? "正在获取 1 项数据…" : `正在获取 ${targets.length} 项数据…`);
      try {
        const outcomes = await fetchSkills(targets);
        const failed = outcomes.filter((o) => !o.ok);
        setFailures(failed.map(({ skill, error }) => ({ skill, error: humanizeError(skill, error) })));
        await loadLocal(targets);
      } catch (error) {
        setFailures([{ skill: "workbench", error: String(error) }]);
      } finally {
        setIsReloading(false);
        setActivity(null);
      }
    },
    [sectionSkills, loadLocal],
  );

  // 顶栏手动刷新与自动刷新一致：全量执行 Skill，再回读当前分区数据。
  const refreshAll = useCallback(async () => {
      setIsReloading(true);
      setFailures([]);
      setStatuses({});
      setActivity("正在获取全部数据…");
      try {
        const outcomes = await fetchAllSkills();
        setFailures(outcomes.filter((o) => !o.ok).map(({ skill, error }) => ({ skill, error: humanizeError(skill, error) })));
        await loadLocal(sectionSkillsRef.current);
      } catch (error) {
        setFailures([{ skill: "workbench", error: String(error) }]);
      } finally {
        setIsReloading(false);
        setActivity(null);
      }
    },
    [loadLocal]);

  return {
    envelopes,
    failures,
    isReloading,
    activity,
    statuses,
    refresh,
    refreshAll,
    loadLocal,
  };
}
