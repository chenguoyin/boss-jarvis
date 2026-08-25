import Foundation
import Testing
@testable import BossJarvis

/// 测试用假执行器：不跑 Node 脚本，立即成功。
/// 与真实 SkillCommandService 一致：非隔离 + @unchecked Sendable。
private final class StubCommandService: WritesConfirmedActions, @unchecked Sendable {
    func execute(_ action: PendingWriteAction) -> SkillCommandOutcome {
        SkillCommandOutcome(ok: true, summary: "stub executed", draftPath: nil)
    }
    func openMailReply(_ message: MailMessage, completion: @escaping (Bool, String) -> Void) {
        completion(true, "回复窗口已在邮件客户端打开，请核对后点击发送。")
    }
    func markMailRead(_ message: MailMessage, completion: @escaping (Bool, String) -> Void) {
        completion(true, "已同步为已读。")
    }
    func refetchOATodos(completion: @escaping (OATodoResult?) -> Void) {
        // 下一轮主循环完成，让全量刷新中的“OA 阶段”动作提示可被采样到。
        DispatchQueue.global(qos: .utility).async {
            DispatchQueue.main.async {
                completion(OATodoResult(total: 0, count: 0, items: [], fetchedAt: Date()))
            }
        }
    }
    func refetchSkillManager(completion: @escaping (Bool) -> Void) { completion(true) }
}

@MainActor
@Suite(.serialized)
struct DashboardViewModelTests {
    private func makeViewModel() -> DashboardViewModel {
        DashboardViewModel(commandService: StubCommandService())
    }

    private func writeBuiltinStubScripts(in root: URL) {
        let nodeScripts: [(String, String)] = [
            ("company-mail", "fetch-unread-mail.cjs"),
            ("hongyi-today-metrics", "fetch-today-metrics.cjs"),
            ("hongyi-business-overview", "fetch-business.cjs"),
            ("skill-manager", "manage-skills.cjs"),
            ("reminder-center", "aggregate-reminders.cjs"),
            ("daily-briefing", "run-briefing.cjs")
        ]
        for (skill, scriptName) in nodeScripts {
            let dir = root.appendingPathComponent(skill, isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let body = "console.log(JSON.stringify({ ok: true, skill: '" + skill + "', mode: 'read_only', sourceSystem: 'test', fetchedAt: new Date().toISOString(), count: 0, items: [], events: [], reminders: [] }));"
            try? body.write(toFile: dir.appendingPathComponent(scriptName).path, atomically: true, encoding: .utf8)
        }
        let calendarDir = root.appendingPathComponent("native-calendar", isDirectory: true)
        try? FileManager.default.createDirectory(at: calendarDir, withIntermediateDirectories: true)
        let swiftBody = "import Foundation; let payload: [String: Any] = [\"ok\": true, \"skill\": \"native-calendar\", \"mode\": \"read_only\", \"sourceSystem\": \"test\", \"fetchedAt\": ISO8601DateFormatter().string(from: Date()), \"count\": 0, \"events\": [], \"reminders\": []]; print(String(data: try! JSONSerialization.data(withJSONObject: payload), encoding: .utf8)!)"
        try? swiftBody.write(toFile: calendarDir.appendingPathComponent("fetch-today.swift").path, atomically: true, encoding: .utf8)
    }

    @Test
    func homeModuleConfigurationPersistsAndHeals() {
        let suiteName = "boss-jarvis.tests.home-modules"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)

        var configuration = SystemConfiguration(defaults: defaults)
        #expect(configuration.homeModuleOrder == HomeModule.allCases)
        #expect(configuration.hiddenHomeModules.isEmpty)

        configuration.homeModuleOrder = [.mail, .todo]
        configuration.hiddenHomeModules = [.metrics]

        // 重新加载：持久化生效，且补齐被遗漏的模块。
        configuration = SystemConfiguration(defaults: defaults)
        #expect(configuration.homeModuleOrder.prefix(2) == [.mail, .todo])
        #expect(configuration.homeModuleOrder.contains(HomeModule.metrics))
        #expect(configuration.homeModuleOrder.count == HomeModule.allCases.count)
        #expect(configuration.hiddenHomeModules == [.metrics])

        configuration.resetHomeModules()
        #expect(configuration.homeModuleOrder == HomeModule.allCases)
        #expect(configuration.hiddenHomeModules.isEmpty)
    }

