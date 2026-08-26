#!/usr/bin/env node
// 布局守门：核心壳层尺寸必须与黄金参照一致（legacy/ContentView.swift）。
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const tokens = readFileSync(join(root, "src/styles/tokens.css"), "utf8");

const expectations = [
  ["--jv-nav-w", "72px", "导航宽度"],
  ["--jv-nav-item", "52px", "导航热区（黄金参照源码事实）"],
  ["--jv-nav-active", "42px", "选中背景"],
  ["--jv-nav-icon", "16px", "导航图标"],
  ["--jv-topbar-h", "60px", "顶栏高度"],
];

const violations = expectations
  .map(([token, expected, label]) => {
    const re = new RegExp(`${token.replace(/[-]/g, "\\-")}:\\s*([^;]+);`);
    const match = tokens.match(re);
    if (!match) return `${token} 未定义`;
    const actual = match[1].trim();
    return actual === expected ? null : `${label} ${token}: 期望 ${expected}，实际 ${actual}`;
  })
  .filter(Boolean);

if (violations.length > 0) {
  console.error("壳层布局尺寸违规:");
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}

console.log("shell layout check passed");
