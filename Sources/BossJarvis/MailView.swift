import SwiftUI
import WebKit

/// 未读邮件列表页。数据来自 company-mail Skill 的 JSON 输出，
/// 只读展示；回复直接在邮件客户端打开回复窗口，由用户点击发送。
struct MailView: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    let result: CompanyMailResult?
    let onOpenReply: (MailMessage) -> Void
    let onMarkRead: (MailMessage) -> Void
    let replyStatus: String?
    let readStatus: String?
    /// 正在生成回复草稿的邮件 ID 集合，用于行内等待指示与防重复点击。
    let replyingMailIDs: Set<Int>
    /// 最近一次回复流程是否成功，详情弹层据此自动关闭或展示失败原因。
    let lastMailReplySucceeded: Bool
    @State private var selectedMessage: MailMessage?

    var body: some View {
        if let result {
            content(result)
        } else {
            UnavailableCard(
                title: "邮件",
                detail: "未获取到数据。请先运行 company-mail Skill，把输出 JSON 写入数据目录后刷新。",
                systemImage: "envelope"
            )
        }
    }

    private func content(_ result: CompanyMailResult) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            header(result)

            if result.items.isEmpty {
                Text("当前没有未读邮件")
                    .font(configuration.bodyFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 40)
            } else {
                VStack(spacing: 0) {
                    columnHeader
                    Divider().overlay(Color.jarvisLine)
                    ForEach(Array(result.items.enumerated()), id: \.element.id) { index, message in
                        row(message, index: index + 1)
                        if message.id != result.items.last?.id {
                            Divider().overlay(Color.jarvisLine.opacity(0.6))
                        }
                    }
                }
                .padding(.top, 16)
            }
        }
        .padding(24)
        .jarvisCard(cornerRadius: 20)
        .sheet(item: $selectedMessage) { message in
            MailDetailSheet(
                message: message,
                onOpenReply: onOpenReply,
                replyingMailIDs: replyingMailIDs,
                lastMailReplySucceeded: lastMailReplySucceeded,
                replyStatus: replyStatus
            )
            .environmentObject(configuration)
        }
    }

    private func header(_ result: CompanyMailResult) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text("邮件")
                    .font(configuration.titleFont())
                    .foregroundStyle(Color.jarvisText)
                Text("未读 \(result.count) 封 · 需回复 \(result.needsReplyCount) 封 · 来源：macOS Mail · 采集 \(formatted(result.fetchedAt))")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            Spacer()
            if let replyStatus {
                Text(replyStatus)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .lineLimit(1)
                    .help(replyStatus)
            } else if let readStatus {
                Text(readStatus)
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
                    .lineLimit(1)
                    .help(readStatus)
            } else {
                Text("回复直接打开邮件客户端")
                    .font(configuration.captionFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisBlue)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.jarvisBlue.opacity(0.12))
                    .clipShape(Capsule())
            }
        }
    }

    private var columnHeader: some View {
        HStack(spacing: 0) {
            Text("#").frame(width: 36, alignment: .leading)
            Text("主题").frame(maxWidth: .infinity, alignment: .leading)
            Text("发件人").frame(width: 210, alignment: .leading)
            Text("级别").frame(width: 64, alignment: .leading)
            Text("时间").frame(width: 130, alignment: .leading)
            Text("").frame(width: 96, alignment: .trailing)
        }
        .font(configuration.captionFont(weight: .semibold))
        .foregroundStyle(Color.jarvisMuted)
        .padding(.vertical, 8)
    }

    private func row(_ message: MailMessage, index: Int) -> some View {
        HStack(spacing: 0) {
            Text("\(index)")
                .foregroundStyle(Color.jarvisMuted)
                .frame(width: 36, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    if message.needsReply {
                        Circle()
                            .fill(Color.jarvisAmber)
                            .frame(width: 6, height: 6)
                    }
                    Button {
                        selectedMessage = message
                        onMarkRead(message)
                    } label: {
                        Text(message.subject)
                            .font(configuration.bodyFont(weight: .medium))
                            .foregroundStyle(Color.jarvisText)
                            .lineLimit(1)
                    }
                    .buttonStyle(.plain)
                    .help("查看邮件详情")
                }
                if !message.replyBasis.isEmpty, message.needsReply {
                    Text(message.replyBasis)
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisMuted)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(message.sender.isEmpty ? "未获取" : message.sender)
                .frame(width: 210, alignment: .leading)
                .lineLimit(1)

            Group {
                if let urgency = message.urgency {
                    Text(urgencyTitle(urgency))
                        .foregroundStyle(urgency.tint)
                } else {
                    Text("未获取")
                        .foregroundStyle(Color.jarvisMuted)
                }
            }
            .frame(width: 64, alignment: .leading)

            Text(shortTime(message.receivedAt))
                .frame(width: 130, alignment: .leading)

            HStack {
                if message.needsReply {
                    if replyingMailIDs.contains(message.id) {
                        ProgressView()
                            .controlSize(.small)
                            .frame(width: 28, height: 28)
                            .help("正在生成回复草稿，请稍候…")
                    } else {
                        Button {
                            onOpenReply(message)
                        } label: {
                            Image(systemName: "arrowshape.turn.up.left")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(Color.jarvisBlue)
                                .frame(width: 28, height: 28)
                                .background(Color.jarvisBlue.opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .help("在邮件客户端打开回复窗口，由您点击发送")
                    }
                }
            }
            .frame(width: 96, alignment: .trailing)
        }
        .font(configuration.bodyFont())
        .foregroundStyle(Color.jarvisMuted)
        .padding(.vertical, 12)
    }

    private func urgencyTitle(_ level: RiskLevel) -> String {
        switch level {
        case .urgent: "紧急"
        case .attention: "关注"
        case .normal: "正常"
        case .missing: "未获取"
        }
    }

    private func formatted(_ date: Date?) -> String {
        guard let date else { return "未获取" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: date)
    }

private func shortTime(_ date: Date?) -> String {
    guard let date else { return "未获取" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
    return formatter.string(from: date)
}
}

// MARK: - 邮件详情弹层

/// 点击主题后的只读详情弹层；回复直接打开邮件客户端回复窗口。
struct MailDetailSheet: View {
    @EnvironmentObject private var configuration: SystemConfiguration
    @Environment(\.dismiss) private var dismiss
    let message: MailMessage
    let onOpenReply: (MailMessage) -> Void
    let replyingMailIDs: Set<Int>
    let lastMailReplySucceeded: Bool
    let replyStatus: String?
    /// 本次弹层内是否已点击过回复，用于只在当前邮件的失败结果上展示提示。
    @State private var replyAttempted = false

    private var isReplying: Bool { replyingMailIDs.contains(message.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            Divider().overlay(Color.jarvisLine)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    bodySection
                    replyAdvice
                }
                .padding(.vertical, 4)
            }
            actionBar
        }
        .padding(24)
        .frame(width: 640, height: 520)
        .background(Color.jarvisCard)
        .onChange(of: isReplying) { replying in
            // 草稿生成完成且成功：回复窗口已在 Mail 打开，自动关闭详情弹层。
            if !replying && lastMailReplySucceeded { dismiss() }
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(message.subject)
                    .font(configuration.titleFont())
                    .foregroundStyle(Color.jarvisText)
                    .lineLimit(2)
                Text("发件人：\(message.sender.isEmpty ? "未获取" : message.sender) · 时间：\(message.displayTime)")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisMuted)
            }
            Spacer()
            Group {
                if let urgency = message.urgency {
                    Text(urgencyTitle(urgency))
                        .foregroundStyle(urgency.tint)
                } else {
                    Text("未获取")
                        .foregroundStyle(Color.jarvisMuted)
                }
            }
            .font(configuration.captionFont(weight: .bold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background((message.urgency?.tint ?? Color.jarvisMuted).opacity(0.12))
            .clipShape(Capsule())
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.jarvisMuted)
            }
            .buttonStyle(.plain)
            .help("关闭")
        }
    }

    private var replyAdvice: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "lightbulb")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(message.needsReply ? Color.jarvisAmber : Color.jarvisMuted)
                Text("回复建议")
                    .font(configuration.bodyFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisText)
            }
            Text(message.replyBasis.isEmpty ? "未获取" : message.replyBasis)
                .font(configuration.bodyFont())
                .foregroundStyle(Color.jarvisText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(Color.jarvisCardSoft)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    @ViewBuilder
    private var bodySection: some View {
        if message.bodyHtml.isEmpty {
            section("正文摘要", icon: "text.alignleft", tint: .jarvisBlue, text: message.bodySummary)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: "doc.richtext")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.jarvisBlue)
                    Text("邮件正文")
                        .font(configuration.bodyFont(weight: .semibold))
                        .foregroundStyle(Color.jarvisText)
                }
                MailHtmlWebView(html: message.bodyHtml)
                    .frame(height: 360)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
    }

    private var actionBar: some View {
        HStack {
            if isReplying {
                HStack(spacing: 6) {
                    ProgressView()
                        .controlSize(.small)
                    Text("正在生成回复草稿，请稍候…")
                        .font(configuration.captionFont())
                        .foregroundStyle(Color.jarvisBlue)
                }
            } else if let replyStatus, !lastMailReplySucceeded {
                Text(replyAttempted ? replyStatus : "")
                    .font(configuration.captionFont())
                    .foregroundStyle(Color.jarvisRed)
                    .lineLimit(2)
            }
            Spacer()
            Button {
                replyAttempted = true
                onOpenReply(message)
            } label: {
                Group {
                    if isReplying {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "arrowshape.turn.up.left")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 34, height: 34)
                .background(isReplying ? Color.jarvisBlue.opacity(0.4) : Color.jarvisBlue)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(isReplying)
            .help("在邮件客户端打开回复窗口，由您点击发送")
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.jarvisText)
                    .frame(width: 34, height: 34)
                    .background(Color.jarvisCardSoft)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color.jarvisLine))
            }
            .buttonStyle(.plain)
            .help("关闭")
        }
    }

    private func section(_ title: String, icon: String, tint: Color, text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(tint)
                Text(title)
                    .font(configuration.bodyFont(weight: .semibold))
                    .foregroundStyle(Color.jarvisText)
            }
            Text(text.isEmpty ? "未获取" : text)
                .font(configuration.bodyFont())
                .foregroundStyle(Color.jarvisText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(Color.jarvisCardSoft)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func urgencyTitle(_ level: RiskLevel) -> String {
        switch level {
        case .urgent: "紧急"
        case .attention: "关注"
        case .normal: "正常"
        case .missing: "未获取"
        }
    }
}

/// 用 WKWebView 渲染邮件 HTML 正文；禁用脚本与链接跳转，只读展示。
private struct MailHtmlWebView: NSViewRepresentable {
    let html: String

    func makeNSView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        webView.navigationDelegate = context.coordinator
        webView.setValue(false, forKey: "drawsBackground")
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        if context.coordinator.loadedHTML != html {
            context.coordinator.loadedHTML = html
            webView.loadHTMLString(html, baseURL: nil)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedHTML: String?

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .other {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
        }
    }
}
