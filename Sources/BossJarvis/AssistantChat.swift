import Foundation
import SwiftUI

// MARK: - 数据模型

/// 助手对话消息。role=tool 用于展示工具执行的过程行。
struct AssistantMessage: Identifiable {
    enum Role { case user, assistant, tool }
    let id = UUID()
    let role: Role
    let text: String
}

enum AssistantError: LocalizedError {
    case config(String)
    case network(String)

    var errorDescription: String? {
        switch self {
        case .config(let message): message
        case .network(let message): message
        }
    }
}

// MARK: - 模型客户端

/// 助手与模型之间传递的载荷。字典含 Any 但构造后只读、单侧创建，跨线程安全。
struct LLMPayload: @unchecked Sendable {
    let dictionary: [String: Any]
}

struct LLMMessages: @unchecked Sendable {
    let items: [[String: Any]]
}

/// 公司大模型 OpenAI 兼容客户端。Base URL / Key / 模型名在发送时从
/// SystemConfiguration 读取，源码不落任何凭证。
struct CompanyLLMClient {
    var baseURL: String
    var apiKey: String
    var model: String

    func chat(history: LLMMessages, tools: LLMMessages) async throws -> LLMPayload {
        let base = baseURL.trimmingCharacters(in: .whitespaces)
        let endpoint = base.hasSuffix("/") ? base + "chat/completions" : base + "/chat/completions"
        guard let url = URL(string: endpoint) else {
            throw AssistantError.config("模型 Base URL 无效，请在设置中检查。")
        }
        var request = URLRequest(url: url, timeoutInterval: 90)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer " + apiKey, forHTTPHeaderField: "Authorization")
        var body: [String: Any] = [
            "model": model,
            "messages": history.items,
            "max_tokens": 2048
        ]
        if !tools.items.isEmpty { body["tools"] = tools.items }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AssistantError.network("模型服务无响应")
        }
        guard http.statusCode == 200 else {
            let text = String(data: data, encoding: .utf8) ?? ""
            throw AssistantError.network("模型服务返回 \(http.statusCode)：\(String(text.prefix(160)))")
        }
        guard let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let message = choices.first?["message"] as? [String: Any] else {
            throw AssistantError.network("模型响应格式无法解析")
        }
        return LLMPayload(dictionary: message)
    }
}

// MARK: - 对话状态

/// Jarvis 助手对话模型：多轮历史 + function calling 工具循环。
/// 工具三个：跳转页面（只读导航）、重跑 Skill 取数、邮件回复（生成草稿并
/// 打开邮件客户端回复窗口，不代发送）；其余写操作引导到对应页面确认。
@MainActor
final class AssistantChatModel: ObservableObject {
    @Published private(set) var messages: [AssistantMessage] = []
    @Published private(set) var isBusy = false
    @Published var draft = ""

    private var history: [[String: Any]] = []
    private let configuration: SystemConfiguration
    private let sections: [String]
    private let skillsProvider: () -> [String]
    private let contextProvider: () -> String
    private let currentSectionProvider: () -> String
    private let onOpenSection: (String) -> Void
    private let onRunSkill: (String, @escaping (Bool) -> Void) -> Void
    private let mailItemsProvider: () -> [MailMessage]
    private let onOpenMailReply: (MailMessage, @escaping (Bool, String) -> Void) -> Void
    /// 工具循环上限，防止模型无限调用。
    private let maxToolRounds = 4

    init(configuration: SystemConfiguration,
         sections: [String],
         skillsProvider: @escaping () -> [String],
         contextProvider: @escaping () -> String,
         currentSectionProvider: @escaping () -> String,
         onOpenSection: @escaping (String) -> Void,
         onRunSkill: @escaping (String, @escaping (Bool) -> Void) -> Void,
         mailItemsProvider: @escaping () -> [MailMessage],
         onOpenMailReply: @escaping (MailMessage, @escaping (Bool, String) -> Void) -> Void) {
        self.configuration = configuration
        self.sections = sections
        self.skillsProvider = skillsProvider
        self.contextProvider = contextProvider
        self.currentSectionProvider = currentSectionProvider
        self.onOpenSection = onOpenSection
        self.onRunSkill = onRunSkill
        self.mailItemsProvider = mailItemsProvider
        self.onOpenMailReply = onOpenMailReply
    }

