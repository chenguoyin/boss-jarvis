#!/usr/bin/env node
// 图标守门：应用图标必须是透明背景 + 圆角版本，方角不透明版会在四角检测中失败。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

const ROOT = join(import.meta.dirname, "..");
const TARGETS = [
  join(ROOT, "src/assets/brand-icon.png"),
  ...readdirSync(join(ROOT, "src-tauri/icons"))
    .filter((name) => name.endsWith(".png"))
    .map((name) => join(ROOT, "src-tauri/icons", name)),
];

function readPng(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("不是 PNG 文件");
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += len + 12;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`不支持的非 RGBA8 PNG（bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}）`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++];
    const line = raw.subarray(offset, offset + stride);
    offset += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      pixels[y * stride + x] = v;
    }
    prev = pixels.subarray(y * stride, (y + 1) * stride);
  }
  return { width, height, pixels, stride };
}

const failures = [];
for (const file of TARGETS) {
  const rel = file.slice(ROOT.length + 1);
  try {
    const { width, height, pixels, stride } = readPng(file);
    const corners = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ].map(([x, y]) => pixels[y * stride + x * 4 + 3]);
    if (corners.some((a) => a !== 0)) {
      failures.push(`${rel}: 四角 alpha=${corners.join(",")}，疑似方角不透明图标`);
    }
  } catch (err) {
    failures.push(`${rel}: ${err.message}`);
  }
}

if (failures.length > 0) {
  console.error("图标合规检查失败（必须使用透明背景圆角图标）:");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}

console.log(`icon alpha check passed (${TARGETS.length} files)`);
