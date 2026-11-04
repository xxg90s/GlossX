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

    func testForgottenCardComesBackAfterGapUntilRemembered() {
        var session = ReviewSession(cards: (0..<5).map { ReviewCard.stub(id: "c\($0)", isNew: false) })

        XCTAssertTrue(session.isFirstAttempt)
        session.advanceAfterGrade(.forgot)
        XCTAssertEqual(session.cards.map(\.id), ["c0", "c1", "c2", "c3", "c0", "c4"])

        for _ in 0..<3 { session.advanceAfterGrade(.remembered) }
        XCTAssertEqual(session.current?.id, "c0")
        XCTAssertFalse(session.isFirstAttempt)
        XCTAssertEqual(session.current?.mode, .cloze)

        session.advanceAfterGrade(.fuzzy)
        XCTAssertEqual(session.cards.last?.id, "c0")
        session.advanceAfterGrade(.remembered)
        session.advanceAfterGrade(.remembered)
        XCTAssertTrue(session.isFinished)
    }

    func testForgottenIntroCardReturnsAsRecallCard() {
        var session = ReviewSession(cards: [ReviewCard.stub(id: "fresh", isNew: true)])
        session.advanceAfterGrade(.forgot)
        XCTAssertEqual(session.current?.id, "fresh")
        XCTAssertEqual(session.current?.mode, .cloze)
        XCTAssertFalse(session.showsAnswer)
    }
}
