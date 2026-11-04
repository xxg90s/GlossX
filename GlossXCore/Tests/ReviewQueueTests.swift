import XCTest
@testable import GlossXCore

final class ReviewQueueTests: XCTestCase {
    let now: Double = 1_700_000_000_000

    func testCapsNewAndDueAndInterleavesPhrases() {
        var items: [ReviewSourceItem] = []
        for index in 0..<12 {
            items.append(word(id: "new-\(index)", status: "new", addedAt: now - Double(index) * 1000, nextReviewAt: now))
        }
        for index in 0..<25 {
            items.append(word(
                id: "due-\(index)",
                status: "learning",
                addedAt: now - 86_400_000,
                nextReviewAt: now - Double(index + 1) * 1000,
                repetitions: 1
            ))
        }
        items.append(phrase(id: "phrase-new", status: "new", addedAt: now + 1, nextReviewAt: now))
        items.append(phrase(
            id: "phrase-due",
            status: "learning",
            addedAt: now - 86_400_000,
            nextReviewAt: now - 100_000,
            repetitions: 2
        ))
        items.append(sentence(id: "sentence-1"))

        let queue = ReviewQueue.build(from: items, now: now)

        XCTAssertEqual(queue.newCount, 11)
        XCTAssertEqual(queue.dueCount, 20)
        XCTAssertEqual(queue.cards.count, 31)
        XCTAssertTrue(queue.cards.contains(where: { $0.id == "sentence-1" && $0.mode == .recall }))
        XCTAssertEqual(Set(queue.cards.filter(\.isNew).map(\.id)).count, 10)
        XCTAssertTrue(queue.cards.contains(where: { $0.id == "phrase-new" && $0.mode == .intro }))
        XCTAssertTrue(queue.cards.contains(where: { $0.id == "phrase-due" && $0.mode == .cloze }))
        XCTAssertEqual(queue.cards.first?.mode, .cloze)
    }

    func testNewSentencesAreCappedAndNeedATranslation() {
        var items = (0..<5).map { index -> ReviewSourceItem in
            var item = sentence(id: "s\(index)")
            item.addedAt = now - Double(index)
            return item
        }
        var untranslated = sentence(id: "bare")
        untranslated.chinese = ""
        items.append(untranslated)

        let queue = ReviewQueue.build(from: items, now: now)

        XCTAssertEqual(queue.cards.map(\.id), ["s0", "s1", "s2"])
        XCTAssertTrue(queue.cards.allSatisfy { $0.mode == .recall })
        XCTAssertFalse(ReviewQueue.isReviewable(untranslated, now: now))
    }

    func testIntroForUnreviewedItemsAndClozeForReviews() {
        let items = [
            word(id: "fresh", status: "new", addedAt: now, nextReviewAt: now),
            word(id: "repeat", status: "learning", addedAt: now - 1000, nextReviewAt: now, repetitions: 1)
        ]

        let cards = ReviewQueue.build(from: items, now: now).cards
        XCTAssertEqual(cards.first { $0.id == "fresh" }?.mode, .intro)
        XCTAssertEqual(cards.first { $0.id == "repeat" }?.mode, .cloze)
    }

    func testSkipsFamiliarAndMasteredThatIsNotDue() {
        let items = [
            word(id: "done", status: "mastered", addedAt: now, nextReviewAt: now + 1, repetitions: 5),
            phrase(id: "known", status: "familiar", addedAt: now, nextReviewAt: now)
        ]
        let queue = ReviewQueue.build(from: items, now: now, goal: 10)
        XCTAssertTrue(queue.cards.isEmpty)
        XCTAssertEqual(ReviewQueue.reviewableCount(in: items, now: now), 0)
    }

    func testDueMasteredCardsReturnForLongTermReview() {
        let items = [
            word(id: "done", status: "mastered", addedAt: now, nextReviewAt: now - 1, repetitions: 5)
        ]
        let queue = ReviewQueue.build(from: items, now: now)
        XCTAssertEqual(queue.cards.map(\.id), ["done"])
        XCTAssertEqual(queue.cards.first?.mode, .cloze)
        XCTAssertEqual(queue.dueCount, 1)
        XCTAssertEqual(ReviewQueue.reviewableCount(in: items, now: now), 1)
    }

