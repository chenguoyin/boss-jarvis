import { useState } from "react";
import { FileText, Lightbulb, MailOpen, RefreshCw, Reply, X } from "lucide-react";
import { mailLevelTitle, type MailLevel, type MailMessage, type MailResult } from "@/lib/mail";

interface Props {
  result: MailResult | null;
  readStatus: string | null;
  replyStatus: string | null;
  replyingIds: ReadonlySet<number>;
  hiddenIds: ReadonlySet<number>;
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
          <LevelBadge level={message.level} />
          <button type="button" className="jv-icon-plain" title="关闭" onClick={onClose}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>
        <div className="jv-sheet-body">
          {message.bodyHtml === "" ? (
            <section className="jv-sheet-section">
              <div className="jv-body jv-sheet-label"><FileText size={15} strokeWidth={2} />正文摘要</div>
              <div className="jv-body jv-sheet-text">{message.bodySummary === "" ? "未获取" : message.bodySummary}</div>
            </section>
          ) : (
            <section className="jv-sheet-section jv-mail-body-section">
              <div className="jv-body jv-sheet-label"><FileText size={15} strokeWidth={2} />邮件正文</div>
              <div className="jv-mail-html">
                <iframe title="邮件正文" sandbox="" srcDoc={message.bodyHtml} />
              </div>
            </section>
          )}
          <section className="jv-sheet-section">
            <div className="jv-body jv-sheet-label">
              <Lightbulb size={15} strokeWidth={2} className={message.needsReply ? "jv-level-attention" : undefined} />
              回复建议
            </div>
            <div className="jv-body jv-sheet-text">{message.replyBasis === "" ? "未获取" : message.replyBasis}</div>
          </section>
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
            未获取到数据。请先运行 company-mail Skill，把输出 JSON 写入数据目录后刷新。
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
            未读 {result.count} 封 · 需回复 {result.needsReplyCount} 封 · 来源：macOS Mail · 采集 {result.fetchedAt}
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
        <div className="jv-mail-list">
          <div className="jv-mail-row jv-mail-row-head">
            <span>#</span>
            <span>主题</span>
            <span>发件人</span>
            <span>级别</span>
            <span>时间</span>
            <span />
          </div>
          {result.items.map((message, index) => (
            <button
              type="button"
              key={message.id}
              className="jv-mail-row jv-mail-row-body"
              title="查看详情并同步为已读"
              onClick={() => {
                setSelected(message);
                onMarkRead(message);
              }}
            >
              <span className="jv-caption jv-mail-index">{index + 1}</span>
              <span className="jv-mail-main">
                <span className="jv-mail-title-line">
                  {message.needsReply && <span className="jv-mail-dot" />}
                  <span className="jv-body jv-mail-subject">{message.subject}</span>
                </span>
                {message.needsReply && message.replyBasis !== "" && (
                  <span className="jv-caption jv-mail-basis">{message.replyBasis}</span>
                )}
              </span>
              <span className="jv-caption jv-mail-sender">{message.sender === "" ? "未获取" : message.sender}</span>
              <span className={"jv-caption jv-level-" + message.level}>{mailLevelTitle(message.level)}</span>
              <span className="jv-caption jv-mail-time">{message.displayTime}</span>
              <span />
            </button>
          ))}
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
