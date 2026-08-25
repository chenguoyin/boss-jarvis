# boss-jarvis 项目说明（面向 Agent）

Tauri 2 单壳双平台（macOS + Windows）AI 工作台。壳层只有一套：React/TS 前端 + Rust 核心。
SwiftUI 版仅在 `legacy/` 保留为迁移期黄金参照，1:1 验收通过后删除；不要在 legacy 下加新功能。
技术栈、构建、测试命令见 [README.md](README.md)。

## 单一事实来源（北极星，违反即返工）

- 一份前端：全部视图只写一遍，双端共用；禁止 `if (platform === 'mac') ... else ...` 式平台分支 UI。
- 一份 Rust 核心：窗口与 Skill 编排逻辑共享；平台差异只允许出现在 `skills/manifest.json` 的 common/platform 配置。
- 一份契约：`docs/skill-output-contract.md` 是壳与 Skill 的唯一接口；新增字段先改契约再动解析。
- 一份设计系统：`src/styles/tokens.css` 是 jarvis* 色板/字号/圆角/阴影唯一来源，对应 legacy DesignSystem.swift。

## 主题颜色（必须遵守）

- 所有 UI 颜色必须使用 `var(--jv-*)` 设计令牌，禁止组件里写死 hex/rgb/white/black/gray。
- 新增颜色先在 `src/styles/tokens.css` 定义 `--jv-*`，同时给出亮/暗两套值（`[data-theme="dark"]`），再在组件引用。
- 新增 UI 后，必须切换「系统 / 浅色 / 深色」三种主题各看一遍，确认对比度和可读性。
- 主题配置存 localStorage `system.theme`，默认跟随系统。

## 字号（必须遵守）

- 所有文字必须使用字号类或 `var(--jv-fs-*)`：`.jv-title` / `.jv-body` / `.jv-caption` / `.jv-control` / `.jv-data`。
- 禁止组件写死 `font-size`；用户可在系统配置里调整标题/正文字号（默认 14/12）并持久化到 localStorage。
- 字号体系单一来源：`src/lib/config.ts` 的 `computeFontSizes`。

## 尺寸约定

- 左侧导航：宽 72，图标热区 52×52（黄金参照源码事实，见 legacy/ContentView.swift），选中背景 42×42，图标 15px，徽标贴图标右上角。
- 顶栏高 60，内容垂直居中；图标按钮无外框（`.jv-icon-plain`）。

## Skill 与写操作

- Skill 清单唯一入口：`skills/manifest.json`；加载时校验声明脚本存在，缺失启动即报错。
- 通用 Skill（oa-todo / spm-todo / hongyi-* / reminder-center / daily-briefing / skill-manager / audit-log …）一套脚本双端复用；Windows 上 Playwright 用 `channel: 'msedge'`（Phase T）。
- 平台专用 Skill（邮件、日历）在 manifest 里按 macos/windows 分叉，Windows 实现属 Phase T。
- 数据流：Skill → JSON → `~/.boss-jarvis/data/`（Windows `%USERPROFILE%\.boss-jarvis\data\`）→ 壳层只读契约 → UI。
- Rust 写命令在 `src-tauri/src/command_runtime.rs`：OA/SPM 审批直达、Skill 启停、邮件标记已读/打开草稿、skill-env 读写；全部经 audit-log Skill 留痕。

## 安全红线

- 不在源码硬编码 OA 账号、密码、API Key、Cookie、Token；凭证只存 `~/.boss-jarvis/skill-env.conf`。
- OA 审批：在待办详情弹层内点“同意/不同意”即视为明确确认，直接执行真实审批并写审计。
- Skill 启停、AI 对话识别的写操作必须先进确认中心，用户确认后才执行。
- 邮件：点击主题仅标记该封已读；点击回复只打开邮件客户端草稿/回复窗口，绝不自动发送，发送必须由用户手动完成。
- 取数、分析、拟执行、实际执行都要进审计留痕。
- 金额/日期/人名只来自源系统，壳层不推测、不四舍五入；缺字段显示「未获取」，不得用猜测数据填充。

## 应用图标

- 所有展示的应用图标一律使用 macOS 圆角矩形版本（连续圆角，半径约边长 22.37%，透明背景），不要用方角版。
- 当前壳内引用 `src/assets/brand-icon.png`；图标源文件与再生成流程见 `docs/icon/`。

## 日期时间显示格式（必须遵守）

- App 内所有面向用户显示的日期：`yyyy-MM-dd`（如 2026-08-24）。
- 日期时间：`yyyy-MM-dd HH:mm:ss`（如 2026-08-24 14:30:00），带秒；纯时间段标签（如 09:00-10:00）除外。
- 内部存储、JSON 字段、Skill 输出继续用 ISO8601，仅显示层转换。

## 验证命令

- 前端：`npx tsc --noEmit && npm run build && npm run check:design && npm run check:shell`
- Rust：`cd src-tauri && cargo check && cargo test`（集成测试依赖本机 ~/.codex/skills，CI 中 --ignored 跳过）
- 窗口：`npm run tauri dev`（macOS）；写操作 UI 链路需实机人工验证
