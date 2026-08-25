import { SquareDashed } from "lucide-react";
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
  isRunning: boolean;
  onRun: () => void;
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
  isRunning,
  onRun,
}: Props) {
  const loaded = section.skills
    .map((skill) => ({ skill, envelope: envelopes[skill] }))
    .filter((entry) => entry.envelope !== undefined);
  const skillManager = envelopes["skill-manager"]
    ? parseSkillManager(envelopes["skill-manager"] as import("@/lib/contract").SkillEnvelope)
    : null;
  const nativeCalendar = envelopes["native-calendar"]
    ? parseNativeCalendar(envelopes["native-calendar"] as import("@/lib/contract").SkillEnvelope)
    : null;
  const briefing = briefingEnvelope ? parseDailyBriefing(briefingEnvelope) : null;
  const weeklySummary = parseWeeklySummary(weekly.raw);
  const hongyiSnapshot = buildHongyiSnapshot(
    envelopes["hongyi-today-metrics"] as import("@/lib/contract").SkillEnvelope | null ?? null,
    envelopes["hongyi-business-overview"] as import("@/lib/contract").SkillEnvelope | null ?? null,
  );
  const oaTodo = parseOATodo(envelopes["oa-todo"] as import("@/lib/contract").SkillEnvelope | null ?? null);

  return (
    <div className="jv-placeholder">
      {failures.length > 0 && (
        <div className="jv-failure-banner" role="status">
          {failures.map((failure) => (
            <div key={failure.skill} className="jv-body jv-failure-text">
              {failure.error}
            </div>
          ))}
        </div>
      )}
      {section.id === "skills" ? (
        <SkillManagerView result={skillManager} />
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
        <OATodoView result={oaTodo} />
      ) : section.id === "funds" ? (
        <ExpenseTodoView result={oaTodo} />
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
