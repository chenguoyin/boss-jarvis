import SwiftUI

extension Color {
    private static func dynamic(_ light: NSColor, _ dark: NSColor) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
        })
    }

    private static func rgb(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) -> NSColor {
        NSColor(red: r / 255, green: g / 255, blue: b / 255, alpha: a)
    }

    static let jarvisPage = dynamic(rgb(236, 238, 240), rgb(24, 25, 28))
    static let jarvisApp = dynamic(rgb(251, 251, 253), rgb(30, 31, 35))
    static let jarvisPanel = dynamic(rgb(243, 245, 248), rgb(38, 39, 44))
    static let jarvisCard = dynamic(rgb(255, 255, 255), rgb(44, 46, 52))
    static let jarvisCardSoft = dynamic(rgb(250, 250, 251), rgb(50, 52, 58))
    static let jarvisText = dynamic(rgb(37, 41, 57), rgb(232, 234, 240))
    static let jarvisMuted = dynamic(rgb(116, 123, 141), rgb(158, 164, 178))
    static let jarvisFaint = dynamic(rgb(162, 168, 181), rgb(110, 116, 128))
    static let jarvisLine = dynamic(rgb(230, 232, 237), rgb(58, 60, 66))
    static let jarvisBlue = dynamic(rgb(39, 151, 245), rgb(74, 168, 250))
    static let jarvisGreen = dynamic(rgb(35, 173, 117), rgb(52, 190, 134))
    static let jarvisAmber = dynamic(rgb(224, 176, 32), rgb(236, 190, 52))
    static let jarvisRed = dynamic(rgb(236, 98, 112), rgb(242, 116, 128))
    static let jarvisPurple = dynamic(rgb(112, 103, 217), rgb(132, 124, 226))
    static let jarvisInk = dynamic(rgb(37, 37, 37), rgb(232, 234, 240))
    /// 首页结论条底色（#F0F8FE），深色模式用相近的深蓝灰。
    static let jarvisVerdict = dynamic(rgb(240, 248, 254), rgb(36, 44, 54))
}

extension View {
    func jarvisCard(cornerRadius: CGFloat = 24) -> some View {
        self
            .background(Color.jarvisCard)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.jarvisLine, lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.055), radius: 24, x: 0, y: 13)
    }

    func iconTint(_ color: Color) -> some View {
        self
            .foregroundStyle(color)
            .frame(width: 44, height: 44)
            .background(color.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct JarvisButtonStyle: ButtonStyle {
    enum Variant {
        case icon
        case iconPlain
        case primaryPill
        case segment
        case nav(active: Bool, hovering: Bool = false)
    }

    let variant: Variant

    func makeBody(configuration: Configuration) -> some View {
        switch variant {
        case .icon:
            configuration.label
                .frame(width: 48, height: 48)
                .foregroundStyle(Color.jarvisMuted)
                .background(Color.jarvisCard)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.jarvisLine))
                .shadow(color: .black.opacity(0.055), radius: 12, x: 0, y: 7)
                .scaleEffect(configuration.isPressed ? 0.97 : 1)
        case .iconPlain:
            configuration.label
                .frame(width: 32, height: 32)
                .foregroundStyle(configuration.isPressed ? Color.jarvisText : Color.jarvisMuted)
                .background(configuration.isPressed ? Color.jarvisText.opacity(0.08) : .clear)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .contentShape(Rectangle())
        case .primaryPill:
            configuration.label
                .foregroundStyle(.white)
                .frame(minWidth: 248, minHeight: 62)
                .padding(.horizontal, 26)
                .background(
                    LinearGradient(colors: [Color(red: 0.22, green: 0.22, blue: 0.22), .black], startPoint: .top, endPoint: .bottom)
                )
                .clipShape(Capsule())
                .shadow(color: .black.opacity(0.22), radius: 18, x: 0, y: 12)
                .scaleEffect(configuration.isPressed ? 0.98 : 1)
        case .segment:
            configuration.label
                .foregroundStyle(Color.jarvisText)
                .frame(minHeight: 58)
                .padding(.horizontal, 22)
                .background(Color.jarvisCard.opacity(0.72))
                .clipShape(Capsule())
                .scaleEffect(configuration.isPressed ? 0.98 : 1)
        case .nav(let active, let hovering):
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(
                        active
                            ? LinearGradient(
                                colors: [Color(red: 0.23, green: 0.23, blue: 0.23), Color(red: 0.03, green: 0.03, blue: 0.035)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                            : LinearGradient(
                                colors: hovering
                                    ? [Color.jarvisText.opacity(0.07), Color.jarvisText.opacity(0.07)]
                                    : [.clear, .clear],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(active ? Color.white.opacity(0.17) : Color.clear, lineWidth: 1)
                    )
                    .shadow(color: active ? .black.opacity(0.18) : .clear, radius: 14, x: 0, y: 8)
                    .frame(width: 42, height: 42)

                configuration.label
                    .foregroundStyle(
                        active
                            ? Color.white
                            : hovering
                                ? Color.jarvisText
                                : Color.jarvisFaint
                    )
            }
                .frame(width: 52, height: 52)
                .contentShape(Rectangle())
                .scaleEffect(configuration.isPressed ? 0.96 : 1)
                .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
                .animation(.easeInOut(duration: 0.18), value: active)
                .animation(.easeOut(duration: 0.14), value: hovering)
                .overlay(
                    Circle()
                        .fill(active ? Color.jarvisBlue : Color.clear)
                        .frame(width: 5, height: 5)
                        .offset(x: 22),
                    alignment: .trailing
                )
        }
    }
}
