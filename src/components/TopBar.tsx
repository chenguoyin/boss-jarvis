import {
  ChevronRight,
  Maximize2,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import ThemePicker from "./ThemePicker";
import { sectionById } from "@/lib/sections";
import type { Theme } from "@/lib/config";

interface Props {
  sectionId: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  isReloading: boolean;
  activity: string | null;
  failures: { skill: string; error: string }[];
}

export default function TopBar({
  sectionId,
  theme,
  onThemeChange,
  onOpenSettings,
  onRefresh,
  isReloading,
  activity,
  failures,
}: Props) {
  const section = sectionById(sectionId);
  const SectionIcon = section?.icon;
  const showsCustomize = sectionId === "dashboard";
  const refreshTitle = isReloading
    ? (activity ?? "正在获取，请稍候...")
    : failures.length > 0
      ? `部分数据未获取：${failures.map((f) => f.error).join("；")}`
      : "调用 Skill 获取真实数据";

  return (
    <header className="jv-topbar">
      <div className="jv-title jv-topbar-title">Boss Jarvis</div>

      <div className="jv-topbar-crumb">
        <ChevronRight size={13} strokeWidth={2.5} className="jv-crumb-chevron" />
        {SectionIcon && (
          <SectionIcon size={15} strokeWidth={2} className="jv-crumb-icon" />
        )}
        <span className="jv-body jv-crumb-text">{section?.title ?? ""}</span>
      </div>

      <div className="jv-topbar-spacer" />

      <div className="jv-topbar-actions">
        <button type="button" className="jv-search" title="打开 Jarvis 助手（⌘K）">
          <Search size={15} strokeWidth={2} className="jv-search-icon" />
          <span className="jv-body jv-search-placeholder">
            搜索事项、客户、合同、Skill
          </span>
          <span className="jv-caption jv-search-kbd">⌘ K</span>
        </button>

        <button
          type="button"
          className="jv-icon-plain"
          title="系统配置"
          aria-label="系统配置"
          onClick={onOpenSettings}
        >
          <Settings size={15} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="jv-icon-plain"
          title="放大/还原"
          aria-label="放大/还原"
        >
          <Maximize2 size={15} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="jv-icon-plain"
          title={refreshTitle}
          aria-label="刷新"
          onClick={onRefresh}
          disabled={isReloading}
        >
          <RefreshCw
            size={15}
            strokeWidth={2}
            className={isReloading ? "jv-refresh-spin" : undefined}
          />
        </button>

        <ThemePicker theme={theme} onChange={onThemeChange} />

        {showsCustomize && (
          <button
            type="button"
            className="jv-icon-plain"
            title="调整首页模块排序与显隐"
            aria-label="调整首页模块"
          >
            <SlidersHorizontal size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    </header>
  );
}
