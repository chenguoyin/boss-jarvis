import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Inbox,
  ListChecks,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Fragment } from "react";
import type { DashboardSnapshot } from "@/lib/dashboard";
import type { HomeModuleConfig, HomeModuleId } from "@/lib/config";

interface Props {
  snapshot: DashboardSnapshot;
  onNavigate: (sectionId: string) => void;
  onOpenMailReply: (message: DashboardSnapshot["mailItems"][number]) => void;
  replyingMailIds: ReadonlySet<number>;
  homeModules: HomeModuleConfig;
}

function Panel({
  icon,
  title,
  subtitle,
  pill,
  footer,
  solidText,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  pill?: { value: string; label: string; level: string };
  footer: string;
  solidText?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={"jv-home-panel" + (solidText ? " jv-home-solid" : "")}>
      <header className="jv-home-panel-header">
        <span className="jv-home-panel-icon">{icon}</span>
        <div className="jv-home-panel-heading">
          <div className="jv-title">{title}</div>
          <div className="jv-caption jv-muted">{subtitle}</div>
        </div>
        {pill && (
          <span className={"jv-caption jv-home-count jv-level-bg-" + pill.level + " jv-level-" + pill.level}>
            <b>{pill.value}</b>
            {pill.label}
          </span>
        )}
      </header>
      {children}
      <footer className="jv-caption jv-faint">{footer}</footer>
    </section>
  );
}

function PositiveState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="jv-home-positive">
      <CheckCircle2 size={18} strokeWidth={2} className="jv-level-normal" />
      <div>
        <div className="jv-title">{title}</div>
        <div className="jv-caption jv-muted">{detail}</div>
      </div>
    </div>
  );
}

