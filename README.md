# boss-jarvis

面向 BOSS 的单代码库 AI 工作台：Tauri 2 壳（Rust + React/TypeScript），一套代码同时产出 macOS 与 Windows 安装包。
SwiftUI 原生版已按人工终审退役删除；仓库仅保留一套 Tauri 2 壳。

## 架构

```text
Tauri 2 单壳（一套代码，双端复用）
├── 前端 React/TS   → 导航壳 + 12 分区视图 + 主题/字号/配置 + 确认中心 + 审计展示
├── Rust 核心       → 窗口生命周期 + Skill 执行/命令桥 + 数据目录适配
├── 设计系统 tokens → jarvis* 色板/字号/圆角/阴影，亮暗两套
└── skills/manifest.json → Skill → 平台 → 脚本唯一入口
```

平台差异只收敛在 Skill 层：通用 Skill 双端复用；邮件统一通过 `changhong-mail` 获取和执行动作，不在 App 或 manifest 区分 macOS/Windows。

## 当前范围

- 老板驾驶舱：全局结论条、Top3 待办提醒、跨系统聚合行、经营速览、风险提示、待回复邮件。
- 12 分区：驾驶舱、每日晨报、OA 待办、经营情况、资金费用、邮件、日历提醒、每周总结、Skill 管理、审计日志、确认中心（入口在 Skill 管理启停）、系统配置（顶栏齿轮）。
- 数据全部来自本地 Skill（Playwright / AppleScript / Swift 采集），输出 JSON 到 `~/.boss-jarvis/data/`，壳层只读契约渲染，缺字段显示「未获取」。
- 刷新即真实取数：各分区刷新只执行本分区 Skill；顶栏刷新执行全部取数任务。Rust 在每个 Skill 开始/结束时发 `skill-fetch-progress` 事件，顶栏与内容区实时显示逐项获取状态。

## 写操作规则

- OA/SPM 审批：待办详情弹层点「同意/不同意」即确认，直接真实执行并写审计。
- Skill 启停：先进确认中心，用户确认后执行并留痕。
- 邮件：点主题通过 Coremail 直连仅标记该封已读，不依赖本地邮件客户端；点回复只打开系统默认邮件客户端草稿窗口，绝不自动发送。
- 全部取数、分析、拟执行、实际执行都进审计留痕（`~/.codex/workbench-audit/`）。

## 配置

系统配置（顶栏齿轮）：三态主题（跟随系统/浅色/深色）、标题字号（默认 14）、正文字号（默认 12）、OA/LLM 运行环境变量与邮件签名。
配置存 localStorage、`~/.boss-jarvis/skill-env.conf` 与 `~/.boss-jarvis/mail-signature.txt`，凭证和个人签名不进源码。

## 环境

- Node 22+ / npm
- Rust stable（Tauri 2）
- macOS 13+（开发与打包）；Windows 10+（Phase T 打包，依赖 WebView2）

## 常用命令

```bash
npm install
npm run tauri dev        # 本地窗口开发（macOS）
npm run build            # 前端类型检查 + 构建
npm run check:design     # 设计令牌约束检查
npm run check:shell      # 壳层布局尺寸检查
cd src-tauri && cargo check && cargo test
npm run tauri build      # 打安装包（macOS）
```

## 设计边界

- 一套壳、一份前端、一份 Rust 核心；出现第二套壳即偏离目标。
- UI 颜色只用 `var(--jv-*)`，字号只用字号类，禁止写死。
- 不硬编码凭证；不调用未授权接口；写操作必须确认（邮件标记已读/打开草稿除外）并留痕。
- `docs/skill-output-contract.md` 是壳与 Skill 的唯一接口，先改契约再动解析。

## 迁移状态

Phase 0-5 已完成（壳层、契约链、12 视图、确认中心/写命令/配置、收敛退役）；
`legacy/` SwiftUI 金参照已删除，单代码库定稿。
Phase T（尾段单独处理）：Windows 邮件/日历 Skill、Node sidecar、Windows CI、实机验收。
详见 [docs/migration-plan.md](docs/migration-plan.md)。
平台差异对照表见 [docs/platform-diff-matrix.md](docs/platform-diff-matrix.md)。
