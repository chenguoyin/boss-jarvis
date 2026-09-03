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

// 智能识别字段类型并进行格式化
function formatFieldValue(label: string, value: string): string {
  const labelLower = label.toLowerCase();
  const valueStr = value.trim();
  
  // 识别金额字段
  const moneyKeywords = ['金额', '费用', '价格', '总额', '合计', '付款', '收款', '余额', '报销', '实付', '应付', '预付', '金额'];
  const isMoneyField = moneyKeywords.some(kw => labelLower.includes(kw.toLowerCase()));
  
  // 尝试解析金额（移除¥、$、元、万等，保留数字和千分位）
  if (isMoneyField) {
    const numMatch = valueStr.replace(/[¥$元,\s]/g, '').match(/^-?[\d,]+\.?\d*$/);
    if (numMatch) {
      const num = parseFloat(valueStr.replace(/[¥$元,]/g, ''));
      if (!isNaN(num)) {
        // 判断单位（如果是"万元"需要转换）
        const isWan = valueStr.includes('万');
        const displayNum = isWan ? num * 10000 : num;
        const formatted = displayNum.toLocaleString('zh-CN', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        });
        return `¥${formatted}${isWan ? ' (万元)' : ''}`;
      }
    }
    // 如果已经是格式化过的金额，直接返回
    if (valueStr.includes('¥') || valueStr.includes('￥')) {
      return valueStr;
    }
  }
  
  // 识别日期字段
  const dateKeywords = ['日期', '时间', '日期', '创建时间', '提交时间', '审批时间', '开始日期', '结束日期', '有效期'];
  const isDateField = dateKeywords.some(kw => labelLower.includes(kw.toLowerCase()));
  
  if (isDateField) {
    // 尝试解析各种日期格式并统一显示
    // ISO 格式: 2024-01-15T10:30:00
    const isoMatch = valueStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{1,2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')} ${isoMatch[4].padStart(2, '0')}:${isoMatch[5].padStart(2, '0')}`;
    }
    // 只有日期: 2024-01-15
    const dateOnlyMatch = valueStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (dateOnlyMatch) {
      return `${dateOnlyMatch[1]}-${dateOnlyMatch[2].padStart(2, '0')}-${dateOnlyMatch[3].padStart(2, '0')}`;
    }
    // 中文日期: 2024年01月15日
    const cnDateMatch = valueStr.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (cnDateMatch) {
      return `${cnDateMatch[1]}-${cnDateMatch[2].padStart(2, '0')}-${cnDateMatch[3].padStart(2, '0')}`;
    }
  }
  
  return valueStr;
}

// 判断是否为金额单元格（用于表格）
function isMoneyCell(cell: string): boolean {
  const cellLower = cell.toLowerCase();
  return cellLower.includes('金额') || cellLower.includes('费用') || cellLower.includes('价格') || 
         cellLower.includes('实付') || cellLower.includes('应付') || cellLower.includes('合计');
}

// 格式化表格单元格
function formatCellValue(cell: string): { value: string; isMoney: boolean; isHeader: boolean } {
  const trimmed = cell.trim();
  
  // 判断是否为表头（通常是第一行，或者包含"项目"、"名称"等关键词）
  const headerKeywords = ['项目', '名称', '品名', '商品', '明细', '序号', '编号', '类型', '科目', '费用类别'];
  const isHeader = headerKeywords.some(kw => trimmed.includes(kw)) || /^\d+[.、]/.test(trimmed);
  
  // 判断是否为金额
  const isMoney = isMoneyCell(trimmed) || /^[\d,]+\.?\d*$/.test(trimmed.replace(/[¥$元]/g, ''));
  
  // 格式化金额
  if (isMoney && !isHeader) {
    const numMatch = trimmed.replace(/[¥$元,\s]/g, '').match(/^-?[\d,]+\.?\d*$/);
    if (numMatch) {
      const num = parseFloat(trimmed.replace(/[¥$元,]/g, ''));
      if (!isNaN(num)) {
        const formatted = num.toLocaleString('zh-CN', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        });
        return { value: `¥${formatted}`, isMoney: true, isHeader: false };
      }
    }
  }
  
  return { value: trimmed, isMoney, isHeader };
}