    func clear() {
        messages = []
        history = []
    }

    func send(_ rawText: String) {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isBusy else { return }
        guard !configuration.llmAPIKey.isEmpty else {
            messages.append(.init(role: .user, text: text))
            messages.append(.init(role: .assistant, text: "还没有配置模型 API Key。请先在「系统配置 → 模型调用」里填写公司模型设置。"))
            return
        }
        // 每轮重建 system 提示，保证数据快照与当前页面始终最新；对话历史保持不变。
        history.removeAll { ($0["role"] as? String) == "system" }
        history.insert(["role": "system", "content": systemPrompt()], at: 0)
        messages.append(.init(role: .user, text: text))
        history.append(["role": "user", "content": text])
        isBusy = true
        Task { await runToolLoop() }
    }

    private func systemPrompt() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let now = formatter.string(from: Date())
        return """
        你是「Boss Jarvis」工作台里的 Jarvis 助手，服务老板。当前时间：\(now)，老板正在「\(currentSectionProvider())」页面。
        下面是工作台已加载的最新数据快照，回答问题时以它为准：

        \(contextProvider())

        你可以调用的工具：
        - open_section：把工作台跳转到指定页面。
        - run_skill：重新执行指定 Skill 的取数，刷新对应页面数据。
        - reply_mail：为指定邮件生成回复草稿并在邮件客户端打开回复窗口（不代发送）。
        规则：
        - 审批、启停或装卸 Skill 等写操作你不能直接执行；告诉老板到对应页面确认，需要时用 open_section 跳转。
        - 老板要回复某封邮件时，用 reply_mail，邮件 ID 取数据快照里「#」后的数字；回复窗口打开后提醒老板在邮件客户端核对并点击发送。
        - 数据缺失或老板明确要最新数据时，先调用 run_skill 刷新，再回答。
        - 回答要简洁，用中文，先给结论和关键数字。
        """
    }

    private var toolDefinitions: [[String: Any]] {
        [
            [
                "type": "function",
                "function": [
                    "name": "open_section",
                    "description": "把工作台跳转到指定页面。",
                    "parameters": [
                        "type": "object",
                        "properties": ["section": ["type": "string", "enum": sections]],
                        "required": ["section"]
                    ]
                ]
            ],
            [
                "type": "function",
                "function": [
                    "name": "run_skill",
                    "description": "重新执行指定 Skill 的取数（可能耗时数十秒），刷新对应页面数据。",
                    "parameters": [
                        "type": "object",
                        "properties": ["skill": ["type": "string", "enum": skillsProvider()]],
                        "required": ["skill"]
                    ]
                ]
            ],
            [
                "type": "function",
                "function": [
                    "name": "reply_mail",
                    "description": "为指定邮件生成回复草稿，并在邮件客户端打开回复窗口；只开窗不代发送，由老板在客户端点击发送。",
                    "parameters": [
                        "type": "object",
                        "properties": ["mail_id": ["type": "string", "description": "数据快照邮件条目里 # 后的数字 ID"]],
                        "required": ["mail_id"]
                    ]
                ]
            ]
        ]
    }

    private func runToolLoop() async {
        let client = CompanyLLMClient(
            baseURL: configuration.llmBaseURL,
            apiKey: configuration.llmAPIKey,
            model: configuration.llmModel.isEmpty ? SystemConfiguration.defaultLLMModel : configuration.llmModel
        )
        let tools = LLMMessages(items: toolDefinitions)
        var rounds = 0
        while rounds < maxToolRounds {
            rounds += 1
            let message: [String: Any]
            do {
                message = try await client.chat(history: LLMMessages(items: history), tools: tools).dictionary
            } catch {
                finish(with: "抱歉，这次没能完成：" + error.localizedDescription)
                return
            }
            let toolCalls = message["tool_calls"] as? [[String: Any]] ?? []
            let content = (message["content"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if toolCalls.isEmpty {
                let finalText = content.isEmpty ? "已完成，可以继续问我。" : content
                history.append(["role": "assistant", "content": finalText])
                messages.append(.init(role: .assistant, text: finalText))
                isBusy = false
                return
            }
            var assistantEntry: [String: Any] = ["role": "assistant", "tool_calls": toolCalls]
            if !content.isEmpty { assistantEntry["content"] = content }
            history.append(assistantEntry)
            for call in toolCalls {
                let outcome = await executeToolCall(call)
                messages.append(.init(role: .tool, text: outcome.progress))
                history.append([
                    "role": "tool",
                    "tool_call_id": call["id"] as? String ?? "",
                    "content": outcome.result
                ])
            }
        }
        finish(with: "动作链已执行完成，请到对应页面查看结果。")
    }

    private struct ToolOutcome {
        let progress: String
        let result: String
    }

    private func executeToolCall(_ call: [String: Any]) async -> ToolOutcome {
        let function = call["function"] as? [String: Any] ?? [:]
        let name = function["name"] as? String ?? ""
        let rawArgs = function["arguments"] as? String ?? "{}"
        let args = (try? JSONSerialization.jsonObject(with: Data(rawArgs.utf8))) as? [String: Any] ?? [:]
        switch name {
        case "open_section":
            let section = args["section"] as? String ?? ""
            guard sections.contains(section) else {
                return ToolOutcome(progress: "跳转失败：页面不存在", result: "页面「" + section + "」不存在。可用页面：" + sections.joined(separator: "、"))
            }
            onOpenSection(section)
            return ToolOutcome(progress: "已跳转到「" + section + "」", result: "已跳转到「" + section + "」页面。")
        case "run_skill":
            let skill = args["skill"] as? String ?? ""
            let available = skillsProvider()
            guard available.contains(skill) else {
                return ToolOutcome(progress: "执行失败：Skill 不存在", result: "Skill " + skill + " 不存在。可执行：" + available.joined(separator: "、"))
            }
            let ok = await withCheckedContinuation { continuation in
                onRunSkill(skill) { result in continuation.resume(returning: result) }
            }
            if ok {
                return ToolOutcome(progress: "已刷新 " + skill, result: "Skill " + skill + " 重新取数完成，对应页面数据已更新。")
            }
            return ToolOutcome(progress: skill + " 刷新失败", result: "Skill " + skill + " 取数失败，请告诉老板稍后重试，或查看 ~/.boss-jarvis/logs/fetch.log。")
        case "reply_mail":
            let rawID = args["mail_id"] as? String ?? String(args["mail_id"] as? Int ?? -1)
            let mailID = Int(rawID) ?? -1
            guard let message = mailItemsProvider().first(where: { $0.id == mailID }) else {
                return ToolOutcome(progress: "回复失败：邮件不在当前列表", result: "邮件 ID " + rawID + " 不在当前邮件列表里；可先 run_skill company-mail 刷新，或让老板到邮件页查看。")
            }
            let outcome: (Bool, String) = await withCheckedContinuation { continuation in
                onOpenMailReply(message) { ok, summary in
                    continuation.resume(returning: (ok, summary))
                }
            }
            if outcome.0 {
                return ToolOutcome(progress: "已为「" + message.subject + "」打开回复窗口", result: "已为邮件「" + message.subject + "」生成回复草稿并在邮件客户端打开回复窗口；请提醒老板核对内容后在客户端点击发送。")
            }
            return ToolOutcome(progress: "回复「" + message.subject + "」失败", result: "回复失败：" + outcome.1)
        default:
            return ToolOutcome(progress: "未知工具", result: "未知工具 " + name + "，无法执行。")
        }
    }

    private func finish(with text: String) {
        history.append(["role": "assistant", "content": text])
        messages.append(.init(role: .assistant, text: text))
        isBusy = false
    }
}

// MARK: - 对话面板

/// Jarvis 助手对话面板。顶部搜索框（⌘K）打开，对话式执行 app 内
/// 所有取数 Skill、跳转页面，并基于工作台数据快照回答上下文问题。
struct AssistantChatView: View {
    @ObservedObject var model: AssistantChatModel
    @EnvironmentObject private var configuration: SystemConfiguration
    @Environment(\.dismiss) private var dismiss
    @FocusState private var inputFocused: Bool

    private let suggestions = [
        "今天有几封邮件要回复？",
        "刷新 OA 待办并总结",
        "今天经营情况怎么样？",
        "我今天有什么日程？"
    ]

    var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle().fill(Color.jarvisLine).frame(height: 1)
            messageList
            Rectangle().fill(Color.jarvisLine).frame(height: 1)
            inputBar
        }
        .frame(width: 600, height: 560)
        .background(Color.jarvisApp)
        .onAppear { inputFocused = true }
        .onExitCommand { dismiss() }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkles")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.jarvisBlue)
            Text("Jarvis 助手")
                .font(configuration.titleFont(weight: .bold))
                .foregroundStyle(Color.jarvisText)
            Text("可执行 Skill 取数与页面跳转 · Esc 关闭")
                .font(configuration.captionFont())
                .foregroundStyle(Color.jarvisFaint)
            Spacer()
            ChatIconButton(systemName: "arrow.counterclockwise", help: "清空对话") {
                model.clear()
            }
            ChatIconButton(systemName: "xmark", help: "关闭") {
                dismiss()
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 46)
        .background(Color.jarvisApp)
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 12) {
                    if model.messages.isEmpty {
                        emptyState
                    } else {
                        ForEach(model.messages) { message in
                            AssistantMessageRow(message: message)
                                .id(message.id)
                        }
                        if model.isBusy {
                            HStack(spacing: 8) {
                                ProgressView().controlSize(.small)
                                Text("正在思考或获取数据…")
                            }
                            .font(configuration.captionFont())
                            .foregroundStyle(Color.jarvisMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .padding(16)
            }
            .onChange(of: model.messages.count) { _ in
                if let last = model.messages.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "sparkle.magnifyingglass")
                .font(.system(size: 30, weight: .light))
                .foregroundStyle(Color.jarvisFaint)
                .padding(.top, 44)
            Text("问事项、客户、合同，或直接执行 Skill")
                .font(configuration.bodyFont(weight: .semibold))
                .foregroundStyle(Color.jarvisMuted)
            VStack(spacing: 8) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        model.send(suggestion)
                    } label: {
                        Text(suggestion)
                            .font(configuration.bodyFont())
                            .foregroundStyle(Color.jarvisText)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .frame(maxWidth: .infinity)
                            .background(Color.jarvisCard)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color.jarvisLine))
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(width: 340)
            Spacer()
        }
    }

    private var inputBar: some View {
        HStack(spacing: 10) {
            TextField("问 Jarvis，回车发送", text: $model.draft)
                .textFieldStyle(.plain)
                .font(configuration.bodyFont())
                .focused($inputFocused)
                .onSubmit { sendDraft() }
                .disabled(model.isBusy)
            Button(action: sendDraft) {
                Image(systemName: model.isBusy ? "ellipsis" : "arrow.up.circle.fill")
                    .font(.system(size: 22, weight: .regular))
                    .foregroundStyle(model.isBusy ? Color.jarvisFaint : Color.jarvisBlue)
            }
            .buttonStyle(.plain)
            .disabled(model.isBusy || model.draft.trimmingCharacters(in: .whitespaces).isEmpty)
            .help("发送（回车）")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.jarvisPanel)
    }

    private func sendDraft() {
        let text = model.draft
        model.draft = ""
        model.send(text)
        inputFocused = true
    }
}

private struct AssistantMessageRow: View {
    let message: AssistantMessage
    @EnvironmentObject private var configuration: SystemConfiguration

    var body: some View {
        switch message.role {
        case .user:
            HStack {
                Spacer(minLength: 48)
                Text(message.text)
                    .font(configuration.bodyFont())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.jarvisBlue)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        case .assistant:
            HStack {
                Text(message.text)
                    .font(configuration.bodyFont())
                    .foregroundStyle(Color.jarvisText)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.jarvisCard)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.jarvisLine))
                Spacer(minLength: 48)
            }
        case .tool:
            HStack(spacing: 6) {
                Image(systemName: "bolt.circle")
                Text(message.text)
            }
            .font(configuration.captionFont())
            .foregroundStyle(Color.jarvisFaint)
            .frame(maxWidth: .infinity)
        }
    }
}

private struct ChatIconButton: View {
    let systemName: String
    let help: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .medium))
        }
        .buttonStyle(JarvisButtonStyle(variant: .iconPlain))
        .help(help)
    }
}
