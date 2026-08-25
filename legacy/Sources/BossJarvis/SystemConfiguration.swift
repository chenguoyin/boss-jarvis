import Foundation
import SwiftUI

enum AppTheme: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: "系统"
        case .light: "浅色"
        case .dark: "深色"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    /// 主题切换按钮图标。
    var iconName: String {
        switch self {
        case .system: "macwindow"
        case .light: "sun.max"
        case .dark: "moon"
        }
    }
}

@MainActor
final class SystemConfiguration: ObservableObject {
    private enum Keys {
        static let titleFontSize = "system.titleFontSize"
        static let bodyFontSize = "system.bodyFontSize"
        static let theme = "system.theme"
        static let autoRefreshEnabled = "system.autoRefreshEnabled"
        static let autoRefreshInterval = "system.autoRefreshInterval"
        static let homeModuleOrder = "home.moduleOrder"
        static let hiddenHomeModules = "home.hiddenModules"
    }

    static let defaultTitleFontSize: Double = 14
    static let defaultBodyFontSize: Double = 12
    static let defaultAutoRefreshInterval: Double = 15
    static let autoRefreshIntervalOptions: [Double] = [5, 10, 15, 30, 60]

    // 公司大模型默认接入（OpenAI 兼容接口），API Key 不落源码，只存 skill-env.conf。
    static let defaultLLMBaseURL = "https://hongxincy.changhong.com/v1"
    static let defaultLLMModel = "qwen3.7-plus"

    @Published var titleFontSize: Double {
        didSet { UserDefaults.standard.set(titleFontSize, forKey: Keys.titleFontSize) }
    }

    @Published var bodyFontSize: Double {
        didSet { UserDefaults.standard.set(bodyFontSize, forKey: Keys.bodyFontSize) }
    }

    @Published var theme: AppTheme {
        didSet { UserDefaults.standard.set(theme.rawValue, forKey: Keys.theme) }
    }

    // 自动刷新
    @Published var autoRefreshEnabled: Bool {
        didSet { UserDefaults.standard.set(autoRefreshEnabled, forKey: Keys.autoRefreshEnabled) }
    }

    @Published var autoRefreshInterval: Double {
        didSet { UserDefaults.standard.set(autoRefreshInterval, forKey: Keys.autoRefreshInterval) }
    }

    // 首页模块自定义：排序与显隐，持久化到 UserDefaults。
    @Published var homeModuleOrder: [HomeModule] {
        didSet { defaults.set(homeModuleOrder.map(\.rawValue), forKey: Keys.homeModuleOrder) }
    }

    @Published var hiddenHomeModules: Set<HomeModule> {
        didSet { defaults.set(hiddenHomeModules.map(\.rawValue).sorted(), forKey: Keys.hiddenHomeModules) }
    }

    private let defaults: UserDefaults