    func testPadsToGoalWithEarliestUpcomingThenExtraNewCards() {
        var items: [ReviewSourceItem] = [
            word(id: "due", status: "learning", addedAt: now - 5000, nextReviewAt: now - 1, repetitions: 1),
            word(id: "later", status: "review", addedAt: now - 5000, nextReviewAt: now + 3 * 86_400_000, repetitions: 3),
            word(id: "soon", status: "learning", addedAt: now - 5000, nextReviewAt: now + 86_400_000, repetitions: 1)
        ]
        for index in 0..<12 {
            items.append(word(id: "new-\(index)", status: "new", addedAt: now - Double(index) * 1000, nextReviewAt: now))
        }

        let queue = ReviewQueue.build(from: items, now: now, goal: 14)
        let ids = queue.cards.map(\.id)

        XCTAssertEqual(queue.cards.count, 14)
        XCTAssertEqual(Array(ids.suffix(3)), ["soon", "later", "new-10"])
        XCTAssertEqual(queue.cards.first { $0.id == "soon" }?.mode, .cloze)
        XCTAssertEqual(queue.cards.first { $0.id == "new-10" }?.mode, .intro)
        XCTAssertEqual(queue.newCount, 11)
        XCTAssertEqual(queue.dueCount, 3)
    }

    func testPaddingSkipsCardsReviewedToday() {
        let items = [
            word(id: "reviewed", status: "learning", addedAt: now, nextReviewAt: now + 1000, repetitions: 1),
            word(id: "upcoming", status: "learning", addedAt: now, nextReviewAt: now + 2000, repetitions: 1)
        ]

        let queue = ReviewQueue.build(from: items, now: now, goal: 5, excludedIds: ["reviewed"])
        XCTAssertEqual(queue.cards.map(\.id), ["upcoming"])
    }

    func testDoesNotTruncateWhenRegularQueueExceedsGoal() {
        let items = (0..<8).map { index in
            word(id: "due-\(index)", status: "learning", addedAt: now, nextReviewAt: now - Double(index + 1), repetitions: 1)
        }
        XCTAssertEqual(ReviewQueue.build(from: items, now: now, goal: 3).cards.count, 8)
    }

    func testReviewableCountExcludesBrowsingOnlyItemsButKeepsTodaysReviews() {
        let items = [
            word(id: "a", status: "new", addedAt: now, nextReviewAt: now),
            word(id: "b", status: "mastered", addedAt: now, nextReviewAt: now + 1, repetitions: 5),
            word(id: "c", status: "mastered", addedAt: now, nextReviewAt: now + 1, repetitions: 5),
            sentence(id: "s")
        ]
        XCTAssertEqual(ReviewQueue.reviewableCount(in: items, now: now), 2)
        XCTAssertEqual(ReviewQueue.reviewableCount(in: items, includingReviewed: ["b", "missing"], now: now), 3)
    }

    private func word(
        id: String,
        status: String,
        addedAt: Double,
        nextReviewAt: Double,
        repetitions: Int = 0
    ) -> ReviewSourceItem {
        ReviewSourceItem(
            id: id,
            kind: .word,
            target: id,
            lemma: "",
            phonetic: "",
            pos: "v",
            definitions: ["测试"],
            english: "Please remember \(id) today.",
            chinese: "请记住这个词。",
            hostname: "example.com",
            status: status,
            addedAt: addedAt,
            repetitions: repetitions,
            nextReviewAt: nextReviewAt
        )
    }

    private func phrase(
        id: String,
        status: String,
        addedAt: Double,
        nextReviewAt: Double,
        repetitions: Int = 0
    ) -> ReviewSourceItem {
        ReviewSourceItem(
            id: id,
            kind: .phrase,
            target: "take into account",
            lemma: "",
            phonetic: "",
            pos: "",
            definitions: ["考虑"],
            english: "We must take into account all factors.",
            chinese: "我们必须考虑所有因素。",
            hostname: "example.com",
            status: status,
            addedAt: addedAt,
            repetitions: repetitions,
            nextReviewAt: nextReviewAt
        )
    }

    private func sentence(id: String) -> ReviewSourceItem {
        ReviewSourceItem(
            id: id,
            kind: .sentence,
            target: "A long sentence worth recalling.",
            lemma: "",
            phonetic: "",
            pos: "",
            definitions: [],
            english: "A long sentence worth recalling.",
            chinese: "一个值得回想的长句。",
            hostname: "example.com",
            status: "new",
            addedAt: now,
            repetitions: 0,
            nextReviewAt: now
        )
    }
}
