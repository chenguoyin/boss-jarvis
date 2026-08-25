#!/usr/bin/env node
// 设计系统守门：颜色与字号只允许来自 src/styles/tokens.css。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const TOKENS_FILE = "src/styles/tokens.css";

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|:(?!\s*none)[^;]*\b(?:white|black|gray|grey)\b/;
const FONTSIZE_RE = /font-size\s*:\s*(?!var\(--jv-fs-)/;

const violations = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(tsx?|css)$/.test(name)) continue;
    const rel = relative(ROOT, full);
    if (rel === TOKENS_FILE) continue;

    const lines = readFileSync(full, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("/*")) return;
      const at = (rule) => `${rel}:${i + 1} ${rule}`;
      // 剥掉合法 token 引用后再检查，避免把变量名里的 white 当违规
      const effective = line.replace(/var\(--jv-[a-z0-9-]+\)/gi, "");
      if (COLOR_RE.test(effective)) violations.push(at("硬编码颜色"));
      if (/\.tsx?$/.test(name) && FONTSIZE_RE.test(line)) {
        violations.push(at("写死 font-size"));
      }
    });
  }
}

walk(SRC);

if (violations.length > 0) {
  console.error("设计系统违规（颜色/字号必须走 jarvis token）:");
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}

console.log("design token check passed");
