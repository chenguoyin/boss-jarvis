#!/usr/bin/env node
// Tauri CLI 在 macOS 上交叉编译 Windows 时不会自动带 cargo-xwin 的环境，
// 用这个垫片让 tauri build --runner 指向 cargo xwin，复用 xwin 的 CRT/SDK 头文件。
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
// 前端必须以 custom-protocol 编进 exe，否则 release 运行时会去连 devUrl(127.0.0.1:1420)。
const needsFeature =
  args.includes("build") && !args.includes("--features") && !process.env.CARGO_XWIN_SHIM_NO_FEATURE;
const finalArgs = needsFeature ? [...args, "--features", "custom-protocol"] : args;
const child = spawn("cargo", ["xwin", ...finalArgs], { stdio: "inherit" });
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.on("close", (code) => process.exit(code ?? 1));
