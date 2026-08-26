import { CreditCard } from "lucide-react";
import { filterExpenseItems, OA_RISK_TITLES, type OATodoResult } from "@/lib/oaTodo";

interface Props {
  result: OATodoResult | null;
}

export default function ExpenseTodoView({ result }: Props) {
  const expenseItems = result ? filterExpenseItems(result) : [];

  if (result === null) {
    return (
      <div className="jv-card">
        <div className="jv-empty">
          <CreditCard size={40} strokeWidth={1.5} />
          <div className="jv-title">资金费用 · 未获取</div>
          <div className="jv-body jv-muted">
            未获取到数据。请先运行 oa-todo Skill 后刷新；费控系统独立 Skill 接入后此页切换为费控数据源。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jv-card">
      <div className="jv-skill-header">
        <div>
          <div className="jv-title">资金费用</div>
          <div className="jv-caption jv-muted">
            共 {expenseItems.length} 条 · 来源：OA 待办（智能财务/费控/资金类） · 采集 {result.fetchedAt}
          </div>
        </div>
      </div>
      {expenseItems.length === 0 ? (
        <div className="jv-body jv-muted jv-oa-empty-list">当前待办中没有资金费用类单据</div>
      ) : (
        <div className="jv-expense-list">
          {expenseItems.map((item, index) => (
            <div key={`${item.title}-${item.time}-${index}`} className="jv-expense-row">
              <span className="jv-caption jv-expense-index">{index + 1}</span>
              <div className="jv-expense-main">
                <div className="jv-body jv-oa-title">{item.title}</div>
                <div className="jv-caption">
                  {item.source}
                  {item.sender !== "" && <> · {item.sender}</>}
                  {item.time !== "" && <> · {item.time}</>}
                </div>
              </div>
              <span
                className={`jv-caption jv-oa-risk jv-level-${item.analysis?.riskLevel ?? "missing"}`}
                title={item.analysis ? item.analysis.riskPoints.join(" / ") : "未分析"}
              >
                {item.analysis ? OA_RISK_TITLES[item.analysis.riskLevel] : "未分析"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
