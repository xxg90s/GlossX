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

    public static func delete(in snapshot: LibrarySnapshot, id: String, now: Double) -> LibrarySnapshot {
        var next = snapshot
        if next.payload.vocabItems.removeValue(forKey: id) != nil {
            next.payload.deletedItems[TombstoneKey.vocab(id)] = now
        } else if next.payload.snippetItems.removeValue(forKey: id) != nil {
            next.payload.deletedItems[TombstoneKey.snippet(id)] = now
        } else {
            return snapshot
        }
        next.updatedAt = now
        return next
    }

    /// Skipped cards leave review; restoring puts them back where their progress left off.
    public static func setSkipped(in snapshot: LibrarySnapshot, id: String, skipped: Bool, now: Double) -> LibrarySnapshot {
        var next = snapshot
        let update: (inout [String: Any]) -> Void = { item in
            if skipped {
                item["status"] = "skipped"
            } else {
                item["status"] = JSONValue.int(item["repetitions"]) > 0 ? "learning" : "new"
            }
            item["skippedAt"] = now
        }
        if var item = next.payload.vocabItems[id] {
            update(&item)
            next.payload.vocabItems[id] = item
        } else if var item = next.payload.snippetItems[id] {
            update(&item)
            next.payload.snippetItems[id] = item
        } else {
            return snapshot
        }
        next.updatedAt = now
        return next
    }

    /// Adds a word typed on the phone, shaped like the extension's vocab records. Nil for blanks or duplicates.
    public static func addWord(
        to snapshot: LibrarySnapshot,
        word rawWord: String,
        definition: String,
        example: String,
        exampleChinese: String,
        phonetic: String = "",
        pos: String = "",
        source: String = "ios",
        now: Double
    ) -> LibrarySnapshot? {
        let word = rawWord.trimmingCharacters(in: .whitespacesAndNewlines)
        let id = word.lowercased()
        guard !id.isEmpty, snapshot.payload.vocabItems[id] == nil else { return nil }
        let definitionText = definition.trimmingCharacters(in: .whitespacesAndNewlines)
        let english = example.trimmingCharacters(in: .whitespacesAndNewlines)
        let chinese = exampleChinese.trimmingCharacters(in: .whitespacesAndNewlines)
        let usage: Any = english.isEmpty ? NSNull() : ["english": english, "chinese": chinese]
        var next = snapshot
        next.payload.vocabItems[id] = [
            "id": id,
            "word": word,
            "lemma": "",
            "phonetic": phonetic,
            "pos": pos,
            "definitions": definitionText.isEmpty ? [] : [definitionText],
            "usageExample": usage,
            "extraExample": usage,
            "exampleFromContext": NSNull(),
            "status": "new",
            "addedAt": now,
            "updatedAt": now,
            "easeFactor": 2.5,
            "interval": 0,
            "repetitions": 0,
            "nextReviewAt": now,
            "source": source
        ]
        next.payload.deletedItems.removeValue(forKey: TombstoneKey.vocab(id))
        next.updatedAt = now
        return next
    }

    /// Imports selected text from the share inbox. Nil when the text is invalid or already collected.
    public static func importSharedText(_ raw: String, into snapshot: LibrarySnapshot, now: Double) -> LibrarySnapshot? {
        switch ShareInbox.classify(raw) {
        case .word:
            return addWord(
                to: snapshot,
                word: ShareInbox.normalize(raw),
                definition: "",
                example: "",
                exampleChinese: "",
                source: "share",
                now: now
            )
        case .phrase, .sentence:
            return addSnippet(to: snapshot, text: ShareInbox.normalize(raw), type: "phrase", now: now)
        case .excerpt, nil:
            return nil
        }
    }

    public static func addSnippet(
        to snapshot: LibrarySnapshot,
        text: String,
        type: String,
        now: Double
    ) -> LibrarySnapshot? {
        let normalized = ShareInbox.normalize(text)
        let id = ShareInbox.snippetId(normalized)
        guard !normalized.isEmpty, snapshot.payload.snippetItems[id] == nil else { return nil }
        var record: [String: Any] = [
            "id": id,
            "text": normalized,
            "type": type,
            "translation": "",
            "context": [
                "hostname": ShareInbox.hostname,
                "fullEnglish": normalized,
                "fullChinese": "",
                "pageUrl": ""
            ],
            "status": "new",
            "addedAt": now,
            "updatedAt": now,
            "source": "share"
        ]
        if type == "phrase" {
            record["easeFactor"] = 2.5
            record["interval"] = 0
            record["repetitions"] = 0
            record["nextReviewAt"] = now
        }
        var next = snapshot
        next.payload.snippetItems[id] = record
        next.payload.deletedItems.removeValue(forKey: TombstoneKey.snippet(id))
        next.updatedAt = now
        return next
    }

    /// Sets the review example for a word. Nil when the id is not a vocab item or the English is blank.
    public static func setExtraExample(
        in snapshot: LibrarySnapshot,
        id: String,
        english rawEnglish: String,
        chinese rawChinese: String,
        now: Double
    ) -> LibrarySnapshot? {
        let english = rawEnglish.trimmingCharacters(in: .whitespacesAndNewlines)
        let chinese = rawChinese.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !english.isEmpty, var item = snapshot.payload.vocabItems[id] else { return nil }
        var next = snapshot
        item["extraExample"] = ["english": english, "chinese": chinese]
        item["updatedAt"] = now
        next.payload.vocabItems[id] = item
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

    public static func string(from date: Date, timeZone: TimeZone = .current) -> String {
        string(fromMilliseconds: date.timeIntervalSince1970 * 1000, timeZone: timeZone)
    }

    /// Calendar-day arithmetic on `yyyy-MM-dd` strings; independent of the device time zone.
    public static func adding(days: Int, to day: String) -> String {
        guard let date = utcDate(from: day),
              let shifted = utcCalendar.date(byAdding: .day, value: days, to: date) else {
            return day
        }
        return string(from: shifted, timeZone: utcCalendar.timeZone)
    }

    /// Monday of the ISO week containing `day`.
    public static func weekStart(of day: String) -> String {
        guard let date = utcDate(from: day) else { return day }
        let weekday = utcCalendar.component(.weekday, from: date)
        let offset = (weekday + 5) % 7
        return adding(days: -offset, to: day)
    }

    /// The next local midnight after `date`.
    public static func nextMidnight(after date: Date, calendar: Calendar = .current) -> Date {
        let start = calendar.startOfDay(for: date)
        return calendar.date(byAdding: .day, value: 1, to: start) ?? date.addingTimeInterval(86_400)
    }

    private static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    private static func utcDate(from day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return utcCalendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}
