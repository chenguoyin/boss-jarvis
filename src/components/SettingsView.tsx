import { useCallback, useEffect, useState } from "react";
import { Check, Clock, Download, Eye, EyeOff, RefreshCw, RotateCcw, Save, Trash2, X } from "lucide-react";
import {
  AUTO_REFRESH_INTERVAL_OPTIONS,
  DEFAULT_BODY_FONT_SIZE,
  DEFAULT_TITLE_FONT_SIZE,
  type Theme,
} from "@/lib/config";
import {
  manageSchedule,
  readMailSignature,
  readSkillEnv,
  scheduleStatus,
  writeMailSignature,
  writeSkillEnv,
  type ScheduleAction,
  type ScheduleStatus,
} from "@/lib/skillBridge";
import { DEFAULT_HONGYI_EXTERNAL_URL, getHongyiExternalUrl, setHongyiExternalUrl, getHongyiCookie, getHongyiXSid } from "@/lib/config";

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

function scheduleConfirmLabel(action: ScheduleAction): string {
  if (action === "install") return "安装并加载定时任务";
  if (action === "reload") return "重载定时任务";
  return "卸载定时任务";
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
  const [mailSignature, setMailSignature] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [reveal, setReveal] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleStatus | null>(null);
  const [reminderTime, setReminderTime] = useState("17:00");
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ScheduleAction | null>(null);
  const [hongyiUrl, setHongyiUrl] = useState("");
  const [hongyiCookie, setHongyiCookie] = useState("");
  const [hongyiXSid, setHongyiXSid] = useState("");
  const [hongyiRefererSign, setHongyiRefererSign] = useState("");

  useEffect(() => {
    void Promise.all([readSkillEnv(), readMailSignature()]).then(([env, signature]) => {
      setValues(env);
      setMailSignature(signature);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    const url = getHongyiExternalUrl();
    setHongyiUrl(url ?? DEFAULT_HONGYI_EXTERNAL_URL);
    setHongyiCookie(getHongyiCookie() ?? "");
    setHongyiXSid(getHongyiXSid() ?? "");
    setHongyiRefererSign(localStorage.getItem("system.hongyiRefererSign") ?? "");
  }, []);

  const save = async () => {
    setSaving(true);
    setStatus("正在保存配置…");
    try {
      const [envOutcome, signatureOutcome] = await Promise.all([
        writeSkillEnv(values),
        writeMailSignature(mailSignature),
      ]);
      setStatus(
        envOutcome.ok && signatureOutcome.ok
          ? "配置与邮件签名已保存，Skill 下次运行生效。"
          : [envOutcome, signatureOutcome]
              .filter((outcome) => !outcome.ok)
              .map((outcome) => outcome.summary)
              .join(" "),
      );
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

  const loadSchedule = useCallback(async () => {
    try {
      const next = await scheduleStatus();
      setSchedule(next);
      if (typeof next.configuredTime === "string" && next.configuredTime !== "") {
        setReminderTime(next.configuredTime);
      }
      setScheduleMessage(null);
    } catch (error) {
      setScheduleMessage("读取定时任务状态失败：" + String(error));
    }
  }, []);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const runScheduleAction = useCallback(
    async (action: ScheduleAction) => {
      setScheduleBusy(true);
      setScheduleMessage("正在执行…");
      try {
        const result = await manageSchedule(
          action,
          action === "set-time" ? reminderTime : undefined,
        );
        let summary: string;
        if (action === "set-time") {
          summary = result.note ?? "提醒时间已保存";
        } else if (action === "uninstall") {
          summary = "已卸载定时任务";
        } else if (action === "install" || action === "reload") {
          summary = result.loaded ? "定时任务已加载生效" : "定时任务已写入";
        } else {
          summary = "操作完成";
        }
        setScheduleMessage(summary);
        await loadSchedule();
      } catch (error) {
        setScheduleMessage("操作失败：" + String(error));
      } finally {
        setScheduleBusy(false);
        setConfirming(null);
      }
    },
    [reminderTime, loadSchedule],
  );

  const requestAction = (action: ScheduleAction) => {
    if (action === "set-time") {
      void runScheduleAction(action);
      return;
    }
    setConfirming(action);
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
        <div className="jv-title">定时巡检 / 提醒</div>
        <div className="jv-settings-row">
          <div className="jv-settings-row-head">
            <Clock size={15} strokeWidth={2} className="jv-muted" />
            <span className="jv-body jv-settings-label">提醒时间</span>
            <span className="jv-caption jv-muted">工作日此刻推送</span>
          </div>
          <div className="jv-settings-schedule-actions">
            <input
              className="jv-settings-time-input"
              type="time"
              value={reminderTime}
              aria-label="提醒时间"
              onChange={(event) => setReminderTime(event.target.value)}
            />
            <button
              type="button"
              className="jv-settings-save-button"
              disabled={scheduleBusy}
              onClick={() => void runScheduleAction("set-time")}
            >
              <Save size={15} strokeWidth={2} />
              保存时间
            </button>
          </div>
          <div className="jv-caption jv-muted">
            {schedule
              ? "已配置 " + (schedule.configuredTime ?? "未获取") + " · 定时文件 " + (schedule.installed ? "已安装" : "未安装") + " · 系统任务 " + (schedule.loaded ? "已加载" : "未加载")
              : "定时任务状态未获取"}
          </div>
        </div>

        <div className="jv-settings-row">
          <div className="jv-settings-row-head">
            <span className="jv-body jv-settings-label">系统提醒任务</span>
          </div>
          <div className="jv-settings-schedule-actions">
            <button
              type="button"
              className="jv-skill-toggle"
              disabled={scheduleBusy}
              onClick={() => requestAction("install")}
            >
              <Download size={15} strokeWidth={2} />
              安装并加载
            </button>
            <button
              type="button"
              className="jv-skill-toggle"
              disabled={scheduleBusy || schedule?.installed !== true}
              onClick={() => requestAction("reload")}
            >
              <RefreshCw size={15} strokeWidth={2} />
              重载生效
            </button>
            <button
              type="button"
              className="jv-oa-reject"
              disabled={scheduleBusy || schedule?.installed !== true}
              onClick={() => requestAction("uninstall")}
            >
              <Trash2 size={15} strokeWidth={2} />
              卸载
            </button>
          </div>
          {confirming !== null && (
            <div className="jv-settings-confirm-bar">
              <span className="jv-caption jv-level-attention">
                {scheduleConfirmLabel(confirming)}，确认执行？
              </span>
              <button
                type="button"
                className="jv-confirm-primary"
                disabled={scheduleBusy}
                onClick={() => void runScheduleAction(confirming)}
              >
                <Check size={15} strokeWidth={2} />
                确认执行
              </button>
              <button
                type="button"
                className="jv-confirm-plain"
                onClick={() => setConfirming(null)}
              >
                <X size={15} strokeWidth={2} />
                取消
              </button>
            </div>
          )}
          <div className="jv-caption jv-muted jv-settings-note">
            定时巡检默认每日 17:00 自动运行（macOS launchd / Windows 任务计划程序），通过系统通知推送当日紧急优先事项；应用内提醒与 Dock 角标随晨报数据实时同步。
          </div>
          {scheduleMessage !== null && (
            <span
              className={
                "jv-caption " +
                (scheduleMessage.startsWith("操作失败") || scheduleMessage.startsWith("读取")
                  ? "jv-level-attention"
                  : "jv-level-normal")
              }
            >
              {scheduleMessage}
            </span>
          )}
        </div>
      </section>

      <section className="jv-settings-section">
        <div className="jv-title">账号、模型与邮件</div>
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
        <div className="jv-settings-row">
          <div className="jv-settings-row-head">
            <span className="jv-body jv-settings-label">邮件签名</span>
          </div>
          <textarea
            className="jv-body jv-settings-input jv-settings-textarea"
            aria-label="邮件签名"
            placeholder="请输入邮件回复时追加的签名"
            value={mailSignature}
            onChange={(event) => setMailSignature(event.target.value)}
          />
        </div>
        <div className="jv-caption jv-muted jv-settings-note">
          凭证保存在本机 ~/.boss-jarvis/skill-env.conf，邮件签名保存在同目录的 mail-signature.txt；均不上传任何服务器。
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

      <section className="jv-settings-section">
        <div className="jv-title">虹翼外链</div>
        <div className="jv-settings-row">
          <div className="jv-settings-row-head">
            <span className="jv-body jv-settings-label">虹翼外链 URL</span>
          </div>
          <input
            className="jv-body jv-settings-input"
            type="url"
            placeholder="https://hongyi.changhong.com/..."
            value={hongyiUrl}
            onChange={(event) => setHongyiUrl(event.target.value)}
          />
        </div>
        <div className="jv-settings-row">
          <div className="jv-settings-row-head">
            <span className="jv-body jv-settings-label">Cookie</span>
          </div>
          <input
            className="jv-body jv-settings-input"
            type="password"
            placeholder="用于 SSO 认证的 Cookie"
            value={hongyiCookie}
            onChange={(event) => setHongyiCookie(event.target.value)}
          />
        </div>
        <div className="jv-settings-row">
          <div className="jv-settings-row-head">
            <span className="jv-body jv-settings-label">x-sid</span>
          </div>
          <input
            className="jv-body jv-settings-input"
            type="password"
            placeholder="用于 SSO 认证的 Session ID"
            value={hongyiXSid}
            onChange={(event) => setHongyiXSid(event.target.value)}
          />
        </div>
        <div className="jv-settings-row">
          <div className="jv-settings-row-head">
            <span className="jv-body jv-settings-label">referer-sign</span>
          </div>
          <input
            className="jv-body jv-settings-input"
            type="password"
            placeholder="用于 SSO 认证的 Referer 签名"
            value={hongyiRefererSign}
            onChange={(event) => setHongyiRefererSign(event.target.value)}
          />
        </div>
        <div className="jv-caption jv-muted jv-settings-note">
          配置虹翼系统的访问地址和认证信息。认证信息用于 SSO 自动登录。
        </div>
        <div className="jv-settings-save">
          <button
            type="button"
            className="jv-control jv-settings-save-button"
            onClick={() => {
              setHongyiExternalUrl(hongyiUrl);
              localStorage.setItem("system.hongyiCookie", hongyiCookie);
              localStorage.setItem("system.hongyiXSid", hongyiXSid);
              localStorage.setItem("system.hongyiRefererSign", hongyiRefererSign);
              setStatus("虹翼外链配置已保存");
            }}
          >
            <Save size={15} strokeWidth={2} />
            保存配置
          </button>
        </div>
      </section>
    </div>
  );
}
