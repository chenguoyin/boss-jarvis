// 主题与字号配置：单一事实来源，持久化到 localStorage。
// 键名与 legacy SystemConfiguration.swift 保持一致。

export type Theme = "system" | "light" | "dark";

const KEYS = {
  theme: "system.theme",
  titleFontSize: "system.titleFontSize",
  bodyFontSize: "system.bodyFontSize",
} as const;

export const DEFAULT_TITLE_FONT_SIZE = 14;
export const DEFAULT_BODY_FONT_SIZE = 12;

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
