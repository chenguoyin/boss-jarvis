import Foundation
import Testing
@testable import BossJarvis

@Suite(.serialized)
struct SkillFetchServiceTests {
    private func makeManifest(skill: String, command: [String] = ["node", "run.cjs"], outputFile: String = "out.json") -> String {
        let fetch = ["command": command, "outputFile": outputFile, "wrapEnvelope": false] as [String: Any]
        let object = ["skill": skill, "fetch": fetch] as [String: Any]
        let data = try! JSONSerialization.data(withJSONObject: object)
        return String(data: data, encoding: .utf8)!
    }

    private func withTempSkills(_ body: (URL) -> Void) {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("skill-fetch-tests-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        body(root)
        try? FileManager.default.removeItem(at: root)
    }

    @Test
    func workbenchManifestAddsFetchTaskImmediately() {
        withTempSkills { root in
            let skillDir = root.appendingPathComponent("demo-skill", isDirectory: true)
            try? FileManager.default.createDirectory(at: skillDir, withIntermediateDirectories: true)
            try? makeManifest(skill: "demo-skill").write(toFile: skillDir.appendingPathComponent("workbench.json").path, atomically: true, encoding: .utf8)
            let service = SkillFetchService(skillsDirectory: root)
            let names = service.tasks.map(\.skill)
            #expect(names.contains("demo-skill"))
        }
    }

    @Test
    func manifestOverridesBuiltinForSameSkill() {
        withTempSkills { root in
            // 没有声明目录时，内置 daily-briefing 兜底生效
            let empty = SkillFetchService(skillsDirectory: root)
            #expect(empty.tasks.contains { $0.skill == "daily-briefing" && $0.script == "daily-briefing/run-briefing.cjs" })

            // 带声明时技能侧优先
            let skillDir = root.appendingPathComponent("daily-briefing", isDirectory: true)
            try? FileManager.default.createDirectory(at: skillDir, withIntermediateDirectories: true)
            try? makeManifest(skill: "daily-briefing", command: ["node", "custom.cjs", "--flag"]).write(
                toFile: skillDir.appendingPathComponent("workbench.json").path, atomically: true, encoding: .utf8)
            let service = SkillFetchService(skillsDirectory: root)
            var task: SkillFetchService.FetchTask?
            for candidate in service.tasks where candidate.skill == "daily-briefing" {
                task = candidate
                break
            }
            #expect(task?.script == "daily-briefing/custom.cjs")
            #expect(task?.arguments == ["--flag"])
        }
    }

    @Test
    func unsafeManifestsAreIgnored() {
        withTempSkills { root in
            let cases: [(String, [String], String)] = [
                ("abs-path", ["/bin/sh", "-c", "echo hi"], "bad.json"),
                ("traversal", ["node", "../escape.cjs"], "bad.json"),
                ("bad-output", ["node", "run.cjs"], "../escape.json")
            ]
            for (name, command, output) in cases {
                let dir = root.appendingPathComponent(name, isDirectory: true)
                try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                try? makeManifest(skill: name, command: command, outputFile: output).write(
                    toFile: dir.appendingPathComponent("workbench.json").path, atomically: true, encoding: .utf8)
            }
            let disabled = root.appendingPathComponent("ghost.disabled/demo", isDirectory: true)
            try? FileManager.default.createDirectory(at: disabled, withIntermediateDirectories: true)
            let service = SkillFetchService(skillsDirectory: root)
            let names = Set(service.tasks.map(\.skill))
            #expect(!names.contains("abs-path"))
            #expect(!names.contains("traversal"))
            #expect(!names.contains("bad-output"))
        }
    }

    /// 取数脚本成功退出但包络声明 ok=false（全部或部分数据未获取）时，按取数失败上报。
    @Test
    func envelopeDeclaredFalseIsTreatedAsFetchFailure() async {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("skill-fetch-tests-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let skillDir = root.appendingPathComponent("flaky-skill", isDirectory: true)
        try? FileManager.default.createDirectory(at: skillDir, withIntermediateDirectories: true)
        try? makeManifest(skill: "flaky-skill", command: ["node", "run.cjs"], outputFile: "out.json").write(
            toFile: skillDir.appendingPathComponent("workbench.json").path, atomically: true, encoding: .utf8)
        let script = "console.log(JSON.stringify({ ok: false, skill: 'flaky-skill', error: 'DENIED: 数据源未授权' }));"
        try? script.write(toFile: skillDir.appendingPathComponent("run.cjs").path, atomically: true, encoding: .utf8)

        let dataDir = root.appendingPathComponent("data", isDirectory: true)
        let logDir = root.appendingPathComponent("logs", isDirectory: true)
        let service = SkillFetchService(skillsDirectory: root, dataDirectory: dataDir, logDirectory: logDir)
        let result = await awaitFetch(service, skill: "flaky-skill")

        #expect(result?.ok == false)
        #expect(result?.error == "DENIED: 数据源未授权")
    }

    /// 非零退出时，优先采用 stdout JSON 里的业务错误文案，而不是裸退出码。
    @Test
    func nonZeroExitPrefersJSONErrorText() async {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("skill-fetch-tests-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let skillDir = root.appendingPathComponent("crashy-skill", isDirectory: true)
        try? FileManager.default.createDirectory(at: skillDir, withIntermediateDirectories: true)
        try? makeManifest(skill: "crashy-skill", command: ["node", "run.cjs"], outputFile: "out.json").write(
            toFile: skillDir.appendingPathComponent("workbench.json").path, atomically: true, encoding: .utf8)
        let script = "console.error('crash'); console.log(JSON.stringify({ ok: false, error: 'BUSY: 服务繁忙' })); process.exit(2);"
        try? script.write(toFile: skillDir.appendingPathComponent("run.cjs").path, atomically: true, encoding: .utf8)

        let dataDir = root.appendingPathComponent("data", isDirectory: true)
        let logDir = root.appendingPathComponent("logs", isDirectory: true)
        let service = SkillFetchService(skillsDirectory: root, dataDirectory: dataDir, logDirectory: logDir)
        let result = await awaitFetch(service, skill: "crashy-skill")

        #expect(result?.ok == false)
        #expect(result?.error == "BUSY: 服务繁忙")
    }

    private func awaitFetch(_ service: SkillFetchService, skill: String) async -> SkillFetchService.TaskResult? {
        await withCheckedContinuation { continuation in
            service.fetchAll(excluding: []) { results in
                continuation.resume(returning: results.first { $0.skill == skill })
            }
        }
    }

    /// workbench.json 声明的 actionText 驱动取数进度回调；序号按串行执行顺序递增；
    /// 未声明 actionText 时用技能名兜底。
    @Test
    func actionTextAndOrderDriveProgressCallbacks() async {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("skill-fetch-tests-" + UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        // a-skill 声明 actionText；b-skill 不声明，验证兜底文案。
        let aDir = root.appendingPathComponent("a-skill", isDirectory: true)
        try? FileManager.default.createDirectory(at: aDir, withIntermediateDirectories: true)
        let labeled = [
            "skill": "a-skill",
            "fetch": ["command": ["node", "run.cjs"], "outputFile": "out.json", "wrapEnvelope": false, "actionText": "正在同步测试数据…"]
        ] as [String: Any]
        try? JSONSerialization.data(withJSONObject: labeled)
            .write(to: aDir.appendingPathComponent("workbench.json"))
        try? "console.log(JSON.stringify({ ok: true }));".write(toFile: aDir.appendingPathComponent("run.cjs").path, atomically: true, encoding: .utf8)

        let bDir = root.appendingPathComponent("b-skill", isDirectory: true)
        try? FileManager.default.createDirectory(at: bDir, withIntermediateDirectories: true)
        try? makeManifest(skill: "b-skill").write(toFile: bDir.appendingPathComponent("workbench.json").path, atomically: true, encoding: .utf8)
        try? "console.log(JSON.stringify({ ok: true }));".write(toFile: bDir.appendingPathComponent("run.cjs").path, atomically: true, encoding: .utf8)

        let dataDir = root.appendingPathComponent("data", isDirectory: true)
        let logDir = root.appendingPathComponent("logs", isDirectory: true)
        let service = SkillFetchService(skillsDirectory: root, dataDirectory: dataDir, logDirectory: logDir)
        let progress = await awaitAllProgress(service)

        // 2 个技能声明 + 7 个内置兜底任务，串行执行共 9 项。
        #expect(progress == [
            "正在同步测试数据…（第 1/9 项）",
            "正在获取 b-skill…（第 2/9 项）",
            "正在同步未读邮件…（第 3/9 项）",
            "正在读取今日日历…（第 4/9 项）",
            "正在获取今日经营指标…（第 5/9 项）",
            "正在汇总经营情况…（第 6/9 项）",
            "正在扫描 Skill 清单…（第 7/9 项）",
            "正在聚合提醒事项…（第 8/9 项）",
            "正在生成每日晨报…（第 9/9 项）"
        ])
    }

    private func awaitAllProgress(_ service: SkillFetchService) async -> [String] {
        await withCheckedContinuation { continuation in
            let box = ProgressBox()
            service.fetchAll(excluding: [], onProgress: { text in
                box.add(text)
            }) { _ in
                continuation.resume(returning: box.items)
            }
        }
    }

    /// 进度回调可能跨线程，简单加锁收集。
    private final class ProgressBox: @unchecked Sendable {
        private let lock = NSLock()
        private var storage: [String] = []
        var items: [String] {
            lock.lock()
            defer { lock.unlock() }
            return storage
        }
        func add(_ text: String) {
            lock.lock()
            defer { lock.unlock() }
            storage.append(text)
        }
    }
}
