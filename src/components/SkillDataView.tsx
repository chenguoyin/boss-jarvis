import { useMemo } from "react";
import { RefreshCw, SquareDashed } from "lucide-react";
import type { AppSection } from "@/lib/sections";
import { isMissing } from "@/lib/contract";
import type { SkillFailure } from "@/hooks/useSkillData";
import SkillManagerView from "./SkillManagerView";
import { parseSkillManager } from "@/lib/skillManager";
import NativeCalendarView from "./NativeCalendarView";
import { parseNativeCalendar } from "@/lib/nativeCalendar";
import BriefingView from "./BriefingView";
import { parseDailyBriefing } from "@/lib/dailyBriefing";
import WeeklySummaryView from "./WeeklySummaryView";
import { parseWeeklySummary } from "@/lib/weeklySummary";
import HongyiBusinessView from "./HongyiBusinessView";
import { buildHongyiSnapshot } from "@/lib/hongyiBusiness";
import OATodoView from "./OATodoView";
import ExpenseTodoView from "./ExpenseTodoView";
import { parseOATodo } from "@/lib/oaTodo";
import MailView from "./MailView";
import { hideMailMessages, parseCompanyMail, type MailMessage } from "@/lib/mail";
import DashboardView from "./DashboardView";
import { buildDashboardSnapshot } from "@/lib/dashboard";
import { parseReminderCenter } from "@/lib/reminderCenter";
import AuditLogView from "./AuditLogView";
import { parseAuditLog } from "@/lib/auditLog";
import type { OATodoItem } from "@/lib/oaTodo";
import type { ManagedSkill } from "@/lib/skillManager";
import type { HomeModuleConfig, HomeModuleId } from "@/lib/config";

interface Props {
  section: AppSection;
  envelopes: Record<string, import("@/lib/contract").SkillEnvelope | null>;
  failures: SkillFailure[];
  briefingEnvelope: import("@/lib/contract").SkillEnvelope | null;
  weekly: {
    raw: unknown;
    dates: string[];
    selectedDate: string;
    onSelectDate: (date: string) => void;
  };
  audit: {
    dates: string[];
    selectedDate: string;
    jsonl: string | null;
    onSelectDate: (date: string) => void;
  };
  isRunning: boolean;
  onRun: () => void;
  onSectionRefresh: () => void;
  onNavigate: (sectionId: string) => void;
  oa: {
    approvalStatus: string | null;
    onApprove: (item: OATodoItem, comment: string) => void;
    onReject: (item: OATodoItem, comment: string) => void;
  };
  mail: {
    readStatus: string | null;
    replyStatus: string | null;
    replyingIds: ReadonlySet<number>;
    hiddenIds: ReadonlySet<number>;
    onMarkRead: (message: MailMessage) => void;
    onOpenReply: (message: MailMessage) => void;
  };
  skills: {
    onToggle: (skill: ManagedSkill) => void;
    onInstall: () => void;
    onUninstall: (skill: ManagedSkill) => void;
    pendingSkillIds: ReadonlySet<string>;
  };
  homeModules: HomeModuleConfig;
  onHomeModuleOrderChange: (order: HomeModuleId[]) => void;
}

function displayValue(value: unknown): string {
  if (isMissing(value)) return "未获取";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value === "" ? "未获取" : value;
  return "未获取";
}

