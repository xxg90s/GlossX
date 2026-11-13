import GlossXCore
import SwiftUI
import WidgetKit

struct StreakEntry: TimelineEntry {
    let date: Date
    let status: StreakStatus
    let scene: WidgetScene
}

struct StreakProvider: TimelineProvider {
    func placeholder(in context: Context) -> StreakEntry {
        entry(at: Date(), sample: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
        if context.isPreview && StreakSharedState.load(from: StreakSharedState.sharedDefaults) == nil {
            completion(entry(at: Date(), sample: true))
        } else {
            completion(entry(at: Date()))
        }
    }

    /// Two entries: now, and the next local midnight so the flame greys out (or the
    /// streak resets) and the illustration changes, even if the app is never opened.
    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let now = Date()
        let midnight = DayStamp.nextMidnight(after: now)
        completion(Timeline(entries: [entry(at: now), entry(at: midnight)], policy: .after(midnight)))
    }

    private func entry(at date: Date, sample: Bool = false) -> StreakEntry {
        let day = DayStamp.string(from: date)
        let status: StreakStatus
        if sample {
            status = .sample
        } else {
            let state = StreakSharedState.load(from: StreakSharedState.sharedDefaults)
            status = StreakEngine.status(
                state?.record ?? .empty,
                reviewableCount: state?.reviewableCount ?? 0,
                today: day
            )
        }
        return StreakEntry(date: date, status: status, scene: WidgetScene.forDay(day))
    }
}

/// Illustrations of the app mascot. The same picture stays up for a local day,
/// then moves to another one at midnight. Multiplying by 3 (coprime with the
/// scene count) visits every picture before repeating, without showing the same
/// one on two days in a row.
enum WidgetScene: String, CaseIterable {
    case reading = "WidgetSceneReading"
    case cheer = "WidgetSceneCheer"
    case cards = "WidgetSceneCards"
    case sprout = "WidgetSceneSprout"
    case night = "WidgetSceneNight"
    case picnic = "WidgetScenePicnic"
    case flight = "WidgetSceneFlight"

    func imageName(warning: Bool) -> String {
        warning ? rawValue + "Warning" : rawValue
    }

    static func forDay(_ day: String) -> WidgetScene {
        let scenes = allCases
        guard let ordinal = dayOrdinal(day) else { return scenes[0] }
        let index = (ordinal * 3) % scenes.count
        return scenes[index]
    }

    private static func dayOrdinal(_ day: String) -> Int? {
        let parts = day.split(separator: "-")
        guard parts.count == 3,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let dayNumber = Int(parts[2]) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
        guard let date = calendar.date(from: DateComponents(year: year, month: month, day: dayNumber)) else {
            return nil
        }
        return calendar.ordinality(of: .day, in: .era, for: date)
    }
}

private enum WidgetPalette {
    static let ink = adaptive(light: (27, 67, 50), dark: (220, 236, 226))
    static let muted = adaptive(light: (90, 110, 100), dark: (150, 170, 160))
    static let paper = adaptive(light: (247, 250, 246), dark: (16, 22, 19))
    static let flame = Color(red: 255 / 255, green: 140 / 255, blue: 40 / 255)
    static let track = adaptive(light: (225, 232, 227), dark: (48, 58, 53))
    static let done = Color(red: 0.10, green: 0.42, blue: 0.26)
    static let due = Color(red: 0.70, green: 0.18, blue: 0.10)
    static let onArt = Color(red: 0.08, green: 0.16, blue: 0.12)
    static let onArtMuted = Color(red: 0.28, green: 0.22, blue: 0.20)
    static let softWhite = Color(red: 1, green: 0.97, blue: 0.95)

    private static func adaptive(light: (Int, Int, Int), dark: (Int, Int, Int)) -> Color {
        Color(UIColor { traits in
            let rgb = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat(rgb.0) / 255, green: CGFloat(rgb.1) / 255, blue: CGFloat(rgb.2) / 255, alpha: 1)
        })
    }
}

