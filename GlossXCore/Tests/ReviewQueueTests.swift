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

        XCTAssertEqual(queue.newCount, 10)
        XCTAssertEqual(queue.dueCount, 20)
        XCTAssertEqual(queue.cards.count, 30)
        XCTAssertFalse(queue.cards.contains(where: { $0.id == "sentence-1" }))
        XCTAssertEqual(Set(queue.cards.filter(\.isNew).map(\.id)).count, 10)
        XCTAssertTrue(queue.cards.contains(where: { $0.id == "phrase-new" && $0.mode == .intro }))
        XCTAssertTrue(queue.cards.contains(where: { $0.id == "phrase-due" && $0.mode == .cloze }))
        XCTAssertEqual(queue.cards.first?.mode, .cloze)
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

    func testSkipsMasteredAndFamiliar() {
        let items = [
            word(id: "done", status: "mastered", addedAt: now, nextReviewAt: now, repetitions: 5),
            phrase(id: "known", status: "familiar", addedAt: now, nextReviewAt: now)
        ]
        let queue = ReviewQueue.build(from: items, now: now)
        XCTAssertTrue(queue.cards.isEmpty)
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
            target: "A long sentence used only for browsing.",
            lemma: "",
            phonetic: "",
            pos: "",
            definitions: [],
            english: "A long sentence used only for browsing.",
            chinese: "仅供浏览的长句。",
            hostname: "example.com",
            status: "new",
            addedAt: now,
            repetitions: 0,
            nextReviewAt: now
        )
    }
}
