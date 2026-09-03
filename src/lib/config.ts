// 主题与字号配置：单一事实来源，持久化到 localStorage。
// 键名与 legacy SystemConfiguration.swift 保持一致。

export type Theme = "system" | "light" | "dark";

const KEYS = {
  theme: "system.theme",
  titleFontSize: "system.titleFontSize",
  bodyFontSize: "system.bodyFontSize",
  autoRefreshEnabled: "system.autoRefreshEnabled",
  autoRefreshInterval: "system.autoRefreshInterval",
  homeModuleOrder: "home.moduleOrder",
  hiddenHomeModules: "home.hiddenModules",
  hongyiExternalUrl: "system.hongyiExternalUrl",
  hongyiCookie: "system.hongyiCookie",
  hongyiXSid: "system.hongyiXSid",
  hongyiRefererSign: "system.hongyiRefererSign",
} as const;

export const DEFAULT_TITLE_FONT_SIZE = 14;
export const DEFAULT_BODY_FONT_SIZE = 12;
export const DEFAULT_AUTO_REFRESH_INTERVAL = 15;
export const AUTO_REFRESH_INTERVAL_OPTIONS = [5, 10, 15, 30, 60];

export type HomeModuleId = "verdict" | "todo" | "summary" | "metrics" | "risk" | "mail";

export const HOME_MODULES: Array<{ id: HomeModuleId; title: string; subtitle: string }> = [
  { id: "verdict", title: "全局结论条", subtitle: "10 秒掌握今日全局" },
  { id: "todo", title: "今日待办提醒", subtitle: "紧急事项 Top 3" },
  { id: "summary", title: "今日需处理事项", subtitle: "跨系统聚合计数" },
  { id: "metrics", title: "经营情况速览", subtitle: "5 个核心经营指标" },
  { id: "risk", title: "风险提示与建议", subtitle: "分级风险 + AI 建议" },
  { id: "mail", title: "待回复邮件", subtitle: "需回复邮件 Top 3" },
];

const DEFAULT_HOME_MODULE_ORDER = HOME_MODULES.map((module) => module.id);

export interface FontSizes {
  title: number;
  body: number;
  caption: number;
  control: number;
  data: number;
}

export function computeFontSizes(title: number, body: number): FontSizes {
  return {
    title,
    body,
    caption: Math.max(body - 1, 10),
    control: Math.max(title, body + 1),
    data: Math.max(title * 2.25, 28),
  };
}

function readNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getTheme(): Theme {
  const raw = localStorage.getItem(KEYS.theme);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEYS.theme, theme);
}

export function getTitleFontSize(): number {
  return readNumber(KEYS.titleFontSize, DEFAULT_TITLE_FONT_SIZE);
}

export function setTitleFontSize(value: number): void {
  localStorage.setItem(KEYS.titleFontSize, String(value));
}

export function getBodyFontSize(): number {
  return readNumber(KEYS.bodyFontSize, DEFAULT_BODY_FONT_SIZE);
}

export function setBodyFontSize(value: number): void {
  localStorage.setItem(KEYS.bodyFontSize, String(value));
}

export function getAutoRefreshEnabled(): boolean {
  const raw = localStorage.getItem(KEYS.autoRefreshEnabled);
  return raw === null ? true : raw === "true";
}

export function setAutoRefreshEnabled(value: boolean): void {
  localStorage.setItem(KEYS.autoRefreshEnabled, String(value));
}

export function getAutoRefreshInterval(): number {
  const value = readNumber(KEYS.autoRefreshInterval, DEFAULT_AUTO_REFRESH_INTERVAL);
  return AUTO_REFRESH_INTERVAL_OPTIONS.includes(value) ? value : DEFAULT_AUTO_REFRESH_INTERVAL;
}

export function setAutoRefreshInterval(value: number): void {
  localStorage.setItem(KEYS.autoRefreshInterval, String(value));
}

export interface HomeModuleConfig {
  order: HomeModuleId[];
  hidden: Set<HomeModuleId>;
}

export function getHomeModuleConfig(): HomeModuleConfig {
  const parse = (raw: string | null): HomeModuleId[] => {
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const known = new Set(HOME_MODULES.map((module) => module.id));
      return parsed.filter((id): id is HomeModuleId => typeof id === "string" && known.has(id as HomeModuleId));
    } catch {
      return [];
    }
  };
  const savedOrder = parse(localStorage.getItem(KEYS.homeModuleOrder));
  const order = savedOrder.length === 0 ? [...DEFAULT_HOME_MODULE_ORDER] : savedOrder;
  for (const id of DEFAULT_HOME_MODULE_ORDER) {
    if (!order.includes(id)) order.push(id);
  }
  const hidden = new Set(parse(localStorage.getItem(KEYS.hiddenHomeModules)));
  return { order, hidden };
}

export function setHomeModuleConfig(config: HomeModuleConfig): void {
  localStorage.setItem(KEYS.homeModuleOrder, JSON.stringify(config.order));
  localStorage.setItem(
    KEYS.hiddenHomeModules,
    JSON.stringify([...config.hidden].sort()),
  );
}

export const DEFAULT_HONGYI_EXTERNAL_URL = "https://hongyi.changhong.com/rcsit-prc-web/#/rcsit-prc-web/report/departmentDashboard";

export function getHongyiExternalUrl(): string | null {
  return localStorage.getItem(KEYS.hongyiExternalUrl);
}

export function setHongyiExternalUrl(url: string): void {
  localStorage.setItem(KEYS.hongyiExternalUrl, url);
}

export function getHongyiCookie(): string | null {
  return localStorage.getItem(KEYS.hongyiCookie);
}

export function setHongyiCookie(cookie: string): void {
  localStorage.setItem(KEYS.hongyiCookie, cookie);
}

export function getHongyiXSid(): string | null {
  return localStorage.getItem(KEYS.hongyiXSid);
}

export function setHongyiXSid(xSid: string): void {
  localStorage.setItem(KEYS.hongyiXSid, xSid);
}

export function getHongyiRefererSign(): string | null {
  return localStorage.getItem(KEYS.hongyiRefererSign);
}

export function setHongyiRefererSign(refererSign: string): void {
  localStorage.setItem(KEYS.hongyiRefererSign, refererSign);
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// 应用主题到 <html> 的 data-theme；system 跟随系统并在变化时同步。
export function applyTheme(theme: Theme, media?: MediaQueryList): void {
  const root = document.documentElement;
  if (theme === "system") {
    root.dataset.theme = systemPrefersDark() ? "dark" : "light";
    media?.addEventListener("change", () => {
      if (getTheme() === "system") {
        root.dataset.theme = systemPrefersDark() ? "dark" : "light";
      }
    });
  } else {
    root.dataset.theme = theme;
  }
}

// 应用字号到 CSS 变量，组件只引用 CSS 变量 --jv-fs-*，不写死字号。
export function applyFontSizes(fonts: FontSizes): void {
  const root = document.documentElement;
  root.style.setProperty("--jv-fs-title", fonts.title + "px");
  root.style.setProperty("--jv-fs-body", fonts.body + "px");
  root.style.setProperty("--jv-fs-caption", fonts.caption + "px");
  root.style.setProperty("--jv-fs-control", fonts.control + "px");
  root.style.setProperty("--jv-fs-data", fonts.data + "px");
}