private extension StreakStatus {
    static let sample = StreakStatus(
        streak: 12,
        todayCompleted: false,
        todayReviewed: 3,
        effectiveGoal: 10,
        remaining: 7,
        week: [.completed, .completed, .completed, .pending, .future, .future, .future]
    )

    var statusText: String {
        if todayCompleted { return "今日已完成" }
        if !hasTask { return "先去收藏单词" }
        return "还差 \(remaining) 张"
    }
}

struct StreakWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    let entry: StreakEntry

    private var showsScene: Bool {
        switch family {
        case .systemSmall, .systemMedium:
            break
        default:
            return false
        }
        if #available(iOSApplicationExtension 18.0, *) {
            return renderingMode == .fullColor
        }
        return true
    }

    var body: some View {
        content
            .widgetBackground {
                if showsScene {
                    Image(entry.scene.imageName(warning: !entry.status.todayCompleted))
                        .resizable()
                        .renderingMode(.original)
                        .scaledToFill()
                } else if family == .accessoryCircular || family == .accessoryInline {
                    Color.clear
                } else {
                    WidgetPalette.paper
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryCircular:
            CircularView(status: entry.status)
        case .accessoryInline:
            InlineView(status: entry.status)
        case .systemMedium:
            MediumView(status: entry.status, onScene: showsScene)
        default:
            SmallView(status: entry.status, onScene: showsScene)
        }
    }
}

private struct StreakHeadline: View {
    let status: StreakStatus
    var onScene: Bool

    private var pendingOnArt: Bool { onScene && !status.todayCompleted }

    private var mark: Color {
        if pendingOnArt { return WidgetPalette.softWhite }
        return status.todayCompleted ? WidgetPalette.flame : WidgetPalette.due
    }

    private var count: Color {
        if pendingOnArt { return WidgetPalette.softWhite }
        return onScene ? WidgetPalette.onArt : WidgetPalette.ink
    }

    var body: some View {
        HStack(alignment: .center, spacing: 4) {
            Image(systemName: "flame.fill")
                .font(.system(size: 28, weight: .black))
                .foregroundColor(mark)
            Text("\(status.streak)")
                .font(.system(size: 44, weight: .black, design: .rounded))
                .foregroundColor(count)
                .minimumScaleFactor(0.55)
                .lineLimit(1)
        }
        .artType(onScene && status.todayCompleted)
    }
}

private struct StatusLine: View {
    let status: StreakStatus
    var onScene: Bool

    private var color: Color {
        if onScene {
            return status.todayCompleted ? WidgetPalette.done : WidgetPalette.due
        }
        return status.todayCompleted ? WidgetPalette.ink : WidgetPalette.flame
    }

    var body: some View {
        Text(status.statusText)
            .font(.headline.weight(.heavy))
            .foregroundColor(color)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .artType(onScene)
    }
}

