import { useState } from "react";
import { FileText, ListChecks, TriangleAlert, X } from "lucide-react";
import type { OATodoItem, OATodoResult } from "@/lib/oaTodo";

interface Props {
  result: OATodoResult | null;
}

function DetailSheet({ item, onClose }: { item: OATodoItem; onClose: () => void }) {
  const analysis = item.analysis;
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
          {analysis && (
            <div className="jv-oa-sheet-badges">
              <span className="jv-oa-priority">{analysis.priority}</span>
              <span className={`jv-oa-risk-dot jv-level-${analysis.riskLevel}`} />
            </div>
          )}
          <button type="button" className="jv-icon-plain" title="关闭" onClick={onClose}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>
        <div className="jv-sheet-body">
          {analysis ? (
            <>
              <section className="jv-sheet-section">
                <div className="jv-sheet-label"><FileText size={15} strokeWidth={2} />单据详情</div>
                <div className="jv-body jv-sheet-text">{analysis.detail}</div>
              </section>
              <section className="jv-sheet-section">
                <div className="jv-sheet-label"><TriangleAlert size={15} strokeWidth={2} />风险点</div>
                {analysis.riskPoints.map((risk, index) => (
                  <div key={index} className="jv-body jv-sheet-text">
                    {index + 1}. {risk}
                  </div>
                ))}
              </section>
              <section className="jv-sheet-section">
                <div className="jv-sheet-label"><ListChecks size={15} strokeWidth={2} />审核建议</div>
                <div className="jv-body jv-sheet-text">{analysis.suggestion}</div>
              </section>
            </>
          ) : (
            <div className="jv-body jv-muted">该单据暂无实时风险分析，请刷新 OA 后重试。</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OATodoView({ result }: Props) {
  const [selected, setSelected] = useState<OATodoItem | null>(null);

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
          <div className="jv-caption jv-muted">
            共 {result.total} 条 · 来源：OA 融合办公平台 · 采集 {result.fetchedAt}
          </div>
        </div>
      </div>
      {result.hasCountMismatch && (
        <div className="jv-caption jv-level-attention jv-oa-mismatch">
          <TriangleAlert size={15} strokeWidth={2} />
          分页计数与列表条数不一致，请复核源系统
        </div>
      )}
      {result.items.length === 0 ? (
        <div className="jv-body jv-muted jv-oa-empty-list">当前没有待办</div>
      ) : (
        <div className="jv-oa-table">
          <div className="jv-oa-row jv-oa-row-head">
            <span>#</span>
            <span>标题</span>
            <span>优先级</span>
            <span>风险点</span>
            <span>建议</span>
            <span>来源系统</span>
            <span>发送人</span>
            <span>发送时间</span>
          </div>
          {result.items.map((item, index) => (
            <button
              type="button"
              key={`${item.title}-${item.time}-${index}`}
              className="jv-oa-row jv-oa-row-body"
              onClick={() => setSelected(item)}
            >
              <span className="jv-caption">{index + 1}</span>
              <span className="jv-body jv-oa-title">{item.title}</span>
              <span className="jv-caption">{item.analysis?.priorityLabel ?? "未分析"}</span>
              <span className={`jv-caption jv-oa-risk jv-level-${item.analysis?.riskLevel ?? "missing"}`}>
                {item.analysis ? (item.analysis.riskLevel === "missing" ? "未获取" : item.analysis.riskLevel) : "未分析"}
              </span>
              <span className="jv-caption jv-oa-suggestion">{item.analysis?.suggestion ?? "审批前核验详情和附件"}</span>
              <span className="jv-caption">{item.source || "未获取"}</span>
              <span className="jv-caption">{item.displaySender || "未获取"}</span>
              <span className="jv-caption">{item.time || "未获取"}</span>
            </button>
          ))}
        </div>
      )}
      {selected && <DetailSheet item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
