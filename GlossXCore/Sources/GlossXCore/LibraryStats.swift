import Foundation

public struct HeatmapDay: Equatable, Identifiable {
    public var date: String
    public var state: WeekDayState
    public var id: String { date }
}

public struct ForecastDay: Equatable, Identifiable {
    public var date: String
    public var count: Int
    public var id: String { date }
}

public struct LibraryStatsSummary: Equatable {
    public var total: Int
    public var newCount: Int
    public var learning: Int
    public var mastered: Int
    public var skipped: Int
    public var currentStreak: Int
    public var longestStreak: Int
    public var completedDays: Int
    /// Monday-first weeks, oldest first, ending with the current week.
    public var heatmap: [HeatmapDay]
    /// Today plus the next six days; today includes anything already overdue.
    public var forecast: [ForecastDay]
}

public enum LibraryStats {
    public static let heatmapWeeks = 12
    public static let forecastDays = 7

    public static func summarize(
        items: [ReviewSourceItem],
        record: StreakRecord,
        today: String,
        now: Double,
        timeZone: TimeZone = .current
    ) -> LibraryStatsSummary {
        let completed = Set(record.completedDays)
        return LibraryStatsSummary(
            total: items.count,
            newCount: items.filter { $0.status == "new" || $0.status.isEmpty }.count,
            learning: items.filter { $0.status == "learning" || $0.status == "review" }.count,
            mastered: items.filter { $0.status == "mastered" || $0.status == "familiar" }.count,
            skipped: items.filter { $0.status == "skipped" }.count,
            currentStreak: StreakEngine.status(record, reviewableCount: 0, today: today).streak,
            longestStreak: longestRun(in: record.completedDays),
            completedDays: completed.count,
            heatmap: heatmap(completed: completed, today: today),
            forecast: forecast(items: items, today: today, now: now, timeZone: timeZone)
        )
    }

    private static func longestRun(in days: [String]) -> Int {
        var longest = 0
        var run = 0
        var previous: String?
        for day in Set(days).sorted() {
            run = previous.map { DayStamp.adding(days: 1, to: $0) == day } == true ? run + 1 : 1
            longest = max(longest, run)
            previous = day
        }
        return longest
    }

    private static func heatmap(completed: Set<String>, today: String) -> [HeatmapDay] {
        let start = DayStamp.adding(days: -7 * (heatmapWeeks - 1), to: DayStamp.weekStart(of: today))
        return (0..<(heatmapWeeks * 7)).map { offset in
            let day = DayStamp.adding(days: offset, to: start)
            let state: WeekDayState
            if completed.contains(day) {
                state = .completed
            } else if day == today {
                state = .pending
            } else {
                state = day > today ? .future : .missed
            }
            return HeatmapDay(date: day, state: state)
        }
    }

    private static func forecast(items: [ReviewSourceItem], today: String, now: Double, timeZone: TimeZone) -> [ForecastDay] {
        var counts: [String: Int] = [:]
        for item in items where item.kind != .sentence || !item.chinese.isEmpty || !item.definitions.isEmpty {
            guard item.status != "new", item.status != "familiar", item.status != "skipped", !item.status.isEmpty else { continue }
            let day = item.nextReviewAt <= now ? today : DayStamp.string(fromMilliseconds: item.nextReviewAt, timeZone: timeZone)
            counts[day, default: 0] += 1
        }
        return (0..<forecastDays).map { offset in
            let day = DayStamp.adding(days: offset, to: today)
            return ForecastDay(date: day, count: counts[day] ?? 0)
        }
    }
}
