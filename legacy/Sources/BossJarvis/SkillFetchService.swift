import Foundation

/// 按 Skill 输出契约执行取数脚本并落盘。所有刷新都必须走这里调用真实 Skill，
/// 不再只读旧 JSON。
struct SkillFetchService {
    var skillsDirectory: URL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".codex/skills", isDirectory: true)
    var dataDirectory: URL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".boss-jarvis/data", isDirectory: true)
    var logDirectory: URL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".boss-jarvis/logs", isDirectory: true)
    /// 单个 Skill 取数超时：脚本挂起（登录/SSO/网络异常）时终止进程并上报原因，避免界面永远转圈。
    var fetchTimeout: TimeInterval = 150

    struct FetchTask {
        let skill: String
        let command: String        // "node" 或 "swift"
        let script: String         // 相对 skills 目录
        let arguments: [String]
        let outputFile: String     // 数据目录下文件名
        let wrapEnvelope: Bool     // stdout 是否需要包一层契约包络
        let actionText: String     // 取数过程中的实时动作提示，由 Skill 侧声明
    }

    /// 内置任务：老技能未带 workbench.json 时的兜底，保证兼容。
    private static let builtinTasks: [FetchTask] = [
        FetchTask(skill: "company-mail", command: "node", script: "company-mail/fetch-unread-mail.cjs", arguments: [], outputFile: "company-mail.json", wrapEnvelope: false, actionText: "正在同步未读邮件…"),
        FetchTask(skill: "native-calendar", command: "swift", script: "native-calendar/fetch-today.swift", arguments: [], outputFile: "native-calendar.json", wrapEnvelope: false, actionText: "正在读取今日日历…"),
        FetchTask(skill: "hongyi-today-metrics", command: "node", script: "hongyi-today-metrics/fetch-today-metrics.cjs", arguments: [], outputFile: "hongyi-today-metrics.json", wrapEnvelope: false, actionText: "正在获取今日经营指标…"),
        FetchTask(skill: "hongyi-business-overview", command: "node", script: "hongyi-business-overview/fetch-business.cjs", arguments: [], outputFile: "hongyi-business-overview.json", wrapEnvelope: false, actionText: "正在汇总经营情况…"),
        FetchTask(skill: "skill-manager", command: "node", script: "skill-manager/manage-skills.cjs", arguments: ["list"], outputFile: "skill-manager.json", wrapEnvelope: false, actionText: "正在扫描 Skill 清单…"),
        FetchTask(skill: "reminder-center", command: "node", script: "reminder-center/aggregate-reminders.cjs", arguments: [], outputFile: "reminder-center.json", wrapEnvelope: false, actionText: "正在聚合提醒事项…"),
        FetchTask(skill: "daily-briefing", command: "node", script: "daily-briefing/run-briefing.cjs", arguments: [], outputFile: "daily-briefing.json", wrapEnvelope: false, actionText: "正在生成每日晨报…")
    ]

    /// 技能目录里的 workbench.json 取数声明；安装后立即参与取数，无需改 App。
    struct WorkbenchManifest: Codable {
        let skill: String
        let fetch: FetchDeclaration?
        struct FetchDeclaration: Codable {
            let command: [String]
            let outputFile: String
            let wrapEnvelope: Bool?
            let actionText: String?
        }
    }

    /// 合并内置任务与技能声明任务；同 skill 时技能侧声明优先，声明任务排前面。
    var tasks: [FetchTask] {
        var merged: [String: FetchTask] = [:]
        var order: [String] = []
        for task in discoveredTasks() + Self.builtinTasks where merged[task.skill] == nil {
            merged[task.skill] = task
            order.append(task.skill)
        }
        return order.compactMap { merged[$0] }
    }

    /// 扫描 ~/.codex/skills/*/workbench.json；解析失败时忽略该技能，不影响其他技能。
    private func discoveredTasks() -> [FetchTask] {
        let fileManager = FileManager.default
        guard let entries = try? fileManager.contentsOfDirectory(at: skillsDirectory, includingPropertiesForKeys: [.isDirectoryKey]) else {
            return []
        }
        var results: [FetchTask] = []
        for dir in entries.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
            let name = dir.lastPathComponent
            guard !name.hasSuffix(".disabled") else { continue }
            var isDir: ObjCBool = false
            let manifestURL = dir.appendingPathComponent("workbench.json")
            guard fileManager.fileExists(atPath: manifestURL.path, isDirectory: &isDir), !isDir.boolValue else { continue }
            guard let data = try? Data(contentsOf: manifestURL),
                  let manifest = try? JSONDecoder().decode(WorkbenchManifest.self, from: data),
                  manifest.skill == name,
                  let fetch = manifest.fetch,
                  fetch.command.count >= 2,
                  ["node", "swift", "python3"].contains(fetch.command[0]),
                  !fetch.command[1].hasPrefix("/"),
                  !fetch.command[1].components(separatedBy: "/").contains(".."),
                  !fetch.outputFile.contains("/") else { continue }
            let arguments = Array(fetch.command.dropFirst(2))
            // 命令格式：[执行器, 相对脚本路径, 参数...]，与路由层 workbench.json 约定一致。
            results.append(FetchTask(
                skill: manifest.skill,
                command: fetch.command[0],
                script: name + "/" + fetch.command[1],
                arguments: arguments,
                outputFile: fetch.outputFile,
                wrapEnvelope: fetch.wrapEnvelope ?? false,
                actionText: fetch.actionText ?? "正在获取 \(name)…"
            ))
        }
        return results
    }

    struct TaskResult {
        let skill: String
        let ok: Bool
        let error: String
    }

    /// 顺序执行取数任务（串行，避免同时拉起多个浏览器互相干扰）。
    /// 可排除由调用方需要直接消费实时结果的 Skill。
    /// onProgress 在任务开始前于主线程回调，携带 Skill 侧声明的实时动作文案。
    func fetchAll(excluding excludedSkills: Set<String> = [], onProgress: (@Sendable (String) -> Void)? = nil, completion: @escaping ([TaskResult]) -> Void) {
        var results: [TaskResult] = []
        let group = DispatchGroup()
        // 串行队列：Playwright 脚本同时起多个 Chromium 会互相抢登录会话
        let queue = DispatchQueue(label: "boss-jarvis.skill-fetch")
        let tasksToRun = tasks.filter { !excludedSkills.contains($0.skill) }
        for (index, task) in tasksToRun.enumerated() {
            group.enter()
            queue.async { [self] in
                DispatchQueue.main.async {
                    onProgress?("\(task.actionText)（第 \(index + 1)/\(tasksToRun.count) 项）")
                }
                let result = runTask(task)
                results.append(result)
                group.leave()
            }
        }
        group.notify(queue: .main) {
            completion(results)
        }
    }

    /// 只跑单个 Skill 的取数（给单页刷新用）。
    func fetch(skill name: String, onProgress: (@Sendable (String) -> Void)? = nil, completion: @escaping (Bool, String) -> Void) {
        guard let task = tasks.first(where: { $0.skill == name }) else {
            completion(false, "未找到该 Skill 的取数任务")
            return
        }
        DispatchQueue.global(qos: .utility).async { [self] in
            DispatchQueue.main.async {
                onProgress?(task.actionText)
            }
            let result = runTask(task)
            DispatchQueue.main.async {
                completion(result.ok, result.error)
            }
        }
    }

    private func runTask(_ task: FetchTask) -> TaskResult {
        let scriptURL = skillsDirectory.appendingPathComponent(task.script)
        let outputURL = dataDirectory.appendingPathComponent(task.outputFile)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = [task.command, scriptURL.path] + task.arguments
        let env = SkillProcessEnvironment.make(dataDirectory: dataDirectory)
        process.environment = env
        let out = Pipe()
        let err = Pipe()
        process.standardOutput = out
        process.standardError = err
        do {
            try process.run()
        } catch {
            let result = TaskResult(skill: task.skill, ok: false, error: error.localizedDescription)
            log(task: task, result: result, stdout: "", stderr: "")
            recordAuditFailure(task, error: result.error)
            return result
        }
        let (data, errorData, timedOut) = SkillProcessRunner.runAndWait(process, timeout: fetchTimeout)
        let text = String(data: data, encoding: .utf8) ?? ""
        let errorText = String(data: errorData, encoding: .utf8) ?? ""
        guard process.terminationStatus == 0 else {
            // 脚本以 JSON 输出业务错误（如权限拒绝）时优先使用该文案，而不是裸的退出码。
            let jsonError = Self.extractJSONError(from: text)
            let result = TaskResult(
                skill: task.skill,
                ok: false,
                error: timedOut
                    ? "取数超时（\(Int(fetchTimeout)) 秒），已终止"
                    : (jsonError ?? (errorText.isEmpty ? "exit \(process.terminationStatus)" : errorText))
            )
            log(task: task, result: result, stdout: text, stderr: errorText)
            recordAuditFailure(task, error: result.error)
            return result
        }
        guard let rawData = text.data(using: .utf8),
              let object = (try? JSONSerialization.jsonObject(with: rawData)) as? [String: Any] else {
            let result = TaskResult(skill: task.skill, ok: false, error: "输出不是 JSON")
            log(task: task, result: result, stdout: text, stderr: errorText)
            recordAuditFailure(task, error: result.error)
            return result
        }
        var payload = object
        if task.wrapEnvelope {
            payload["ok"] = true
            payload["skill"] = task.skill
            payload["mode"] = "read_only"
            payload["sourceSystem"] = "OA / 融合办公平台"
            payload["fetchedAt"] = ISO8601DateFormatter().string(from: Date())
        }
        // 契约包络声明 ok=false（全部或部分数据未获取）时按取数失败上报。
        // 文件仍落盘：各加载器依 ok=false 保持“未获取”语义，避免误读陈旧数据。
        if !task.wrapEnvelope, payload["ok"] as? Bool == false {
            let detail = payload["error"] as? String ?? Self.envelopeFailureSummary(payload) ?? "取数未完成"
            let result = TaskResult(skill: task.skill, ok: false, error: detail)
            log(task: task, result: result, stdout: text, stderr: errorText)
            recordAuditFailure(task, error: detail)
            if let outData = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys]) {
                try? outData.write(to: outputURL)
            }
            return result
        }
        do {
            let outData = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            try outData.write(to: outputURL)
            log(task: task, result: TaskResult(skill: task.skill, ok: true, error: ""), stdout: "", stderr: "")
            return TaskResult(skill: task.skill, ok: true, error: "")
        } catch {
            let result = TaskResult(skill: task.skill, ok: false, error: error.localizedDescription)
            log(task: task, result: result, stdout: "", stderr: error.localizedDescription)
            recordAuditFailure(task, error: result.error)
            return result
        }
    }

    /// 取数失败在界面上不可见，先落盘日志便于排查。
    private func log(task: FetchTask, result: TaskResult, stdout: String, stderr: String) {
        let formatter = ISO8601DateFormatter()
        let line = "\(formatter.string(from: Date())) skill=\(task.skill) ok=\(result.ok) error=\(result.error) stdout=\(stdout.prefix(400)) stderr=\(stderr.prefix(400))\n"
        try? FileManager.default.createDirectory(at: logDirectory, withIntermediateDirectories: true)
        let url = logDirectory.appendingPathComponent("fetch.log")
        if let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(line.data(using: .utf8) ?? Data())
        } else {
            try? line.data(using: .utf8)?.write(to: url)
        }
    }

    /// 取数失败同时写入审计中心（record-audit.cjs append）；审计写入失败不影响取数主流程。
    private func recordAuditFailure(_ task: FetchTask, error: String) {
        let auditScript = skillsDirectory.appendingPathComponent("audit-log/record-audit.cjs")
        guard FileManager.default.fileExists(atPath: auditScript.path) else { return }
        DispatchQueue.global(qos: .utility).async { [dataDirectory] in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = ["node", auditScript.path, "append"]
            process.environment = SkillProcessEnvironment.make(dataDirectory: dataDirectory)
            let input = Pipe()
            process.standardInput = input
            process.standardOutput = Pipe()
            process.standardError = Pipe()
            let payload: [String: Any] = [
                "skill": task.skill,
                "actionType": "fetch_data",
                "mode": "read_only",
                "status": "failed",
                "sourceSystem": "工作台取数",
                "resultSummary": "取数失败：" + String(error.prefix(400)),
                "error": String(error.prefix(400)),
                "target": ["title": task.skill]
            ]
            guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
            do {
                try process.run()
                input.fileHandleForWriting.write(data)
                try? input.fileHandleForWriting.close()
                process.waitUntilExit()
            } catch {
                // 忽略审计写入失败，不让它干扰取数主流程。
            }
        }
    }

    /// 非零退出但 stdout 是带 error 字段的 JSON 时，返回业务错误文案。
    private static func extractJSONError(from stdout: String) -> String? {
        guard let data = stdout.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let json = object as? [String: Any],
              let error = json["error"] as? String, !error.isEmpty else { return nil }
        return error
    }

    /// 包络没有 error 字段时，从未获取来源 / 缺失字段拼出可读摘要。
    private static func envelopeFailureSummary(_ payload: [String: Any]) -> String? {
        let unavailable = (payload["unavailableSources"] as? [String] ?? []).prefix(3)
        if !unavailable.isEmpty {
            return "部分数据源未获取：" + unavailable.joined(separator: "、")
        }
        let missing = (payload["missingFields"] as? [String] ?? []).prefix(3)
        if !missing.isEmpty {
            return "部分字段未获取：" + missing.joined(separator: "、")
        }
        return nil
    }
}
