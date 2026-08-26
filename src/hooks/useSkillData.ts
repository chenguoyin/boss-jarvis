import { useCallback, useEffect, useRef, useState } from "react";
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

export function useSkillData(sectionSkills: string[], allSkills: string[]) {
  const [envelopes, setEnvelopes] = useState<Record<string, SkillEnvelope | null>>({});
  const [failures, setFailures] = useState<SkillFailure[]>([]);
  const [isReloading, setIsReloading] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
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
  useEffect(() => {
    void loadLocal(allSkills);
  }, [allSkills, loadLocal]);

  useEffect(() => {
    void loadLocal(sectionSkills);
  }, [sectionSkills, loadLocal]);

  const refresh = useCallback(
    async (skills: string[]) => {
      const targets = skills.length > 0 ? skills : sectionSkills;
      if (targets.length === 0) {
        await loadLocal([]);
        return;
      }
      setIsReloading(true);
      setFailures([]);
      setActivity("正在获取，请稍候...");
      try {
        const outcomes = await fetchSkills(targets);
        const failed = outcomes.filter((o) => !o.ok);
        setFailures(failed.map(({ skill, error }) => ({ skill, error })));
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
      setActivity("正在获取，请稍候...");
      try {
        const outcomes = await fetchAllSkills();
        setFailures(outcomes.filter((o) => !o.ok).map(({ skill, error }) => ({ skill, error })));
        await loadLocal(sectionSkillsRef.current);
      } catch (error) {
        setFailures([{ skill: "workbench", error: String(error) }]);
      } finally {
        setIsReloading(false);
        setActivity(null);
      }
    },
    [loadLocal]);

  return { envelopes, failures, isReloading, activity, refresh, refreshAll, loadLocal };
}
