import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Circle,
  Eye,
  FileText,
  LayoutGrid,
  SquarePen,
  TriangleAlert,
} from "lucide-react";
import type { WeeklySummary } from "@/lib/weeklySummary";

interface Props {
  summary: WeeklySummary | null;
  dates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

function displayCategories(summary: WeeklySummary) {
  const items = [...summary.oaByCategory];
  if (summary.attendanceTotal > 0) {
    items.unshift({ name: "考勤异常", count: summary.attendanceTotal });
  }
  return items.sort((a, b) => b.count - a.count);
}

export default function WeeklySummaryView({ summary, dates, selectedDate, onSelectDate }: Props) {
  if (summary === null) {
    return (
      <div className="jv-card">
        <div className="jv-empty">
          <CalendarClock size={40} strokeWidth={1.5} />
          <div className="jv-title">每周总结</div>
          <div className="jv-body jv-muted">未获取到周报数据。请点击页面上方刷新按钮生成。</div>
        </div>
      </div>
    );
  }

  if (!summary.isOK) {
    return (
      <div className="jv-card">
        <div className="jv-empty">
          <CalendarClock size={40} strokeWidth={1.5} />
          <div className="jv-title">每周总结</div>
          <div className="jv-body jv-muted">
            生成失败：{summary.errorText === "" ? "未知原因" : summary.errorText}
          </div>
        </div>
      </div>
    );
  }

  const categories = displayCategories(summary);

  return (
    <div className="jv-weekly-stack">
      <div className="jv-card jv-weekly-header">
        <div>
          <div className="jv-title">每周工作总结</div>
          <div className="jv-caption jv-muted">
            {summary.rangeStart} ~ {summary.rangeEnd} · 生成 {summary.generatedAt}
          </div>
        </div>
        {dates.length > 0 && (
          <select
            className="jv-weekly-select"
            value={selectedDate}
            onChange={(event) => onSelectDate(event.target.value)}
            aria-label="历史报告日期"
          >
            {dates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        )}
      </div>

      <section className="jv-card">
        <div className="jv-weekly-card-title">
          <LayoutGrid size={15} strokeWidth={2} />
          本周概览
        </div>
        <div className="jv-weekly-kpis">
          <div className="jv-weekly-kpi">
            <div className="jv-caption jv-muted"><FileText size={13} strokeWidth={2} /> OA 单据</div>
            <div className="jv-control">{summary.oaCount}</div>
          </div>
          <div className="jv-weekly-kpi">
            <div className="jv-caption jv-muted"><CheckCircle2 size={13} strokeWidth={2} /> 已执行</div>
            <div className="jv-control">{summary.executedCount}</div>
          </div>
          <div className="jv-weekly-kpi">
            <div className="jv-caption jv-muted"><TriangleAlert size={13} strokeWidth={2} /> 高风险</div>
            <div className="jv-control">{summary.redRiskCount}</div>
          </div>
          <div className="jv-weekly-kpi">
            <div className="jv-caption jv-muted"><Bell size={13} strokeWidth={2} /> 提醒</div>
            <div className="jv-control">{summary.reminderCount}</div>
          </div>
        </div>
        {categories.length > 0 && (
          <div className="jv-weekly-tags">
            {categories.map((category) => (
              <span key={category.name} className="jv-weekly-tag">
                {category.name} {category.count}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="jv-card">
        <div className="jv-weekly-card-title">
          <FileText size={15} strokeWidth={2} />
          OA 单据处理
        </div>
        {summary.oaCount === 0 ? (
          <div className="jv-caption jv-faint">本周无待处理 OA 单据</div>
        ) : (
          <div className="jv-weekly-lines">
            <div className="jv-weekly-line">
              <Circle size={6} strokeWidth={0} className="jv-weekly-dot" />
              <span className="jv-body">
                本周共 {summary.oaCount} 项：
                {categories.map((item) => `${item.name} ${item.count} 项`).join("、")}
              </span>
            </div>
            {summary.attendancePersonCount > 0 && (
              <div className="jv-weekly-line">
                <Circle size={6} strokeWidth={0} className="jv-weekly-dot" />
                <span className="jv-body">
                  考勤异常 {summary.attendancePersonCount} 人共 {summary.attendanceTotal} 笔，其中{" "}
                  {summary.attendanceTopPerson} {summary.attendanceTopCount} 笔，建议关注考勤纪律。
                </span>
              </div>
            )}
            <div className="jv-weekly-line">
              <Circle size={6} strokeWidth={0} className="jv-weekly-dot" />
              <span className="jv-body">明细见每日晨报，此处只做汇总。</span>
            </div>
          </div>
        )}
      </section>

      <section className="jv-card">
        <div className="jv-weekly-card-title">
          <TriangleAlert size={15} strokeWidth={2} />
          风险与规避
        </div>
        {summary.redRiskCount === 0 ? (
          <div className="jv-caption jv-faint">本周无高风险事项</div>
        ) : (
          <div className="jv-weekly-lines">
            <div className="jv-weekly-line">
              <Circle size={6} strokeWidth={0} className="jv-weekly-dot" />
              <span className="jv-body">
                本周高风险 {summary.redRiskCount} 项：{summary.redRiskSummary}
              </span>
            </div>
            {summary.attendanceTopPerson !== "" && (
              <div className="jv-weekly-line">
                <Circle size={6} strokeWidth={0} className="jv-weekly-dot" />
                <span className="jv-body">
                  主要集中在 {summary.attendanceTopPerson} 的考勤异常（{summary.attendanceTopCount} 笔），建议要求团队负责人跟进。
                </span>
              </div>
            )}
            <div className="jv-weekly-line">
              <Circle size={6} strokeWidth={0} className="jv-weekly-dot" />
              <span className="jv-body">均已进入驾驶舱待办视图，可逐项确认。</span>
            </div>
          </div>
        )}
      </section>

      <section className="jv-card">
        <div className="jv-weekly-card-title">
          <Eye size={15} strokeWidth={2} />
          重点关注
        </div>
        {summary.focusPoints.length === 0 ? (
          <div className="jv-caption jv-faint">无特别关注事项</div>
        ) : (
          <div className="jv-weekly-lines">
            {summary.focusPoints.map((point, index) => (
              <div key={index} className="jv-weekly-line">
                <Circle size={6} strokeWidth={0} className="jv-weekly-dot" />
                <span className="jv-body">{point}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="jv-card">
        <div className="jv-weekly-card-title">
          <SquarePen size={15} strokeWidth={2} />
          下周排期
        </div>
        {summary.nextWeekEvents.length === 0 ? (
          <div className="jv-caption jv-faint">下周日历暂无已排事项</div>
        ) : (
          <div className="jv-weekly-lines">
            {summary.nextWeekEvents.map((event, index) => (
              <div key={`${event.date}-${event.title}-${index}`} className="jv-weekly-event">
                <span className="jv-caption jv-weekly-event-date">{event.date}</span>
                <span className="jv-caption jv-weekly-event-time">{event.time}</span>
                <span className="jv-body">{event.title}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
