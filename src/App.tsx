import { useCallback, useEffect, useMemo, useState } from "react";
import NavigationRail from "./components/NavigationRail";
import TopBar from "./components/TopBar";
import PlaceholderView from "./components/PlaceholderView";
import SkillDataView from "./components/SkillDataView";
import { SquareDashed } from "lucide-react";
import { sectionById } from "./lib/sections";
import { useSkillData } from "./hooks/useSkillData";
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
            void refresh(sectionSkills);
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
