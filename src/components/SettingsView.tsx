import { useEffect, useState } from "react";
import { Eye, EyeOff, RotateCcw, Save } from "lucide-react";
import {
  AUTO_REFRESH_INTERVAL_OPTIONS,
  DEFAULT_BODY_FONT_SIZE,
  DEFAULT_TITLE_FONT_SIZE,
  type Theme,
} from "@/lib/config";
import { readSkillEnv, writeSkillEnv } from "@/lib/skillBridge";

interface Props {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  titleFontSize: number;
  bodyFontSize: number;
  onTitleFontSizeChange: (value: number) => void;
  onBodyFontSizeChange: (value: number) => void;
  onResetFontSizes: () => void;
  autoRefreshEnabled: boolean;
  autoRefreshInterval: number;
  onAutoRefreshChange: (enabled: boolean, interval: number) => void;
}

const ENV_FIELDS = [
  { key: "OA_USERNAME", label: "OA 账号", placeholder: "OA 账号", secret: false },
  { key: "OA_PASSWORD", label: "OA 密码", placeholder: "OA 密码", secret: true },
  { key: "COMPANY_LLM_BASE_URL", label: "Base URL", placeholder: "https://…/v1", secret: false },
  { key: "COMPANY_LLM_MODEL", label: "默认模型", placeholder: "模型名", secret: false },
  { key: "COMPANY_LLM_API_KEY", label: "API Key", placeholder: "sk-…", secret: true },
  { key: "NODE_PATH", label: "NODE_PATH", placeholder: "Playwright node_modules 路径", secret: false },
] as const;

