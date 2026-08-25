# boss-jarvis 项目说明（面向 Agent）

原生 macOS AI 工作台，SwiftUI，无第三方依赖。技术栈、构建、测试命令见 [README.md](README.md)。

## 主题颜色（必须遵守）

- 所有 UI 颜色必须使用 DesignSystem.swift 里的 Color.jarvis* 动态色，禁止写死 Color(red:green:blue:)、Color.white、.black、.gray 等固定色。
- 现有动态色：jarvisPage / jarvisApp / jarvisPanel / jarvisCard / jarvisCardSoft（背景层级），jarvisText / jarvisMuted / jarvisFaint（文字层级），jarvisLine（分隔线/描边），jarvisBlue / jarvisGreen / jarvisAmber / jarvisRed / jarvisPurple（强调/状态），jarvisInk。
- 新增功能缺颜色时，先在 DesignSystem.swift 的 dynamic(_:_:) 帮助函数基础上扩展一个新的 Color.jarvis*，同时给出亮/暗两套值，再在视图里引用。不要在视图里临时造色。
- 文字用 .foregroundStyle(Color.jarvisText) 系列，不要用 Color.primary（深浅切换时部分场景不同步）。
- 新增 UI 后，必须切换「系统 / 浅色 / 深色」三种主题各看一遍，确认对比度和可读性。
- 顶栏右侧有主题选择器（ThemePicker），配置存在 SystemConfiguration.theme，默认跟随系统。

## 字号（必须遵守）

- 所有文字必须用 SystemConfiguration 的字号方法：titleFont() / bodyFont() / captionFont() / controlFont() / dataFont()，禁止写死 .font(.system(size:))。
- 默认标题 14、正文 12，用户可在设置里自定义并持久化。

## 尺寸约定

- 左侧导航：宽 72，图标热区 64×64，选中背景 42×42，图标 15pt，徽标贴图标右上角。
- 顶栏高 60，内容垂直居中；图标按钮用 JarvisButtonStyle(variant: .iconPlain)（无外框）。

## 安全红线

- 不在源码硬编码 OA 账号、密码、API Key、Cookie、Token。
- OA 审批：在待办详情弹层内点“同意/不同意”即视为明确确认，直接执行真实审批；执行记录仍写入确认中心做审计。Skill 启停、AI 对话识别的写操作仍必须先进确认中心，用户确认后才执行。邮件例外一：点击邮件主题打开详情时直接把该邮件标记为已读并同步 Mail 客户端，仅此一封；例外二：点击回复直接在邮件客户端打开草稿/回复窗口，但不得自动点击发送，发送必须由用户手动完成。
- 取数、分析、拟执行、实际执行都要进审计留痕。

## 应用图标

- 所有对外/对内展示的应用图标一律使用 macOS 圆角矩形版本（连续圆角，半径约边长 22.37%，透明背景），不要用方角版。
- 唯一源文件是 docs/icon/icon-final.svg / icon-final-small.svg，改图标只改这两个文件。
- 重新生成跑 ./scripts/make-icon.sh（产出 AppIcon.icns 方角系统裁切版 + AppIconRounded.icns 圆角版 + brand/BrandIcon*.png 圆角透明 PNG），然后 ./scripts/build-app.sh 打进 app 包。
- app 内引用品牌图标用 Bundle 里的 BrandIcon.png（已是圆角透明），不要在 SwiftUI 里再叠 clipShape。

## 日期时间显示格式（必须遵守）

- App 内所有面向用户显示的日期：`yyyy-MM-dd`（如 2026-08-24）。
- App 内所有面向用户显示的日期时间：`yyyy-MM-dd HH:mm:ss`（如 2026-08-24 14:30:00），带秒。
- 不使用 `MM-dd HH:mm`、`HH:mm`、`yyyy-MM-dd HH:mm` 等变体；日程/日程时间段这类纯时间标签（如 09:00-10:00）除外。
- DateFormatter 统一 `locale = Locale(identifier: "zh_CN")`。
- 内部存储、JSON 字段、Skill 输出继续用 ISO8601，仅显示层转换。
