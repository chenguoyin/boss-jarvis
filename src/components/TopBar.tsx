import {
  AlertTriangle,
  ChevronRight,
  CircleCheck,
  Clock,
  Maximize2,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import ThemePicker from "./ThemePicker";
import { sectionById } from "@/lib/sections";
import type { Theme } from "@/lib/config";
import { formatDateTime } from "@/lib/datetime";

interface Props {
  sectionId: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  isReloading: boolean;
  activity: string | null;
  failures: { skill: string; error: string }[];
  lastRefreshedAt: number | null;
  nextAutoRefreshAt: number | null;
  nowTick: number;
  onOpenAssistant: () => void;
  onToggleMaximize: () => void;
  onOpenCustomizer: () => void;
}

const formatTime = formatDateTime;

function countdownText(target: number, now: number): string {
  const remaining = Math.round((target - now) / 1000);
  if (remaining <= 0) return "即将刷新";
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const secondsText = String(seconds).padStart(2, "0");
  return minutes > 0 ? minutes + "分" + secondsText + "秒" : seconds + "秒";
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
  lastRefreshedAt,
  nextAutoRefreshAt,
  nowTick,
  onOpenAssistant,
  onToggleMaximize,
  onOpenCustomizer,
}: Props) {
  const section = sectionById(sectionId);
  const SectionIcon = section?.icon;
  const showsCustomize = sectionId === "dashboard";
  const failureText = failures.map((failure) => failure.error).join("；");
  const refreshTitle = isReloading
    ? (activity ?? "正在获取，请稍候...")
    : failures.length > 0
      ? "部分数据未获取：" + failureText
      : nextAutoRefreshAt !== null
        ? "下次刷新 " + countdownText(nextAutoRefreshAt, nowTick)
        : lastRefreshedAt !== null
          ? "最近刷新 " + formatTime(lastRefreshedAt)
          : "自动刷新状态";
  const refreshIcon = isReloading
    ? { Component: RefreshCw, className: "jv-refresh-spin jv-refresh-running" }
    : failures.length > 0
      ? { Component: AlertTriangle, className: "jv-refresh-failed" }
      : nextAutoRefreshAt !== null
        ? { Component: Clock, className: "jv-refresh-scheduled" }
        : lastRefreshedAt !== null
          ? { Component: CircleCheck, className: "jv-refresh-ok" }
          : { Component: RefreshCw, className: undefined };

  return (
    <header
      className="jv-topbar"
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) onToggleMaximize();
      }}
    >
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
        <button
          type="button"
          className="jv-search"
          title="打开 Jarvis 助手（⌘K）"
          onClick={onOpenAssistant}
        >
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
          onClick={onToggleMaximize}
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
          <refreshIcon.Component
            size={15}
            strokeWidth={2}
            className={refreshIcon.className}
          />
        </button>

        <ThemePicker theme={theme} onChange={onThemeChange} />

        {showsCustomize && (
          <button
            type="button"
            className="jv-icon-plain"
            title="调整首页模块排序与显隐"
            aria-label="调整首页模块"
            onClick={onOpenCustomizer}
          >
            <SlidersHorizontal size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    </header>
  );
}
