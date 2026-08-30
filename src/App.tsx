import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NavigationRail from "./components/NavigationRail";
import TopBar from "./components/TopBar";
import PlaceholderView from "./components/PlaceholderView";
import SkillDataView from "./components/SkillDataView";
import ConfirmationCenterView from "./components/ConfirmationCenterView";
import SettingsView from "./components/SettingsView";
import AssistantChatPanel from "./components/AssistantChatPanel";
import { parseCompanyMail } from "./lib/mail";
import { parseDailyBriefing } from "./lib/dailyBriefing";
import AboutDialog from "./components/AboutDialog";
import HomeModuleCustomizer from "./components/HomeModuleCustomizer";
import { Bell, RefreshCw, SquareDashed, X } from "lucide-react";
import { appSections, confirmationSection, sectionById, settingsSection } from "./lib/sections";
import { useSkillData } from "./hooks/useSkillData";
import {
  approveTodo,
  listAuditLogDates,
  listWeeklySummaryDates,
  installSkill,
  markMailRead,
  openMailReply,
  readAuditLog,
  readDailyBriefingReport,
  readSkillData,
  readWeeklySummaryArchive,
  selectSkillDirectory,
  setDockBadge,
  toggleSkill,
  toggleMaximize,
  uninstallSkill,
} from "./lib/skillBridge";
import { parseOATodo } from "./lib/oaTodo";
import type { AssistantRuntime } from "./lib/assistantChat";
import {
  createSkillInstallAction,
  createSkillToggleAction,
  createSkillUninstallAction,
  pendingOnly,
  type PendingAction,
} from "./lib/confirmationCenter";
import type { SkillEnvelope } from "./lib/contract";
import type { MailMessage } from "./lib/mail";
import type { OATodoItem } from "./lib/oaTodo";
import type { ManagedSkill } from "./lib/skillManager";
import {
  applyFontSizes,
  applyTheme,
  computeFontSizes,
  DEFAULT_BODY_FONT_SIZE,
  DEFAULT_TITLE_FONT_SIZE,
  getBodyFontSize as loadBodyFontSize,
  getTheme as loadTheme,
  getTitleFontSize as loadTitleFontSize,
  setBodyFontSize as persistBodyFontSize,
  setTheme as persistTheme,
  setTitleFontSize as persistTitleFontSize,
  getAutoRefreshEnabled as loadAutoRefreshEnabled,
  getAutoRefreshInterval as loadAutoRefreshInterval,
  setAutoRefreshEnabled as persistAutoRefreshEnabled,
  setAutoRefreshInterval as persistAutoRefreshInterval,
  getHomeModuleConfig,
  setHomeModuleConfig,
  type HomeModuleConfig,
  type HomeModuleId,
  type Theme,
} from "./lib/config";

