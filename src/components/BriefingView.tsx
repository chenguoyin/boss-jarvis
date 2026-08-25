import { Eye, Link, RefreshCw, Timer, TriangleAlert, Zap } from "lucide-react";
import type { DailyBriefing } from "@/lib/dailyBriefing";

interface Props {
  briefing: DailyBriefing | null;
  isRunning: boolean;
  onRun: () => void;
}

const kpis = [
  { key: "mustDoNow", label: "紧急优先", level: "urgent" },
  { key: "focusToday", label: "今日关注", level: "attention" },
  { key: "watchList", label: "持续观察", level: "normal" },
  { key: "hiddenLowPriority", label: "低优先隐藏", level: "missing" },
] as const;

const sections = [
  { key: "mustDoItems", label: "紧急优先", icon: TriangleAlert, level: "urgent" },
  { key: "focusItems", label: "今日关注", icon: Zap, level: "attention" },
  { key: "watchItems", label: "持续观察", icon: Eye, level: "normal" },
] as const;

export default function BriefingView({ briefing, isRunning, onRun }: Props) {
  if (briefing === null) {
    return (
      <div className="jv-card">
        <div className="jv-empty">
          <div className="jv-title">每日晨报</div>
          <div className="jv-body jv-muted">未获取到晨报数据。请先运行 daily-briefing Skill，或点击运行巡检生成今日报告。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="jv-card">
      <div className="jv-skill-header">
        <div>
          <div className="jv-title">每日晨报</div>
          <div className="jv-caption jv-muted">
            {briefing.today} · 生成 {briefing.generatedAt} · {briefing.headline}
          </div>
        </div>
        {isRunning && <span className="jv-caption jv-muted">正在生成每日晨报…</span>}
        <button type="button" className="jv-icon-plain" title="立即运行 daily-briefing 巡检" onClick={onRun} disabled={isRunning}>
          <RefreshCw size={15} strokeWidth={2} className={isRunning ? "jv-refresh-spin" : undefined} />
        </button>
      </div>

      <div className="jv-briefing-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.key} className={`jv-briefing-kpi jv-level-bg-${kpi.level}`}>
            <div className="jv-caption jv-muted">{kpi.label}</div>
            <div className={`jv-control jv-level-${kpi.level}`}>
              {briefing[kpi.key] === 0 && kpi.level === "missing" ? "未获取" : briefing[kpi.key]}
            </div>
          </div>
        ))}
      </div>

      <div className="jv-briefing-sections">
        {sections.map(({ key, label, icon: Icon, level }) => (
          <div key={key} className="jv-briefing-section">
            <div className="jv-body jv-briefing-section-title">
              <Icon size={15} strokeWidth={2} className={`jv-level-${level}`} />
              {label}
              <span className="jv-caption jv-muted">{briefing[key].length} 项</span>
            </div>
            {briefing[key].length === 0 ? (
              <div className="jv-caption jv-briefing-empty">无</div>
            ) : (
              briefing[key].map((title, index) => (
                <div key={index} className="jv-briefing-item">
                  <span className="jv-caption jv-muted jv-briefing-index">{index + 1}</span>
                  <span className="jv-body jv-briefing-text">{title}</span>
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      {briefing.sourceLabels.length > 0 && (
        <div className="jv-caption jv-muted jv-briefing-source">
          <Link size={15} strokeWidth={2} />
          数据来源：{briefing.sourceLabels.join(" / ")} · 未获取来源 {briefing.unavailableSources} 个
        </div>
      )}
      <div className={`jv-caption jv-briefing-source ${briefing.scheduleInstalled ? "jv-level-normal" : "jv-level-attention"}`}>
        <Timer size={15} strokeWidth={2} />
        定时巡检：每日 {briefing.scheduleTime ?? "未获取"} · {briefing.scheduleInstalled ? "已安装" : "未安装，需确认后安装"}
      </div>
    </div>
  );
}
