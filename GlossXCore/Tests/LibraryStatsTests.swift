import XCTest
@testable import GlossXCore

final class LibraryStatsTests: XCTestCase {
    private let day: Double = 86_400_000

    func testCountsByStatus() {
        let items = [
            item("a", status: "new"),
            item("b", status: "learning"),
            item("c", status: "review"),
            item("d", status: "mastered"),
            item("e", status: "familiar"),
            item("f", status: "skipped")
        ]
        let stats = LibraryStats.summarize(items: items, record: .empty, today: "2026-11-04", now: 0)
        XCTAssertEqual(stats.total, 6)
        XCTAssertEqual(stats.newCount, 1)
        XCTAssertEqual(stats.learning, 2)
        XCTAssertEqual(stats.mastered, 2)
        XCTAssertEqual(stats.skipped, 1)
    }

    func testCurrentAndLongestStreak() {
        let record = StreakRecord(completedDays: [
            "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
            "2026-11-02", "2026-11-03"
        ])
        let stats = LibraryStats.summarize(items: [], record: record, today: "2026-11-04", now: 0)
        XCTAssertEqual(stats.currentStreak, 2)
        XCTAssertEqual(stats.longestStreak, 4)
        XCTAssertEqual(stats.completedDays, 6)
    }

    func testHeatmapCoversTwelveFullWeeksEndingThisWeek() {
        let record = StreakRecord(completedDays: ["2026-11-03"])
        let stats = LibraryStats.summarize(items: [], record: record, today: "2026-11-04", now: 0)
        XCTAssertEqual(stats.heatmap.count, 12 * 7)
        XCTAssertEqual(stats.heatmap.first?.date, "2026-08-17")
        XCTAssertEqual(stats.heatmap.last?.date, "2026-11-08")
        XCTAssertEqual(stats.heatmap.first { $0.date == "2026-11-03" }?.state, .completed)
        XCTAssertEqual(stats.heatmap.first { $0.date == "2026-11-04" }?.state, .pending)
        XCTAssertEqual(stats.heatmap.first { $0.date == "2026-11-05" }?.state, .future)
        XCTAssertEqual(stats.heatmap.first { $0.date == "2026-11-02" }?.state, .missed)
    }

    func testForecastBucketsUpcomingReviewsByLocalDay() {
        let now = Self.utcMillis("2026-11-04T10:00:00Z")
        let items = [
            item("overdue", status: "learning", nextReviewAt: now - day),
            item("today", status: "learning", nextReviewAt: now + 3_600_000),
            item("tomorrow", status: "review", nextReviewAt: now + day),
            item("later", status: "review", nextReviewAt: now + 10 * day),
            item("restingMastered", status: "mastered", nextReviewAt: now + 2 * day),
            item("skipped", status: "skipped", nextReviewAt: now + day),
            item("fresh", status: "new", nextReviewAt: now)
        ]
        let stats = LibraryStats.summarize(
            items: items,
            record: .empty,
            today: "2026-11-04",
            now: now,
            timeZone: TimeZone(identifier: "UTC")!
        )
        XCTAssertEqual(stats.forecast.map(\.date), (0..<7).map { DayStamp.adding(days: $0, to: "2026-11-04") })
        XCTAssertEqual(stats.forecast.map(\.count), [2, 1, 1, 0, 0, 0, 0])
    }

    private func item(_ id: String, status: String, nextReviewAt: Double = 0) -> ReviewSourceItem {
        ReviewSourceItem(
            id: id, kind: .word, target: id, lemma: "", phonetic: "", pos: "",
            definitions: [], english: "", chinese: "", hostname: "",
            status: status, addedAt: 0, repetitions: status == "new" ? 0 : 1, nextReviewAt: nextReviewAt
        )
    }

    private static func utcMillis(_ iso: String) -> Double {
        ISO8601DateFormatter().date(from: iso)!.timeIntervalSince1970 * 1000
    }
}