function FontRow({
  label,
  value,
  min,
  max,
  defaultValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="jv-settings-row">
      <div className="jv-settings-row-head">
        <span className="jv-body jv-settings-label">{label}</span>
        <span className="jv-caption jv-muted">{value}</span>
        <button
          type="button"
          className="jv-icon-plain"
          title="恢复默认"
          onClick={() => onChange(defaultValue)}
        >
          <RotateCcw size={15} strokeWidth={2} />
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

export default function SettingsView({
  theme,
  onThemeChange,
  titleFontSize,
  bodyFontSize,
  onTitleFontSizeChange,
  onBodyFontSizeChange,
  onResetFontSizes,
  autoRefreshEnabled,
  autoRefreshInterval,
  onAutoRefreshChange,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [reveal, setReveal] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void readSkillEnv().then((env) => {
      setValues(env);
      setLoaded(true);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setStatus("正在保存配置…");
    try {
      const outcome = await writeSkillEnv(values);
      setStatus(outcome.summary);
    } catch {
      setStatus("保存配置失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const toggleReveal = (key: string) => {
    setReveal((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="jv-card jv-settings-card">
      <section className="jv-settings-section">
        <div className="jv-title">显示</div>
        <FontRow
          label="标题字号"
          value={titleFontSize}
          min={12}
          max={24}
          defaultValue={DEFAULT_TITLE_FONT_SIZE}
          onChange={onTitleFontSizeChange}
        />
        <FontRow
          label="正文字号"
          value={bodyFontSize}
          min={10}
          max={24}
          defaultValue={DEFAULT_BODY_FONT_SIZE}
          onChange={onBodyFontSizeChange}
        />
        <div className="jv-settings-row">
          <div className="jv-settings-row-head">
            <span className="jv-body jv-settings-label">主题</span>
            <span className="jv-caption jv-muted">
              {theme === "system" ? "跟随系统" : theme === "light" ? "浅色" : "深色"}
            </span>
          </div>
          <div className="jv-settings-theme">
            {(["system", "light", "dark"] as Theme[]).map((option) => (
              <button
                type="button"
                key={option}
                className="jv-caption jv-settings-theme-option"
                data-active={theme === option || undefined}
                onClick={() => onThemeChange(option)}
              >
                {option === "system" ? "跟随系统" : option === "light" ? "浅色" : "深色"}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="jv-caption jv-settings-reset" onClick={onResetFontSizes}>
          <RotateCcw size={15} strokeWidth={2} />
          恢复默认字号
        </button>
      </section>

      <section className="jv-settings-section">
        <div className="jv-title">自动刷新</div>
        <div className="jv-settings-row">
          <div className="jv-settings-row-head">
            <span className="jv-body jv-settings-label">启用自动刷新</span>
            <button
              type="button"
              className={"jv-switch" + (autoRefreshEnabled ? " jv-switch-on" : "")}
              role="switch"
              aria-checked={autoRefreshEnabled}
              title={autoRefreshEnabled ? "关闭自动刷新" : "启用自动刷新"}
              onClick={() => onAutoRefreshChange(!autoRefreshEnabled, autoRefreshInterval)}
            >
              <span className="jv-switch-knob" />
            </button>
          </div>
        </div>
        <div className="jv-settings-row">
          <div className="jv-settings-row-head">
            <span className="jv-body jv-settings-label">刷新间隔</span>
            <div className="jv-settings-interval">
              {AUTO_REFRESH_INTERVAL_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option}
                  className="jv-caption jv-settings-theme-option"
                  data-active={autoRefreshInterval === option || undefined}
                  disabled={!autoRefreshEnabled}
                  onClick={() => onAutoRefreshChange(autoRefreshEnabled, option)}
                >
                  {option} 分钟
                </button>
              ))}
            </div>
          </div>
          <div className="jv-caption jv-muted jv-settings-note">
            所有 Skill 按此间隔自动获取真实数据。刷新时顶部状态栏会显示进度，完成后显示最近刷新时间和下次倒计时。
          </div>
        </div>
      </section>

      <section className="jv-settings-section">
        <div className="jv-title">OA 账号与模型调用</div>
        {ENV_FIELDS.map((field) => (
          <div className="jv-settings-row" key={field.key}>
            <div className="jv-settings-row-head">
              <span className="jv-body jv-settings-label">{field.label}</span>
              {field.secret && (
                <button
                  type="button"
                  className="jv-icon-plain"
                  title={reveal.has(field.key) ? "隐藏" : "显示"}
                  onClick={() => toggleReveal(field.key)}
                >
                  {reveal.has(field.key) ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
                </button>
              )}
            </div>
            <input
              className="jv-body jv-settings-input"
              type={field.secret && !reveal.has(field.key) ? "password" : "text"}
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
          </div>
        ))}
        <div className="jv-caption jv-muted jv-settings-note">
          凭证只保存在本机 ~/.boss-jarvis/skill-env.conf，不上传任何服务器；保存后 Skill 下次运行生效。
        </div>
        <div className="jv-settings-save">
          <button
            type="button"
            className="jv-control jv-settings-save-button"
            disabled={saving}
            onClick={() => void save()}
          >
            <Save size={15} strokeWidth={2} />
            {saving ? "保存中..." : "保存配置"}
          </button>
          {status !== null && <span className="jv-caption jv-level-normal">{status}</span>}
          {!loaded && <span className="jv-caption jv-level-attention">配置文件未找到，保存后将创建</span>}
        </div>
      </section>

      <section className="jv-settings-section">
        <div className="jv-title">数据目录</div>
        <div className="jv-settings-dir">
          <span className="jv-body jv-settings-label">Skill 输出</span>
          <span className="jv-caption jv-muted">~/.boss-jarvis/data</span>
        </div>
        <div className="jv-settings-dir">
          <span className="jv-body jv-settings-label">审计日志</span>
          <span className="jv-caption jv-muted">~/.codex/workbench-audit</span>
        </div>
        <div className="jv-settings-dir">
          <span className="jv-body jv-settings-label">晨报输出</span>
          <span className="jv-caption jv-muted">~/.codex/workbench-reports</span>
        </div>
      </section>
    </div>
  );
}
