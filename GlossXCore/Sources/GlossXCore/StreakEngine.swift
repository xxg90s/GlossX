import Foundation

public struct DayProgress: Codable, Equatable {
    public var date: String
    public var reviewedIds: [String]

    public init(date: String, reviewedIds: [String]) {
        self.date = date
        self.reviewedIds = reviewedIds
    }

    public static let empty = DayProgress(date: "", reviewedIds: [])
}

public struct StreakRecord: Codable, Equatable {
    public static let currentVersion = 1
    public static let defaultGoal = 10
    public static let goalRange = 5...50
    public static let maxStoredDays = 400

    public var version: Int
    public var goal: Int
    /// Sorted ascending, unique, `yyyy-MM-dd` in the device's local calendar at completion time.
    public var completedDays: [String]
    public var today: DayProgress
    public var updatedAt: Double

    public init(
        version: Int = StreakRecord.currentVersion,
        goal: Int = StreakRecord.defaultGoal,
        completedDays: [String] = [],
        today: DayProgress = .empty,
        updatedAt: Double = 0
    ) {
        self.version = version
        self.goal = goal
        self.completedDays = completedDays
        self.today = today
        self.updatedAt = updatedAt
    }

    public static let empty = StreakRecord()

    public func encoded() -> Data? {
        try? JSONEncoder().encode(self)
    }

    public static func decode(_ data: Data) -> StreakRecord? {
        guard let record = try? JSONDecoder().decode(StreakRecord.self, from: data),
              record.version <= currentVersion else {
            return nil
        }
        return record
    }
}

public enum WeekDayState: String, Codable, Equatable {
    case completed
    case missed
    case pending
    case future
}

public struct StreakStatus: Equatable {
    public var streak: Int
    public var todayCompleted: Bool
    public var todayReviewed: Int
    public var effectiveGoal: Int
    public var remaining: Int
    /// Monday through Sunday of the week containing `today`.
    public var week: [WeekDayState]

    public init(
        streak: Int,
        todayCompleted: Bool,
        todayReviewed: Int,
        effectiveGoal: Int,
        remaining: Int,
        week: [WeekDayState]
    ) {
        self.streak = streak
        self.todayCompleted = todayCompleted
        self.todayReviewed = todayReviewed
        self.effectiveGoal = effectiveGoal
        self.remaining = remaining
        self.week = week
    }

    public var hasTask: Bool {
        effectiveGoal > 0
    }
}

public enum StreakEngine {
    public static func status(_ record: StreakRecord, reviewableCount: Int, today: String) -> StreakStatus {
        let days = Set(record.completedDays)
        let reviewed = progress(of: record, on: today).reviewedIds.count
        let effectiveGoal = max(0, min(record.goal, reviewableCount))
        let todayCompleted = days.contains(today)

        var streak = 0
        var cursor = todayCompleted ? today : DayStamp.adding(days: -1, to: today)
        while days.contains(cursor) {
            streak += 1
            cursor = DayStamp.adding(days: -1, to: cursor)
        }

        let monday = DayStamp.weekStart(of: today)
        let week: [WeekDayState] = (0..<7).map { offset in
            let day = DayStamp.adding(days: offset, to: monday)
            if days.contains(day) { return .completed }
            if day == today { return .pending }
            return day > today ? .future : .missed
        }

        return StreakStatus(
            streak: streak,
            todayCompleted: todayCompleted,
            todayReviewed: reviewed,
            effectiveGoal: effectiveGoal,
            remaining: todayCompleted ? 0 : max(0, effectiveGoal - reviewed),
            week: week
        )
    }

    public static func recordReview(
        _ record: StreakRecord,
        id: String,
        reviewableCount: Int,
        today: String,
        now: Double
    ) -> StreakRecord {
        var next = record
        var progress = progress(of: record, on: today)
        if !progress.reviewedIds.contains(id) {
            progress.reviewedIds.append(id)
        }
        next.today = progress
        next.updatedAt = now
        return evaluate(next, reviewableCount: reviewableCount, today: today)
    }

    public static func setGoal(
        _ record: StreakRecord,
        goal: Int,
        reviewableCount: Int,
        today: String,
        now: Double
    ) -> StreakRecord {
        var next = record
        next.goal = min(max(goal, StreakRecord.goalRange.lowerBound), StreakRecord.goalRange.upperBound)
        next.updatedAt = now
        return evaluate(next, reviewableCount: reviewableCount, today: today)
    }

    public static func merge(_ lhs: StreakRecord, _ rhs: StreakRecord) -> StreakRecord {
        let newer = rhs.updatedAt > lhs.updatedAt ? rhs : lhs
        let today: DayProgress
        if lhs.today.date == rhs.today.date {
            var ids = lhs.today.reviewedIds
            for id in rhs.today.reviewedIds where !ids.contains(id) {
                ids.append(id)
            }
            today = DayProgress(date: lhs.today.date, reviewedIds: ids)
        } else {
            today = lhs.today.date > rhs.today.date ? lhs.today : rhs.today
        }
        return StreakRecord(
            version: StreakRecord.currentVersion,
            goal: newer.goal,
            completedDays: normalizedDays(lhs.completedDays + rhs.completedDays),
            today: today,
            updatedAt: max(lhs.updatedAt, rhs.updatedAt)
        )
    }

    public static func reminderBody(for status: StreakStatus) -> String? {
        guard status.hasTask, !status.todayCompleted else { return nil }
        if status.streak > 0 {
            return "连续 \(status.streak) 天，今天还差 \(status.remaining) 张，别断了"
        }
        return "今天还差 \(status.remaining) 张，开始你的连胜"
    }

    private static func progress(of record: StreakRecord, on today: String) -> DayProgress {
        record.today.date == today ? record.today : DayProgress(date: today, reviewedIds: [])
    }

    private static func evaluate(_ record: StreakRecord, reviewableCount: Int, today: String) -> StreakRecord {
        var next = record
        let goal = min(next.goal, reviewableCount)
        let reviewed = progress(of: next, on: today).reviewedIds.count
        var days = next.completedDays
        if goal > 0, reviewed >= goal, !days.contains(today) {
            days.append(today)
        }
        next.completedDays = normalizedDays(days)
        return next
    }

    private static func normalizedDays(_ days: [String]) -> [String] {
        Array(Set(days).sorted().suffix(StreakRecord.maxStoredDays))
    }
}

/// Snapshot the app publishes into the App Group for the widget extension.
public struct StreakSharedState: Codable, Equatable {
    public static let appGroupID = "group.com.xxg.Flipword"
    public static let defaultsKey = "glossx.streak.shared"
    public static let keyValueStoreKey = "glossx.streak.v1"
    public static let widgetKind = "GlossXStreakWidget"
    public static let reviewURL = URL(string: "glossx://review")!

    public var record: StreakRecord
    public var reviewableCount: Int

    public init(record: StreakRecord, reviewableCount: Int) {
        self.record = record
        self.reviewableCount = reviewableCount
    }

    public static var sharedDefaults: UserDefaults {
        UserDefaults(suiteName: appGroupID) ?? .standard
    }

    public static func load(from defaults: UserDefaults) -> StreakSharedState? {
        guard let data = defaults.data(forKey: defaultsKey) else { return nil }
        return try? JSONDecoder().decode(StreakSharedState.self, from: data)
    }

    public func save(to defaults: UserDefaults) {
        guard let data = try? JSONEncoder().encode(self) else { return }
        defaults.set(data, forKey: Self.defaultsKey)
    }
}
