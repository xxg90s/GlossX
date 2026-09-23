import XCTest
@testable import GlossXCore

final class ReviewSessionTests: XCTestCase {
    func testClozeStartsHiddenAndIntroShowsAnswer() {
        let session = ReviewSession(cards: [
            ReviewCard.stub(id: "due", isNew: false),
            ReviewCard.stub(id: "fresh", isNew: true)
        ])

        XCTAssertEqual(session.remaining, 2)
        XCTAssertFalse(session.showsAnswer)
        XCTAssertFalse(session.showsGradeButtons)
        XCTAssertEqual(session.progressText, "1 / 2")
    }

    func testTapRevealsClozeThenGradeAdvances() {
        var session = ReviewSession(cards: [
            ReviewCard.stub(id: "due", isNew: false),
            ReviewCard.stub(id: "fresh", isNew: true)
        ])

        session.handleTap()
        XCTAssertTrue(session.showsAnswer)
        XCTAssertTrue(session.showsGradeButtons)
        XCTAssertEqual(session.current?.id, "due")

        session.advanceAfterGrade()
        XCTAssertEqual(session.current?.id, "fresh")
        XCTAssertTrue(session.showsAnswer)
        XCTAssertTrue(session.showsGradeButtons)
        XCTAssertEqual(session.remaining, 1)
        XCTAssertEqual(session.progressText, "2 / 2")

        session.advanceAfterGrade()
        XCTAssertTrue(session.isFinished)
        XCTAssertEqual(session.remaining, 0)
        XCTAssertNil(session.current)
    }
}
