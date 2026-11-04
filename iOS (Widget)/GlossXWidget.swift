import GlossXCore
import SwiftUI
import WidgetKit

struct StreakEntry: TimelineEntry {
    let date: Date
    let status: StreakStatus
}

struct StreakProvider: TimelineProvider {
    func placeholder(in context: Context) -> StreakEntry {
        StreakEntry(date: Date(), status: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
        if context.isPreview && StreakSharedState.load(from: StreakSharedState.sharedDefaults) == nil {
            completion(StreakEntry(date: Date(), status: .sample))
        } else {
            completion(entry(at: Date()))
        }
    }

    /// Two entries: now, and the next local midnight so the flame greys out (or the
    /// streak resets) on time even if the app is never opened.
    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let now = Date()
        let midnight = DayStamp.nextMidnight(after: now)
        completion(Timeline(entries: [entry(at: now), entry(at: midnight)], policy: .after(midnight)))
    }

    private func entry(at date: Date) -> StreakEntry {
        let state = StreakSharedState.load(from: StreakSharedState.sharedDefaults)
        let status = StreakEngine.status(
            state?.record ?? .empty,
            reviewableCount: state?.reviewableCount ?? 0,
            today: DayStamp.string(from: date)
        )
        return StreakEntry(date: date, status: status)
    }
}

private enum WidgetPalette {
    static let ink = adaptive(light: (27, 67, 50), dark: (220, 236, 226))
    static let green = adaptive(light: (45, 106, 79), dark: (116, 198, 157))
    static let muted = adaptive(light: (90, 110, 100), dark: (150, 170, 160))
    static let paper = adaptive(light: (247, 250, 246), dark: (16, 22, 19))
    static let flame = Color(red: 255 / 255, green: 140 / 255, blue: 40 / 255)
    static let idle = adaptive(light: (176, 186, 180), dark: (90, 100, 95))
    static let track = adaptive(light: (225, 232, 227), dark: (48, 58, 53))

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

    var flameColor: Color {
        todayCompleted ? WidgetPalette.flame : WidgetPalette.idle
    }

    var statusText: String {
        if todayCompleted { return "今日已完成" }
        if !hasTask { return "先去收藏单词" }
        return "还差 \(remaining) 张"
    }

    var streakCaption: String {
        streak > 0 ? "天连续" : "开始连胜"
    }
}

struct StreakWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: StreakEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            CircularView(status: entry.status)
                .widgetBackground(.clear)
        case .accessoryInline:
            InlineView(status: entry.status)
                .widgetBackground(.clear)
        case .systemMedium:
            MediumView(status: entry.status)
                .widgetBackground(WidgetPalette.paper)
        default:
            SmallView(status: entry.status)
                .widgetBackground(WidgetPalette.paper)
        }
    }
}

private struct StreakHeadline: View {
    let status: StreakStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Image(systemName: "flame.fill")
                .font(.system(size: 26, weight: .semibold))
                .foregroundColor(status.flameColor)
            Text("\(status.streak)")
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .foregroundColor(WidgetPalette.ink)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(status.streakCaption)
                .font(.caption.weight(.medium))
                .foregroundColor(WidgetPalette.muted)
        }
    }
}

private struct StatusLine: View {
    let status: StreakStatus

    var body: some View {
        HStack(spacing: 4) {
            if status.todayCompleted {
                Image(systemName: "checkmark.circle.fill")
            }
            Text(status.statusText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .font(.footnote.weight(.semibold))
        .foregroundColor(status.todayCompleted ? WidgetPalette.green : WidgetPalette.flame)
    }
}

private struct SmallView: View {
    let status: StreakStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            StreakHeadline(status: status)
            Spacer(minLength: 4)
            StatusLine(status: status)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

private struct MediumView: View {
    private static let weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"]
    let status: StreakStatus

    var body: some View {
        HStack(spacing: 16) {
            SmallView(status: status)
                .frame(maxWidth: 110)
            VStack(alignment: .leading, spacing: 10) {
                Text("本周")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(WidgetPalette.muted)
                HStack(spacing: 0) {
                    ForEach(Array(status.week.enumerated()), id: \.offset) { index, state in
                        VStack(spacing: 6) {
                            DayDot(state: state)
                            Text(Self.weekdayLabels[index])
                                .font(.caption2)
                                .foregroundColor(WidgetPalette.muted)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                if status.hasTask && !status.todayCompleted {
                    ProgressView(value: Double(status.todayReviewed), total: Double(max(status.effectiveGoal, 1)))
                        .tint(WidgetPalette.flame)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct DayDot: View {
    let state: WeekDayState

    var body: some View {
        ZStack {
            switch state {
            case .completed:
                Circle().fill(WidgetPalette.flame)
                Image(systemName: "flame.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
            case .pending:
                Circle().stroke(WidgetPalette.flame, style: StrokeStyle(lineWidth: 2, dash: [3, 2]))
            case .missed:
                Circle().fill(WidgetPalette.track)
            case .future:
                Circle().stroke(WidgetPalette.track, lineWidth: 1.5)
            }
        }
        .frame(width: 22, height: 22)
    }
}

private struct CircularView: View {
    let status: StreakStatus

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Image(systemName: status.todayCompleted ? "flame.fill" : "flame")
                    .font(.system(size: 14, weight: .semibold))
                Text("\(status.streak)")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.6)
            }
        }
        .widgetAccentable()
    }
}

private struct InlineView: View {
    let status: StreakStatus

    var body: some View {
        Text("\(Image(systemName: "flame.fill")) \(status.streak) 天 · \(status.statusText)")
    }
}

private extension View {
    @ViewBuilder
    func widgetBackground(_ color: Color) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(color, for: .widget)
        } else {
            background(color)
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
        .description("查看连续天数和今日复习目标。")
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
        let entry = StreakEntry(date: Date(), status: .sample)
        Group {
            StreakWidgetView(entry: entry)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
            StreakWidgetView(entry: entry)
                .previewContext(WidgetPreviewContext(family: .systemMedium))
            StreakWidgetView(entry: entry)
                .previewContext(WidgetPreviewContext(family: .accessoryCircular))
            StreakWidgetView(entry: entry)
                .previewContext(WidgetPreviewContext(family: .accessoryInline))
        }
    }
}