private struct SmallView: View {
    let status: StreakStatus
    var onScene: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            StreakHeadline(status: status, onScene: onScene)
            Spacer(minLength: 6)
            StatusLine(status: status, onScene: onScene)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

private struct MediumView: View {
    let status: StreakStatus
    var onScene: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                StreakHeadline(status: status, onScene: onScene)
                StatusLine(status: status, onScene: onScene)
            }
            .frame(maxWidth: 136, alignment: .leading)
            VStack(alignment: .leading, spacing: 8) {
                Text("本周")
                    .font(.subheadline.weight(.heavy))
                    .foregroundColor(onScene ? WidgetPalette.onArtMuted : WidgetPalette.muted)
                    .artType(onScene)
                WeekStrip(status: status, onScene: onScene, diameter: 24)
                if status.hasTask && !status.todayCompleted {
                    ProgressView(value: Double(status.todayReviewed), total: Double(max(status.effectiveGoal, 1)))
                        .tint(WidgetPalette.due)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct WeekStrip: View {
    private static let weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"]
    let status: StreakStatus
    var onScene: Bool
    var diameter: CGFloat

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(status.week.enumerated()), id: \.offset) { index, state in
                VStack(spacing: 4) {
                    DayDot(state: state, onScene: onScene, diameter: diameter)
                    Text(Self.weekdayLabels[index])
                        .font(.caption2.weight(.heavy))
                        .foregroundColor(onScene ? WidgetPalette.onArt : WidgetPalette.muted)
                        .artType(onScene)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }
}

private struct DayDot: View {
    let state: WeekDayState
    var onScene: Bool
    var diameter: CGFloat

    var body: some View {
        ZStack {
            switch state {
            case .completed:
                Circle().fill(WidgetPalette.flame)
                Image(systemName: "flame.fill")
                    .font(.system(size: diameter * 0.52, weight: .black))
                    .foregroundColor(.white)
            case .pending:
                Circle().stroke(WidgetPalette.due, style: StrokeStyle(lineWidth: 2.5, dash: [3, 2]))
            case .missed:
                Circle().fill(onScene ? Color.white.opacity(0.72) : WidgetPalette.track)
            case .future:
                Circle().stroke(onScene ? Color.white : WidgetPalette.track, lineWidth: 2)
            }
        }
        .frame(width: diameter, height: diameter)
    }
}

private extension View {
    func artType(_ onScene: Bool) -> some View {
        shadow(color: onScene ? Color.white.opacity(0.95) : .clear, radius: onScene ? 2 : 0)
    }
}

private struct CircularView: View {
    let status: StreakStatus

    var body: some View {
        Group {
            if status.hasTask {
                Gauge(value: progress, in: 0...1) {
                    Image(systemName: status.todayCompleted ? "checkmark" : "flame.fill")
                } currentValueLabel: {
                    Text("\(status.streak)")
                }
                .gaugeStyle(.accessoryCircularCapacity)
            } else {
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 0) {
                        Image(systemName: "flame")
                            .font(.system(size: 14, weight: .semibold))
                        Text("\(status.streak)")
                            .font(.system(size: 20, weight: .bold, design: .rounded))
                            .minimumScaleFactor(0.6)
                    }
                }
            }
        }
        .widgetAccentable()
    }

    private var progress: Double {
        min(Double(status.todayReviewed) / Double(max(status.effectiveGoal, 1)), 1)
    }
}

private struct InlineView: View {
    let status: StreakStatus

    var body: some View {
        let symbol = status.todayCompleted ? "checkmark.circle.fill" : "flame"
        Text("\(Image(systemName: symbol)) \(status.streak) 天 · \(status.statusText)")
    }
}

private extension View {
    @ViewBuilder
    func widgetBackground<Background: View>(@ViewBuilder _ background: () -> Background) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget, content: background)
        } else {
            self.background(background())
        }
    }
}

struct StreakWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: StreakSharedState.widgetKind, provider: StreakProvider()) { entry in
            StreakWidgetView(entry: entry)
                .widgetURL(StreakSharedState.reviewURL)
        }
        .configurationDisplayName("GlossX 连胜")
        .description("每天换一张插画，查看连续天数和今日复习目标。")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryInline])
    }
}

@main
struct GlossXWidgets: WidgetBundle {
    var body: some Widget {
        StreakWidget()
    }
}

struct StreakWidget_Previews: PreviewProvider {
    static var previews: some View {
        let pending = StreakEntry(date: Date(), status: .sample, scene: .picnic)
        let completed = StreakEntry(
            date: Date(),
            status: StreakStatus(
                streak: 12,
                todayCompleted: true,
                todayReviewed: 10,
                effectiveGoal: 10,
                remaining: 0,
                week: [.completed, .completed, .completed, .completed, .future, .future, .future]
            ),
            scene: .cheer
        )
        Group {
            StreakWidgetView(entry: pending)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
            StreakWidgetView(entry: completed)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
            StreakWidgetView(entry: pending)
                .previewContext(WidgetPreviewContext(family: .systemMedium))
            StreakWidgetView(entry: completed)
                .previewContext(WidgetPreviewContext(family: .systemMedium))
        }
    }
}
