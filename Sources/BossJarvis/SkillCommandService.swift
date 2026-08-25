import Foundation

/// 确认中心执行结果。
struct SkillCommandOutcome {
    let ok: Bool
    let summary: String
    let draftPath: String?
}

/// 确认中心确认后的真实执行层。调用各 Skill 的 CLI 脚本完成写操作；不在源码保存任何凭证。
protocol WritesConfirmedActions: AnyObject, Sendable {
    func execute(_ action: PendingWriteAction) -> SkillCommandOutcome
    /// 邮件回复直达路径：由 company-mail 生成草稿、追加签名并打开回复窗口，不代点发送。
    func openMailReply(_ message: MailMessage, completion: @escaping (Bool, String) -> Void)
    /// 邮件详情直达路径：点击主题后把该邮件在 Mail 客户端标记为已读。
    func markMailRead(_ message: MailMessage, completion: @escaping (Bool, String) -> Void)
    /// 从 OA 实时取数并直接返回解析结果，不通过本地数据文件中转。
    func refetchOATodos(completion: @escaping (OATodoResult?) -> Void)
    func refetchSkillManager(completion: @escaping (Bool) -> Void)
}

final class SkillCommandService: WritesConfirmedActions, @unchecked Sendable {
    var skillsDirectory: URL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".codex/skills", isDirectory: true)
    var dataDirectory: URL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".boss-jarvis/data", isDirectory: true)
    /// 写操作脚本超时：执行脚本挂起（登录/网络异常）时终止并上报，避免确认中心一直无结果。
    var processTimeout: TimeInterval = 150

    /// 执行一个已确认的写操作。返回执行结果与摘要。
    func execute(_ action: PendingWriteAction) -> SkillCommandOutcome {
        switch action.kind {
        case .mailReply:
            return executeMailReply(action)
        case .skillEnable, .skillDisable:
            return executeSkillToggle(action)
        case .skillInstall:
            return executeSkillInstall(action)
        case .skillUninstall:
            return executeSkillUninstall(action)
        case .approval:
            return executeApproval(action)
        }
    }

    /// OA / SPM 审批：按来源 Skill 调用对应执行器。脚本自带 --confirmed 双确认与页内二次确认。
    private func executeApproval(_ action: PendingWriteAction) -> SkillCommandOutcome {
        let isSPM = action.payload["skill"] == "spm-todo"
        let title = action.payload["todoTitle"] ?? action.payload["itemTitle"] ?? ""
        guard !title.isEmpty else {
            return SkillCommandOutcome(ok: false, summary: "待办标题未获取，无法执行审批。", draftPath: nil)
        }
        let comment = action.payload["comment"] ?? "同意"
        let verb = action.payload["verb"] ?? "同意"
        let actionArg = verb == "同意" ? "approve" : "reject"
        // 关键词用完整标题：脚本端按“最长唯一前缀”匹配，多命中直接中止，截断反而会导致审到别的单据。
        let keyword = title
        let script = skillsDirectory.appendingPathComponent(isSPM ? "spm-todo/approve-todo.cjs" : "oa-todo/approve-todo.cjs")
        let result = runNode(script.path, [keyword, comment, actionArg, "--confirmed"])
        guard result.ok, let json = result.json else {
            return SkillCommandOutcome(ok: false, summary: "审批执行失败：" + result.error, draftPath: nil)
        }
        let approved = (json["approved"] as? Bool) ?? false
        let verified = (json["verified"] as? Bool) ?? false
        let pageType = (json["pageType"] as? String) ?? "未获取"
        if approved && verified {
            return SkillCommandOutcome(ok: true, summary: "审批已提交并验证：\(verb) · \(pageType)", draftPath: nil)
        }
        if approved {
            return SkillCommandOutcome(ok: true, summary: "审批已提交，验证未完成：\(pageType)", draftPath: nil)
        }
        return SkillCommandOutcome(ok: false, summary: "审批未成功：\(result.error.isEmpty ? pageType : result.error)", draftPath: nil)
    }

    /// 邮件回复：由 company-mail 生成草稿后直接打开邮件客户端回复窗口，由用户在客户端点击发送。
    private func executeMailReply(_ action: PendingWriteAction) -> SkillCommandOutcome {
        let to = action.payload["to"] ?? ""
        let subject = action.payload["subject"] ?? ""
        guard !to.isEmpty, !subject.isEmpty else {
            return SkillCommandOutcome(ok: false, summary: "收件人或主题未获取，无法生成回复草稿。", draftPath: nil)
        }
        let message = MailMessage(
            id: Int(action.payload["mailID"] ?? "") ?? 0,
            sender: to,
            subject: subject,
            receivedAt: nil,
            receivedAtText: "",
            bodySummary: "",
            bodyHtml: "",
            urgency: nil,
            needsReply: true,
            replyBasis: action.basis
        )
        let semaphore = DispatchSemaphore(value: 0)
        var opened = false
        var openingSummary = ""
        openMailReply(message) { ok, summary in
            opened = ok
            openingSummary = summary
            semaphore.signal()
        }
        semaphore.wait()
        return SkillCommandOutcome(ok: opened, summary: openingSummary, draftPath: nil)
    }

    /// 直达邮件回复：先由 generate-reply-draft 生成拟回复正文，prepare-reply 追加签名，再打开 Mail 回复窗口。
    /// 只打开窗口不发送；发送按钮始终由用户在邮件客户端里点击。
    func openMailReply(_ message: MailMessage, completion: @escaping (Bool, String) -> Void) {
        logReply("start id=\(message.id) to=\(message.sender) subject=\(message.subject)")
        guard !message.sender.isEmpty, !message.subject.isEmpty else {
            logReply("fail: 收件人或主题缺失")
            completion(false, "收件人或主题未获取，无法打开回复窗口。")
            return
        }
        generateReplyDraft(for: message) { [weak self] draftResult in
            guard let self else { return }
            guard let body = draftResult else {
                self.logReply("draft FAIL")
                completion(false, "回复草稿生成失败：company-mail 输出无法解析")
                return
            }
            self.logReply("draft ok len=\(body.count)")
            self.runNodeAsync(
                self.skillsDirectory.appendingPathComponent("company-mail/prepare-reply.cjs").path,
                ["--to=" + message.sender, "--subject=" + message.subject, "--body=" + body]
            ) { prepared in
                guard prepared.ok, let json = prepared.json else {
                    self.logReply("prepare FAIL ok=\(prepared.ok) err=\(prepared.error)")
                    completion(false, "回复草稿加工失败：" + (prepared.error.isEmpty ? "company-mail 输出无法解析" : prepared.error))
                    return
                }
                let to = (json["to"] as? String) ?? message.sender
                let subject = (json["subject"] as? String) ?? message.subject
                let fullBody = (json["body"] as? String) ?? body
                self.logReply("prepare ok to=\(to)")
                self.runNodeAsync(
                    self.skillsDirectory.appendingPathComponent("company-mail/open-confirmed-reply.cjs").path,
                    ["--to=" + to, "--subject=" + subject, "--body=" + fullBody, "--confirmed"]
                ) { opened in
                    guard opened.ok, let payload = opened.json, payload["opened"] as? Bool == true else {
                        self.logReply("open FAIL ok=\(opened.ok) err=\(opened.error)")
                        completion(false, "打开回复窗口失败：" + (opened.error.isEmpty ? "邮件客户端未响应" : opened.error))
                        return
                    }
                    self.logReply("open ok")
                    completion(true, "回复窗口已在邮件客户端打开，请核对后点击发送。")
                }
            }
        }
    }

    /// 调用 company-mail 生成拟回复正文。返回 nil 表示生成失败。
    private func generateReplyDraft(for message: MailMessage, completion: @escaping (String?) -> Void) {
        let script = skillsDirectory.appendingPathComponent("company-mail/generate-reply-draft.cjs")
        runNodeAsync(
            script.path,
            [
                "--subject=" + message.subject,
                "--body-summary=" + message.bodySummary,
                "--reply-basis=" + message.replyBasis,
                "--sender=" + message.sender
            ]
        ) { [weak self] result in
            if !result.ok {
                self?.logReply("draft script FAIL err=\(result.error)")
            }
            guard result.ok, let json = result.json, let draft = json["draftBody"] as? String, !draft.isEmpty else {
                self?.logReply("draft parse FAIL jsonMissing=\(result.json == nil)")
                completion(nil)
                return
            }
            completion(draft)
        }
    }

    /// 点击邮件主题后立即在 Mail 中标记已读，由 Mail 自己同步未读状态到服务端。
    func markMailRead(_ message: MailMessage, completion: @escaping (Bool, String) -> Void) {
        guard message.id > 0 else {
            completion(false, "邮件标识未获取，无法标记已读。")
            return
        }
        runNodeAsync(
            skillsDirectory.appendingPathComponent("company-mail/mark-mail-read.cjs").path,
            ["--message-id=\(message.id)", "--confirmed"]
        ) { result in
            guard result.ok, let json = result.json, json["markedRead"] as? Bool == true else {
                completion(false, "标记已读失败：" + (result.error.isEmpty ? "邮件客户端未响应" : result.error))
                return
            }
            completion(true, "已同步为已读。")
        }
    }

    /// Skill 启停：manage-skills enable/disable。
    private func executeSkillToggle(_ action: PendingWriteAction) -> SkillCommandOutcome {
        guard let skillID = action.payload["skillID"], !skillID.isEmpty else {
            return SkillCommandOutcome(ok: false, summary: "Skill 标识未获取，无法执行启停。", draftPath: nil)
        }
        let verb = action.kind == .skillEnable ? "enable" : "disable"
        let script = skillsDirectory.appendingPathComponent("skill-manager/manage-skills.cjs")
        let result = runNode(script.path, [verb, skillID])
        guard result.ok else {
            return SkillCommandOutcome(ok: false, summary: "Skill " + verb + " 失败：" + result.error, draftPath: nil)
        }
        return SkillCommandOutcome(ok: true, summary: "Skill 已" + (action.payload["verb"] ?? verb) + "。", draftPath: nil)
    }

    /// Skill 安装：install <源目录>，默认安装后停用，需再显式启用。
    private func executeSkillInstall(_ action: PendingWriteAction) -> SkillCommandOutcome {
        guard let source = action.payload["source"], !source.isEmpty else {
            return SkillCommandOutcome(ok: false, summary: "安装源目录未获取，无法安装。", draftPath: nil)
        }
        let script = skillsDirectory.appendingPathComponent("skill-manager/manage-skills.cjs")
        let result = runNode(script.path, ["install", source, "--enable"])
        guard result.ok else {
            return SkillCommandOutcome(ok: false, summary: "Skill 安装失败：" + result.error, draftPath: nil)
        }
        let name = (result.json?["skill"] as? [String: Any])?["name"] as? String ?? (action.payload["skillID"] ?? source)
        return SkillCommandOutcome(ok: true, summary: "Skill 已安装并启用：\(name)", draftPath: nil)
    }

    /// Skill 卸载：uninstall <id> --confirm，代码移入归档目录，不删历史日志。
    private func executeSkillUninstall(_ action: PendingWriteAction) -> SkillCommandOutcome {
        guard let skillID = action.payload["skillID"], !skillID.isEmpty else {
            return SkillCommandOutcome(ok: false, summary: "Skill 标识未获取，无法卸载。", draftPath: nil)
        }
        let script = skillsDirectory.appendingPathComponent("skill-manager/manage-skills.cjs")
        let result = runNode(script.path, ["uninstall", skillID, "--confirm"])
        guard result.ok else {
            return SkillCommandOutcome(ok: false, summary: "Skill 卸载失败：" + result.error, draftPath: nil)
        }
        let archive = (result.json?["archiveDir"] as? String) ?? "归档目录"
        return SkillCommandOutcome(ok: true, summary: "Skill 已卸载，代码归档至 \(archive)", draftPath: nil)
    }

    /// 确认执行后的同步刷新：重跑 OA 聚合取数（列表+详情分析由 oa-todo 一次输出）。
    /// 结果直接返回给调用方，不落盘本地数据目录。
    func refetchOATodos(completion: @escaping (OATodoResult?) -> Void) {
        let script = skillsDirectory.appendingPathComponent("oa-todo/fetch-todo-with-analysis.cjs")
        runNodeAsync(script.path, []) { result in
            guard result.ok, let text = result.text, !text.isEmpty,
                  let data = text.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data),
                  let raw = object as? [String: Any] else {
                completion(nil)
                return
            }
            let parsed = SkillDataStore.parse(raw)
            completion(SkillDataStore.parseOATodo(parsed))
        }
    }

    /// Skill 启停后刷新管理清单状态并写入数据目录。
    func refetchSkillManager(completion: @escaping (Bool) -> Void) {
        let script = skillsDirectory.appendingPathComponent("skill-manager/manage-skills.cjs")
        runNodeAsync(script.path, ["list"]) { result in
            guard result.ok, let text = result.text,
                  let data = text.data(using: .utf8),
                  let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
                completion(false)
                return
            }
            let url = self.dataDirectory.appendingPathComponent("skill-manager.json")
            if let out = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]) {
                try? out.write(to: url)
            }
            completion(true)
        }
    }

    private struct NodeResult {
        let ok: Bool
        let json: [String: Any]?
        let error: String
        let text: String?
    }

    private func runNode(_ script: String, _ arguments: [String]) -> NodeResult {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["node", script] + arguments
        let env = SkillProcessEnvironment.make()
        process.environment = env
        let out = Pipe()
        let err = Pipe()
        process.standardOutput = out
        process.standardError = err
        do {
            try process.run()
        } catch {
            return NodeResult(ok: false, json: nil, error: error.localizedDescription, text: nil)
        }
        let (data, errorData, timedOut) = SkillProcessRunner.runAndWait(process, timeout: processTimeout)
        let text = String(data: data, encoding: .utf8) ?? ""
        let errorText = String(data: errorData, encoding: .utf8) ?? ""
        guard process.terminationStatus == 0 else {
            let reason = timedOut
                ? "脚本执行超时（\(Int(processTimeout)) 秒），已终止"
                : (errorText.isEmpty ? "exit " + String(process.terminationStatus) : errorText)
            return NodeResult(ok: false, json: nil, error: reason, text: nil)
        }
        if let object = try? JSONSerialization.jsonObject(with: Data(text.utf8)),
           let json = object as? [String: Any] {
            return NodeResult(ok: true, json: json, error: "", text: text)
        }
        return NodeResult(ok: true, json: nil, error: "", text: text)
    }

    /// 异步跑 Skill 脚本；fetch 类脚本输出量大，避免卡住主线程。
    private func runNodeAsync(_ script: String, _ arguments: [String], completion: @escaping (NodeResult) -> Void) {
        DispatchQueue.global(qos: .utility).async { [self] in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = ["node", script] + arguments
            let env = SkillProcessEnvironment.make()
            process.environment = env
            let out = Pipe()
            let err = Pipe()
            process.standardOutput = out
            process.standardError = err
            do {
                try process.run()
            } catch {
                let result = NodeResult(ok: false, json: nil, error: error.localizedDescription, text: nil)
                DispatchQueue.main.async { completion(result) }
                return
            }
            let (data, errorData, timedOut) = SkillProcessRunner.runAndWait(process, timeout: self.processTimeout)
            let text = String(data: data, encoding: .utf8) ?? ""
            let errorText = String(data: errorData, encoding: .utf8) ?? ""
            let json = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any]
            let result = NodeResult(
                ok: process.terminationStatus == 0 && !timedOut,
                json: json,
                error: timedOut ? "脚本执行超时（\(Int(self.processTimeout)) 秒），已终止" : errorText,
                text: text
            )
            DispatchQueue.main.async { completion(result) }
        }
    }

    /// 回复链路诊断日志：定位回复失败必须看到每一步的真实结果。
    private func logReply(_ line: String) {
        let url = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".boss-jarvis/logs/reply.log")
        let stamp = ISO8601DateFormatter().string(from: Date())
        guard let data = (stamp + " " + line + "\n").data(using: .utf8) else { return }
        if let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile()
            handle.write(data)
            try? handle.close()
        } else {
            try? data.write(to: url)
        }
    }
}
