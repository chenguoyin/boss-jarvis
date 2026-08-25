import SwiftUI

/// 系统配置页。Skill 运行配置（模型、OA 账号、NODE_PATH）直接读写
/// ~/.boss-jarvis/skill-env.conf，保存后 Skill 下次运行立即生效。
struct SettingsView: View {
    @ObservedObject var configuration: SystemConfiguration
    var onAutoRefreshChange: ((Bool, Double) -> Void)?
    @State private var showSaved = false
    @State private var showOAPassword = false
    @State private var showLLMKey = false

    var body: some View {
        Form {
            Section("显示") {
                FontSizeRow(
                    title: "标题字号",
                    value: $configuration.titleFontSize,
                    range: 12...24,
                    defaultValue: SystemConfiguration.defaultTitleFontSize
                )

                FontSizeRow(
                    title: "正文字号",
                    value: $configuration.bodyFontSize,
                    range: 10...20,
                    defaultValue: SystemConfiguration.defaultBodyFontSize
                )

                HStack {
                    Text("主题")
                    Spacer()
                    Picker("", selection: $configuration.theme) {
                        ForEach(AppTheme.allCases) { theme in
                            Text(theme.title).tag(theme)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 180)
                }

                Button("恢复默认字号") {
                    configuration.resetFontSizes()
                }
            }

            Section("自动刷新") {
                Toggle("启用自动刷新", isOn: $configuration.autoRefreshEnabled)
                    .onChange(of: configuration.autoRefreshEnabled) { enabled in
                        onAutoRefreshChange?(enabled, configuration.autoRefreshInterval)
                    }

                HStack {
                    Text("刷新间隔")
                    Spacer()
                    Picker("", selection: $configuration.autoRefreshInterval) {
                        Text("5 分钟").tag(5.0)
                        Text("10 分钟").tag(10.0)
                        Text("15 分钟").tag(15.0)
                        Text("30 分钟").tag(30.0)
                        Text("60 分钟").tag(60.0)
                    }
                    .pickerStyle(.menu)
                    .frame(width: 120)
                }
                .onChange(of: configuration.autoRefreshInterval) { interval in
                    onAutoRefreshChange?(configuration.autoRefreshEnabled, interval)
                }

                Text("所有 Skill 按此间隔自动获取真实数据。刷新时顶部状态栏会显示进度，完成后显示最近刷新时间和下次倒计时。")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }

            Section("OA 账号") {
                LabeledContent("账号") {
                    TextField("20290926", text: $configuration.oaUsername)
                        .textFieldStyle(.roundedBorder)
                }
                LabeledContent("密码") {
                    HStack {
                        if showOAPassword {
                            TextField("密码", text: $configuration.oaPassword)
                                .textFieldStyle(.roundedBorder)
                        } else {
                            SecureField("密码", text: $configuration.oaPassword)
                                .textFieldStyle(.roundedBorder)
                        }
                        Button {
                            showOAPassword.toggle()
                        } label: {
                            Image(systemName: showOAPassword ? "eye.slash" : "eye")
                        }
                        .buttonStyle(.borderless)
                        .help(showOAPassword ? "隐藏密码" : "显示密码")
                    }
                }
                Text("OA 账号可更换。密码只保存在本机 ~/.boss-jarvis/skill-env.conf，不上传任何服务器。")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }

            Section("模型调用") {
                LabeledContent("Base URL") {
                    TextField(SystemConfiguration.defaultLLMBaseURL, text: $configuration.llmBaseURL)
                        .textFieldStyle(.roundedBorder)
                }
                LabeledContent("API Key") {
                    HStack {
                        if showLLMKey {
                            TextField("sk-…", text: $configuration.llmAPIKey)
                                .textFieldStyle(.roundedBorder)
                        } else {
                            SecureField("sk-…", text: $configuration.llmAPIKey)
                                .textFieldStyle(.roundedBorder)
                        }
                        Button {
                            showLLMKey.toggle()
                        } label: {
                            Image(systemName: showLLMKey ? "eye.slash" : "eye")
                        }
                        .buttonStyle(.borderless)
                        .help(showLLMKey ? "隐藏 Key" : "显示 Key")
                    }
                }
                LabeledContent("默认模型") {
                    TextField(SystemConfiguration.defaultLLMModel, text: $configuration.llmModel)
                        .textFieldStyle(.roundedBorder)
                }
                Text("Skill 通过 COMPANY_LLM_* 环境变量调用公司模型（OpenAI 兼容接口）。配置保存在本机 ~/.boss-jarvis/skill-env.conf，保存后下次运行生效。")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }

            Section("运行环境") {
                LabeledContent("NODE_PATH") {
                    TextField("~/.npm/…/node_modules", text: $configuration.nodePath)
                        .textFieldStyle(.roundedBorder)
                }
                Text("Playwright 模块路径。更换电脑或 npm 缓存路径变化后需要更新。")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }

            Section("数据目录") {
                LabeledContent("Skill 输出") {
                    Text("~/.boss-jarvis/data")
                        .foregroundStyle(Color.jarvisMuted)
                        .textSelection(.enabled)
                }
                LabeledContent("审计日志") {
                    Text("~/.codex/workbench-audit")
                        .foregroundStyle(Color.jarvisMuted)
                        .textSelection(.enabled)
                }
                LabeledContent("晨报输出") {
                    Text("~/.codex/workbench-reports")
                        .foregroundStyle(Color.jarvisMuted)
                        .textSelection(.enabled)
                }
            }

            HStack {
                Button {
                    configuration.saveSkillEnv()
                    showSaved = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        showSaved = false
                    }
                } label: {
                    Text("保存配置")
                }

                if showSaved {
                    Label("已保存", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(Color.jarvisGreen)
                        .transition(.opacity)
                }

                Spacer()

                if !configuration.skillEnvLoaded {
                    Text("配置文件未找到，保存后将创建")
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisAmber)
                }
            }
        }
        .formStyle(.grouped)
        .padding(20)
        .frame(width: 480)
    }
}

private struct FontSizeRow: View {
    let title: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let defaultValue: Double
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                Spacer()
                Text("\(Int(value))")
                    .foregroundStyle(Color.jarvisMuted)
            }

            HStack {
                Slider(value: $value, in: range, step: 1)
                Stepper("", value: $value, in: range, step: 1)
                    .labelsHidden()
                Button {
                    value = defaultValue
                } label: {
                    Image(systemName: "arrow.counterclockwise")
                }
                .buttonStyle(.borderless)
                .help("恢复默认")
            }
        }
    }
}
