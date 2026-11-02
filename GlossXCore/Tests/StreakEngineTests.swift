import XCTest
@testable import GlossXCore

final class StreakEngineTests: XCTestCase {
    private let now: Double = 1_793_520_000_000

    private func record(
        goal: Int = 10,
        days: [String] = [],
        todayDate: String = "",
        reviewed: [String] = [],
        updatedAt: Double = 0
    ) -> StreakRecord {
        StreakRecord(
            goal: goal,
            completedDays: days,
            today: DayProgress(date: todayDate, reviewedIds: reviewed),
            updatedAt: updatedAt
        )
    }

    private func review(_ start: StreakRecord, ids: [String], reviewable: Int = 100, today: String) -> StreakRecord {
        ids.reduce(start) { partial, id in
            StreakEngine.recordReview(partial, id: id, reviewableCount: reviewable, today: today, now: now)
        }
    }

    // MARK: - Day arithmetic

    func testDayStampArithmeticCrossesMonthAndYear() {
        XCTAssertEqual(DayStamp.adding(days: 1, to: "2026-12-31"), "2027-01-01")
        XCTAssertEqual(DayStamp.adding(days: -1, to: "2026-03-01"), "2026-02-28")
        XCTAssertEqual(DayStamp.weekStart(of: "2026-11-02"), "2026-11-02")
        XCTAssertEqual(DayStamp.weekStart(of: "2026-11-08"), "2026-11-02")
    }

    // MARK: - Completion

    func testStreakIncrementsImmediatelyWhenGoalReached() {
        let start = record(days: ["2026-11-01"])
        let nine = review(start, ids: (1...9).map { "c\($0)" }, today: "2026-11-02")
        var status = StreakEngine.status(nine, reviewableCount: 100, today: "2026-11-02")
        XCTAssertFalse(status.todayCompleted)
        XCTAssertEqual(status.streak, 1)
        XCTAssertEqual(status.remaining, 1)

        let ten = review(nine, ids: ["c10"], today: "2026-11-02")
        status = StreakEngine.status(ten, reviewableCount: 100, today: "2026-11-02")
        XCTAssertTrue(status.todayCompleted)
        XCTAssertEqual(status.streak, 2)
        XCTAssertEqual(status.remaining, 0)
    }

    func testDuplicateReviewsCountOnce() {
        let reviewed = review(record(), ids: ["a", "a", "b", "a"], today: "2026-11-02")
        let status = StreakEngine.status(reviewed, reviewableCount: 100, today: "2026-11-02")
        XCTAssertEqual(status.todayReviewed, 2)
    }

    func testGoalShrinksToReviewableCount() {
        let reviewed = review(record(), ids: ["a", "b", "c"], reviewable: 3, today: "2026-11-02")
        let status = StreakEngine.status(reviewed, reviewableCount: 3, today: "2026-11-02")
        XCTAssertEqual(status.effectiveGoal, 3)
        XCTAssertTrue(status.todayCompleted)
        XCTAssertEqual(status.streak, 1)
    }

    func testEmptyLibraryNeverCompletes() {
        let start = record()
        let status = StreakEngine.status(start, reviewableCount: 0, today: "2026-11-02")
        XCTAssertEqual(status.effectiveGoal, 0)
        XCTAssertFalse(status.todayCompleted)
        XCTAssertEqual(status.remaining, 0)
    }

    func testRaisingGoalKeepsCompletedDay() {
        let done = review(record(goal: 5), ids: ["a", "b", "c", "d", "e"], today: "2026-11-02")
        let raised = StreakEngine.setGoal(done, goal: 20, reviewableCount: 100, today: "2026-11-02", now: now)
        let status = StreakEngine.status(raised, reviewableCount: 100, today: "2026-11-02")
        XCTAssertEqual(raised.goal, 20)
        XCTAssertTrue(status.todayCompleted)
    }

    func testLoweringGoalCompletesToday() {
        let partial = review(record(goal: 10), ids: ["a", "b", "c", "d", "e"], today: "2026-11-02")
        let lowered = StreakEngine.setGoal(partial, goal: 5, reviewableCount: 100, today: "2026-11-02", now: now)
        XCTAssertTrue(StreakEngine.status(lowered, reviewableCount: 100, today: "2026-11-02").todayCompleted)
    }

    func testGoalIsClampedToAllowedRange() {
        XCTAssertEqual(StreakEngine.setGoal(record(), goal: 1, reviewableCount: 100, today: "2026-11-02", now: now).goal, 5)
        XCTAssertEqual(StreakEngine.setGoal(record(), goal: 99, reviewableCount: 100, today: "2026-11-02", now: now).goal, 50)
    }

    // MARK: - Streak counting across days

    func testPendingTodayKeepsYesterdaysStreak() {
        let start = record(days: ["2026-10-30", "2026-10-31", "2026-11-01"])
        let status = StreakEngine.status(start, reviewableCount: 100, today: "2026-11-02")
        XCTAssertEqual(status.streak, 3)
        XCTAssertFalse(status.todayCompleted)
    }

