import { useCallback, useEffect, useState } from "react";
import NavigationRail from "./components/NavigationRail";
import TopBar from "./components/TopBar";
import PlaceholderView from "./components/PlaceholderView";
import { SquareDashed } from "lucide-react";
import { sectionById } from "./lib/sections";
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

  const section = sectionById(sectionId);

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
          onRefresh={() => undefined}
        />
        <main className="jv-content">
          {section ? (
            <PlaceholderView section={section} />
          ) : (
            <PlaceholderView
              section={{ id: "unknown", title: "未知", icon: SquareDashed }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