    @Test
    func homeHeadlineDefaultsToMissingState() {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("boss-jarvis-tests-empty-" + UUID().uuidString, isDirectory: true)
        let store = SkillDataStore(baseDirectory: directory)
        var briefingStore = BriefingStore()
        briefingStore.reportDirectory = directory
        let viewModel = DashboardViewModel(store: store, briefingStore: briefingStore)

        #expect(viewModel.homeTodoItems.isEmpty)
        #expect(viewModel.homeHeadlineText.contains("未获取"))
        #expect(viewModel.homeDataUpdatedText == "未获取")
        #expect(viewModel.homeMetricItems.map(\.isMissing) == Array(repeating: true, count: 5))
    }

    @Test
    func refreshNowClearsCountdownWhenAutoRefreshDisabled() {
        let viewModel = DashboardViewModel()
        viewModel.configureAutoRefresh(enabled: false, intervalMinutes: 15)
        let countdownBefore = viewModel.nextAutoRefreshAt

        viewModel.refreshNow()

        #expect(viewModel.nextAutoRefreshAt == nil)
        #expect(countdownBefore == nil)
    }

    @Test
    func refreshNowReschedulesAutoRefreshWhenEnabled() async {
        let viewModel = DashboardViewModel()
        try? await Task.sleep(nanoseconds: 100_000_000)
        viewModel.configureAutoRefresh(enabled: true, intervalMinutes: 30)
        let first = viewModel.nextAutoRefreshAt
        try? await Task.sleep(nanoseconds: 100_000_000)

        viewModel.refreshNow()

        #expect(viewModel.nextAutoRefreshAt != nil)
        #expect(first != nil)
        #expect(viewModel.nextAutoRefreshAt!.timeIntervalSinceNow > 29 * 60)
    }

