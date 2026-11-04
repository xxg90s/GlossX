import XCTest
@testable import GlossXCore

final class SM2Tests: XCTestCase {
    let now: Double = 1_700_000_000_000

    func testForgotResetsToTomorrow() {
        var record = ReviewRecord.fresh(now: now)
        record.repetitions = 4
        record.interval = 12
        record.easeFactor = 2.6
        record.status = "review"

        let next = SM2.apply(record, grade: .forgot, now: now)

        XCTAssertEqual(next.repetitions, 0)
        XCTAssertEqual(next.interval, 1)
        XCTAssertEqual(next.status, "learning")
        XCTAssertEqual(next.nextReviewAt, now + SM2.msPerDay)
        XCTAssertEqual(next.reviewedAt, now)
        XCTAssertLessThan(next.easeFactor, record.easeFactor)
    }

    func testFuzzySchedulesAShortPass() {
        let record = ReviewRecord.fresh(now: now)
        let next = SM2.apply(record, grade: .fuzzy, now: now)

        XCTAssertEqual(next.repetitions, 1)
        XCTAssertEqual(next.interval, 1)
        XCTAssertEqual(next.status, "learning")
        XCTAssertEqual(next.nextReviewAt, now + SM2.msPerDay)
    }

    func testRememberedDoesNotMasterOnFirstReview() {
        let record = ReviewRecord.fresh(now: now)
        let next = SM2.apply(record, grade: .remembered, now: now)

        XCTAssertEqual(next.repetitions, 1)
        XCTAssertEqual(next.interval, 1)
        XCTAssertEqual(next.status, "learning")
        XCTAssertNotEqual(next.status, "mastered")
    }

    func testRememberedMastersAfterEnoughSuccessfulReps() {
        var record = ReviewRecord.fresh(now: now)
        record = SM2.apply(record, grade: .remembered, now: now)
        record = SM2.apply(record, grade: .remembered, now: record.nextReviewAt)
        record = SM2.apply(record, grade: .remembered, now: record.nextReviewAt)

        XCTAssertGreaterThanOrEqual(record.repetitions, 3)
        XCTAssertEqual(record.status, "review")

        record = SM2.apply(record, grade: .remembered, now: record.nextReviewAt)
        XCTAssertEqual(record.status, "mastered")

        let longTerm = SM2.apply(record, grade: .remembered, now: 0)
        XCTAssertEqual(longTerm.status, "mastered")
        XCTAssertGreaterThan(longTerm.interval, record.interval)

        let lapsed = SM2.apply(record, grade: .forgot, now: 0)
        XCTAssertEqual(lapsed.status, "learning")
        XCTAssertEqual(record.learnedAt, record.reviewedAt)
        XCTAssertGreaterThanOrEqual(record.interval, 21)
    }
}