    // Skill 运行配置（读写 ~/.boss-jarvis/skill-env.conf）
    @Published var llmBaseURL: String = SystemConfiguration.defaultLLMBaseURL
    @Published var llmAPIKey: String = ""
    @Published var llmModel: String = SystemConfiguration.defaultLLMModel
    @Published var oaUsername: String = ""
    @Published var oaPassword: String = ""
    @Published var nodePath: String = ""
    @Published var skillEnvLoaded = false

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let savedTitle = defaults.double(forKey: Keys.titleFontSize)
        let savedBody = defaults.double(forKey: Keys.bodyFontSize)
        titleFontSize = savedTitle > 0 ? savedTitle : Self.defaultTitleFontSize
        bodyFontSize = savedBody > 0 ? savedBody : Self.defaultBodyFontSize
        theme = AppTheme(rawValue: defaults.string(forKey: Keys.theme) ?? "") ?? .system
        if defaults.object(forKey: Keys.autoRefreshEnabled) != nil {
            autoRefreshEnabled = defaults.bool(forKey: Keys.autoRefreshEnabled)
        } else {
            autoRefreshEnabled = true
        }
        let savedInterval = defaults.double(forKey: Keys.autoRefreshInterval)
        autoRefreshInterval = savedInterval > 0 ? savedInterval : Self.defaultAutoRefreshInterval
        homeModuleOrder = Self.loadModuleOrder(from: defaults)
        hiddenHomeModules = Self.loadHiddenModules(from: defaults)
        loadSkillEnv()
    }

    private static func loadModuleOrder(from defaults: UserDefaults) -> [HomeModule] {
        let saved = defaults.stringArray(forKey: Keys.homeModuleOrder) ?? []
        let modules = saved.compactMap { HomeModule(rawValue: $0) }
        guard !modules.isEmpty else { return HomeModule.allCases }
        // 补上新增模块、剔除未知值，保证升级后首页不缺模块。
        var result = modules
        for module in HomeModule.allCases where !result.contains(module) {
            result.append(module)
        }
        return result
    }

    private static func loadHiddenModules(from defaults: UserDefaults) -> Set<HomeModule> {
        let saved = defaults.stringArray(forKey: Keys.hiddenHomeModules) ?? []
        return Set(saved.compactMap { HomeModule(rawValue: $0) })
    }

    var titleSize: CGFloat { CGFloat(titleFontSize) }
    var bodySize: CGFloat { CGFloat(bodyFontSize) }
    var captionSize: CGFloat { max(CGFloat(bodyFontSize) - 1, 10) }
    var controlSize: CGFloat { max(CGFloat(titleFontSize), CGFloat(bodyFontSize) + 1) }
    var dataSize: CGFloat { max(CGFloat(titleFontSize) * 2.25, 28) }

    func titleFont(weight: Font.Weight = .bold) -> Font {
        .system(size: titleSize, weight: weight)
    }

    func bodyFont(weight: Font.Weight = .regular) -> Font {
        .system(size: bodySize, weight: weight)
    }

    func captionFont(weight: Font.Weight = .regular) -> Font {
        .system(size: captionSize, weight: weight)
    }

    func controlFont(weight: Font.Weight = .semibold) -> Font {
        .system(size: controlSize, weight: weight)
    }

    func dataFont(weight: Font.Weight = .bold) -> Font {
        .system(size: dataSize, weight: weight)
    }

    func resetFontSizes() {
        titleFontSize = Self.defaultTitleFontSize
        bodyFontSize = Self.defaultBodyFontSize
    }

    func resetHomeModules() {
        homeModuleOrder = HomeModule.allCases
        hiddenHomeModules = []
    }

    private var skillEnvURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".boss-jarvis/skill-env.conf")
    }

    /// 读取 Skill 运行配置。文件缺失时保持空值，界面显示“未配置”。
    func loadSkillEnv() {
        guard let text = try? String(contentsOf: skillEnvURL, encoding: .utf8) else {
            skillEnvLoaded = false
            return
        }
        var values: [String: String] = [:]
        for line in text.split(separator: "\n") {
            let parts = line.split(separator: "=", maxSplits: 1)
            guard parts.count == 2 else { continue }
            let key = parts[0].trimmingCharacters(in: .whitespaces)
            let value = parts[1].trimmingCharacters(in: .whitespaces)
            if !key.isEmpty, !value.isEmpty { values[key] = value }
        }
        llmBaseURL = values["COMPANY_LLM_BASE_URL"] ?? Self.defaultLLMBaseURL
        llmAPIKey = values["COMPANY_LLM_API_KEY"] ?? ""
        llmModel = values["COMPANY_LLM_MODEL"] ?? Self.defaultLLMModel
        oaUsername = values["OA_USERNAME"] ?? ""
        oaPassword = values["OA_PASSWORD"] ?? ""
        nodePath = values["NODE_PATH"] ?? ""
        skillEnvLoaded = true
    }

    /// 保存 Skill 运行配置。只写有值的键，空值保留文件中原有的其他键。
    func saveSkillEnv() {
        var lines: [String] = [
            "# Boss Jarvis Skill 运行环境（key=value，勿提交到代码库）",
            "OA_USERNAME=\(oaUsername)",
            "OA_PASSWORD=\(oaPassword)",
            "COMPANY_LLM_BASE_URL=\(llmBaseURL)",
            "COMPANY_LLM_MODEL=\(llmModel)",
            "COMPANY_LLM_API_KEY=\(llmAPIKey)",
            "NODE_PATH=\(nodePath)"
        ]
        let _ = try? lines.joined(separator: "\n").write(to: skillEnvURL, atomically: true, encoding: .utf8)
        skillEnvLoaded = true
    }
}
