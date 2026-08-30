import { useState } from "react";
import { CalendarClock, FileText, Lightbulb, MailOpen, RefreshCw, Reply, X } from "lucide-react";
import { mailLevelTitle, type MailLevel, type MailMessage, type MailResult } from "@/lib/mail";

interface Props {
  result: MailResult | null;
  readStatus: string | null;
  replyStatus: string | null;
  replyingIds: ReadonlySet<number | string>;
  hiddenIds: ReadonlySet<number | string>;
  onMarkRead: (message: MailMessage) => void;
  onOpenReply: (message: MailMessage) => void;
}

function LevelBadge({ level }: { level: MailLevel }) {
  return (
    <span className={"jv-caption jv-mail-level-badge jv-level-bg-" + level + " jv-level-" + level}>
      {mailLevelTitle(level)}
    </span>
  );
}

function PriorityBadge({ label }: { label: string }) {
  if (label === "") return null;
  return (
    <span className="jv-caption jv-mail-priority-badge">
      {label}
    </span>
  );
}

// 生成简短分析文案（100字内）
function buildAnalysisSnippet(message: MailMessage): string {
  if (!message.needsReply) {
    return "通知类，无需回复";
  }
  const basis = message.replyBasis || "需要回复";
  // 如果有明确截止时间
  if (message.reminderCandidate) {
    return "需回复：" + basis + "，已识别截止时间";
  }
  return "需回复：" + basis;
}

function mailBodyHtml(message: MailMessage): string {
  if (message.bodyHtml !== "") return message.bodyHtml;
  const escaped = message.bodySummary === ""
    ? "未获取"
    : message.bodySummary
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
  return '<div style="font:menu;line-height:1.65;color:CanvasText;padding:16px;white-space:pre-wrap;word-break:break-word;">' + escaped + '</div>';
}

