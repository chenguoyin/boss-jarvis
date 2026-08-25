import { RefreshCw, Shield } from "lucide-react";
import type { AuditLogResult } from "@/lib/auditLog";

interface Props {
  result: AuditLogResult;
  isRunning: boolean;
  onRefresh: () => void;
}

const ACTION_TITLES: Record<string, string> = {
  fetch_data: "取数",
  analyze: "分析",
  propose_write: "拟执行",
  confirm_write: "确认",
  execute_write: "实际执行",
  skill_lifecycle: "Skill 生命周期",
  model_call: "模型调用",
};

function actionTitle(value: string): string {
  return ACTION_TITLES[value] ?? (value === "" ? "未获取" : value);
}

function statusTitle(value: string): string {
  if (value === "success") return "成功";
  if (value === "pending") return "待确认";
  if (value === "") return "未获取";
  return value;
}

function statusLevel(value: string): string {
  if (value === "success") return "normal";
  if (value === "pending") return "attention";
  return "urgent";
}

export default function AuditLogView({ result, isRunning, onRefresh }: Props) {
  if (result.dates.length === 0) {
    return (
      <div className="jv-card">
        <div className="jv-empty">
          <Shield size={40} strokeWidth={1.5} />
          <div className="jv-title">审计日志</div>
          <div className="jv-body jv-muted">未获取到审计留痕。各 Skill 取数、分析、确认、执行时会自动写入。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="jv-card">
      <div className="jv-skill-header">
        <div>
          <div className="jv-title">审计日志</div>
          <div className="jv-caption jv-muted">
            共 {result.entries.length} 条 · 取数 / 分析 / 拟执行 / 确认 / 实际执行全链路留痕
          </div>
        </div>
        <div className="jv-audit-actions">
          <select
            className="jv-weekly-select"
            value={result.selectedDate}
            onChange={(event) => result.onSelectDate(event.target.value)}
            aria-label="审计日期"
          >
            {result.dates.map((date) => (
              <option key={date} value={date}>{date}</option>
            ))}
          </select>
          <button
            type="button"
            className="jv-icon-plain"
            title="刷新审计日志"
            aria-label="刷新审计日志"
            onClick={onRefresh}
            disabled={isRunning}
          >
            <RefreshCw size={15} strokeWidth={2} className={isRunning ? "jv-refresh-spin" : undefined} />
          </button>
        </div>
      </div>

      {result.entries.length === 0 ? (
        <div className="jv-body jv-muted jv-mail-empty">当日暂无审计记录</div>
      ) : (
        <div className="jv-audit-table">
          <div className="jv-audit-row jv-audit-row-head">
            <span>#</span>
            <span>时间</span>
            <span>Skill</span>
            <span>动作</span>
            <span>对象</span>
            <span>结果</span>
            <span>状态</span>
          </div>
          {result.entries.map((entry, index) => (
            <div
              key={entry.auditId + entry.timestampText + index}
              className="jv-audit-row jv-audit-row-body"
              title={[
                "系统：" + (entry.sourceSystem === "" ? "未获取" : entry.sourceSystem),
                entry.requestSummary === "" ? "" : "请求：" + entry.requestSummary,
                entry.resultSummary === "" ? "" : "结果：" + entry.resultSummary,
                "审计 ID：" + entry.auditId,
              ].filter((part) => part !== "").join("\n")}
            >
              <span className="jv-caption">{index + 1}</span>
              <span className="jv-caption jv-audit-time">{entry.displayTime}</span>
              <span className="jv-caption jv-audit-skill">{entry.skill}</span>
              <span className="jv-caption">{actionTitle(entry.actionType)}</span>
              <span className="jv-audit-target">
                <span className="jv-caption">{entry.targetTitle === "" ? (entry.sourceSystem === "" ? "—" : entry.sourceSystem) : entry.targetTitle}</span>
                {entry.resultSummary !== "" && <span className="jv-caption jv-faint">{entry.resultSummary}</span>}
              </span>
              <span className="jv-caption jv-audit-mode">{entry.mode === "" ? "未获取" : entry.mode}</span>
              <span className={"jv-caption jv-level-" + statusLevel(entry.status)}>{statusTitle(entry.status)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
