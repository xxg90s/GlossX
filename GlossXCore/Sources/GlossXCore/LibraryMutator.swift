import Foundation

public enum LibraryMutator {
    public static func applyGrade(
        to snapshot: LibrarySnapshot,
        id: String,
        grade: ReviewGrade,
        now: Double,
        today: String
    ) -> LibrarySnapshot {
        var next = rolloverStats(snapshot, now: now, today: today)
        if let item = next.payload.vocabItems[id] {
            let record = SM2.apply(LibraryMapper.record(from: item, now: now), grade: grade, now: now)
            next.payload.vocabItems[id] = LibraryMapper.apply(record, to: item)
            incrementStat(&next.payload.stats, key: "vocabReviewedToday")
        } else if let item = next.payload.snippetItems[id] {
            let record = SM2.apply(LibraryMapper.record(from: item, now: now), grade: grade, now: now)
            next.payload.snippetItems[id] = LibraryMapper.apply(record, to: item)
            incrementStat(&next.payload.stats, key: "snippetReviewedToday")
        }
        next.payload.stats["lastActiveDate"] = today
        next.updatedAt = now
        return next
    }

    public static func markFamiliar(in snapshot: LibrarySnapshot, id: String, now: Double) -> LibrarySnapshot {
        var next = snapshot
        guard var item = next.payload.snippetItems[id] else { return snapshot }
        item["status"] = "familiar"
        item["familiarAt"] = now
        next.payload.snippetItems[id] = item
        next.updatedAt = now
        return next
    }

    public static func rolloverStats(_ snapshot: LibrarySnapshot, now: Double, today: String) -> LibrarySnapshot {
        var next = snapshot
        var stats = next.payload.stats
        let currentDate = JSONValue.string(stats["date"])
        if currentDate != today {
            let lastActive = JSONValue.string(stats["lastActiveDate"])
            var streak = JSONValue.int(stats["streak"])
            if lastActive == currentDate {
                streak += 1
            } else if lastActive != today {
                streak = 1
            }
            stats["date"] = today
            stats["newWords"] = 0
            stats["reviews"] = 0
            stats["vocabNewToday"] = 0
            stats["vocabReviewedToday"] = 0
            stats["snippetNewToday"] = 0
            stats["snippetReviewedToday"] = 0
            stats["streak"] = streak
        } else if JSONValue.string(stats["date"]).isEmpty {
            stats["date"] = today
        }
        next.payload.stats = stats
        next.updatedAt = now
        return next
    }

    private static func incrementStat(_ stats: inout [String: Any], key: String) {
        stats[key] = JSONValue.int(stats[key]) + 1
    }
}

public enum DayStamp {
    public static func string(fromMilliseconds ms: Double, timeZone: TimeZone = .current) -> String {
        let date = Date(timeIntervalSince1970: ms / 1000)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}
