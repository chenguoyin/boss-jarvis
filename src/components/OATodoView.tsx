import { useState } from "react";
import { Check, FileText, ListChecks, TriangleAlert, X } from "lucide-react";
import { groupOATodo, summarizeOATodo, type OATodoItem, type OATodoResult } from "@/lib/oaTodo";

interface Props {
  result: OATodoResult | null;
  onApprove: (item: OATodoItem, comment: string) => void;
  onReject: (item: OATodoItem, comment: string) => void;
  approvalStatus: string | null;
}

type SheetPending = "approve" | "reject" | null;

function DetailFields({ item }: { item: OATodoItem }) {
  const detail = item.documentDetail;
  if (!detail) return null;
  const fields = detail.fields.slice(0, 36);
  const tables = detail.tables.slice(0, 4);
  const attachments = detail.attachments.slice(0, 20);
  const sourceLine = [
    detail.sourceSystem || item.source || "未获取",
    detail.host || "未获取",
    detail.pageTitle || "",
  ].filter(Boolean).join(" · ");
  return (
    <>
      <section className="jv-sheet-section">
        <div className="jv-sheet-label jv-sheet-label-detail"><FileText size={15} strokeWidth={2} />来源与页面</div>
        <div className="jv-body jv-sheet-text">{sourceLine}</div>
      </section>
      {fields.length > 0 && (
        <section className="jv-sheet-section">
          <div className="jv-sheet-label jv-sheet-label-detail"><FileText size={15} strokeWidth={2} />单据字段</div>
          <div className="jv-oa-field-grid">
            {fields.map((field, index) => (
              <div key={`${field.name}-${field.label}-${index}`} className="jv-oa-field">
                <span className="jv-caption jv-muted">{field.label}</span>
                <span className="jv-body">{field.value}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {tables.length > 0 && (
        <section className="jv-sheet-section">
          <div className="jv-sheet-label jv-sheet-label-detail"><FileText size={15} strokeWidth={2} />明细表</div>
          <div className="jv-oa-detail-tables">
            {tables.map((table, tableIndex) => (
              <div key={tableIndex} className="jv-oa-detail-table-wrap">
                <table className="jv-oa-detail-table">
                  <tbody>
                    {table.slice(0, 16).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.slice(0, 8).map((cell, cellIndex) => (
                          <td key={cellIndex} className="jv-body">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}
      {attachments.length > 0 && (
        <section className="jv-sheet-section">
          <div className="jv-sheet-label jv-sheet-label-detail"><FileText size={15} strokeWidth={2} />附件</div>
          <div className="jv-oa-attachments">
            {attachments.map((attachment, index) => (
              <div key={`${attachment.text}-${index}`} className="jv-body jv-oa-attachment">
                {attachment.text}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function DetailSheet({
  item,
  pending,
  onClose,
  onApprove,
  onReject,
}: {
  item: OATodoItem;
  pending: SheetPending;
  onClose: () => void;
  onApprove: (item: OATodoItem, comment: string) => void;
  onReject: (item: OATodoItem, comment: string) => void;
}) {
  const analysis = item.analysis;
  const bodyPreview = item.documentDetail?.bodyPreview || analysis?.detail || "";
  const [comment, setComment] = useState(analysis?.suggestion ?? "");
  return (
    <div className="jv-sheet-backdrop" onClick={onClose}>
      <div className="jv-sheet jv-oa-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="jv-sheet-header">
          <div>
            <div className="jv-title">{item.title}</div>
            <div className="jv-caption jv-muted">
              来源：{item.source || "未获取"} · 发送人：{item.displaySender || "未获取"} · {item.time || "未获取"}
            </div>
          </div>
          <button type="button" className="jv-icon-plain" title="关闭" onClick={onClose}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>
        <div className="jv-sheet-body">
          <DetailFields item={item} />
          {analysis ? (
            <>
              <section className="jv-sheet-section">
                <div className="jv-sheet-label jv-sheet-label-detail"><FileText size={15} strokeWidth={2} />正文预览</div>
                <div className="jv-body jv-sheet-text">{bodyPreview || "未获取"}</div>
              </section>
              <section className="jv-sheet-section">
                <div className="jv-sheet-label jv-sheet-label-suggestion"><ListChecks size={15} strokeWidth={2} />审核建议</div>
                <div className="jv-verdict-row">
                  <span className="jv-verdict-chip jv-verdict-chip-lg" data-tone={analysis.verdictTone}>{analysis.verdict}</span>
                  {analysis.adviceBody ? (
                    <span className="jv-body jv-sheet-text jv-oa-advice-body">{analysis.adviceBody}</span>
                  ) : null}
                </div>
              </section>
              <section className="jv-sheet-section jv-sheet-section-risk">
                <div className={"jv-sheet-label jv-sheet-label-risk jv-level-" + analysis.riskLevel}>
                  <TriangleAlert size={15} strokeWidth={2} />风险点
                </div>
                <div className="jv-sheet-risks">
                  {analysis.riskPoints.map((risk, index) => (
                    <div key={index} className="jv-sheet-risk">
                      <span className="jv-caption jv-sheet-risk-index">{index + 1}</span>
                      <span className="jv-body jv-sheet-text">{risk}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div className="jv-body jv-muted">
              {item.analyzeError || "该单据暂无实时风险分析，请刷新 OA 后重试。"}
            </div>
          )}
        </div>
        <div className="jv-oa-approval">
          <label className="jv-caption jv-muted" htmlFor="jv-oa-comment">审批意见</label>
          <div className="jv-oa-approval-row">
            <textarea
              id="jv-oa-comment"
              className="jv-body jv-oa-comment"
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="输入审批意见"
            />
            <div className="jv-oa-approval-buttons">
              {pending === null ? (
                <>
                  <button type="button" className="jv-control jv-oa-approve"
                    title="同意：立即提交真实审批"
                    onClick={() => { onApprove(item, comment); onClose(); }}>
                    <Check size={15} strokeWidth={2} /> 同意
                  </button>
                  <button type="button" className="jv-control jv-oa-reject"
                    title="不同意/退回：立即提交真实审批"
                    onClick={() => { onReject(item, comment); onClose(); }}>
                    <X size={15} strokeWidth={2} /> 不同意
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="jv-control jv-oa-cancel" onClick={onClose}>
                    <X size={15} strokeWidth={2} /> 取消
                  </button>
                  {pending === "approve" ? (
                    <button type="button" className="jv-control jv-oa-approve"
                      title="确认：立即提交真实审批（同意）"
                      onClick={() => { onApprove(item, comment); onClose(); }}>
                      <Check size={15} strokeWidth={2} /> 确认同意
                    </button>
                  ) : (
                    <button type="button" className="jv-control jv-oa-reject"
                      title="确认：立即提交真实审批（不同意）"
                      onClick={() => { onReject(item, comment); onClose(); }}>
                      <X size={15} strokeWidth={2} /> 确认不同意
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TodoRow({ item, onOpen, onApprove, onReject }: {
  item: OATodoItem;
  onOpen: (item: OATodoItem) => void;
  onApprove: (item: OATodoItem) => void;
  onReject: (item: OATodoItem) => void;
}) {
  return (
    <div
      className="jv-oa-row-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(item);
        }
      }}
    >
      <span className="jv-oa-status-chip" data-level={item.analysis?.riskLevel ?? "missing"}>
        {item.analysis?.priorityLabel ?? "未分析"}
      </span>
      <div className="jv-oa-main">
        <span className="jv-body jv-oa-title">{item.title}</span>
        {item.analysis ? (
          <span className="jv-oa-suggestion">
            <span className={"jv-verdict-chip"} data-tone={item.analysis.verdictTone}>{item.analysis.verdict}</span>
            {item.analysis.adviceBody ? (
              <span className="jv-caption jv-muted jv-oa-advice-body">{item.analysis.adviceBody}</span>
            ) : null}
          </span>
        ) : (
          <span className="jv-caption jv-muted jv-oa-suggestion">审批建议未获取，请刷新后重试</span>
        )}
      </div>
      <div className="jv-oa-meta">
        <span>{[item.source, item.displaySender].map((v) => v || "未获取").join(" · ")}</span>
        <span>{item.time || "未获取"}</span>
      </div>
      <div className="jv-oa-actions" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="jv-btn-ok" title="同意：打开审核窗口" onClick={() => onApprove(item)}>
          <Check size={14} strokeWidth={2.4} />
          同意
        </button>
        <button type="button" className="jv-btn-no" title="不同意：打开审核窗口" onClick={() => onReject(item)}>
          <X size={14} strokeWidth={2.4} />
          不同意
        </button>
      </div>
    </div>
  );
}

export default function OATodoView({ result, onApprove, onReject, approvalStatus }: Props) {
  const [sheet, setSheet] = useState<{ item: OATodoItem; pending: SheetPending } | null>(null);

  const openDetail = (item: OATodoItem) => setSheet({ item, pending: null });
  const openApprove = (item: OATodoItem) => setSheet({ item, pending: "approve" });
  const openReject = (item: OATodoItem) => setSheet({ item, pending: "reject" });
  const overview = summarizeOATodo(result);
  const groups = result === null ? { needsAttention: [], canBatchLater: [] } : groupOATodo(result.items);

  if (result === null) {
    return (
      <div className="jv-card">
        <div className="jv-empty">
          <ListChecks size={40} strokeWidth={1.5} />
          <div className="jv-title">OA 待办 · 未获取</div>
          <div className="jv-body jv-muted">未获取到 OA 实时数据，请点击刷新重新从 OA 取数。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="jv-card">
      <div className="jv-skill-header">
        <div>
          <div className="jv-title">OA 待办</div>
          <div className="jv-caption jv-muted jv-oa-updated">
            来源：OA 融合办公平台 · 更新于 {result.fetchedAt}
          </div>
        </div>
      </div>
      <div className="jv-oa-summary">
        <span>共 <b>{overview.total}</b> 条待办</span>
        {overview.urgentCount > 0 && (<span><i className="jv-dot" data-level="urgent" /><b>{overview.urgentCount}</b> 红色风险</span>)}
        {overview.attentionCount > 0 && (<span><i className="jv-dot" data-level="attention" /><b>{overview.attentionCount}</b> 黄色关注</span>)}
        {overview.pendingAnalysisCount > 0 && (<span><i className="jv-dot" data-level="missing" /><b>{overview.pendingAnalysisCount}</b> 待分析</span>)}
      </div>
      {result.hasCountMismatch && (
        <div className="jv-caption jv-level-attention jv-oa-mismatch">
          <TriangleAlert size={15} strokeWidth={2} />
          分页计数与列表条数不一致，请复核源系统
        </div>
      )}
      {approvalStatus !== null && (
        <div className="jv-caption jv-oa-status jv-level-normal">{approvalStatus}</div>
      )}
      {result.items.length === 0 && (
        <div className="jv-body jv-muted jv-oa-empty-list">当前没有待办</div>
      )}
      {groups.needsAttention.length > 0 && (
        <section className="jv-oa-group">
          <div className="jv-oa-group-title">
            <span className="jv-dot" data-level="urgent" />
            需要你处理
            <span className="jv-oa-group-count">{groups.needsAttention.length}</span>
          </div>
          {groups.needsAttention.map((item) => (
            <TodoRow key={`${item.title}-${item.time}`} item={item} onOpen={openDetail} onApprove={openApprove} onReject={openReject} />
          ))}
        </section>
      )}
      {groups.canBatchLater.length > 0 && (
        <section className="jv-oa-group">
          <div className="jv-oa-group-title">
            <span className="jv-dot" data-level="normal" />
            可稍后批量处理
            <span className="jv-oa-group-count">{groups.canBatchLater.length}</span>
          </div>
          {groups.canBatchLater.map((item) => (
            <TodoRow key={`${item.title}-${item.time}`} item={item} onOpen={openDetail} onApprove={openApprove} onReject={openReject} />
          ))}
        </section>
      )}
      {sheet && (
        <DetailSheet item={sheet.item} pending={sheet.pending} onClose={() => setSheet(null)} onApprove={onApprove} onReject={onReject} />
      )}
    </div>
  );
}
