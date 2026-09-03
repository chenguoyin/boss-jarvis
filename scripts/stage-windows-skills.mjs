#!/usr/bin/env node
/**
 * Stage Windows 便携包 exe 同级 skills/ 目录（可复现打包步骤）。
 *
 * 原则：Windows 运行时默认只走 exe 同级 skills/（manifest.rs 优先解析项），
 * 绝不依赖 %USERPROFILE%\.codex\skills 这类 home 硬编码路径 —— 机器间不同步
 * 正是“isSharedSessionValid is not a function”这类版本错位的根因。
 *
 * 来源：
 *   - 清单：仓库 skills/manifest.json（唯一入口，随包携带）；
 *   - 通用 Skill 脚本：本地 Skill 源（默认 ~/.codex/skills，可用
 *     BOSS_JARVIS_SKILLS_SRC 覆盖）——manifest 声明的 14 个通用 Skill 目录 + 运行时
 *     引用的 mail-analysis；
 *   - 平台专用 Skill：仓库 skills/windows-outlook-mail（随代码库版本管理）。
 *
 * 排除（不进包）：OA 会话缓存（oa-storage.json / oa-session.json 及 .bak-*）、
 * review-samples.jsonl（含真实待办样本）、*.local.json、.DS_Store/Thumbs.db、
 * node_modules、.playwright-cli、名为 undefined 的杂散文件。
 *
 * 用法：node scripts/stage-windows-skills.mjs [输出目录]
 *   输出目录默认 dist-windows/skills（可被 zip 打包进便携包，与 exe 同级）。
 */
import { mkdirSync, readdirSync, readFileSync, copyFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(repoRoot, 'skills', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const skillsSrc = process.env.BOSS_JARVIS_SKILLS_SRC || join(homedir(), '.codex', 'skills');
const outRoot = resolve(process.argv[2] || join(repoRoot, 'dist-windows', 'skills'));
const platformSkillSrc = join(repoRoot, 'skills');

/** 会话缓存/杂散文件不进包 */
const EXCLUDED_BASENAMES = new Set([
  'oa-storage.json', 'oa-session.json', 'oa-storage.json.bak', 'oa-session.json.bak',
  'hongyi-today-storage.json', 'session-cookies.json',
  '.DS_Store', 'Thumbs.db', 'node_modules', '.playwright-cli', 'undefined',
]);
const isExcluded = (name) =>
  EXCLUDED_BASENAMES.has(name) ||
  /\.bak-\d{6}$/.test(name) ||
  name.endsWith('.local.json') ||
  name === 'review-samples.jsonl';

/** 从 manifest 收集通用 Skill 目录名（脚本第一段路径）。 */
function skillDirsFrom(entries) {
  const dirs = new Set();
  const collect = (script) => {
    if (script) dirs.add(script.split('/')[0]);
  };
  for (const entry of Object.values(entries)) {
    collect(entry.fetch);
    for (const s of Object.values(entry.actions || {})) collect(s);
  }
  return dirs;
}

const commonDirs = [...skillDirsFrom(manifest.skills)]
  .filter((d) => d && !d.includes('..'))
  .sort();
// 运行时额外引用的目录（不在 manifest 的 skills 表中）
const extraDirs = ['mail-analysis', 'hongyi-common'];

/** 复制单个目录树，跳过被排除文件。返回复制的文件数。 */
function copyTree(srcDir, dstDir, copied = { n: 0 }) {
  if (!existsSync(srcDir)) throw new Error(`源目录不存在: ${srcDir}`);
  for (const name of readdirSync(srcDir)) {
    if (isExcluded(name)) continue;
    const src = join(srcDir, name);
    const dst = join(dstDir, name);
    const st = statSync(src);
    if (st.isDirectory()) {
      mkdirSync(dst, { recursive: true });
      copyTree(src, dst, copied);
    } else {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
      copied.n += 1;
    }
  }
  return copied.n;
}

function main() {
  if (!existsSync(skillsSrc)) {
    console.error(`Skill 源不存在: ${skillsSrc}（可用 BOSS_JARVIS_SKILLS_SRC 覆盖）`);
    process.exit(1);
  }
  console.log(`Skill 源: ${skillsSrc}`);
  console.log(`输出目录: ${outRoot}`);
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });

  // 1) 共享登录助手（只带代码，不带会话缓存）
  copyTree(join(skillsSrc, '.shared'), join(outRoot, '.shared'));

  // 2) 通用 Skill 目录
  const dirs = [...commonDirs, ...extraDirs];
  let total = 0;
  for (const d of dirs) {
    const src = join(skillsSrc, d);
    if (!existsSync(src)) {
      console.warn(`⚠️  跳过（源缺失）: ${d}`);
      continue;
    }
    total += copyTree(src, join(outRoot, d));
    console.log(`   + ${d}`);
  }

  // 3) 平台专用 Skill（仓库内）
  const platSrc = join(platformSkillSrc, 'windows-outlook-mail');
  if (existsSync(platSrc)) {
    total += copyTree(platSrc, join(outRoot, 'windows-outlook-mail'));
    console.log('   + windows-outlook-mail (repo)');
  }

  // 4) manifest 唯一入口随包携带
  copyFileSync(manifestPath, join(outRoot, 'manifest.json'));

  // 5) 校验：manifest 声明的脚本在 staging 内真实存在（与 Rust 启动校验同口径）
  const missing = [];
  for (const [id, entry] of Object.entries(manifest.skills)) {
    const candidates = [entry.fetch, ...Object.values(entry.actions || {})].filter(Boolean);
    for (const script of candidates) {
      if (!existsSync(join(outRoot, script))) missing.push(`${id} ${script}`);
    }
  }
  if (missing.length) {
    console.error('❌ staging 后 manifest 声明的脚本缺失:');
    for (const m of missing) console.error(`   - ${m}`);
    process.exit(1);
  }
  console.log(`✅ 完成：${dirs.length + 1} 个目录，${total} 个脚本文件；manifest 声明的脚本全部存在。`);
  console.log(`   会话缓存/样本数据已排除（oa-storage.json / oa-session.json / review-samples.jsonl 等）。`);
}

main();
