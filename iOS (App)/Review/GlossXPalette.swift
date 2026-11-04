import SwiftUI
import UIKit

enum GlossXPalette {
    static let ink = adaptive(light: (27, 67, 50), dark: (220, 236, 226))
    static let green = adaptive(light: (45, 106, 79), dark: (116, 198, 157))
    static let mint = adaptive(light: (149, 213, 178), dark: (64, 120, 92))
    static let wash = green.opacity(0.12)
    static let paper = adaptive(light: (247, 250, 246), dark: (16, 22, 19))
    static let card = adaptive(light: (255, 255, 255), dark: (30, 38, 34))
    static let muted = adaptive(light: (90, 110, 100), dark: (150, 170, 160))
    static let danger = adaptive(light: (140, 70, 70), dark: (230, 140, 140))
    /// Text drawn on top of `green`.
    static let onAccent = adaptive(light: (255, 255, 255), dark: (16, 22, 19))
    static let flame = Color(red: 255 / 255, green: 140 / 255, blue: 40 / 255)
    static let flameIdle = adaptive(light: (176, 186, 180), dark: (90, 100, 95))

    private static func adaptive(light: (Int, Int, Int), dark: (Int, Int, Int)) -> Color {
        Color(UIColor { traits in
            let rgb = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat(rgb.0) / 255, green: CGFloat(rgb.1) / 255, blue: CGFloat(rgb.2) / 255, alpha: 1)
        })
    }
}