export default function SkillDataView({
  section,
  envelopes,
  failures,
  briefingEnvelope,
  weekly,
  audit,
  isRunning,
  onRun,
  onSectionRefresh,
  onNavigate,
  oa,
  mail,
  skills,
  homeModules,
  onHomeModuleOrderChange,
}: Props) {
  // 数据只在信封变化时解析一次；点击/悬停/弹层不再重复解析大体量契约 JSON。
  const parsed = useMemo(() => {
    const skillManagerEnvelope = envelopes["skill-manager"] ?? null;
    const skillManager = skillManagerEnvelope === null
      ? null
      : parseSkillManager(skillManagerEnvelope as import("@/lib/contract").SkillEnvelope);
    const calendarEnvelope = envelopes["native-calendar"] ?? null;
    const nativeCalendar = calendarEnvelope === null
      ? null
      : parseNativeCalendar(calendarEnvelope as import("@/lib/contract").SkillEnvelope);
    const briefing = briefingEnvelope === null ? null : parseDailyBriefing(briefingEnvelope);
    const weeklySummary = parseWeeklySummary(weekly.raw);
    const hongyiSnapshot = buildHongyiSnapshot(
      envelopes["hongyi-today-metrics"] as import("@/lib/contract").SkillEnvelope | null ?? null,
      envelopes["hongyi-business-overview"] as import("@/lib/contract").SkillEnvelope | null ?? null,
    );
    const oaTodo = parseOATodo(envelopes["oa-todo"] as import("@/lib/contract").SkillEnvelope | null ?? null);
    const parsedMail = parseCompanyMail(envelopes["company-mail"] as import("@/lib/contract").SkillEnvelope | null ?? null);
    const reminders = parseReminderCenter(envelopes["reminder-center"] as import("@/lib/contract").SkillEnvelope | null ?? null);
    return { skillManager, nativeCalendar, briefing, weeklySummary, hongyiSnapshot, oaTodo, parsedMail, reminders };
  }, [envelopes, briefingEnvelope, weekly.raw]);

  const companyMail = parsed.parsedMail === null ? null : hideMailMessages(parsed.parsedMail, mail.hiddenIds);
  const { skillManager, nativeCalendar, briefing, weeklySummary, hongyiSnapshot, oaTodo } = parsed;
  const auditEntries = useMemo(() => parseAuditLog(audit.jsonl), [audit.jsonl]);
  const dashboardSnapshot = useMemo(
    () => buildDashboardSnapshot({
      reminders: parsed.reminders,
      oaTodo: parsed.oaTodo,
      mail: companyMail,
      calendar: parsed.nativeCalendar,
      briefing: parsed.briefing,
      hongyi: parsed.hongyiSnapshot,
    }),
    [parsed, companyMail],
  );

  const loaded = section.skills
    .map((skill) => ({ skill, envelope: envelopes[skill] }))
    .filter((entry) => entry.envelope !== undefined);

  return (
    <div className="jv-placeholder">
      <div className="jv-section-header">
        <div className="jv-title">{section.title}</div>
        <button
          type="button"
          className="jv-icon-plain"
          title="调用 Skill 获取真实数据"
          aria-label="刷新本分区"
          onClick={onSectionRefresh}
          disabled={isRunning}
        >
          <RefreshCw size={15} strokeWidth={2} className={isRunning ? "jv-refresh-spin" : undefined} />
        </button>
      </div>
      {failures.length > 0 && (
        <div className="jv-failure-banner" role="status">
          {failures.map((failure) => (
            <div key={failure.skill} className="jv-body jv-failure-text">
              {failure.error}
            </div>
          ))}
        </div>
      )}
      {section.id === "dashboard" ? (
        <DashboardView
          snapshot={dashboardSnapshot}
          onNavigate={onNavigate}
          onOpenMailReply={mail.onOpenReply}
          replyingMailIds={mail.replyingIds}
          homeModules={homeModules}
          onHomeModuleOrderChange={onHomeModuleOrderChange}
        />
      ) : section.id === "skills" ? (
        <SkillManagerView
          result={skillManager}
          onToggle={skills.onToggle}
          onInstall={skills.onInstall}
          onUninstall={skills.onUninstall}
          pendingSkillIds={skills.pendingSkillIds}
        />
      ) : section.id === "calendar" ? (
        <NativeCalendarView result={nativeCalendar} />
      ) : section.id === "briefing" ? (
        <BriefingView briefing={briefing} isRunning={isRunning} onRun={onRun} />
      ) : section.id === "weekly" ? (
        <WeeklySummaryView
          summary={weeklySummary}
          dates={weekly.dates}
          selectedDate={weekly.selectedDate}
          onSelectDate={weekly.onSelectDate}
        />
      ) : section.id === "business" ? (
        <HongyiBusinessView snapshot={hongyiSnapshot} />
      ) : section.id === "oa-todo" ? (
        <OATodoView
          result={oaTodo}
          approvalStatus={oa.approvalStatus}
          onApprove={oa.onApprove}
          onReject={oa.onReject}
        />
      ) : section.id === "funds" ? (
        <ExpenseTodoView result={oaTodo} />
      ) : section.id === "mail" ? (
        <MailView
          result={companyMail}
          readStatus={mail.readStatus}
          replyStatus={mail.replyStatus}
          replyingIds={mail.replyingIds}
          hiddenIds={mail.hiddenIds}
          onMarkRead={mail.onMarkRead}
          onOpenReply={mail.onOpenReply}
        />
      ) : section.id === "audit" ? (
        <AuditLogView
          result={{
            dates: audit.dates,
            selectedDate: audit.selectedDate,
            entries: auditEntries,
            onSelectDate: audit.onSelectDate,
          }}
          isRunning={isRunning}
          onRefresh={onRun}
        />
      ) : (
        <>
          <SquareDashed size={40} strokeWidth={1.5} />
          <div className="jv-title" style={{ color: "var(--jv-text)" }}>{section.title}</div>
          {loaded.length === 0 ? (
            <div className="jv-body" style={{ color: "var(--jv-muted)" }}>
              尚未获取数据，请点击右上角刷新。
            </div>
          ) : (
            <div className="jv-skill-status-list">
              {loaded.map(({ skill, envelope }) => (
                <div key={skill} className="jv-skill-status-row">
                  <span className="jv-body jv-skill-status-name">{skill}</span>
                  <span className="jv-body jv-skill-status-value">
                    {envelope === null
                      ? "未获取"
                      : `条目 ${displayValue(envelope.count)} · ${displayValue(envelope.fetchedAt)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
