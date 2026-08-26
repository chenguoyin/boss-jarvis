# 平台差异对照表（单代码库收敛交付物）

> 维护一次、分发两端：所有差异只允许出现在 Skill 层，壳层（前端 + Rust 核心 + 设计系统）零平台分支。
> 更新日期：2026-08-26。

## 1. 通用 Skill 复用清单（双端同一套脚本）

| Skill | 展示名 | Runner | 说明 |
| --- | --- | --- | --- |
| oa-todo | OA 待办 | node | Playwright 取数；Windows 走 channel:'msedge'（Phase T） |
| spm-todo | 业务协作待办 | node | 同上 |
| hongyi-today-metrics | 虹翼今日专项 | node | 同上 |
| hongyi-business-overview | 虹翼经营总览 | node | 同上 |
| reminder-center | 提醒中心 | node | 同上 |
| daily-briefing | 每日晨报 | node | 取数 + 排期动作 |
| skill-manager | Skill 管理 | node | 列表 / 启停 / 安装 / 卸载动作 |
| weekly-summary | 每周总结 | node | 生成周报 + 读历史存档 |
| boss-cockpit | 老板驾驶舱 | node | 聚合驾驶舱 |
| audit-log | 审计日志 | node | 仅动作（写审计留痕），无取数 |
| ai-chat-dispatcher | AI 对话调度 | node | 仅动作（对话路由 / 写操作识别） |

这 11 个 Skill 在 macOS 与 Windows 上共用同一套脚本，输出同一份 JSON 契约。

## 2. 平台专用 Skill 映射与通道

| Skill | 展示名 | macOS | Windows |
| --- | --- | --- | --- |
| company-mail | 邮件 | node + Mail.app（SQLite Envelope Index 只读取数，AppleScript 降级；标记已读 / 打开回复草稿走 Mail AppleScript） | powershell + Outlook COM（内置 PowerShell）或 Microsoft Graph，Phase T 待实现 |
| native-calendar | 日历提醒 | swift + EventKit | powershell + Outlook COM 或 Microsoft Graph，Phase T 待实现 |

二者输出同一份 JSON 契约；字段名、level / urgency / needsReply / replyBasis 的取值与判定逻辑双端逐字一致。

安全边界（双端一致）：邮件点主题仅标记该封已读；点回复只打开客户端草稿/回复窗口，绝不自动发送。

## 3. 未完成项（Phase T，尾段单独处理）

- Tauri sidecar 内嵌 node.exe（最终用户零安装，仅依赖 WebView2）。
- 通用 Skill 在 Windows 上 Playwright 使用 channel:'msedge'。
- Windows 邮件 Skill：Outlook COM（内置 PowerShell，零依赖）或 Microsoft Graph，实现取数 / 标记已读 / 打开回复草稿。
- Windows 日历 Skill：Outlook COM 或 Microsoft Graph，输出与 macOS EventKit 同一契约。
- Windows CI（build-windows.yml）。
- 真实 Windows + Outlook 实机验收。