function DetailSheet({
  message,
  replyStatus,
  isReplying,
  onClose,
  onOpenReply,
}: {
  message: MailMessage;
  replyStatus: string | null;
  isReplying: boolean;
  onClose: () => void;
  onOpenReply: (message: MailMessage) => void;
}) {
  return (
    <div className="jv-sheet-backdrop" onClick={onClose}>
      <div className="jv-sheet jv-mail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="jv-sheet-header">
          <div className="jv-mail-sheet-heading">
            <div className="jv-title jv-mail-sheet-subject">{message.subject}</div>
            <div className="jv-caption jv-muted">
              发件人：{message.sender === "" ? "未获取" : message.sender} · 时间：{message.displayTime}
            </div>
          </div>
          <div className="jv-mail-sheet-badges">
            <LevelBadge level={message.level} />
            <PriorityBadge label={message.priorityLabel} />
          </div>
          <button type="button" className="jv-icon-plain" title="关闭" onClick={onClose}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>
        <div className="jv-sheet-body">
          <section className="jv-sheet-section jv-mail-body-section">
            <div className="jv-body jv-sheet-label"><FileText size={15} strokeWidth={2} />邮件正文</div>
            <div className="jv-mail-html">
              <iframe title="邮件正文" sandbox="" srcDoc={mailBodyHtml(message)} />
            </div>
          </section>
          <section className="jv-sheet-section">
            <div className="jv-body jv-sheet-label">
              <Lightbulb size={15} strokeWidth={2} className={message.needsReply ? "jv-level-attention" : undefined} />
              回复建议
            </div>
            <div className="jv-body jv-sheet-text">{message.replyBasis === "" ? "未获取" : message.replyBasis}</div>
          </section>
          {message.reminderCandidate && (
            <div className="jv-caption jv-mail-reminder-note">
              <CalendarClock size={15} strokeWidth={2} />
              已识别到行动截止时间，建议创建日历提醒
            </div>
          )}
          {replyStatus !== null && (
            <div className="jv-caption jv-mail-action-status">{replyStatus}</div>
          )}
        </div>
        <div className="jv-mail-action-bar">
          <button
            type="button"
            className="jv-control jv-mail-reply-button"
            title="在邮件客户端打开回复草稿，由您点击发送"
            disabled={isReplying}
            onClick={() => onOpenReply(message)}
          >
            {isReplying
              ? <RefreshCw size={15} strokeWidth={2} className="jv-refresh-spin" />
              : <Reply size={15} strokeWidth={2} />}
            {isReplying ? "正在生成草稿..." : "回复"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MailView({
  result,
  readStatus,
  replyStatus,
  replyingIds,
  hiddenIds,
  onMarkRead,
  onOpenReply,
}: Props) {
  const [selected, setSelected] = useState<MailMessage | null>(null);
  const hiddenCount = hiddenIds.size;

  if (result === null) {
    return (
      <div className="jv-card">
        <div className="jv-empty">
          <MailOpen size={40} strokeWidth={1.5} />
          <div className="jv-title">邮件 · 未获取</div>
          <div className="jv-body jv-muted">
            未获取到数据。请先运行邮件 Skill，把输出 JSON 写入数据目录后刷新。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jv-card">
      <div className="jv-skill-header">
        <div>
          <div className="jv-title">邮件</div>
          <div className="jv-caption jv-muted">
            未读 {result.count} 封 · 需回复 {result.needsReplyCount} 封 · 待提醒 {result.reminderCandidateCount} 封 · 来源：{result.sourceSystem ?? "邮件"} · 采集 {result.fetchedAt}
            {hiddenCount > 0 ? ` · 本次已同步已读 ${hiddenCount} 封` : ""}
          </div>
        </div>
        <span className="jv-caption jv-mail-hint">回复直接打开邮件客户端</span>
      </div>
      {(readStatus !== null || replyStatus !== null) && (
        <div className="jv-caption jv-mail-page-status">
          {readStatus ?? replyStatus}
        </div>
      )}
      {result.items.length === 0 ? (
        <div className="jv-body jv-muted jv-mail-empty">当前没有未读邮件</div>
      ) : (
        <div className="jv-mail-card-list">
          {result.items.map((message, index) => {
            const analysisSnippet = buildAnalysisSnippet(message);
            const isReplying = replyingIds.has(message.id);
            return (
              <div
                key={message.id}
                className="jv-mail-card"
                onClick={() => {
                  setSelected(message);
                  onMarkRead(message);
                }}
              >
                <div className="jv-mail-card-header">
                  <span className="jv-caption jv-mail-index">{index + 1}</span>
                  <div className="jv-mail-card-main">
                    <div className="jv-mail-card-subject-line">
                      <span className="jv-body jv-mail-subject">{message.subject}</span>
                    </div>
                    <div className="jv-mail-card-sender">{message.sender === "" ? "未获取" : message.sender}</div>
                    <div className="jv-mail-card-meta">
                      <span className="jv-caption jv-mail-time">{message.displayTime}</span>
                      <LevelBadge level={message.level} />
                      <PriorityBadge label={message.priorityLabel} />
                    </div>
                  </div>
                </div>
                <div className="jv-mail-card-footer">
                  <div className="jv-mail-card-analysis">
                    {message.needsReply ? (
                      <span className="jv-mail-analysis-highlight">需回复</span>
                    ) : (
                      <span className="jv-mail-analysis-ok">通知类</span>
                    )}
                    <span className="jv-mail-analysis-text">，{analysisSnippet.replace(/^(需回复：|通知类，)/, "")}</span>
                  </div>
                  {message.needsReply && (
                    <button
                      type="button"
                      className="jv-mail-card-reply-btn"
                      disabled={isReplying}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenReply(message);
                      }}
                    >
                      {isReplying
                        ? <RefreshCw size={13} strokeWidth={2} className="jv-refresh-spin" />
                        : <Reply size={13} strokeWidth={2} />}
                      {isReplying ? "正在生成草稿..." : "回复"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {selected && (
        <DetailSheet
          message={selected}
          replyStatus={replyStatus}
          isReplying={replyingIds.has(selected.id)}
          onClose={() => setSelected(null)}
          onOpenReply={onOpenReply}
        />
      )}
    </div>
  );
}
