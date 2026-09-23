import XCTest
@testable import GlossXCore

final class ClozeTests: XCTestCase {
    func testBlanksTheTargetWordAndKeepsChinese() {
        let prompt = Cloze.make(
            english: "The government announced new policies yesterday.",
            chinese: "政府昨天宣布了新政策。",
            target: "announced"
        )

        XCTAssertEqual(prompt.before, "The government ")
        XCTAssertEqual(prompt.blank, "announced")
        XCTAssertEqual(prompt.after, " new policies yesterday.")
        XCTAssertEqual(prompt.chinese, "政府昨天宣布了新政策。")
        XCTAssertEqual(prompt.displaySentence, "The government ______ new policies yesterday.")
    }

    func testBlanksAPhraseInsideTheFullSentence() {
        let prompt = Cloze.make(
            english: "We must take into account all factors.",
            chinese: "我们必须考虑所有因素。",
            target: "take into account"
        )

        XCTAssertEqual(prompt.before, "We must ")
        XCTAssertEqual(prompt.blank, "take into account")
        XCTAssertEqual(prompt.after, " all factors.")
    }

    func testFallsBackToLemmaWhenInflectedFormIsMissing() {
        let prompt = Cloze.make(
            english: "They will announce the result tomorrow.",
            chinese: "他们明天会宣布结果。",
            target: "announced",
            lemma: "announce"
        )

        XCTAssertEqual(prompt.blank, "announce")
        XCTAssertTrue(prompt.displaySentence.contains("______"))
    }

    func testFallsBackToStandaloneBlankWhenTargetIsAbsent() {
        let prompt = Cloze.make(
            english: "No matching context.",
            chinese: "没有对应语境。",
            target: "serendipity"
        )

        XCTAssertEqual(prompt.before, "")
        XCTAssertEqual(prompt.blank, "serendipity")
        XCTAssertEqual(prompt.after, "")
        XCTAssertEqual(prompt.displaySentence, "______")
        XCTAssertEqual(prompt.chinese, "没有对应语境。")
    }
}
