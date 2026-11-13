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
        XCTAssertEqual(session.progressText, "还剩 2")
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
        XCTAssertFalse(session.showsGradeButtons)
        XCTAssertEqual(session.remaining, 1)
        XCTAssertEqual(session.progressText, "还剩 1")

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

    func testSpellingHidesSelfGradeButtons() {
        var spell = ReviewCard.stub(id: "c", isNew: false)
        spell.mode = .spell
        let session = ReviewSession(cards: [spell])
        XCTAssertFalse(session.showsAnswer)
        XCTAssertFalse(session.showsGradeButtons)
    }

    func testAcknowledgingIntroSchedulesSpellingWithoutGrading() {
        var session = ReviewSession(cards: [
            ReviewCard.stub(id: "fresh", isNew: true),
            ReviewCard.stub(id: "a", isNew: false),
            ReviewCard.stub(id: "b", isNew: false),
            ReviewCard.stub(id: "c", isNew: false)
        ])

        session.acknowledgeIntro()
        XCTAssertEqual(session.current?.id, "a")
        XCTAssertEqual(session.cards.map(\.id), ["fresh", "a", "b", "c", "fresh"])
        XCTAssertEqual(session.cards.last?.mode, .spell)
        XCTAssertTrue(session.isFirstAttempt)

        session.advanceAfterGrade(.remembered)
        session.advanceAfterGrade(.remembered)
        session.advanceAfterGrade(.remembered)
        XCTAssertEqual(session.current?.id, "fresh")
        XCTAssertEqual(session.current?.mode, .spell)
        XCTAssertTrue(session.isFirstAttempt)
        XCTAssertFalse(session.showsGradeButtons)
    }

    func testRecallCardRevealsOnTapThenSelfGrades() {
        var recall = ReviewCard.stub(id: "s", isNew: false)
        recall.mode = .recall
        var session = ReviewSession(cards: [recall])
        XCTAssertFalse(session.showsAnswer)
        session.handleTap()
        XCTAssertTrue(session.showsGradeButtons)
    }

    func testDropRemovesTheItemAndAnyLaterCopy() {
        var session = ReviewSession(cards: [
            ReviewCard.stub(id: "known", isNew: false),
            ReviewCard.stub(id: "next", isNew: false),
            ReviewCard.stub(id: "known", isNew: false)
        ])

        session.drop(id: "known")

        XCTAssertEqual(session.cards.map(\.id), ["next"])
        XCTAssertEqual(session.current?.id, "next")
        XCTAssertFalse(session.revealed)
    }

    func testDropOnTheRepeatedCopyFinishesWhenNothingFollows() {
        var session = ReviewSession(cards: (0..<4).map { ReviewCard.stub(id: "c\($0)", isNew: false) })
        session.advanceAfterGrade(.forgot)
        session.advanceAfterGrade(.remembered)
        session.advanceAfterGrade(.remembered)
        session.advanceAfterGrade(.remembered)
        XCTAssertEqual(session.current?.id, "c0")

        session.drop(id: "c0")

        XCTAssertTrue(session.isFinished)
        XCTAssertFalse(session.cards.contains { $0.id == "c0" })
    }

    func testDropLastCardFinishesTheSession() {
        var session = ReviewSession(cards: [ReviewCard.stub(id: "only", isNew: false)])
        session.drop(id: "only")
        XCTAssertTrue(session.isFinished)
        XCTAssertNil(session.current)
    }

    func testForgottenIntroCardReturnsAsSpelling() {
        var session = ReviewSession(cards: [ReviewCard.stub(id: "fresh", isNew: true)])
        session.advanceAfterGrade(.forgot)
        XCTAssertEqual(session.current?.id, "fresh")
        XCTAssertEqual(session.current?.mode, .spell)
        XCTAssertFalse(session.showsAnswer)
    }
}
