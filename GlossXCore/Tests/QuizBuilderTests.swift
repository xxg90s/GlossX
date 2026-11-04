import XCTest
@testable import GlossXCore

final class QuizBuilderTests: XCTestCase {
    private let pool: [ReviewSourceItem] = [
        QuizBuilderTests.item("apple", definition: "苹果"),
        QuizBuilderTests.item("river", definition: "河流"),
        QuizBuilderTests.item("cloud", definition: "云"),
        QuizBuilderTests.item("stone", definition: "石头"),
        QuizBuilderTests.item("brave", definition: "勇敢的")
    ]

    func testIntroCardsStayIntro() {
        let cards = QuizBuilder.prepare([card("apple", mode: .intro, repetitions: 0)], pool: pool)
        XCTAssertEqual(cards.first?.mode, .intro)
    }

    func testEarlyCardsBecomeChoiceWithFourDistinctOptions() {
        let prepared = QuizBuilder.prepare([card("apple", mode: .cloze, repetitions: 1)], pool: pool)[0]
        XCTAssertEqual(prepared.mode, .choice)
        XCTAssertEqual(prepared.options.count, 4)
        XCTAssertEqual(Set(prepared.options).count, 4)
        XCTAssertTrue(prepared.options.contains("苹果"))
        XCTAssertEqual(prepared.answer, "苹果")
    }

    func testChoiceIsDeterministic() {
        let a = QuizBuilder.prepare([card("apple", mode: .cloze, repetitions: 0)], pool: pool)[0]
        let b = QuizBuilder.prepare([card("apple", mode: .cloze, repetitions: 0)], pool: pool)[0]
        XCTAssertEqual(a.options, b.options)
    }

    func testSecondRepetitionWordsBecomeListen() {
        let prepared = QuizBuilder.prepare([card("apple", mode: .cloze, repetitions: 2)], pool: pool)[0]
        XCTAssertEqual(prepared.mode, .listen)
        XCTAssertEqual(prepared.options.count, 4)
    }

    func testPhrasesNeverListenOrSpell() {
        var phrase = card("take off", mode: .cloze, repetitions: 2)
        phrase.kind = .phrase
        XCTAssertEqual(QuizBuilder.prepare([phrase], pool: pool)[0].mode, .choice)
        phrase.repetitions = 5
        XCTAssertEqual(QuizBuilder.prepare([phrase], pool: pool)[0].mode, .cloze)
    }

    func testLaterWordsAlternateBetweenSpellAndCloze() {
        let modes = Set(["apple", "river", "cloud", "stone", "brave", "quiet", "light", "storm"].map {
            QuizBuilder.prepare([card($0, mode: .cloze, repetitions: 3)], pool: pool)[0].mode
        })
        XCTAssertEqual(modes, [.spell, .cloze])
    }

    func testFallsBackToClozeWithoutEnoughDistractors() {
        let small = Array(pool.prefix(3))
        XCTAssertEqual(QuizBuilder.prepare([card("apple", mode: .cloze, repetitions: 0)], pool: small)[0].mode, .cloze)
    }

    func testFallsBackToClozeWithoutDefinition() {
        var bare = card("apple", mode: .cloze, repetitions: 0)
        bare.definitions = []
        XCTAssertEqual(QuizBuilder.prepare([bare], pool: pool)[0].mode, .cloze)
    }

    func testSpellGrading() {
        XCTAssertEqual(SpellCheck.grade(input: " Apple ", answer: "apple"), .remembered)
        XCTAssertEqual(SpellCheck.grade(input: "aple", answer: "apple"), .fuzzy)
        XCTAssertEqual(SpellCheck.grade(input: "appel", answer: "apple"), .forgot)
        XCTAssertEqual(SpellCheck.grade(input: "ox", answer: "on"), .forgot)
        XCTAssertEqual(SpellCheck.grade(input: "", answer: "apple"), .forgot)
    }

    func testSpellHintKeepsFirstLetter() {
        XCTAssertEqual(SpellCheck.hint(for: "apple"), "a _ _ _ _")
    }

    private static func item(_ word: String, definition: String) -> ReviewSourceItem {
        ReviewSourceItem(
            id: word, kind: .word, target: word, lemma: "", phonetic: "", pos: "",
            definitions: [definition], english: "", chinese: "", hostname: "",
            status: "learning", addedAt: 0, repetitions: 1, nextReviewAt: 0
        )
    }

    private func card(_ id: String, mode: CardMode, repetitions: Int) -> ReviewCard {
        ReviewCard(
            id: id, kind: .word, mode: mode, target: id, lemma: "", phonetic: "", pos: "",
            definitions: [pool.first { $0.id == id }?.definitionText ?? "释义"],
            english: "", chinese: "", hostname: "", repetitions: repetitions
        )
    }
}
