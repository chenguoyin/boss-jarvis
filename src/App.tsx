import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NavigationRail from "./components/NavigationRail";
import TopBar from "./components/TopBar";
import PlaceholderView from "./components/PlaceholderView";
import SkillDataView from "./components/SkillDataView";
import ConfirmationCenterView from "./components/ConfirmationCenterView";
import SettingsView from "./components/SettingsView";
import HongyiBusinessView from "./components/HongyiBusinessView";
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
  closeHongyiEmbed,
  listAuditLogDates,
  listWeeklySummaryDates,
  installSkill,
  markMailRead,
  openHongyiInApp,
  setHongyiSlot,
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
import { buildHongyiSnapshot } from "./lib/hongyiBusiness";
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

  // 虹翼外链：点击侧栏该分区即在 App 内容区原位显示「配置的虹翼 URL」页面本身（无边框面板窗口
  // 贴内容区，自跑 OA 单点后整页直达，不转成其它视图；见 src-tauri/src/hongyi_embed.rs 与
  // docs/hongyi-dashboard-in-app.md）。URL 走系统配置 HONGYI_EXTERNAL_URL，默认部门看板，后续可改。
  const [hongyiOpening, setHongyiOpening] = useState(false);
  const [hongyiFailed, setHongyiFailed] = useState(false);
  const [hongyiEmbedActive, setHongyiEmbedActive] = useState(false);
  const [hongyiMessage, setHongyiMessage] = useState("");
  const hongyiOpeningRef = useRef(false);
  // 打开（单点驱动）期间用户请求过关闭：流程结束后不显示内嵌页，改为隐藏。
  const hongyiCloseRequestedRef = useRef(false);
  // 「虹翼外链」分区内容区占位（header 之下），Rust 面板窗口按其左上角对齐贴位。
  const hongyiSlotRef = useRef<HTMLDivElement | null>(null);

  const handleCloseHongyiEmbed = useCallback(async () => {
    setHongyiEmbedActive(false);
    setHongyiMessage("");
    if (hongyiOpeningRef.current) {
      // 单点驱动进行中：不在 Rust 侧并发 hide；记下“待关闭”，打开流程结束后自动隐藏。
      hongyiCloseRequestedRef.current = true;
      return;
    }
    try {
      await closeHongyiEmbed();
    } catch {
      // 未创建过内嵌页时关闭无副作用，忽略错误。
    }
  }, []);

  const handleOpenHongyiEmbed = useCallback(async () => {
    if (hongyiOpeningRef.current) return;
    hongyiOpeningRef.current = true;
    hongyiCloseRequestedRef.current = false;
    setHongyiOpening(true);
    setHongyiFailed(false);
    setHongyiMessage("正在 App 内打开虹翼页面（OA 单点自动登录）…");
    try {
      // 等两帧：确保「打开中」状态渲染完成（列表态的经营卡片已隐藏，slot 紧贴标题行），
      // 否则会量到卡片下方的 y（曾出现 top=199 而预期 ~102，标题与网页间大片空白）。
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      // 把内容区占位左上角上报 Rust：child WebView 据此与标题行对齐贴位。
      const slot = hongyiSlotRef.current;
      if (slot) {
        const rect = slot.getBoundingClientRect();
        await setHongyiSlot(rect.left, rect.top).catch(() => {});
      }
      const summary = await openHongyiInApp();
      if (
        hongyiCloseRequestedRef.current ||
        sectionIdRef.current !== "hongyi-external"
      ) {
        // 打开期间用户已关闭请求 / 已切到其它分区：隐藏内嵌页，避免悬浮遮挡其它分区内容。
        setHongyiMessage("");
        void closeHongyiEmbed().catch(() => {});
      } else {
        setHongyiMessage(summary);
        setHongyiEmbedActive(true);
      }
    } catch (error) {
      if (!hongyiCloseRequestedRef.current) {
        setHongyiFailed(true);
        setHongyiMessage(`打开失败：${String(error)}`);
      } else {
        setHongyiMessage("");
        void closeHongyiEmbed().catch(() => {});
      }
    } finally {
      hongyiOpeningRef.current = false;
      setHongyiOpening(false);
    }
  }, []);

  // 进入「虹翼外链」分区（从其它分区切换过来）自动打开；离开该分区即隐藏虹翼窗口
  // （页面与会话保留，再次进入直接复用，不再重跑单点加载）。
  const prevSectionRef = useRef(sectionId);
  const sectionIdRef = useRef(sectionId);
  useEffect(() => {
    const previous = prevSectionRef.current;
    prevSectionRef.current = sectionId;
    sectionIdRef.current = sectionId;
    if (sectionId === "hongyi-external" && previous !== "hongyi-external") {
      void handleOpenHongyiEmbed();
    } else if (previous === "hongyi-external" && sectionId !== "hongyi-external") {
      void handleCloseHongyiEmbed();
    }
  }, [sectionId, handleOpenHongyiEmbed, handleCloseHongyiEmbed]);

  // Handle section selection, including special handling for external links
  const handleSectionSelect = useCallback(
    (id: string) => {
      if (id === "hongyi-external" && id === sectionId && hongyiEmbedActive) {
        // 已在「虹翼外链」且内嵌页显示中：同分区再次点击不重复 hide/show
        // （避免高频交替触发平台异常，2026-09-02 反馈「第 2 次点直接闪退」）；
        // 退出请用分区头「×」/ 顶栏「返回」/ 切到其它分区。
        return;
      }
      setSectionId(id);
    },
    [sectionId, hongyiEmbedActive],
  );
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
    cancelRefresh,
  } = useSkillData(sectionSkills, fetchableSkills);
  // 跟踪各分区的刷新状态，用于页面级别刷新按钮的独立控制
  const [sectionRefreshStatus, setSectionRefreshStatus] = useState<Record<string, boolean>>({});
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
    // 如果正在刷新，点击则取消获取
    if (isReloading) {
      cancelRefresh();
      return;
    }
    await refreshAll();
    setReloadCount((count) => count + 1);
    setLastRefreshedAt(Date.now());
  }, [refreshAll, cancelRefresh, isReloading]);

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
  // 「虹翼外链」分区未激活（失败/关闭）时展示的经营数据卡：与侧栏「经营情况」一致，
  // 使用 hongyi-business-overview / hongyi-today-metrics 的 Skill 落盘数据按原方式渲染。
  const hongyiSnapshot = useMemo(
    () =>
      buildHongyiSnapshot(
        envelopes["hongyi-today-metrics"] ?? null,
        envelopes["hongyi-business-overview"] ?? null,
      ),
    [envelopes],
  );
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
    // 检查当前分区是否正在刷新
    if (sectionRefreshStatus[sectionId]) {
      // 如果正在刷新，点击则取消该分区的刷新
      cancelRefresh();
      setSectionRefreshStatus((prev) => ({ ...prev, [sectionId]: false }));
      return;
    }
    if (sectionSkills.length === 0) return;
    // 标记当前分区正在刷新
    setSectionRefreshStatus((prev) => ({ ...prev, [sectionId]: true }));
    await refresh(sectionSkills);
    setSectionRefreshStatus((prev) => ({ ...prev, [sectionId]: false }));
    setReloadCount((count) => count + 1);
    setLastRefreshedAt(Date.now());
  }, [sectionId, sectionSkills, refresh, cancelRefresh, sectionRefreshStatus]);

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
        onSelect={handleSectionSelect}
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
          hongyiEmbedActive={hongyiEmbedActive || hongyiOpening}
          onCloseHongyiEmbed={() => {
            void handleCloseHongyiEmbed();
          }}
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
                  disabled={sectionRefreshStatus[sectionId] ?? false}
                >
                  <RefreshCw size={15} strokeWidth={2} className={(sectionRefreshStatus[sectionId] ?? false) ? "jv-refresh-spin" : undefined} />
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
          ) : sectionId === "hongyi-external" ? (
            // 虹翼外链：结构与其他分区一致——header（标题+状态+操作）+ 内容区。
            // 嵌入激活/打开中：header 之下是面板窗口覆盖区（占位 slot，Rust 按其左上角对齐贴位，
            // 见 hongyi_embed.rs set_slot / content_rect；用户要求与 skill 管理页等分区内容对齐）。
            // 未激活：header 之下显示分区原生内容（经营情况卡片）。
            <div className="jv-hongyi-embed-root">
              <div className="jv-section-header">
                <div className="jv-title">虹翼外链</div>
                <div className="jv-section-header-actions">
                  {hongyiOpening ? (
                    <span className="jv-caption jv-muted">
                      <RefreshCw size={13} strokeWidth={2} className="jv-refresh-spin" />
                      正在登录…
                    </span>
                  ) : hongyiEmbedActive ? (
                    <span
                      className="jv-caption jv-muted"
                      style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={hongyiMessage || "虹翼页面已嵌入显示"}
                    >
                      {hongyiMessage || "虹翼页面已嵌入显示"}
                    </span>
                  ) : null}
                  {hongyiEmbedActive ? (
                    <button
                      type="button"
                      className="jv-icon-plain"
                      title="返回本分区内容（隐藏内嵌页，页面与会话保留）"
                      aria-label="返回虹翼外链分区内容"
                      onClick={() => {
                        void handleCloseHongyiEmbed();
                      }}
                    >
                      <X size={15} strokeWidth={2} />
                    </button>
                  ) : null}
                </div>
              </div>
              {!hongyiEmbedActive && !hongyiOpening ? (
                <>
                  {hongyiFailed ? (
                    <div className="jv-caption jv-muted" role="status" style={{ maxWidth: 560 }}>
                      {hongyiMessage || "打开失败，请重试"}
                    </div>
                  ) : hongyiMessage ? (
                    <div className="jv-caption jv-muted" role="status" style={{ maxWidth: 560 }}>
                      {hongyiMessage}
                    </div>
                  ) : null}
                  <div className="jv-section-header-actions" style={{ alignSelf: "flex-start", marginTop: -6 }}>
                    {hongyiFailed ? (
                      <button
                        type="button"
                        className="jv-btn-ok"
                        onClick={() => {
                          void handleOpenHongyiEmbed();
                        }}
                      >
                        <RefreshCw size={14} strokeWidth={2} />
                        重新打开
                      </button>
                    ) : !hongyiMessage ? (
                      <button
                        type="button"
                        className="jv-btn-ok"
                        onClick={() => {
                          void handleOpenHongyiEmbed();
                        }}
                      >
                        打开页面
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="jv-icon-plain"
                      title="刷新经营数据（调用 hongyi-business-overview / hongyi-today-metrics Skill）"
                      aria-label="刷新经营数据"
                      onClick={() => {
                        void refresh(["hongyi-business-overview", "hongyi-today-metrics"]);
                      }}
                    >
                      <RefreshCw size={15} strokeWidth={2} />
                    </button>
                  </div>
                  <HongyiBusinessView snapshot={hongyiSnapshot} />
                </>
              ) : null}
              {/* 内容区占位：激活/打开中由面板窗口覆盖；左上角上报 Rust 用于对齐贴位。 */}
              <div ref={hongyiSlotRef} className="jv-hongyi-slot" aria-hidden="true" />
            </div>
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
              isRunning={sectionRefreshStatus[sectionId] ?? false}
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
