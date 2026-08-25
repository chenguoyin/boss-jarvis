import { X } from "lucide-react";
import brandIcon from "@/assets/brand-icon.png";

interface Props {
  onClose: () => void;
}

const ROWS = [
  ["驾驶舱", "10 秒掌握全局，待办、邮件、经营、风险一屏看完"],
  ["每日晨报", "AI 自动汇总今日要事，出门前 3 分钟心里有数"],
  ["OA 待办", "长虹 OA 审批直接处理，同意或不同意一键提交"],
  ["经营情况", "虹翼系统实时数据，收入、利润、应收尽在掌握"],
  ["邮件日历", "待回复邮件和今日日程，不漏一条重要事项"],
];

export default function AboutDialog({ onClose }: Props) {
  return (
    <div className="jv-sheet-backdrop" role="dialog" aria-modal="true" aria-label="关于 Boss Jarvis">
      <section className="jv-about">
        <button type="button" className="jv-icon-plain jv-about-close" title="关闭" onClick={onClose}>
          <X size={13} strokeWidth={2} />
        </button>
        <img className="jv-about-icon" src={brandIcon} alt="Boss Jarvis" />
        <div className="jv-title jv-about-title">Boss Jarvis</div>
        <div className="jv-body jv-muted">BOSS AI 工作台</div>
        <div className="jv-caption jv-faint">版本 0.1.0 (1)</div>
        <div className="jv-about-rows">
          {ROWS.map(([title, description]) => (
            <div key={title} className="jv-about-row">
              <span className="jv-about-row-dot" />
              <span className="jv-about-row-main">
                <span className="jv-body jv-about-row-title">{title}</span>
                <span className="jv-caption jv-muted">{description}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="jv-caption jv-faint jv-about-note">
          数据来源：OA、虹翼、Mail、日历。所有操作留痕审计，写操作需确认后执行。
        </div>
        <button type="button" className="jv-control jv-about-ok" onClick={onClose}>
          好
        </button>
      </section>
    </div>
  );
}
