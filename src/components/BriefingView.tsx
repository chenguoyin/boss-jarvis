import {
  ChevronRight,
  ChevronDown,
  Check,
  Eye,
  Link2,
  Timer,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { approveTodo } from "@/lib/skillBridge";
import type { DailyBriefing, BriefingItem } from "@/lib/dailyBriefing";

interface Props {
  briefing: DailyBriefing | null;
  isRunning: boolean;
  onNavigate: (sectionTitle: string) => void;
  onApprovalDone: (summary: string) => void;
}

type SectionKey = "mustDoItems" | "focusItems" | "watchItems";

const sectionMeta: Record<SectionKey, { label: string; icon: typeof Eye; level: string; hint: string }> = {
  mustDoItems: { label: "现在就要处理", icon: TriangleAlert, level: "urgent", hint: "按紧急度排序" },
  focusItems: { label: "今日关注", icon: Zap, level: "attention", hint: "预计需要占用今天的时间" },
  watchItems: { label: "持续观察", icon: Eye, level: "normal", hint: "暂不需要动手，趋势类信号" },
};

const collapsedCount = 5;

const sourceTargets: Record<string, string> = {
  oa: "oa-todo",
  spm: "oa-todo",
  mail: "mail",
  calendar: "calendar",
  reminder: "calendar",
};

const sourceNames: Record<string, string> = {
  oa: "OA",
  spm: "SPM 资金费用",
  mail: "邮件",
  calendar: "日历",
  reminder: "提醒中心",
  generic: "通用提醒",
};

function BriefDetailSheet({
  item,
  onClose,
  onNavigate,
  onApprove,
}: {
  item: BriefingItem;
  onClose: () => void;
  onNavigate: (sectionTitle: string) => void;
  onApprove: (item: BriefingItem, comment: string, approve: boolean) => void;
}) {
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const target = sourceTargets[item.source];
  const execute = (approve: boolean) => {
    setPending(true);
    void onApprove(item, comment, approve);
  };
  return (
    <div className="jv-sheet-backdrop" onClick={onClose}>
      <div className="jv-sheet jv-brief-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="jv-sheet-header">
          <div>
            <div className="jv-title">{item.title}</div>
            <div className="jv-caption jv-muted">
              来源：{sourceNames[item.source] ?? item.source} · 处理时限：{item.deferHint ?? "未获取"}
            </div>
          </div>
          <button type="button" className="jv-icon-plain" title="关闭" onClick={onClose}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>
        <div className="jv-sheet-body">
          <section className="jv-sheet-section">
            <div className="jv-sheet-label jv-sheet-label-detail"><TriangleAlert size={15} strokeWidth={2} />处理依据</div>
            {item.basis.length > 0 ? (
              <div className="jv-sheet-risks">
                {item.basis.map((risk, index) => (
                  <div key={index} className="jv-sheet-risk">
                    <span className="jv-caption jv-sheet-risk-index">{index + 1}</span>
                    <span className="jv-body jv-sheet-text">{risk}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="jv-caption jv-muted">未获取依据，建议打开原单核对。</div>
            )}
          </section>
          {item.approvable && (
            <section className="jv-sheet-section jv-sheet-section-risk">
              <div className="jv-sheet-label jv-sheet-label-risk"><Check size={15} strokeWidth={2} />审批意见</div>
              <textarea
                className="jv-oa-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="同意/不同意理由（可选）"
                rows={2}
              />
              <div className="jv-brief-sheet-actions">
                <button type="button" className="jv-btn-ok" disabled={pending} onClick={() => execute(true)}>
                  <Check size={14} strokeWidth={2.4} />
                  同意
                </button>
                <button type="button" className="jv-btn-no" disabled={pending} onClick={() => execute(false)}>
                  <X size={14} strokeWidth={2.4} />
                  不同意
                </button>
              </div>
            </section>
          )}
        </div>
        <div className="jv-sheet-footer">
          {target !== undefined ? (
            <button type="button" className="jv-btn-ok" onClick={() => { onNavigate(target); onClose(); }}>
              <ChevronRight size={14} strokeWidth={2.4} />
              去处理
            </button>
          ) : (
            <span className="jv-caption jv-muted">该条暂无直达处理入口，请在来源系统中处理。</span>
          )}
        </div>
      </div>
    </div>
  );
}

function BriefCard({
  sectionKey,
  items,
  expanded,
  onToggle,
  onOpenItem,
}: {
  sectionKey: SectionKey;
  items: BriefingItem[];
  expanded: boolean;
  onToggle: () => void;
  onOpenItem: (item: BriefingItem) => void;
}) {
  const { label, icon: Icon, level, hint } = sectionMeta[sectionKey];
  const isMust = sectionKey === "mustDoItems";
  const visible = expanded ? items : items.slice(0, collapsedCount);
  const collapsible = items.length > collapsedCount;
  return (
    <section className="jv-brief-card">
      <header className="jv-brief-card-head">
        <span className={"jv-brief-mark jv-brief-mark-" + level}>
          <Icon size={15} strokeWidth={2} />
        </span>
        <div>
          <div className="jv-brief-card-title">{label}</div>
          <div className="jv-caption jv-muted">{hint}</div>
        </div>
        <span className={"jv-caption jv-brief-count jv-brief-count-" + level}>
          <b>{items.length}</b> 项
        </span>
      </header>
      {items.length === 0 ? (
        <div className="jv-caption jv-muted jv-brief-card-empty">无</div>
      ) : (
        <ul className={isMust ? "jv-brief-must-list" : "jv-brief-list"}>
          {visible.map((item, index) => (
            <li
              key={index}
              className={(isMust ? "jv-brief-must-item" : "jv-brief-row") + " jv-brief-clickable"}
              role="button"
              tabIndex={0}
              onClick={() => onOpenItem(item)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenItem(item);
                }
              }}
            >
              {isMust && <span className={"jv-brief-bar jv-brief-bar-" + level} />}
              <div className={isMust ? "jv-brief-must-body" : "jv-brief-row-body"}>
                <span className="jv-brief-text">{item.title}</span>
                {item.deferHint !== null && (
                  <span className={"jv-caption jv-brief-tag jv-brief-tag-" + level}>{item.deferHint}</span>
                )}
              </div>
              {isMust && (
                <span className="jv-brief-go">
                  <ChevronRight size={15} strokeWidth={2} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {collapsible && (
        <button type="button" className="jv-caption jv-brief-more" onClick={onToggle}>
          {expanded ? "收起" : "展开全部 " + items.length + " 条"}
          {!expanded && <ChevronDown size={13} strokeWidth={2} />}
        </button>
      )}
    </section>
  );
}

export default function BriefingView({ briefing, isRunning, onNavigate, onApprovalDone }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<BriefingItem | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);

  const handleApprove = async (item: BriefingItem, comment: string, approve: boolean) => {
    const skill = item.source === "spm" ? "spm-todo" : "oa-todo";
    const outcome = await approveTodo({ skill, title: item.title, comment, approve }).catch(
      (error: unknown) => ({ ok: false, summary: `命令执行失败：${String(error)}` }),
    );
    setApprovalStatus(outcome.summary);
    onApprovalDone(outcome.summary);
    setDetail(null);
  };

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

  const toggle = (key: SectionKey) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="jv-brief-page">
      <header className="jv-brief-head">
        <div>
          <div className="jv-title">每日晨报</div>
          <div className="jv-caption jv-muted">
            {briefing.today} · 生成 {briefing.generatedAt}
          </div>
        </div>
        <div className="jv-brief-head-right">
          {isRunning && <span className="jv-caption jv-muted">正在生成每日晨报…</span>}
          <span className={"jv-brief-pill" + (briefing.scheduleInstalled ? "" : " jv-brief-pill-warn")}>
            <span className="jv-brief-dot" />
            定时巡检 · 每日 {briefing.scheduleTime ?? "未获取"}
          </span>
          {briefing.unavailableSources > 0 && (
            <span className="jv-brief-pill jv-brief-pill-warn">
              <span className="jv-brief-dot" />
              {briefing.unavailableSources} 个来源未获取
            </span>
          )}
        </div>
      </header>

      <section className={"jv-brief-verdict" + (briefing.mustDoNow === 0 ? " calm" : "")}>
        <div className="jv-caption jv-brief-verdict-label">
          <span className="jv-brief-pulse" />
          今晨结论
        </div>
        <p className="jv-brief-headline">{briefing.headline}</p>
        <div className="jv-brief-chips">
          <span className="jv-brief-chip jv-brief-chip-danger">
            <b>{briefing.mustDoNow}</b>紧急优先
          </span>
          <span className="jv-brief-chip jv-brief-chip-warn">
            <b>{briefing.focusToday}</b>今日关注
          </span>
          <span className="jv-brief-chip jv-brief-chip-ok">
            <b>{briefing.watchList}</b>持续观察
          </span>
          <span className="jv-brief-chip">
            <b>{briefing.hiddenLowPriority === 0 && briefing.total === 0 ? "未获取" : briefing.hiddenLowPriority}</b>低优先隐藏
          </span>
        </div>
        <div className="jv-caption jv-faint jv-brief-verdict-meta">共聚合 {briefing.total} 条提醒</div>
      </section>

      <div className="jv-brief-grid">
        <div className="jv-brief-col">
          <BriefCard
            sectionKey="mustDoItems"
            items={briefing.mustDoItems}
            expanded={expanded.mustDoItems === true}
            onToggle={() => toggle("mustDoItems")}
            onOpenItem={setDetail}
          />
        </div>
        <div className="jv-brief-stack">
          <BriefCard
            sectionKey="focusItems"
            items={briefing.focusItems}
            expanded={expanded.focusItems === true}
            onToggle={() => toggle("focusItems")}
            onOpenItem={setDetail}
          />
          <BriefCard
            sectionKey="watchItems"
            items={briefing.watchItems}
            expanded={expanded.watchItems === true}
            onToggle={() => toggle("watchItems")}
            onOpenItem={setDetail}
          />
        </div>
      </div>

      {detail !== null && (
        <BriefDetailSheet
          item={detail}
          onClose={() => setDetail(null)}
          onNavigate={onNavigate}
          onApprove={handleApprove}
        />
      )}

      {approvalStatus !== null && (
        <div className="jv-caption jv-oa-status jv-level-normal">{approvalStatus}</div>
      )}

      <footer className="jv-caption jv-muted jv-brief-foot">
        <span className="jv-brief-foot-label">
          <Link2 size={13} strokeWidth={2} />
          数据来源
        </span>
        <span className="jv-brief-foot-sep">|</span>
        <span>{briefing.sourceLabels.length > 0 ? briefing.sourceLabels.join(" · ") : "未获取"}</span>
        <span className="jv-brief-foot-sep">|</span>
        <span className={"jv-brief-foot-schedule" + (briefing.scheduleInstalled ? "" : " jv-level-attention")}>
          <Timer size={13} strokeWidth={2} />
          定时巡检：每日 {briefing.scheduleTime ?? "未获取"} · {briefing.scheduleInstalled ? "已安装" : "未安装，需确认后安装"}
        </span>
      </footer>
    </div>
  );
}
