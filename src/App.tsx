import { useCallback, useEffect, useMemo, useState } from "react";
import NavigationRail from "./components/NavigationRail";
import TopBar from "./components/TopBar";
import PlaceholderView from "./components/PlaceholderView";
import SkillDataView from "./components/SkillDataView";
import { SquareDashed } from "lucide-react";
import { sectionById } from "./lib/sections";
import { useSkillData } from "./hooks/useSkillData";
import {
  listWeeklySummaryDates,
  readDailyBriefingReport,
  readSkillData,
  readWeeklySummaryArchive,
} from "./lib/skillBridge";
import type { SkillEnvelope } from "./lib/contract";
import {
  applyFontSizes,
  applyTheme,
  computeFontSizes,
  getBodyFontSize,
  getTheme,
  getTitleFontSize,
  setTheme,
  type Theme,
} from "./lib/config";

export default function App() {
  const [sectionId, setSectionId] = useState("dashboard");
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const section = sectionById(sectionId);
  const sectionSkills = useMemo(() => section?.skills ?? [], [section]);
  const { envelopes, failures, isReloading, activity, refresh } = useSkillData(sectionSkills);
  const [briefingEnvelope, setBriefingEnvelope] = useState<SkillEnvelope | null>(null);
  const [weeklyRaw, setWeeklyRaw] = useState<unknown>(null);
  const [weeklyDates, setWeeklyDates] = useState<string[]>([]);
  const [weeklyDate, setWeeklyDate] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

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
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(theme, media);
  }, [theme]);

  useEffect(() => {
    applyFontSizes(
      computeFontSizes(getTitleFontSize(), getBodyFontSize()),
    );
  }, []);

  const handleThemeChange = useCallback((next: Theme) => {
    setTheme(next);
    setThemeState(next);
  }, []);

  const handleRefresh = useCallback(async () => {
    await refresh(sectionSkills);
    setReloadCount((count) => count + 1);
  }, [refresh, sectionSkills]);

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
          {section ? (
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
              isRunning={isReloading}
              onRun={() => {
                void handleRefresh();
              }}
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