export default function DashboardView({ snapshot, onNavigate, onOpenMailReply, replyingMailIds, homeModules }: Props) {
  const { headline } = snapshot;
  const hidden = homeModules.hidden;
  const showModule = (id: HomeModuleId) => !hidden.has(id);
  const cardModule = (id: Extract<HomeModuleId, "todo" | "summary" | "risk" | "mail">) => {
    if (id === "todo") {
      return (
        <Panel
          icon={<Sparkles size={15} strokeWidth={2} />}
          title="今日待办提醒"
          subtitle="按紧急度排序 · 只列 Top 3"
          pill={{
            value: String(snapshot.urgentTodoCount),
            label: "项紧急",
            level: snapshot.urgentTodoCount > 0 ? "urgent" : "normal",
          }}
          footer={"来源：统一提醒中心 · 更新 " + snapshot.remindersFetchedAt}
          solidText
        >
          {snapshot.todoItems.length === 0 ? (
            <PositiveState title="今日无紧急事项" detail="低优先级提醒已在后台归档，可随时查看" />
          ) : (
            snapshot.todoItems.map((item) => (
              <button
                type="button"
                key={item.title + item.timeLabel}
                className="jv-home-todo"
                title={"去处理：" + item.title}
                onClick={() => onNavigate(item.targetSection)}
              >
                <span className={"jv-home-todo-bar jv-level-bg-" + item.level} />
                <span className="jv-home-todo-main">
                  <span className="jv-title">{item.title}</span>
                  <span className="jv-caption jv-muted">
                    {item.sourceLabel} · {item.timeLabel} · {item.detailLabel}
                  </span>
                </span>
                <span className="jv-control jv-home-link">去处理</span>
              </button>
            ))
          )}
        </Panel>
      );
    }
    if (id === "summary") {
      return (
        <Panel
          icon={<ListChecks size={15} strokeWidth={2} />}
          title="今日需处理事项"
          subtitle="跨系统聚合 · 点击进入对应系统"
          pill={{
            value: String(snapshot.aggregateItems.reduce((sum, item) => sum + (item.count ?? 0), 0)),
            label: "项待办",
            level: "attention",
          }}
          footer={"来源：OA / 企业邮箱 / 日历提醒 · 更新 " + headline.updatedAt}
        >
          {snapshot.aggregateItems.map((item) => (
            <button
              type="button"
              key={item.title}
              className="jv-home-aggregate"
              title={"查看" + item.title}
              onClick={() => onNavigate(item.targetSection)}
            >
              <span className={"jv-title jv-level-" + item.level}>{item.count === null ? "未获取" : item.count}</span>
              <span className="jv-home-aggregate-main">
                <span className="jv-title">{item.title}</span>
                <span className="jv-caption jv-muted">{item.detail}</span>
              </span>
              <ChevronRight size={15} strokeWidth={2} className="jv-faint" />
            </button>
          ))}
          {snapshot.hiddenLowPriority > 0 && (
            <div className="jv-caption jv-faint">低优先级已折叠 {snapshot.hiddenLowPriority} 项</div>
          )}
        </Panel>
      );
    }
    if (id === "risk") {
      return (
        <Panel
          icon={<ShieldAlert size={15} strokeWidth={2} />}
          title="风险提示与建议"
          subtitle="影响程度分级 · AI 建议可直接采纳"
          pill={{
            value: String(snapshot.riskItems.filter((item) => item.impact === "high").length),
            label: "高影响",
            level: snapshot.riskItems.some((item) => item.impact === "high") ? "urgent" : "normal",
          }}
          footer={"来源：统一提醒中心 / 邮件分析 / 虹翼 · 更新 " + headline.updatedAt}
          solidText
        >
          {snapshot.riskItems.length === 0 ? (
            <PositiveState title="当前无高风险项" detail="应收、项目与合同风险均在阈值内，持续监控中" />
          ) : (
            snapshot.riskItems.map((risk) => (
              <div key={risk.conclusion} className="jv-home-risk">
                <div className="jv-home-risk-top">
                  <span className={"jv-caption jv-home-risk-impact jv-level-" + risk.impact + " jv-level-bg-" + risk.impact}>
                    {risk.impact === "high" ? "高" : "中"}
                  </span>
                  <span className="jv-body jv-home-risk-text">{risk.conclusion}</span>
                </div>
                <div className="jv-caption jv-muted">
                  <b className="jv-home-advice">AI 建议</b>
                  {risk.advice}
                </div>
                <div className="jv-caption jv-faint">{risk.sourceLabel}</div>
              </div>
            ))
          )}
        </Panel>
      );
    }
    return (
      <Panel
        icon={<Inbox size={15} strokeWidth={2} />}
        title="待回复邮件"
        subtitle="按紧急度与时间排序 · 前 3 封"
        pill={{
          value: String(snapshot.mailNeedsReplyCount ?? 0),
          label: "待回复",
          level: (snapshot.mailNeedsReplyCount ?? 0) > 0 ? "attention" : "normal",
        }}
        footer={"来源：企业邮箱 · 更新 " + headline.updatedAt + " · 回复在邮件客户端打开草稿，由您发送"}
        solidText
      >
        {snapshot.mailItems.length === 0 ? (
          <PositiveState title="暂无待回复邮件" detail="未读邮件均已判定为阅读掌握类" />
        ) : (
          snapshot.mailItems.map((message) => (
            <div key={message.id} className="jv-home-mail">
              <div className="jv-home-mail-main">
                <div className="jv-title jv-home-mail-subject">{message.subject}</div>
                <div className="jv-caption jv-muted">{message.sender === "" ? "未获取" : message.sender} · {message.displayTime}</div>
                {message.replyBasis !== "" && <div className="jv-caption jv-faint">{message.replyBasis}</div>}
              </div>
              <button
                type="button"
                className="jv-control jv-home-mail-reply"
                title="在邮件客户端打开回复草稿，不代发"
                disabled={replyingMailIds.has(message.id)}
                onClick={() => onOpenMailReply(message)}
              >
                {replyingMailIds.has(message.id) ? "生成中..." : "回复"}
              </button>
            </div>
          ))
        )}
      </Panel>
    );
  };
  const orderedCards = homeModules.order.filter(
    (id): id is Extract<HomeModuleId, "todo" | "summary" | "risk" | "mail"> =>
      id === "todo" || id === "summary" || id === "risk" || id === "mail",
  );
  const upperCards = orderedCards.slice(0, 2);
  const lowerCards = orderedCards.slice(2, 4);
  return (
    <div className="jv-home">
      {showModule("verdict") && (
        <section className="jv-home-verdict">
          <div className="jv-home-verdict-top">
            <span className={"jv-home-status-dot jv-level-" + headline.statusLevel} />
            <span className="jv-caption jv-muted">{headline.statusText}</span>
            <span className="jv-home-verdict-time">数据更新于 {headline.updatedAt}</span>
          </div>
          <div className="jv-home-headline">{headline.text}</div>
          <div className="jv-home-chips">
            {headline.chips.map((chip) => (
              <span key={chip.label} className={"jv-caption jv-home-chip jv-level-" + chip.level}>
                <b>{chip.value}</b>
                {chip.label}
              </span>
            ))}
          </div>
        </section>
      )}

      {upperCards.length > 0 && (
        <div className="jv-home-grid">
          {upperCards.map((id) => (
            <Fragment key={id}>{cardModule(id)}</Fragment>
          ))}
        </div>
      )}
      {lowerCards.length > 0 && (
        <div className="jv-home-grid">
          {lowerCards.map((id) => (
            <Fragment key={id}>{cardModule(id)}</Fragment>
          ))}
        </div>
      )}

      {showModule("metrics") && (
        <Panel
          icon={<BarChart3 size={15} strokeWidth={2} />}
          title="经营情况速览"
          subtitle="今日 · 本月 · 年度 · 虹翼口径"
          pill={{
            value: String(snapshot.metricItems.filter((item) => item.isMissing).length),
            label: "项未获取",
            level: snapshot.metricItems.some((item) => item.isMissing) ? "attention" : "normal",
          }}
          footer={"来源：虹翼系统 · 更新 " + headline.updatedAt + " · 点击进入经营情况页"}
          solidText
        >
          <div className="jv-home-metrics">
            {snapshot.metricItems.map((metric) => (
              <div key={metric.title} className="jv-home-metric">
                <div className="jv-caption jv-muted">{metric.title}</div>
                <div className={"jv-title " + (metric.isMissing ? "jv-faint" : "")}>{metric.value}</div>
                <div className={"jv-caption " + (metric.isMissing ? "jv-level-attention" : "jv-muted")}>{metric.note}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