export default function App() {
  const [sectionId, setSectionId] = useState("dashboard");
  const appStartedAtRef = useRef(Date.now());
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const section = sectionById(sectionId);
  const sectionSkills = useMemo(() => section?.skills ?? [], [section]);
  const fetchableSkills = useMemo(
    () => Array.from(new Set(appSections.flatMap((entry) => entry.skills))),
    [],
  );
  const {
    envelopes,
    failures,
    isReloading,
    activity,
    statuses: skillStatuses,
    refresh,
    refreshAll,
  } = useSkillData(sectionSkills, fetchableSkills);
  const [briefingEnvelope, setBriefingEnvelope] = useState<SkillEnvelope | null>(null);
  const [briefingNotice, setBriefingNotice] = useState<{ count: number; items: string[] } | null>(null);
  const briefingNoticeSignatureRef = useRef("");
  const [weeklyRaw, setWeeklyRaw] = useState<unknown>(null);
  const [weeklyDates, setWeeklyDates] = useState<string[]>([]);
  const [weeklyDate, setWeeklyDate] = useState("");
  const [auditDates, setAuditDates] = useState<string[]>([]);
  const [auditDate, setAuditDate] = useState("");
  const [auditJsonl, setAuditJsonl] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [titleFontSize, setTitleFontSize] = useState(loadTitleFontSize);
  const [bodyFontSize, setBodyFontSize] = useState(loadBodyFontSize);
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [executing, setExecuting] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [oaApprovalStatus, setOaApprovalStatus] = useState<string | null>(null);
  const [mailReadStatus, setMailReadStatus] = useState<string | null>(null);
  const [mailReplyStatus, setMailReplyStatus] = useState<string | null>(null);
  const [markingReadIds, setMarkingReadIds] = useState<Set<number | string>>(new Set());
  const [replyingIds, setReplyingIds] = useState<Set<number | string>>(new Set());
  const [hiddenMailIds, setHiddenMailIds] = useState<Set<number | string>>(new Set());
  const [autoRefreshEnabled, setAutoRefreshEnabledState] = useState(loadAutoRefreshEnabled);
  const [autoRefreshInterval, setAutoRefreshIntervalState] = useState(loadAutoRefreshInterval);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [nextAutoRefreshAt, setNextAutoRefreshAt] = useState<number | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [homeModuleConfig, setHomeModuleConfigState] = useState<HomeModuleConfig>(getHomeModuleConfig);

  useEffect(() => {
    if (sectionId !== "briefing") return;
    void readDailyBriefingReport().then(setBriefingEnvelope);
  }, [sectionId, reloadCount]);

  // 启动与每次刷新后把“紧急优先”条数同步到 Dock 角标，并在出现新的紧急事项时弹应用内提醒。
  useEffect(() => {
    let cancelled = false;
    void readDailyBriefingReport()
      .then((envelope) => (envelope === null ? null : parseDailyBriefing(envelope)))
      .then((briefing) => {
        if (cancelled) return;
        const count = briefing?.mustDoNow ?? 0;
        void setDockBadge(count > 0 ? count : null).catch(() => {});
        if (briefing === null || count === 0) {
          briefingNoticeSignatureRef.current = "";
          return;
        }
        const items = briefing.mustDoItems.slice(0, 3).map((item) => item.title);
        const signature = `${count}|${items.join("|")}`;
        if (signature !== briefingNoticeSignatureRef.current) {
          briefingNoticeSignatureRef.current = signature;
          setBriefingNotice({ count, items });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  useEffect(() => {
    if (sectionId !== "weekly") return;
    void listWeeklySummaryDates().then((dates) => {
      setWeeklyDates(dates);
      setWeeklyDate((current) => (current !== "" && dates.includes(current) ? current : (dates[0] ?? "")));
    });
  }, [sectionId, reloadCount]);

  useEffect(() => {
    if (sectionId !== "weekly" || weeklyDate === "") return;
    if (weeklyDates[0] === weeklyDate) {
      void readSkillData("weekly-summary").then(setWeeklyRaw);
      return;
    }
    void readWeeklySummaryArchive(weeklyDate).then(setWeeklyRaw);
  }, [sectionId, weeklyDate, weeklyDates, reloadCount]);

  useEffect(() => {
    if (sectionId !== "audit") return;
    void listAuditLogDates().then((dates) => {
      setAuditDates(dates);
      setAuditDate((current) => (current !== "" && dates.includes(current) ? current : (dates[0] ?? "")));
    });
  }, [sectionId, reloadCount]);

  useEffect(() => {
    if (sectionId !== "audit" || auditDate === "") return;
    void readAuditLog(auditDate).then(setAuditJsonl);
  }, [sectionId, auditDate, reloadCount]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(theme, media);
  }, [theme]);

  useEffect(() => {
    applyFontSizes(computeFontSizes(titleFontSize, bodyFontSize));
  }, [titleFontSize, bodyFontSize]);

  const handleThemeChange = useCallback((next: Theme) => {
    persistTheme(next);
    setThemeState(next);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isReloading) return;
    await refreshAll();
    setReloadCount((count) => count + 1);
    setLastRefreshedAt(Date.now());
  }, [refreshAll, isReloading]);

  const handleRefreshRef = useRef(handleRefresh);
  useEffect(() => {
    handleRefreshRef.current = handleRefresh;
  }, [handleRefresh]);

  // 顶栏/助手/全局 ⌘K，Esc 关闭弹层；与 legacy 快捷键一致。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setAssistantOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setAssistantOpen(false);
        setAboutOpen(false);
        setCustomizerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) {
      setNextAutoRefreshAt(null);
      return;
    }
    // 首个自动刷新周期从启动后算起，启动瞬间只读本底 JSON，不跑 Skill。
    const due = (lastRefreshedAt ?? appStartedAtRef.current) + autoRefreshInterval * 60_000;
    setNextAutoRefreshAt(due);
    const delay = Math.max(due - Date.now(), 0);
    const timer = window.setTimeout(() => {
      void handleRefreshRef.current();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [autoRefreshEnabled, autoRefreshInterval, lastRefreshedAt, handleRefreshRef]);

  const updateHomeModuleConfig = useCallback((next: HomeModuleConfig) => {
    setHomeModuleConfig(next);
    setHomeModuleConfigState(next);
  }, []);

  const updateHomeModuleOrder = useCallback(
    (order: HomeModuleId[]) => {
      const next = { order, hidden: homeModuleConfig.hidden };
      setHomeModuleConfig(next);
      setHomeModuleConfigState(next);
    },
    [homeModuleConfig.hidden],
  );

  const oaEnvelope = envelopes["oa-todo"] ?? null;
  const mailEnvelope = envelopes["changhong-mail"] ?? null;
  const oaTodoResult = useMemo(() => parseOATodo(oaEnvelope), [oaEnvelope]);
  const mailResult = useMemo(() => parseCompanyMail(mailEnvelope), [mailEnvelope]);
  const badgeFor = useCallback((id: string) => {
    if (id === "oa-todo") return oaTodoResult?.total;
    if (id === "mail") return mailResult?.needsReplyCount;
    return undefined;
  }, [oaTodoResult, mailResult]);

  const applyActionOutcome = useCallback((id: string, ok: boolean, summary: string) => {
    setActions((current) =>
      current.map((action) =>
        action.id === id && action.state === "pending"
          ? { ...action, state: ok ? "executed" : "pending", summary }
          : action,
      ),
    );
  }, []);

  const refreshSkills = useCallback(async () => {
    await refresh(["skill-manager"]);
    setReloadCount((count) => count + 1);
  }, [refresh]);

  // 分区头部刷新：只重取本分区 Skill；审计/确认中心仅回读本地数据。
  const handleSectionRefresh = useCallback(async () => {
    if (sectionId === "audit" || sectionId === "confirmation") {
      setReloadCount((count) => count + 1);
      return;
    }
    if (isReloading || sectionSkills.length === 0) return;
    await refresh(sectionSkills);
    setReloadCount((count) => count + 1);
    setLastRefreshedAt(Date.now());
  }, [sectionId, sectionSkills, refresh, isReloading]);

  const executeActions = useCallback(async (ids: string[]) => {
    const pending = pendingOnly(actions).filter((action) => ids.includes(action.id));
    if (pending.length === 0 || executing) return;
    setExecuting(true);
    try {
      for (const [offset, action] of pending.entries()) {
        const remaining = pending.length - offset - 1;
        setProgressText(
          pending.length === 1
            ? `正在执行：${action.title}`
            : `正在执行第 ${offset + 1}/${pending.length} 项：${action.title} · 还剩 ${remaining} 条`,
        );
        const outcome =
          action.kind === "skillInstall"
            ? await installSkill(action.source)
            : action.kind === "skillUninstall"
              ? await uninstallSkill(action.skillId)
              : await toggleSkill(action.skillId, action.enable);
        applyActionOutcome(action.id, outcome.ok, outcome.summary);
      }
    } finally {
      setProgressText("");
      setExecuting(false);
    }
    await refreshSkills();
  }, [actions, executing, applyActionOutcome, refreshSkills]);

  const handleConfirm = useCallback((id: string) => {
    void executeActions([id]);
  }, [executeActions]);

  const handleConfirmBatch = useCallback((ids: string[]) => {
    void executeActions(ids);
  }, [executeActions]);

  const handleSkip = useCallback((id: string) => {
    setActions((current) =>
      current.map((action) =>
        action.id === id && action.state === "pending" ? { ...action, state: "cancelled" } : action,
      ),
    );
  }, []);

  const handleSkipBatch = useCallback((ids: string[]) => {
    setActions((current) =>
      current.map((action) =>
        ids.includes(action.id) && action.state === "pending"
          ? { ...action, state: "cancelled" }
          : action,
      ),
    );
  }, []);

  const handleOaAction = useCallback(async (item: OATodoItem, comment: string, approve: boolean) => {
    setOaApprovalStatus(`正在提交审批：${item.title}`);
    const outcome = await approveTodo({
      skill: "oa-todo",
      title: item.title,
      comment,
      approve,
      targetRef: item.targetRef,
      source: item.source,
      sender: item.sender || item.creator,
      time: item.time,
    })
      .catch((error: unknown) => ({ ok: false, summary: `命令执行失败：${String(error)}` }));
    setOaApprovalStatus(outcome.summary);
    if (outcome.ok) {
      await refresh(["oa-todo"]);
      setReloadCount((count) => count + 1);
    }
  }, [refresh]);

  const handleOaApprove = useCallback((item: OATodoItem, comment: string) => {
    void handleOaAction(item, comment, true);
  }, [handleOaAction]);

  const handleOaReject = useCallback((item: OATodoItem, comment: string) => {
    void handleOaAction(item, comment, false);
  }, [handleOaAction]);

  const handleMarkMailRead = useCallback((message: MailMessage) => {
    if (markingReadIds.has(message.id)) return;
    setMarkingReadIds((current) => new Set(current).add(message.id));
    setMailReadStatus("正在同步已读状态…");
    void markMailRead(String(message.id))
      .catch((error: unknown) => ({ ok: false, summary: `命令执行失败：${String(error)}` }))
      .then((outcome) => {
      setMarkingReadIds((current) => {
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });
      setMailReadStatus(outcome.summary);
      if (outcome.ok) {
        setHiddenMailIds((current) => new Set(current).add(message.id));
      }
    });
  }, [markingReadIds]);

  const handleOpenMailReply = useCallback((message: MailMessage) => {
    if (replyingIds.has(message.id)) return;
    setReplyingIds((current) => new Set(current).add(message.id));
    setMailReplyStatus("正在生成回复草稿…");
    void openMailReply({
      to: message.sender,
      subject: message.subject,
      bodySummary: message.bodySummary,
      replyBasis: message.replyBasis,
      sender: message.sender,
    })
      .catch((error: unknown) => ({ ok: false, summary: `命令执行失败：${String(error)}` }))
      .then((outcome) => {
      setReplyingIds((current) => {
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });
      setMailReplyStatus(outcome.summary);
      if (outcome.ok) {
        handleMarkMailRead(message);
      }
    });
  }, [handleMarkMailRead, replyingIds]);

  const assistantRuntimeRef = useRef<AssistantRuntime | null>(null);

  const runSkillForAssistant = useCallback(async (skill: string) => {
    try {
      await refresh([skill]);
      setReloadCount((count) => count + 1);
      return true;
    } catch {
      return false;
    }
  }, [refresh]);

  const replyMailForAssistant = useCallback(
    async (mailId: number | string): Promise<{ ok: boolean; summary: string } | null> => {
      const text = await readSkillData("changhong-mail");
      const envelope = text;
      const result = parseCompanyMail(envelope);
      const message = result?.items.find((item) => item.id === mailId);
      if (!message) return null;
      return new Promise((resolve) => {
        setReplyingIds((current) => new Set(current).add(message.id));
        void openMailReply({
          to: message.sender,
          subject: message.subject,
          bodySummary: message.bodySummary,
          replyBasis: message.replyBasis,
          sender: message.sender,
        })
          .catch((error: unknown) => ({ ok: false, summary: `命令执行失败：${String(error)}` }))
          .then((outcome) => {
            setReplyingIds((current) => {
              const next = new Set(current);
              next.delete(message.id);
              return next;
            });
            setMailReplyStatus(outcome.summary);
            resolve({ ok: outcome.ok, summary: outcome.summary });
          });
      });
    },
    [],
  );

  const assistantRuntime: AssistantRuntime = {
    sections: [...appSections.map((s) => s.title), settingsSection.title, confirmationSection.title],
    skills: ["oa-todo", "reminder-center", "changhong-mail", "oa-schedule", "skill-manager", "daily-briefing", "boss-cockpit", "hongyi-today-metrics", "hongyi-business-overview", "weekly-summary"],
    currentSection: section?.title ?? "驾驶舱",
    onOpenSection: (target) => {
      const match = [ ...appSections, settingsSection, confirmationSection ].find((s) => s.title === target);
      if (match) setSectionId(match.id);
    },
    onRunSkill: runSkillForAssistant,
    onReplyMail: replyMailForAssistant,
  };
  assistantRuntimeRef.current = assistantRuntime;

  const handleToggleSkill = useCallback((skill: ManagedSkill) => {
    const action = createSkillToggleAction(skill);
    if (actions.some((existing) => existing.skillId === skill.id && existing.state === "pending"
      && (existing.kind === "skillEnable" || existing.kind === "skillDisable"))) return;
    setActions((current) => [...current, action]);
    setSectionId("confirmation");
  }, [actions]);

  const handleInstallSkill = useCallback(async () => {
    const source = await selectSkillDirectory();
    if (source === null || source === "") return;
    const action = createSkillInstallAction(source);
    setActions((current) =>
      current.some((existing) => existing.state === "pending" && existing.kind === "skillInstall" && existing.source === source)
        ? current
        : [...current, action],
    );
    setSectionId("confirmation");
  }, []);

  const handleUninstallSkill = useCallback((skill: ManagedSkill) => {
    setActions((current) =>
      current.some((existing) => existing.state === "pending" && existing.kind === "skillUninstall" && existing.skillId === skill.id)
        ? current
        : [...current, createSkillUninstallAction(skill)],
    );
    setSectionId("confirmation");
  }, []);

  const pendingSkillIds = useMemo(
    () => new Set(pendingOnly(actions).map((action) => action.skillId)),
    [actions],
  );

  return (
    <div className="jv-shell">
      <NavigationRail
        selectedId={sectionId}
        onSelect={setSectionId}
        badgeFor={badgeFor}
        onShowAbout={() => setAboutOpen(true)}
      />

      <div className="jv-rail-divider" />

      <div className="jv-main">
        <TopBar
          sectionId={sectionId}
          theme={theme}
          onThemeChange={handleThemeChange}
          onOpenSettings={() => setSectionId("settings")}
          onRefresh={() => {
            void handleRefresh();
          }}
          isReloading={isReloading}
          activity={activity}
          failures={failures}
          lastRefreshedAt={lastRefreshedAt}
          nextAutoRefreshAt={nextAutoRefreshAt}
          onOpenAssistant={() => setAssistantOpen(true)}
          onToggleMaximize={() => {
            void toggleMaximize();
          }}
          onOpenCustomizer={() => setCustomizerOpen(true)}
        />
        <main className="jv-content">
          {sectionId === "confirmation" ? (
            <>
              <div className="jv-section-header">
                <div className="jv-title">确认中心</div>
                <button
                  type="button"
                  className="jv-icon-plain"
                  title="重新加载 Skill 数据"
                  aria-label="刷新确认中心"
                  onClick={() => setReloadCount((count) => count + 1)}
                  disabled={isReloading}
                >
                  <RefreshCw size={15} strokeWidth={2} className={isReloading ? "jv-refresh-spin" : undefined} />
                </button>
              </div>
              <ConfirmationCenterView
                actions={actions}
                executing={executing}
                progressText={progressText}
                onConfirm={handleConfirm}
                onSkip={handleSkip}
                onConfirmBatch={handleConfirmBatch}
                onSkipBatch={handleSkipBatch}
              />
            </>
          ) : sectionId === "settings" ? (
            <SettingsView
              theme={theme}
              onThemeChange={handleThemeChange}
              titleFontSize={titleFontSize}
              bodyFontSize={bodyFontSize}
              onTitleFontSizeChange={(value) => {
                setTitleFontSize(value);
                persistTitleFontSize(value);
              }}
              onBodyFontSizeChange={(value) => {
                setBodyFontSize(value);
                persistBodyFontSize(value);
              }}
              onResetFontSizes={() => {
                setTitleFontSize(DEFAULT_TITLE_FONT_SIZE);
                setBodyFontSize(DEFAULT_BODY_FONT_SIZE);
                persistTitleFontSize(DEFAULT_TITLE_FONT_SIZE);
                persistBodyFontSize(DEFAULT_BODY_FONT_SIZE);
              }}
              autoRefreshEnabled={autoRefreshEnabled}
              autoRefreshInterval={autoRefreshInterval}
              onAutoRefreshChange={(enabled, interval) => {
                persistAutoRefreshEnabled(enabled);
                persistAutoRefreshInterval(interval);
                setAutoRefreshEnabledState(enabled);
                setAutoRefreshIntervalState(interval);
                setLastRefreshedAt((current) => (current === null ? Date.now() : current));
              }}
            />
          ) : section ? (
            <SkillDataView
              section={section}
              envelopes={envelopes}
              failures={failures}
              briefingEnvelope={briefingEnvelope}
              weekly={{
                raw: weeklyRaw,
                dates: weeklyDates,
                selectedDate: weeklyDate,
                onSelectDate: setWeeklyDate,
              }}
              audit={{
                dates: auditDates,
                selectedDate: auditDate,
                jsonl: auditJsonl,
                onSelectDate: setAuditDate,
              }}
              isRunning={isReloading}
              onSectionRefresh={handleSectionRefresh}
              onBriefingApprovalDone={() => {}}
              fetchStatuses={skillStatuses}
              onNavigate={setSectionId}
              oa={{
                approvalStatus: oaApprovalStatus,
                onApprove: handleOaApprove,
                onReject: handleOaReject,
              }}
              mail={{
                readStatus: mailReadStatus,
                replyStatus: mailReplyStatus,
                replyingIds: replyingIds,
                hiddenIds: hiddenMailIds,
                onMarkRead: handleMarkMailRead,
                onOpenReply: handleOpenMailReply,
              }}
              skills={{
                onToggle: handleToggleSkill,
                onInstall: () => {
                  void handleInstallSkill();
                },
                onUninstall: handleUninstallSkill,
                pendingSkillIds: pendingSkillIds,
              }}
              homeModules={homeModuleConfig}
              onHomeModuleOrderChange={updateHomeModuleOrder}
            />
          ) : (
            <PlaceholderView
              section={{ id: "unknown", title: "未知", icon: SquareDashed, skills: [] }}
            />
          )}
        </main>
      </div>
      {assistantOpen && <AssistantChatPanel runtime={assistantRuntimeRef.current!} onClose={() => setAssistantOpen(false)} />}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      {customizerOpen && (
        <HomeModuleCustomizer
          config={homeModuleConfig}
          onChange={updateHomeModuleConfig}
          onClose={() => setCustomizerOpen(false)}
        />
      )}
      {briefingNotice !== null && (
        <div className="jv-briefing-toast" role="status" aria-live="polite">
          <div className="jv-briefing-toast-head">
            <Bell size={15} strokeWidth={2} className="jv-level-urgent" />
            <span className="jv-body">今日 {briefingNotice.count} 件紧急优先事项</span>
            <button
              type="button"
              className="jv-icon-plain"
              aria-label="关闭提醒"
              onClick={() => setBriefingNotice(null)}
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
          <ul className="jv-briefing-toast-list">
            {briefingNotice.items.map((item, index) => (
              <li key={index} className="jv-caption jv-muted">
                {item}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="jv-caption jv-briefing-toast-action"
            onClick={() => {
              setBriefingNotice(null);
              setSectionId("briefing");
            }}
          >
            查看每日晨报
          </button>
        </div>
      )}
    </div>
  );
}
