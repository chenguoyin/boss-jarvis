import { useState } from "react";
import { Bell, Calendar, Clock, FileText, Flag, Sparkles, StickyNote, X } from "lucide-react";
import {
  fullTime,
  levelClass,
  levelTitle,
  shortTime,
  timeRange,
  type NativeCalendarEvent,
  type NativeCalendarReminder,
  type NativeCalendarResult,
} from "@/lib/nativeCalendar";

interface Props {
  result: NativeCalendarResult | null;
}

function Detail({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) {
  return (
    <div className="jv-sheet-section">
      <div className="jv-body jv-sheet-label">{icon}{label}</div>
      <div className="jv-body jv-sheet-text">{text}</div>
    </div>
  );
}

function EventSheet({ event, onClose }: { event: NativeCalendarEvent; onClose: () => void }) {
  return (
    <div className="jv-sheet-backdrop" onClick={onClose}>
      <div className="jv-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="jv-sheet-header">
          <div>
            <div className="jv-title">日历详情</div>
            <div className="jv-caption jv-muted">{event.title}</div>
          </div>
          <button type="button" className="jv-icon-plain" title="关闭" onClick={onClose}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>
        <div className="jv-sheet-body">
          <Detail icon={<FileText size={15} strokeWidth={2} />} label="标题" text={event.title} />
          <Detail icon={<Clock size={15} strokeWidth={2} />} label="时间" text={event.isAllDay ? "全天" : timeRange(event.start, event.end)} />
          <Detail icon={<Calendar size={15} strokeWidth={2} />} label="日历" text={event.calendar} />
          <Detail icon={<Flag size={15} strokeWidth={2} />} label="级别" text={levelTitle(event.priority)} />
          <Detail icon={<Sparkles size={15} strokeWidth={2} />} label="推荐理由" text={event.reasons.length === 0 ? "未获取" : event.reasons.join("\n")} />
        </div>
      </div>
    </div>
  );
}

function ReminderSheet({ reminder, onClose }: { reminder: NativeCalendarReminder; onClose: () => void }) {
  return (
    <div className="jv-sheet-backdrop" onClick={onClose}>
      <div className="jv-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="jv-sheet-header">
          <div>
            <div className="jv-title">提醒详情</div>
            <div className="jv-caption jv-muted">{reminder.title}</div>
          </div>
          <button type="button" className="jv-icon-plain" title="关闭" onClick={onClose}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>
        <div className="jv-sheet-body">
          <Detail icon={<FileText size={15} strokeWidth={2} />} label="标题" text={reminder.title} />
          <Detail icon={<Clock size={15} strokeWidth={2} />} label="截止时间" text={reminder.due === "" ? "未获取" : fullTime(reminder.due)} />
          <Detail icon={<Flag size={15} strokeWidth={2} />} label="级别" text={levelTitle(reminder.priority)} />
          <Detail icon={<StickyNote size={15} strokeWidth={2} />} label="备注" text={reminder.notes === "" ? "未获取" : reminder.notes} />
          <Detail icon={<Sparkles size={15} strokeWidth={2} />} label="推荐理由" text={reminder.reasons.length === 0 ? "未获取" : reminder.reasons.join("\n")} />
        </div>
      </div>
    </div>
  );
}

export default function NativeCalendarView({ result }: Props) {
  const [selectedEvent, setSelectedEvent] = useState<NativeCalendarEvent | null>(null);
  const [selectedReminder, setSelectedReminder] = useState<NativeCalendarReminder | null>(null);

  if (result === null) {
    return (
      <div className="jv-card">
        <div className="jv-empty">
          <div className="jv-title">日历提醒</div>
          <div className="jv-body jv-muted">未获取到数据。请先运行 native-calendar Skill，把输出 JSON 写入数据目录后刷新。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="jv-card">
      <div className="jv-skill-header">
        <div>
          <div className="jv-title">日历提醒</div>
          <div className="jv-caption jv-muted">
            今日日程 {result.summaryEventCount} 项 · 提醒 {result.summaryReminderCount} 项 · 逾期提醒 {result.summaryOverdueReminderCount} 项 · 首页推荐 {result.summaryHomepageItems} 项 · 来源：macOS Calendar / Reminders · 采集 {result.fetchedAt}
          </div>
        </div>
        <span className="jv-pill jv-pill-normal jv-caption">只读展示</span>
      </div>

      {result.events.length === 0 && result.reminders.length === 0 ? (
        <div className="jv-body jv-muted jv-empty">今日没有日历事件和提醒</div>
      ) : (
        <div className="jv-calendar-sections">
          {result.events.length > 0 && (
            <section className="jv-calendar-section">
              <div className="jv-calendar-section-title jv-body"><Calendar size={15} strokeWidth={2} />今日日程（{result.events.length}）</div>
              <div className="jv-calendar-event-row jv-caption">
                <span className="jv-skill-col-index">#</span>
                <span>日程</span>
                <span className="jv-calendar-col-calendar">日历</span>
                <span className="jv-calendar-col-time">时间</span>
                <span className="jv-calendar-col-level">级别</span>
              </div>
              {result.events.map((event, index) => (
                <button type="button" key={event.id} className="jv-calendar-event-row jv-body jv-calendar-item" onClick={() => setSelectedEvent(event)} title="点击查看日历详情">
                  <span className="jv-skill-col-index">{index + 1}</span>
                  <span className="jv-skill-main">
                    <span className="jv-body jv-skill-name">{event.title}</span>
                    {event.reasons.length > 0 && <span className="jv-caption">{event.reasons.join("；")}</span>}
                  </span>
                  <span className="jv-calendar-col-calendar">{event.calendar}</span>
                  <span className="jv-calendar-col-time">{event.isAllDay ? "全天" : timeRange(event.start, event.end)}</span>
                  <span className={"jv-calendar-col-level jv-level-" + levelClass(event.priority)}>{levelTitle(event.priority)}</span>
                </button>
              ))}
            </section>
          )}
          {result.reminders.length > 0 && (
            <section className="jv-calendar-section">
              <div className="jv-calendar-section-title jv-body"><Bell size={15} strokeWidth={2} />提醒事项（{result.reminders.length}）</div>
              <div className="jv-calendar-reminder-row jv-caption">
                <span className="jv-skill-col-index">#</span>
                <span>提醒</span>
                <span className="jv-calendar-col-time">截止时间</span>
                <span className="jv-calendar-col-level">级别</span>
              </div>
              {result.reminders.map((reminder, index) => (
                <button type="button" key={reminder.id} className="jv-calendar-reminder-row jv-body jv-calendar-item" onClick={() => setSelectedReminder(reminder)} title="点击查看提醒详情">
                  <span className="jv-skill-col-index">{index + 1}</span>
                  <span className="jv-skill-main">
                    <span className="jv-body jv-skill-name">{reminder.title}</span>
                    {reminder.notes !== "" && <span className="jv-caption">{reminder.notes}</span>}
                  </span>
                  <span className="jv-calendar-col-time">{reminder.due === "" ? "未获取" : shortTime(reminder.due)}</span>
                  <span className={"jv-calendar-col-level jv-level-" + levelClass(reminder.priority)}>{levelTitle(reminder.priority)}</span>
                </button>
              ))}
            </section>
          )}
        </div>
      )}

      {selectedEvent && <EventSheet event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
      {selectedReminder && <ReminderSheet reminder={selectedReminder} onClose={() => setSelectedReminder(null)} />}
    </div>
  );
}
