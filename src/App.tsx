import { useCallback, useEffect, useMemo, useState } from "react";
import NavigationRail from "./components/NavigationRail";
import TopBar from "./components/TopBar";
import PlaceholderView from "./components/PlaceholderView";
import SkillDataView from "./components/SkillDataView";
import ConfirmationCenterView from "./components/ConfirmationCenterView";
import SettingsView from "./components/SettingsView";
import { SquareDashed } from "lucide-react";
import { sectionById } from "./lib/sections";
import { useSkillData } from "./hooks/useSkillData";
import {
  approveTodo,
  listAuditLogDates,
  listWeeklySummaryDates,
  markMailRead,
  openMailReply,
  readAuditLog,
  readDailyBriefingReport,
  readSkillData,
  readWeeklySummaryArchive,
  toggleSkill,
} from "./lib/skillBridge";
import {
  createSkillToggleAction,
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
  type Theme,
} from "./lib/config";

export default function App() {
  const [sectionId, setSectionId] = useState("dashboard");
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const section = sectionById(sectionId);
  const sectionSkills = useMemo(() => section?.skills ?? [], [section]);
  const { envelopes, failures, isReloading, activity, refresh } = useSkillData(sectionSkills);
  const [briefingEnvelope, setBriefingEnvelope] = useState<SkillEnvelope | null>(null);
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
  const [markingReadIds, setMarkingReadIds] = useState<Set<number>>(new Set());
  const [replyingIds, setReplyingIds] = useState<Set<number>>(new Set());
  const [hiddenMailIds, setHiddenMailIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (sectionId !== "briefing") return;
    void readDailyBriefingReport().then(setBriefingEnvelope);
  }, [sectionId, reloadCount]);

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
    await refresh(sectionSkills);
    setReloadCount((count) => count + 1);
  }, [refresh, sectionSkills]);

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
        const outcome = await toggleSkill(action.skillId, action.enable);
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
    const outcome = await approveTodo({ skill: "oa-todo", title: item.title, comment, approve })
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
    void markMailRead(message.id)
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
    });
  }, [replyingIds]);

  const handleToggleSkill = useCallback((skill: ManagedSkill) => {
    const action = createSkillToggleAction(skill);
    if (actions.some((existing) => existing.skillId === skill.id && existing.state === "pending")) return;
    setActions((current) => [...current, action]);
    setSectionId("confirmation");
  }, [actions]);

  return (
    <div className="jv-shell">
      <NavigationRail
        selectedId={sectionId}
        onSelect={setSectionId}
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
        />
        <main className="jv-content">
          {sectionId === "confirmation" ? (
            <ConfirmationCenterView
              actions={actions}
              executing={executing}
              progressText={progressText}
              onConfirm={handleConfirm}
              onSkip={handleSkip}
              onConfirmBatch={handleConfirmBatch}
              onSkipBatch={handleSkipBatch}
            />
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
              onRun={() => {
                void handleRefresh();
              }}
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
              skills={{ onToggle: handleToggleSkill }}
            />
          ) : (
            <PlaceholderView
              section={{ id: "unknown", title: "未知", icon: SquareDashed, skills: [] }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
