import { ChevronDown, ChevronUp, X } from "lucide-react";
import { HOME_MODULES, type HomeModuleConfig, type HomeModuleId } from "@/lib/config";

interface Props {
  config: HomeModuleConfig;
  onChange: (config: HomeModuleConfig) => void;
  onClose: () => void;
}

export default function HomeModuleCustomizer({ config, onChange, onClose }: Props) {
  const moduleById = new Map(HOME_MODULES.map((module) => [module.id, module]));
  const move = (id: HomeModuleId, offset: -1 | 1) => {
    const index = config.order.indexOf(id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= config.order.length) return;
    const order = [...config.order];
    [order[index], order[target]] = [order[target], order[index]];
    onChange({ ...config, order });
  };
  const toggle = (id: HomeModuleId) => {
    const hidden = new Set(config.hidden);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    onChange({ ...config, hidden });
  };

  return (
    <div className="jv-sheet-backdrop" role="dialog" aria-modal="true" aria-label="自定义首页模块">
      <section className="jv-customizer">
        <header className="jv-customizer-header">
          <span className="jv-title">自定义首页模块</span>
          <button type="button" className="jv-icon-plain" title="关闭" onClick={onClose}>
            <X size={13} strokeWidth={2} />
          </button>
        </header>
        <div className="jv-caption jv-muted jv-customizer-note">
          用上下按钮排序，开关控制显隐。配置自动保存，重启后仍生效。
        </div>
        <div className="jv-customizer-list">
          {config.order.map((id, index) => {
            const module = moduleById.get(id);
            if (module === undefined) return null;
            const hidden = config.hidden.has(id);
            return (
              <div key={id} className="jv-customizer-row">
                <span className="jv-customizer-row-main">
                  <span className={"jv-body jv-customizer-row-title" + (hidden ? " jv-faint" : "")}>
                    {module.title}
                  </span>
                  <span className="jv-caption jv-muted">{module.subtitle}</span>
                </span>
                <button type="button" className="jv-icon-plain" title="上移" disabled={index === 0} onClick={() => move(id, -1)}>
                  <ChevronUp size={13} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="jv-icon-plain"
                  title="下移"
                  disabled={index === config.order.length - 1}
                  onClick={() => move(id, 1)}
                >
                  <ChevronDown size={13} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className={"jv-switch" + (hidden ? "" : " jv-switch-on")}
                  role="switch"
                  aria-checked={!hidden}
                  title={hidden ? "显示模块" : "隐藏模块"}
                  onClick={() => toggle(id)}
                >
                  <span className="jv-switch-knob" />
                </button>
              </div>
            );
          })}
        </div>
        <footer className="jv-customizer-footer">
          <button
            type="button"
            className="jv-caption jv-confirm-plain"
            onClick={() =>
              onChange({ order: HOME_MODULES.map((module) => module.id), hidden: new Set() })
            }
          >
            恢复默认
          </button>
          <button type="button" className="jv-caption jv-confirm-primary" onClick={onClose}>
            完成
          </button>
        </footer>
      </section>
    </div>
  );
}