    /// 页面级失败过滤：只返回该页面涉及 Skill 的取数失败。
    @Test
    func fetchFailuresAreFilteredByPageSkills() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("boss-jarvis-tests-failures-" + UUID().uuidString, isDirectory: true)
        let dataDir = directory.appendingPathComponent("data", isDirectory: true)
        let logDir = directory.appendingPathComponent("logs", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        writeBuiltinStubScripts(in: directory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let service = SkillFetchService(skillsDirectory: directory, dataDirectory: dataDir, logDirectory: logDir)
        let store = SkillDataStore(baseDirectory: dataDir)
        var briefingStore = BriefingStore()
        briefingStore.reportDirectory = dataDir
        let viewModel = DashboardViewModel(store: store, briefingStore: briefingStore, commandService: StubCommandService(), fetchService: service)

        // 等初始化 reload 结束，避免 isReloading 挡住单技能刷新。
        for _ in 0..<100 where viewModel.isReloading {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }

        viewModel.refreshSkill("ghost-skill")
        for _ in 0..<100 where !viewModel.fetchFailures.contains(where: { $0.hasPrefix("ghost-skill:") }) {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }

        #expect(viewModel.fetchFailures(for: ["ghost-skill"]) == ["ghost-skill: 未找到该 Skill 的取数任务"])
        #expect(viewModel.fetchFailures(for: ["spm-todo"]).isEmpty)
    }

    /// 单技能刷新成功后，清除该 Skill 之前的失败提示。
    @Test
    func refreshSkillSuccessClearsItsOwnFailure() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("boss-jarvis-tests-recover-" + UUID().uuidString, isDirectory: true)
        let dataDir = directory.appendingPathComponent("data", isDirectory: true)
        let logDir = directory.appendingPathComponent("logs", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let skillDir = directory.appendingPathComponent("demo-skill", isDirectory: true)
        try? FileManager.default.createDirectory(at: skillDir, withIntermediateDirectories: true)
        let manifest = [
            "skill": "demo-skill",
            "fetch": ["command": ["node", "run.cjs"], "outputFile": "demo.json", "wrapEnvelope": false]
        ] as [String: Any]
        try? JSONSerialization.data(withJSONObject: manifest)
            .write(to: skillDir.appendingPathComponent("workbench.json"))
        let scriptURL = skillDir.appendingPathComponent("run.cjs")
        try? "process.exit(1);".write(toFile: scriptURL.path, atomically: true, encoding: .utf8)

        let service = SkillFetchService(skillsDirectory: directory, dataDirectory: dataDir, logDirectory: logDir)
        let store = SkillDataStore(baseDirectory: dataDir)
        var briefingStore = BriefingStore()
        briefingStore.reportDirectory = dataDir
        let viewModel = DashboardViewModel(store: store, briefingStore: briefingStore, commandService: StubCommandService(), fetchService: service)
        for _ in 0..<100 where viewModel.isReloading {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }

        viewModel.refreshSkill("demo-skill")
        for _ in 0..<100 where !viewModel.fetchFailures.contains(where: { $0.hasPrefix("demo-skill:") }) {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        for _ in 0..<100 where viewModel.isReloading {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        #expect(viewModel.fetchFailures(for: ["demo-skill"]).count == 1)

        // 脚本修复后再次刷新，应清除该 Skill 的失败提示。
        try? "console.log(JSON.stringify({ ok: true, skill: 'demo-skill', mode: 'read_only', sourceSystem: 'test', fetchedAt: new Date().toISOString(), count: 0, homepageItems: [], items: [], missingFields: [], unavailableSources: [] }));"
            .write(toFile: scriptURL.path, atomically: true, encoding: .utf8)
        viewModel.refreshSkill("demo-skill")
        for _ in 0..<100 where viewModel.fetchFailures.contains(where: { $0.hasPrefix("demo-skill:") }) {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        #expect(viewModel.fetchFailures(for: ["demo-skill"]).isEmpty)
    }

    /// 单技能刷新期间 fetchActivity 显示 Skill 声明的实时动作，完成后清空。
    @Test
    func refreshSkillShowsAndClearsFetchActivity() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("boss-jarvis-tests-activity-" + UUID().uuidString, isDirectory: true)
        let dataDir = directory.appendingPathComponent("data", isDirectory: true)
        let logDir = directory.appendingPathComponent("logs", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        writeBuiltinStubScripts(in: directory)

        let skillDir = directory.appendingPathComponent("slow-skill", isDirectory: true)
        try? FileManager.default.createDirectory(at: skillDir, withIntermediateDirectories: true)
        let manifest = [
            "skill": "slow-skill",
            "fetch": ["command": ["node", "run.cjs"], "outputFile": "slow.json", "wrapEnvelope": false, "actionText": "正在同步测试数据…"]
        ] as [String: Any]
        try? JSONSerialization.data(withJSONObject: manifest)
            .write(to: skillDir.appendingPathComponent("workbench.json"))
        let script = "setTimeout(() => { console.log(JSON.stringify({ ok: true, skill: 'slow-skill', mode: 'read_only', sourceSystem: 'test', fetchedAt: new Date().toISOString(), count: 0, homepageItems: [], items: [], missingFields: [], unavailableSources: [] })); }, 400);"
        try? script.write(toFile: skillDir.appendingPathComponent("run.cjs").path, atomically: true, encoding: .utf8)

        let service = SkillFetchService(skillsDirectory: directory, dataDirectory: dataDir, logDirectory: logDir)
        let store = SkillDataStore(baseDirectory: dataDir)
        var briefingStore = BriefingStore()
        briefingStore.reportDirectory = dataDir
        let viewModel = DashboardViewModel(store: store, briefingStore: briefingStore, commandService: StubCommandService(), fetchService: service)
        for _ in 0..<600 where viewModel.isReloading {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }

        viewModel.refreshSkill("slow-skill")
        for _ in 0..<300 where viewModel.fetchActivity == nil {
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
        #expect(viewModel.fetchActivity?.contains("正在同步测试数据…") == true)

        for _ in 0..<300 where viewModel.fetchActivity != nil || viewModel.isReloading {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        #expect(viewModel.fetchActivity == nil)
        #expect(viewModel.fetchFailures.isEmpty)
    }

    /// 全量刷新时 fetchActivity 依次展示各 Skill 实时动作，最终清空。
    @Test
    func reloadTracksFetchActivityAcrossSkills() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("boss-jarvis-tests-reload-activity-" + UUID().uuidString, isDirectory: true)
        let dataDir = directory.appendingPathComponent("data", isDirectory: true)
        let logDir = directory.appendingPathComponent("logs", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        writeBuiltinStubScripts(in: directory)

        for name in ["x-skill", "y-skill"] {
            let skillDir = directory.appendingPathComponent(name, isDirectory: true)
            try? FileManager.default.createDirectory(at: skillDir, withIntermediateDirectories: true)
            let manifest = [
                "skill": name,
                "fetch": ["command": ["node", "run.cjs"], "outputFile": name + ".json", "wrapEnvelope": false, "actionText": "正在获取 " + name + "…"]
            ] as [String: Any]
            try? JSONSerialization.data(withJSONObject: manifest)
                .write(to: skillDir.appendingPathComponent("workbench.json"))
            let script = "console.log(JSON.stringify({ ok: true, skill: '" + name + "' }));"
            try? script.write(toFile: skillDir.appendingPathComponent("run.cjs").path, atomically: true, encoding: .utf8)
        }

        let service = SkillFetchService(skillsDirectory: directory, dataDirectory: dataDir, logDirectory: logDir)
        let store = SkillDataStore(baseDirectory: dataDir)
        var briefingStore = BriefingStore()
        briefingStore.reportDirectory = dataDir
        let viewModel = DashboardViewModel(store: store, briefingStore: briefingStore, commandService: StubCommandService(), fetchService: service)
        for _ in 0..<600 where viewModel.isReloading {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }

        var seen: [String] = []
        viewModel.reload()
        for _ in 0..<6000 {
            if let activity = viewModel.fetchActivity, !seen.contains(activity) {
                seen.append(activity)
            }
            if !viewModel.isReloading, viewModel.fetchActivity == nil, !seen.isEmpty { break }
            try? await Task.sleep(nanoseconds: 2_000_000)
        }

        #expect(seen.contains { $0 == "正在获取数据…" })
        #expect(seen.contains { $0 == "正在获取 x-skill…（第 1/9 项）" })
        #expect(seen.contains { $0 == "正在获取 y-skill…（第 2/9 项）" })
        #expect(seen.contains { $0.contains("正在获取 OA 待办与审批详情") })
        #expect(viewModel.fetchActivity == nil)
    }

    /// 单页刷新传入多个 Skill 时按序逐个取数，动作提示依次展示。
    @Test
    func refreshSkillsRunsEachSkillSequentially() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("boss-jarvis-tests-refresh-multi-" + UUID().uuidString, isDirectory: true)
        let dataDir = directory.appendingPathComponent("data", isDirectory: true)
        let logDir = directory.appendingPathComponent("logs", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        writeBuiltinStubScripts(in: directory)

        for name in ["p-skill", "q-skill"] {
            let skillDir = directory.appendingPathComponent(name, isDirectory: true)
            try? FileManager.default.createDirectory(at: skillDir, withIntermediateDirectories: true)
            let manifest = [
                "skill": name,
                "fetch": ["command": ["node", "run.cjs"], "outputFile": name + ".json", "wrapEnvelope": false, "actionText": "正在获取 " + name + "…"]
            ] as [String: Any]
            try? JSONSerialization.data(withJSONObject: manifest)
                .write(to: skillDir.appendingPathComponent("workbench.json"))
            let script = "setTimeout(() => { console.log(JSON.stringify({ ok: true, skill: '" + name + "' })); }, 200);"
            try? script.write(toFile: skillDir.appendingPathComponent("run.cjs").path, atomically: true, encoding: .utf8)
        }

        let service = SkillFetchService(skillsDirectory: directory, dataDirectory: dataDir, logDirectory: logDir)
        let store = SkillDataStore(baseDirectory: dataDir)
        var briefingStore = BriefingStore()
        briefingStore.reportDirectory = dataDir
        let viewModel = DashboardViewModel(store: store, briefingStore: briefingStore, commandService: StubCommandService(), fetchService: service)
        for _ in 0..<600 where viewModel.isReloading {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }

        var seen: [String] = []
        viewModel.refreshSkills(["p-skill", "q-skill"])
        for _ in 0..<2000 {
            if let activity = viewModel.fetchActivity, !seen.contains(activity) {
                seen.append(activity)
            }
            if !viewModel.isReloading, viewModel.fetchActivity == nil, !seen.isEmpty { break }
            try? await Task.sleep(nanoseconds: 5_000_000)
        }

        #expect(seen.contains { $0 == "正在获取 p-skill…" })
        #expect(seen.contains { $0 == "正在获取 q-skill…" })
        #expect(viewModel.fetchActivity == nil)
        #expect(viewModel.fetchFailures.isEmpty)
    }

    /// 本地重读不触发任何 Skill 取数，也不进入加载状态。
    @Test
    func reloadLocalOnlySkipsSkillFetches() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("boss-jarvis-tests-local-only-" + UUID().uuidString, isDirectory: true)
        let dataDir = directory.appendingPathComponent("data", isDirectory: true)
        let logDir = directory.appendingPathComponent("logs", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        writeBuiltinStubScripts(in: directory)

        let service = SkillFetchService(skillsDirectory: directory, dataDirectory: dataDir, logDirectory: logDir)
        let store = SkillDataStore(baseDirectory: dataDir)
        var briefingStore = BriefingStore()
        briefingStore.reportDirectory = dataDir
        let viewModel = DashboardViewModel(store: store, briefingStore: briefingStore, commandService: StubCommandService(), fetchService: service)
        for _ in 0..<600 where viewModel.isReloading {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }

        let failuresBefore = viewModel.fetchFailures
        viewModel.reloadLocalOnly()
        #expect(viewModel.isReloading == false)
        #expect(viewModel.fetchActivity == nil)
        #expect(viewModel.fetchFailures == failuresBefore)
    }

    /// 取数脚本挂起时按超时终止，并在页面失败提示里给出原因，而不是永远转圈。
    @Test
    func fetchTimeoutReportsReason() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("boss-jarvis-tests-timeout-" + UUID().uuidString, isDirectory: true)
        let dataDir = directory.appendingPathComponent("data", isDirectory: true)
        let logDir = directory.appendingPathComponent("logs", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        writeBuiltinStubScripts(in: directory)

        let skillDir = directory.appendingPathComponent("hang-skill", isDirectory: true)
        try? FileManager.default.createDirectory(at: skillDir, withIntermediateDirectories: true)
        let manifest = [
            "skill": "hang-skill",
            "fetch": ["command": ["node", "run.cjs"], "outputFile": "hang-skill.json", "wrapEnvelope": false, "actionText": "正在获取 hang-skill…"]
        ] as [String: Any]
        try? JSONSerialization.data(withJSONObject: manifest).write(to: skillDir.appendingPathComponent("workbench.json"))
        try? "setTimeout(() => {}, 60000);".write(toFile: skillDir.appendingPathComponent("run.cjs").path, atomically: true, encoding: .utf8)

        var service = SkillFetchService(skillsDirectory: directory, dataDirectory: dataDir, logDirectory: logDir)
        service.fetchTimeout = 0.8
        let store = SkillDataStore(baseDirectory: dataDir)
        var briefingStore = BriefingStore()
        briefingStore.reportDirectory = dataDir
        let viewModel = DashboardViewModel(store: store, briefingStore: briefingStore, commandService: StubCommandService(), fetchService: service)
        for _ in 0..<600 where viewModel.isReloading {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }

        viewModel.refreshSkill("hang-skill")
        for _ in 0..<1000 where viewModel.isReloading {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        #expect(viewModel.isReloading == false)
        #expect(viewModel.fetchFailures.contains { $0.hasPrefix("hang-skill:") && $0.contains("超时") })
    }

    /// 脚本输出 ok=false + error 时，页面失败提示保留 Skill 侧的具体原因，而不是笼统的“取数失败”。
    @Test
    func fetchFailurePreservesSkillReason() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("boss-jarvis-tests-error-" + UUID().uuidString, isDirectory: true)
        let dataDir = directory.appendingPathComponent("data", isDirectory: true)
        let logDir = directory.appendingPathComponent("logs", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        writeBuiltinStubScripts(in: directory)

        let skillDir = directory.appendingPathComponent("bad-skill", isDirectory: true)
        try? FileManager.default.createDirectory(at: skillDir, withIntermediateDirectories: true)
        let manifest = [
            "skill": "bad-skill",
            "fetch": ["command": ["node", "run.cjs"], "outputFile": "bad-skill.json", "wrapEnvelope": false, "actionText": "正在获取 bad-skill…"]
        ] as [String: Any]
        try? JSONSerialization.data(withJSONObject: manifest).write(to: skillDir.appendingPathComponent("workbench.json"))
        try? "console.log(JSON.stringify({ ok: false, skill: 'bad-skill', error: '收确认菜单未找到' }));".write(toFile: skillDir.appendingPathComponent("run.cjs").path, atomically: true, encoding: .utf8)

        let service = SkillFetchService(skillsDirectory: directory, dataDirectory: dataDir, logDirectory: logDir)
        let store = SkillDataStore(baseDirectory: dataDir)
        var briefingStore = BriefingStore()
        briefingStore.reportDirectory = dataDir
        let viewModel = DashboardViewModel(store: store, briefingStore: briefingStore, commandService: StubCommandService(), fetchService: service)
        for _ in 0..<600 where viewModel.isReloading {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }

        viewModel.refreshSkill("bad-skill")
        for _ in 0..<1000 where viewModel.isReloading {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        #expect(viewModel.isReloading == false)
        #expect(viewModel.fetchFailures.contains { $0.hasPrefix("bad-skill:") && $0.contains("收确认菜单未找到") })
    }

    @Test
    func systemConfigurationUsesDefaultFontSizes() {
        let suiteName = "boss-jarvis.tests.font-defaults"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)

        let configuration = SystemConfiguration(defaults: defaults)

        #expect(configuration.titleFontSize == 14)
        #expect(configuration.bodyFontSize == 12)
    }

    private func makeMailMessage(id: Int, needsReply: Bool = true) -> MailMessage {
        MailMessage(
            id: id,
            sender: "张三 <zhangsan@changhong.com>",
            subject: "测试邮件 \(id)",
            receivedAt: nil,
            receivedAtText: "",
            bodySummary: "",
            bodyHtml: "",
            urgency: needsReply ? .attention : .normal,
            needsReply: needsReply,
            replyBasis: needsReply ? "需要老板确认" : ""
        )
    }

    /// 确认执行已改为后台串行，测试轮询主线程直到批量状态结束。
    private func waitForBatchCompletion(_ viewModel: DashboardViewModel, timeout: TimeInterval = 15) async {
        let deadline = Date().addingTimeInterval(timeout)
        while viewModel.isExecutingBatch && Date() < deadline {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        #expect(!viewModel.isExecutingBatch)
    }

    @Test
    func enqueueMailReplyIsIdempotent() {
        let viewModel = DashboardViewModel()
        let message = makeMailMessage(id: 7)

        viewModel.enqueueMailReply(message)
        viewModel.enqueueMailReply(message)

        #expect(viewModel.pendingActions.count == 1)
        #expect(viewModel.pendingActions.first?.kind == .mailReply)
        #expect(viewModel.pendingActions.first?.payload["mailID"] == "7")
        #expect(viewModel.pendingActions.first?.payload["subject"]?.contains("测试邮件 7") == true)
        #expect(viewModel.pendingActions.first?.state == .pending)
        #expect(viewModel.queuedMailIDs == ["7"])
        #expect(viewModel.pendingConfirmationCount == 1)
    }

    private func makeManagedSkill(id: String, lifecycleStatus: String) -> ManagedSkill {
        ManagedSkill(
            id: id,
            name: id,
            descriptionText: "测试 Skill",
            lifecycleStatus: lifecycleStatus,
            runtimeStatus: "idle",
            enabledOnDisk: lifecycleStatus == "enabled"
        )
    }

    @Test
    func enqueueSkillInstallIsQueuedAndDeduplicated() {
        let viewModel = makeViewModel()

        viewModel.enqueueSkillInstall(source: "/tmp/demo-skill ")
        viewModel.enqueueSkillInstall(source: "/tmp/demo-skill")

        #expect(viewModel.pendingActions.count == 1)
        #expect(viewModel.pendingActions.first?.kind == .skillInstall)
        #expect(viewModel.pendingActions.first?.payload["source"] == "/tmp/demo-skill")
        #expect(viewModel.pendingActions.first?.payload["skillID"] == "demo-skill")
        #expect(viewModel.pendingActions.first?.state == .pending)
    }

    @Test
    func enqueueSkillUninstallIsQueuedAndDeduplicated() {
        let viewModel = makeViewModel()
        let skill = makeManagedSkill(id: "spm-todo", lifecycleStatus: "enabled")

        viewModel.enqueueSkillUninstall(skill)
        viewModel.enqueueSkillUninstall(skill)

        #expect(viewModel.pendingActions.count == 1)
        #expect(viewModel.pendingActions.first?.kind == .skillUninstall)
        #expect(viewModel.pendingActions.first?.payload["skillID"] == "spm-todo")
        #expect(viewModel.pendingActions.first?.actionTitle == "卸载：spm-todo")
        #expect(viewModel.queuedSkillIDs == ["spm-todo"])
    }

    @Test
    func openMailReplyOpensClientWithoutQueueing() async {
        let viewModel = makeViewModel()
        let message = makeMailMessage(id: 15)

        viewModel.openMailReply(message)

        #expect(viewModel.mailReplyStatus?.contains("生成回复草稿") == true)
        #expect(viewModel.replyingMailIDs.contains(message.id))
        #expect(viewModel.lastMailReplySucceeded == false)
        #expect(viewModel.pendingActions.isEmpty)
        #expect(viewModel.pendingConfirmationCount == 0)
    }

    @Test
    func markMailReadMarksImmediatelyWithoutQueueing() async {
        let viewModel = makeViewModel()
        let message = makeMailMessage(id: 16)

        viewModel.markMailRead(message)
        try? await Task.sleep(nanoseconds: 50_000_000)

        #expect(viewModel.mailReadStatus == "已同步为已读。")
        #expect(viewModel.pendingActions.isEmpty)
        #expect(viewModel.pendingConfirmationCount == 0)
    }

    @Test
    func markMailReadRemovesMessageFromListImmediately() async {
        let viewModel = makeViewModel()
        let message = makeMailMessage(id: 16)
        viewModel.injectCompanyMailForTesting(CompanyMailResult(count: 1, items: [message], fetchedAt: Date()))

        viewModel.markMailRead(message)
        await Task.yield()

        #expect(viewModel.companyMail?.items.isEmpty == true)
        #expect(viewModel.companyMail?.count == 0)
    }

    @Test
    func skipMarksActionCancelled() {
        let viewModel = DashboardViewModel()
        viewModel.enqueueMailReply(makeMailMessage(id: 8))
        let id = viewModel.pendingActions[0].id

        viewModel.skip(actionID: id)

        #expect(viewModel.pendingActions.first?.state == .cancelled)
        #expect(viewModel.pendingConfirmationCount == 0)
        #expect(viewModel.queuedMailIDs.isEmpty)
    }

    @Test
    func confirmMarksActionExecuted() async {
        let viewModel = makeViewModel()
        viewModel.enqueueMailReply(makeMailMessage(id: 9))
        let id = viewModel.pendingActions[0].id

        viewModel.confirm(actionID: id)

        await waitForBatchCompletion(viewModel)

        #expect(viewModel.pendingActions.first?.state == .executed)
        #expect(viewModel.pendingConfirmationCount == 0)
    }

    @Test
    func batchConfirmExecutesSelectedActions() async {
        let viewModel = makeViewModel()
        viewModel.enqueueMailReply(makeMailMessage(id: 10))
        viewModel.enqueueMailReply(makeMailMessage(id: 11))
        viewModel.enqueueMailReply(makeMailMessage(id: 12))
        let ids = Array(viewModel.pendingActions.prefix(2).map(\.id))

        viewModel.confirm(actionIDs: ids)

        await waitForBatchCompletion(viewModel)

        #expect(viewModel.pendingActions[0].state == .executed)
        #expect(viewModel.pendingActions[1].state == .executed)
        #expect(viewModel.pendingActions[2].state == .pending)
        #expect(viewModel.pendingConfirmationCount == 1)
    }

    @Test
    func batchSkipCancelsSelectedActions() {
        let viewModel = DashboardViewModel()
        viewModel.enqueueMailReply(makeMailMessage(id: 13))
        viewModel.enqueueMailReply(makeMailMessage(id: 14))
        let ids = Array(viewModel.pendingActions.prefix(1).map(\.id))

        viewModel.skip(actionIDs: ids)

        #expect(viewModel.pendingActions[0].state == .cancelled)
        #expect(viewModel.pendingActions[1].state == .pending)
        #expect(viewModel.pendingConfirmationCount == 1)
    }

    @Test
    func enqueueSkillToggleUsesDirection() {
        let viewModel = DashboardViewModel()
        let enabled = ManagedSkill(id: "oa-todo", name: "OA 待办", descriptionText: "", lifecycleStatus: "enabled", runtimeStatus: "idle", enabledOnDisk: true)
        let disabled = ManagedSkill(id: "daily-briefing", name: "自动晨报", descriptionText: "", lifecycleStatus: "disabled", runtimeStatus: "idle", enabledOnDisk: false)

        viewModel.enqueueSkillToggle(enabled)
        viewModel.enqueueSkillToggle(disabled)
        viewModel.enqueueSkillToggle(enabled)

        #expect(viewModel.pendingActions.count == 2)
        #expect(viewModel.pendingActions[0].kind == .skillDisable)
        #expect(viewModel.pendingActions[1].kind == .skillEnable)
        #expect(viewModel.pendingActions[0].actionTitle.contains("停用"))
        #expect(viewModel.pendingActions[1].actionTitle.contains("启用"))
        #expect(viewModel.queuedSkillIDs == ["oa-todo", "daily-briefing"])
    }

    @Test
    func toggleSkillExecutesImmediatelyWithoutPendingQueue() async {
        let viewModel = makeViewModel()
        let enabled = ManagedSkill(id: "oa-todo", name: "OA 待办", descriptionText: "", lifecycleStatus: "enabled", runtimeStatus: "idle", enabledOnDisk: true)

        viewModel.toggleSkill(enabled)

        #expect(viewModel.isExecutingBatch)
        await waitForBatchCompletion(viewModel)
        #expect(viewModel.pendingActions.count == 1)
        #expect(viewModel.pendingActions[0].state == .executed)
        #expect(viewModel.pendingActions[0].kind == .skillDisable)
        #expect(viewModel.pendingActions[0].executionSummary == "stub executed")
    }

    @Test
    func systemConfigurationCanResetFontSizes() {
        let suiteName = "boss-jarvis.tests.font-reset"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let configuration = SystemConfiguration(defaults: defaults)

        configuration.titleFontSize = 18
        configuration.bodyFontSize = 16
        configuration.resetFontSizes()

        #expect(configuration.titleFontSize == 14)
        #expect(configuration.bodyFontSize == 12)
    }
}



struct AuditLogParsingTests {
    @Test
    func parseAuditLineRejectsInvalidJson() {
        #expect(AuditLogStore.parseLine("not json") == nil)
    }

    @Test
    func loadReturnsEntriesNewestFirst() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("boss-jarvis-audit-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(
            at: directory.appendingPathComponent("2026-08-24", isDirectory: true),
            withIntermediateDirectories: true
        )
        func line(_ stamp: String) -> String {
            "{\"timestamp\":\"\(stamp)\",\"skill\":\"s\",\"actionType\":\"fetch_data\",\"status\":\"success\"}"
        }
        let contents = [
            line("2026-08-24T01:00:00.000Z"),
            line("2026-08-24T02:00:00.000Z"),
            line("2026-08-24T03:00:00.000Z")
        ].joined(separator: "\n")
        try contents.data(using: .utf8)!.write(
            to: directory.appendingPathComponent("2026-08-24/audit.jsonl")
        )
        var store = AuditLogStore()
        store.rootDirectory = directory
        let entries = store.load(date: "2026-08-24")
        #expect(entries.map(\.timestampText) == [
            "2026-08-24T03:00:00.000Z",
            "2026-08-24T02:00:00.000Z",
            "2026-08-24T01:00:00.000Z"
        ])
    }
}

struct BriefingStoreContractTests {
    private func makeStore(_ json: String) throws -> BriefingStore {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("boss-jarvis-briefing-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try json.data(using: .utf8)!.write(to: directory.appendingPathComponent("boss-cockpit.json"))
        var store = BriefingStore()
        store.reportDirectory = directory
        return store
    }

    @Test
    func prefersBriefingBossViewContract() throws {
        let json = """
        {
          "ok": true,
          "today": "2026-08-19",
          "generatedAt": "2026-08-19T00:30:00.000Z",
          "homepage": { "headline": "旧口径", "kpis": { "total": 1, "mustDoNow": 1, "focusToday": 0, "watchList": 0, "unavailableSources": 0 }, "hiddenLowPriorityCount": 0 },
          "ranked": { "summary": { "total": 1 }, "mustDoNow": [{ "title": "旧紧急" }], "focusToday": [], "watchList": [] },
          "sources": [{ "label": "旧来源" }],
          "bossView": {
            "summary": {
              "today": "2026-08-20",
              "headline": "今日有 2 项需优先处理",
              "generatedAt": "2026-08-20T01:00:00.000Z",
              "total": 8, "mustDoNow": 2, "focusToday": 3, "watchList": 1,
              "hiddenLowPriority": 4, "unavailableSources": 1
            },
            "sections": {
              "mustDoNow": ["紧急一", "紧急二"],
              "focusToday": ["关注一"],
              "watchList": ["观察一", "观察二"]
            },
            "sourceLabels": ["oa", "mail"],
            "schedule": { "configuredTime": "09:15", "installed": true, "loaded": true }
          }
        }
        """
        let briefing = try #require(makeStore(json).loadLatest())
        // bossView 优先于 homepage/ranked/sources 的旧口径。
        #expect(briefing.today == "2026-08-20")
        #expect(briefing.headline == "今日有 2 项需优先处理")
        #expect(briefing.total == 8)
        #expect(briefing.mustDoNow == 2)
        #expect(briefing.focusToday == 3)
        #expect(briefing.watchList == 1)
        #expect(briefing.hiddenLowPriority == 4)
        #expect(briefing.unavailableSources == 1)
        #expect(briefing.mustDoItems == ["紧急一", "紧急二"])
        #expect(briefing.focusItems == ["关注一"])
        #expect(briefing.watchItems == ["观察一", "观察二"])
        #expect(briefing.sourceLabels == ["oa", "mail"])
        #expect(briefing.scheduleTime == "09:15")
        #expect(briefing.scheduleInstalled)
        #expect(briefing.riskLevel == .urgent)
    }

    @Test
    func briefingWithoutBossViewReturnsNil() throws {
        let json = """
        {
          "ok": true,
          "today": "2026-08-19",
          "generatedAt": "2026-08-19T00:30:00Z",
          "homepage": { "headline": "今日暂无重点事项", "kpis": { "total": 3, "mustDoNow": 0, "focusToday": 2, "watchList": 1, "unavailableSources": 0 }, "hiddenLowPriorityCount": 5 },
          "ranked": { "summary": { "total": 3 }, "mustDoNow": [], "focusToday": [{ "title": "关注一" }], "watchList": [{ "title": "观察一" }] },
          "sources": [{ "label": "oa" }, { "label": "mail" }]
        }
        """
        // 契约：无 bossView 视为未获取，不回退解析旧格式。
        #expect(try makeStore(json).loadLatest() == nil)
    }
}
