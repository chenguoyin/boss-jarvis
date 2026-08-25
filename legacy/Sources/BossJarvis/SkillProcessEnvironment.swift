import Foundation

/// GUI App 不继承登录 shell 的 PATH；统一在这里补齐 node / npx 常见安装位置，
/// 并加载 skill-env.conf 里的 Skill 运行依赖（凭证、NODE_PATH、公司模型等）。
enum SkillProcessEnvironment {
    private static let commonNodePaths = [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ]

    static func make(dataDirectory: URL? = nil) -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        let confURL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".boss-jarvis/skill-env.conf")
        if let text = try? String(contentsOf: confURL, encoding: .utf8) {
            for line in text.split(separator: "\n") {
                let parts = line.split(separator: "=", maxSplits: 1)
                guard parts.count == 2 else { continue }
                let key = parts[0].trimmingCharacters(in: .whitespaces)
                let value = parts[1].trimmingCharacters(in: .whitespaces)
                guard !key.isEmpty, !value.isEmpty else { continue }
                env[key] = value
            }
        }
        if env["NODE_PATH"]?.isEmpty != false {
            env["NODE_PATH"] = "/Users/chenguoyin/.npm/_npx/e41f203b7505f1fb/node_modules"
        }
        let existingPath = env["PATH"] ?? ""
        let knownPaths = Set(existingPath.split(separator: ":").map(String.init))
        let missingPaths = commonNodePaths.filter { !knownPaths.contains($0) }
        if !missingPaths.isEmpty {
            env["PATH"] = (missingPaths.joined(separator: ":") + ":" + existingPath)
        }
        if let dataDirectory {
            env["BOSS_JARVIS_DATA_DIR"] = dataDirectory.path
        }
        return env
    }
}

/// 带超时的进程等待与输出收集。超时后先 SIGTERM，宽限期未退出再 SIGKILL；
/// 返回 stdout/stderr 与是否超时，避免 Skill 脚本挂起时界面永远转圈、无任何提示。
enum SkillProcessRunner {
    static func runAndWait(_ process: Process, timeout: TimeInterval) -> (stdout: Data, stderr: Data, timedOut: Bool) {
        let out = process.standardOutput as! Pipe
        let err = process.standardError as! Pipe
        var stdoutData = Data()
        var stderrData = Data()
        let group = DispatchGroup()
        group.enter()
        DispatchQueue.global(qos: .utility).async {
            stdoutData = out.fileHandleForReading.readDataToEndOfFile()
            group.leave()
        }
        group.enter()
        DispatchQueue.global(qos: .utility).async {
            stderrData = err.fileHandleForReading.readDataToEndOfFile()
            group.leave()
        }
        let deadline = Date().addingTimeInterval(timeout)
        while process.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.1)
        }
        let timedOut = process.isRunning
        if timedOut {
            process.terminate()
            let graceDeadline = Date().addingTimeInterval(3)
            while process.isRunning && Date() < graceDeadline {
                Thread.sleep(forTimeInterval: 0.05)
            }
            if process.isRunning {
                kill(process.processIdentifier, SIGKILL)
            }
        }
        group.wait()
        process.waitUntilExit()
        return (stdoutData, stderrData, timedOut)
    }
}