// 键值对表格：newoa 等表单型详情页（label | value 两列，label 列灰底）
function KeyValueTable({ tables }: { tables: string[][][] }) {
  const rows = tables.flatMap((table) => table).filter((row) => row.length > 0);
  return (
    <div className="jv-oa-detail-table-wrap">
      <table className="jv-oa-detail-table jv-oa-kv-table">
        <tbody>
          {rows.slice(0, 24).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.slice(0, 8).map((cell, cellIndex) => {
                const isLabel = cellIndex % 2 === 0;
                const value = cell.trim();
                return (
                  <td key={cellIndex} className={isLabel ? "jv-oa-kv-label" : "jv-oa-kv-value"}>
                    {value || (isLabel ? "" : "—")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailFields({ item }: { item: OATodoItem }) {
  const detail = item.documentDetail;
  if (!detail) return null;
  const fields = detail.fields.slice(0, 36);
  const tables = detail.tables.slice(0, 4);
  const attachments = detail.attachments.slice(0, 20);
  const isNeoOa = item.targetRef?.systemSign === "newoa";
  const isChfssc = item.targetRef?.systemSign === "chfssc";
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
            {fields.map((field, index) => {
              const formattedValue = formatFieldValue(field.label, field.value);
              const isMoney = formattedValue.startsWith('¥');
              return (
                <div key={`${field.name}-${field.label}-${index}`} className={`jv-oa-field ${isMoney ? 'jv-oa-field-money' : ''}`}>
                  <span className="jv-caption jv-muted">{field.label}</span>
                  <span className={`jv-body ${isMoney ? 'jv-oa-field-value-money' : ''}`}>{formattedValue}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {tables.length > 0 && (
        <section className="jv-sheet-section">
          <div className="jv-sheet-label jv-sheet-label-detail"><FileText size={15} strokeWidth={2} />{isNeoOa ? '单据信息' : isChfssc ? '单据信息与明细' : '明细表'}</div>
          {isNeoOa ? (
            <div className="jv-oa-detail-tables">
              <KeyValueTable tables={tables} />
            </div>
          ) : (
            <div className="jv-oa-detail-tables">
              {tables.map((table, tableIndex) => (
                <div key={tableIndex} className="jv-oa-detail-table-wrap">
                  <table className="jv-oa-detail-table">
                    <tbody>
                      {table.slice(0, 16).map((row, rowIndex) => {
                        const isFirstRow = rowIndex === 0;
                        return (
                          <tr key={rowIndex} className={isFirstRow ? 'jv-oa-table-header-row' : ''}>
                            {row.slice(0, 8).map((cell, cellIndex) => {
                              const { value, isMoney, isHeader } = formatCellValue(cell);
                              const cellClass = isFirstRow || isHeader 
                                ? 'jv-body jv-oa-table-header' 
                                : `jv-body ${isMoney ? 'jv-oa-table-money' : ''}`;
                              return (
                                <td key={cellIndex} className={cellClass}>{value}</td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {attachments.length > 0 && (
        <section className="jv-sheet-section">
          <div className="jv-sheet-label jv-sheet-label-detail"><FileText size={15} strokeWidth={2} />附件</div>
          <div className="jv-oa-attachments">
            {attachments.map((attachment, index) => (
              <div key={`${attachment.text}-${index}`} className="jv-body jv-oa-attachment">
                <FileText size={14} strokeWidth={1.5} className="jv-oa-attachment-icon" />
                <span className="jv-oa-attachment-name">{attachment.text}</span>
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
  const isAnalyzing = item.analysisStatus === "analyzing";
  const bodyPreview = item.documentDetail?.bodyPreview || analysis?.detail || "";
  // 智能财务（chfssc）单据：正文已按表格展示（单据信息与明细），流程日志纯文本折叠
  const isChfssc = item.targetRef?.systemSign === "chfssc";
  const hasTables = (item.documentDetail?.tables || []).length > 0;
  const [comment, setComment] = useState(analysis?.suggestion ?? "");
  
  // 分析中禁用审批操作
  const isDisabled = isAnalyzing;
  
  return (
    <div className="jv-sheet-backdrop" onClick={onClose}>
      <div className={`jv-sheet jv-oa-sheet ${isAnalyzing ? "jv-sheet-analyzing" : ""}`} onClick={(event) => event.stopPropagation()}>
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
          
          {/* 分析中状态显示 */}
          {isAnalyzing && (
            <section className="jv-sheet-section jv-sheet-analyzing">
              <div className="jv-analyzing-message">
                <span className="jv-analyzing-spinner">⏳</span>
                <span>正在分析单据风险，请稍后...</span>
              </div>
            </section>
          )}
          
          {analysis ? (
            <>
              {isChfssc && hasTables ? (
                <section className="jv-sheet-section">
                  <div className="jv-sheet-label jv-sheet-label-detail"><FileText size={15} strokeWidth={2} />正文（表格化）</div>
                  <details className="jv-oa-collapse">
                    <summary className="jv-caption jv-muted">展开查看流程日志全文</summary>
                    <div className="jv-body jv-sheet-text">{bodyPreview || "未获取"}</div>
                  </details>
                </section>
              ) : (
                <section className="jv-sheet-section">
                  <div className="jv-sheet-label jv-sheet-label-detail"><FileText size={15} strokeWidth={2} />正文预览</div>
                  <div className="jv-body jv-sheet-text">{bodyPreview || "未获取"}</div>
                </section>
              )}
              <section className="jv-sheet-section">
                <div className="jv-sheet-label jv-sheet-label-suggestion"><ListChecks size={15} strokeWidth={2} />审核建议</div>
                <div className="jv-verdict-row">
                  <span className="jv-verdict-chip jv-verdict-chip-lg" data-tone={analysis.verdictTone}>{analysis.verdict}</span>
                  {analysis.adviceBody ? (
                    <span className="jv-body jv-sheet-text jv-oa-advice-body">{analysis.adviceBody}</span>
                  ) : null}
                </div>
              </section>
            </>
          ) : !isAnalyzing ? (
            <div className="jv-body jv-muted">
              {item.analyzeError || "该单据暂无实时风险分析，请刷新 OA 后重试。"}
            </div>
          ) : null}
        </div>
        {/* 风险点：置于审批意见上方，审批前先核验风险 */}
        {analysis && (analysis.riskPoints || []).length > 0 && (
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
        )}
        <div className="jv-oa-approval">
          <label className="jv-caption jv-muted" htmlFor="jv-oa-comment">审批意见</label>
          <div className="jv-oa-approval-row">
            <textarea
              id="jv-oa-comment"
              className="jv-body jv-oa-comment"
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={isAnalyzing ? "等待分析完成..." : "输入审批意见"}
              disabled={isDisabled}
            />
            <div className="jv-oa-approval-buttons">
              {pending === null ? (
                <>
                  <button type="button" className="jv-control jv-oa-approve"
                    title="同意：立即提交真实审批"
                    onClick={() => { onApprove(item, comment); onClose(); }}
                    disabled={isDisabled}>
                    <Check size={15} strokeWidth={2} /> 同意
                  </button>
                  <button type="button" className="jv-control jv-oa-reject"
                    title="不同意/退回：立即提交真实审批"
                    onClick={() => { onReject(item, comment); onClose(); }}
                    disabled={isDisabled}>
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
  // 分析中状态
  const isAnalyzing = item.analysisStatus === "analyzing";
  
  return (
    <div
      className={`jv-oa-row-card ${isAnalyzing ? "jv-oa-analyzing" : ""}`}
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
      <span className="jv-oa-status-chip" data-level={item.analysis?.riskLevel ?? (isAnalyzing ? "analyzing" : "missing")}>
        {isAnalyzing ? "分析中" : (item.analysis?.priorityLabel ?? "未分析")}
      </span>
      <div className="jv-oa-main">
        <span className="jv-body jv-oa-title">{item.title}</span>
        {isAnalyzing ? (
          <span className="jv-caption jv-muted jv-oa-suggestion">
            <span className="jv-analyzing-indicator">⚙️ 正在分析单据风险，请稍后...</span>
          </span>
        ) : item.analysis ? (
          <span className="jv-oa-suggestion">
            <span className={"jv-verdict-chip"} data-tone={item.analysis.verdictTone}>{item.analysis.verdict}</span>
            {item.analysis.adviceBody ? (
              <span className="jv-caption jv-muted jv-oa-advice-body">{item.analysis.adviceBody}</span>
            ) : null}
          </span>
        ) : (
          <span className="jv-caption jv-muted jv-oa-suggestion">
            {item.analyzeError ? `⚠️ ${item.analyzeError}` : "审批建议未获取，请刷新后重试"}
          </span>
        )}
      </div>
      <div className="jv-oa-meta">
        <span>{[item.source, item.displaySender].map((v) => v || "未获取").join(" · ")}</span>
        <span>{item.time || "未获取"}</span>
      </div>
      <div className="jv-oa-actions" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="jv-btn-ok" title="同意：打开审核窗口" onClick={() => onApprove(item)} disabled={isAnalyzing}>
          <Check size={14} strokeWidth={2.4} />
          同意
        </button>
        <button type="button" className="jv-btn-no" title="不同意：打开审核窗口" onClick={() => onReject(item)} disabled={isAnalyzing}>
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

  // 检查是否正在分析中
  const isAnalyzing = result.analysisStatus === "analyzing";
  const progress = result.analysisProgress;

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
      
      {/* 分析进度条 */}
      {isAnalyzing && progress && (
        <div className="jv-oa-progress">
          <div className="jv-oa-progress-text">
            <span>📊 正在分析单据风险...</span>
            <span className="jv-oa-progress-count">{progress.done} / {progress.total}</span>
          </div>
          <div className="jv-oa-progress-bar">
            <div 
              className="jv-oa-progress-fill" 
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
      
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
