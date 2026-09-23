import XCTest
@testable import GlossXCore

final class TodayHomeTests: XCTestCase {
    func testLoadingAndSignedOutAndEmpty() {
        XCTAssertEqual(TodayHome.state(sync: .loading, queue: .empty, streak: 0), .loading)
        XCTAssertEqual(TodayHome.state(sync: .signedOut, queue: .empty, streak: 0), .signedOut)
        XCTAssertEqual(TodayHome.state(sync: .synced(label: "刚才"), queue: .empty, streak: 3), .empty)
    }

    func testDueAndDone() {
        let due = ReviewQueue.Summary(cards: [
            ReviewCard.stub(id: "a", isNew: true),
            ReviewCard.stub(id: "b", isNew: false),
            ReviewCard.stub(id: "c", isNew: false)
        ], newCount: 1, dueCount: 2)
        XCTAssertEqual(
            TodayHome.state(sync: .synced(label: "3 分钟前"), queue: due, streak: 5),
            .due(remaining: 3, newCount: 1, reviewCount: 2, streak: 5, syncLabel: "3 分钟前")
        )

        XCTAssertEqual(
            TodayHome.state(sync: .synced(label: "刚才"), queue: due, streak: 5, remainingOverride: 0),
            .done(streak: 5, syncLabel: "刚才")
        )
    }
}