    func testMissingAWholeDayResetsStreak() {
        let start = record(days: ["2026-10-30", "2026-10-31"])
        let status = StreakEngine.status(start, reviewableCount: 100, today: "2026-11-02")
        XCTAssertEqual(status.streak, 0)
    }

    func testProgressFromPreviousDayDoesNotCarryOver() {
        let yesterday = review(record(), ids: ["a", "b"], today: "2026-11-01")
        let status = StreakEngine.status(yesterday, reviewableCount: 100, today: "2026-11-02")
        XCTAssertEqual(status.todayReviewed, 0)
        XCTAssertEqual(status.remaining, 10)

        let today = review(yesterday, ids: ["c"], today: "2026-11-02")
        XCTAssertEqual(today.today.date, "2026-11-02")
        XCTAssertEqual(today.today.reviewedIds, ["c"])
    }

    func testWeekStatesStartOnMonday() {
        let start = record(days: ["2026-11-03", "2026-11-04"])
        let status = StreakEngine.status(start, reviewableCount: 100, today: "2026-11-05")
        XCTAssertEqual(status.week, [.missed, .completed, .completed, .pending, .future, .future, .future])
    }

    func testCompletedDaysAreTrimmedToMaxStoredDays() {
        var days: [String] = []
        var day = "2025-01-01"
        for _ in 0..<450 {
            days.append(day)
            day = DayStamp.adding(days: 1, to: day)
        }
        let trimmed = review(record(goal: 5, days: days), ids: ["a"], today: day)
        XCTAssertEqual(trimmed.completedDays.count, StreakRecord.maxStoredDays)
        XCTAssertEqual(trimmed.completedDays.last, days.last)
    }

    // MARK: - Merge

    func testMergeUnionsDaysAndSameDayProgress() {
        let phone = record(goal: 10, days: ["2026-10-31"], todayDate: "2026-11-02", reviewed: ["a", "b"], updatedAt: 100)
        let pad = record(goal: 15, days: ["2026-11-01"], todayDate: "2026-11-02", reviewed: ["b", "c"], updatedAt: 200)
        let merged = StreakEngine.merge(phone, pad)
        XCTAssertEqual(merged.completedDays, ["2026-10-31", "2026-11-01"])
        XCTAssertEqual(merged.today.reviewedIds, ["a", "b", "c"])
        XCTAssertEqual(merged.goal, 15)
        XCTAssertEqual(merged.updatedAt, 200)
    }

    func testMergeKeepsNewerDayProgress() {
        let old = record(todayDate: "2026-11-01", reviewed: ["a"], updatedAt: 300)
        let fresh = record(todayDate: "2026-11-02", reviewed: ["b"], updatedAt: 100)
        XCTAssertEqual(StreakEngine.merge(old, fresh).today, DayProgress(date: "2026-11-02", reviewedIds: ["b"]))
        XCTAssertEqual(StreakEngine.merge(fresh, old).today, DayProgress(date: "2026-11-02", reviewedIds: ["b"]))
    }

    // MARK: - Reminder copy

    func testReminderBody() {
        let pending = StreakEngine.status(record(days: ["2026-11-01"]), reviewableCount: 100, today: "2026-11-02")
        XCTAssertEqual(StreakEngine.reminderBody(for: pending), "连续 1 天，今天还差 10 张，别断了")

        let fresh = StreakEngine.status(record(), reviewableCount: 100, today: "2026-11-02")
        XCTAssertEqual(StreakEngine.reminderBody(for: fresh), "今天还差 10 张，开始你的连胜")

        let done = review(record(goal: 5), ids: ["a", "b", "c", "d", "e"], today: "2026-11-02")
        XCTAssertNil(StreakEngine.reminderBody(for: StreakEngine.status(done, reviewableCount: 100, today: "2026-11-02")))

        let empty = StreakEngine.status(record(), reviewableCount: 0, today: "2026-11-02")
        XCTAssertNil(StreakEngine.reminderBody(for: empty))
    }

    // MARK: - Shared state

    func testSharedStateRoundTripsThroughUserDefaults() throws {
        let suite = "glossx.streak.tests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        XCTAssertNil(StreakSharedState.load(from: defaults))
        let state = StreakSharedState(record: record(days: ["2026-11-01"]), reviewableCount: 42)
        state.save(to: defaults)
        XCTAssertEqual(StreakSharedState.load(from: defaults), state)
    }

    func testRecordDecodesFromKeyValueData() throws {
        let original = record(goal: 12, days: ["2026-11-01"], todayDate: "2026-11-02", reviewed: ["x"], updatedAt: 5)
        let data = try XCTUnwrap(original.encoded())
        XCTAssertEqual(StreakRecord.decode(data), original)
        XCTAssertNil(StreakRecord.decode(Data("garbage".utf8)))
    }
}
