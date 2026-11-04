import SwiftUI
import GlossXCore

struct StatsView: View {
    @EnvironmentObject private var store: LibraryStore

    var body: some View {
        let stats = store.stats
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    streakSection(stats)
                    section("打卡记录 · 近 12 周") {
                        HeatmapView(days: stats.heatmap)
                    }
                    section("未来 7 天待复习") {
                        ForecastView(days: stats.forecast)
                    }
                    section("词库") {
                        librarySection(stats)
                    }
                }
                .padding(20)
            }
            .background(GlossXPalette.paper.ignoresSafeArea())
            .navigationTitle("统计")
        }
        .navigationViewStyle(.stack)
    }

    private func streakSection(_ stats: LibraryStatsSummary) -> some View {
        HStack(spacing: 12) {
            metric(title: "当前连胜", value: stats.currentStreak, unit: "天", icon: "flame.fill", tint: GlossXPalette.flame)
            metric(title: "最长连胜", value: stats.longestStreak, unit: "天", icon: "trophy.fill", tint: GlossXPalette.green)
            metric(title: "累计打卡", value: stats.completedDays, unit: "天", icon: "calendar", tint: GlossXPalette.green)
        }
    }

    private func librarySection(_ stats: LibraryStatsSummary) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            countTile("全部", stats.total)
            countTile("新词", stats.newCount)
            countTile("学习中", stats.learning)
            countTile("已掌握", stats.mastered)
            countTile("已跳过", stats.skipped)
        }
    }

    private func metric(title: String, value: Int, unit: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: icon)
                .foregroundColor(tint)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("\(value)")
                    .font(.title2.weight(.bold))
                    .foregroundColor(GlossXPalette.ink)
                Text(unit)
                    .font(.caption)
                    .foregroundColor(GlossXPalette.muted)
            }
            Text(title)
                .font(.caption)
                .foregroundColor(GlossXPalette.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(GlossXPalette.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func countTile(_ title: String, _ value: Int) -> some View {
        HStack {
            Text(title)
                .foregroundColor(GlossXPalette.muted)
            Spacer()
            Text("\(value)")
                .font(.headline)
                .foregroundColor(GlossXPalette.ink)
        }
        .padding(14)
        .background(GlossXPalette.card)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)
                .foregroundColor(GlossXPalette.ink)
            content()
        }
    }
}

private struct HeatmapView: View {
    let days: [HeatmapDay]

    private var weeks: [[HeatmapDay]] {
        stride(from: 0, to: days.count, by: 7).map { Array(days[$0..<min($0 + 7, days.count)]) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 4) {
                VStack(spacing: 4) {
                    ForEach(["一", "二", "三", "四", "五", "六", "日"], id: \.self) { label in
                        Text(label)
                            .font(.system(size: 9))
                            .foregroundColor(GlossXPalette.muted)
                            .frame(height: 14)
                    }
                }
                ForEach(weeks.indices, id: \.self) { index in
                    VStack(spacing: 4) {
                        ForEach(weeks[index]) { day in
                            cell(day)
                        }
                    }
                }
            }
            HStack(spacing: 12) {
                legend(color: GlossXPalette.green, text: "完成")
                legend(color: GlossXPalette.mint.opacity(0.35), text: "未完成")
            }
            .font(.caption2)
            .foregroundColor(GlossXPalette.muted)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(GlossXPalette.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("近 12 周完成 \(days.filter { $0.state == .completed }.count) 天")
    }

    @ViewBuilder
    private func cell(_ day: HeatmapDay) -> some View {
        let shape = RoundedRectangle(cornerRadius: 3, style: .continuous)
        switch day.state {
        case .completed:
            shape.fill(GlossXPalette.green).frame(width: 14, height: 14)
        case .missed:
            shape.fill(GlossXPalette.mint.opacity(0.35)).frame(width: 14, height: 14)
        case .pending:
            shape.stroke(GlossXPalette.flame, lineWidth: 1.5).frame(width: 14, height: 14)
        case .future:
            Color.clear.frame(width: 14, height: 14)
        }
    }

    private func legend(color: Color, text: String) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 10)
            Text(text)
        }
    }
}

private struct ForecastView: View {
    let days: [ForecastDay]

    private var peak: Int { max(days.map(\.count).max() ?? 0, 1) }

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            ForEach(Array(days.enumerated()), id: \.element.id) { index, day in
                VStack(spacing: 6) {
                    Text("\(day.count)")
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(GlossXPalette.ink)
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(index == 0 ? GlossXPalette.green : GlossXPalette.mint)
                        .frame(height: max(4, CGFloat(day.count) / CGFloat(peak) * 90))
                    Text(label(index: index, date: day.date))
                        .font(.caption2)
                        .foregroundColor(GlossXPalette.muted)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .combine)
            }
        }
        .frame(height: 140, alignment: .bottom)
        .padding(14)
        .background(GlossXPalette.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func label(index: Int, date: String) -> String {
        switch index {
        case 0: return "今天"
        case 1: return "明天"
        default: return String(date.suffix(5)).replacingOccurrences(of: "-", with: "/")
        }
    }
}
