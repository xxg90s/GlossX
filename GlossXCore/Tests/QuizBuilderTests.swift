import XCTest
@testable import GlossXCore

final class QuizBuilderTests: XCTestCase {
    func testSpellGrading() {
        XCTAssertEqual(SpellCheck.grade(input: " Apple ", answer: "apple"), .remembered)
        XCTAssertEqual(SpellCheck.grade(input: "aple", answer: "apple"), .fuzzy)
        XCTAssertEqual(SpellCheck.grade(input: "appel", answer: "apple"), .forgot)
        XCTAssertEqual(SpellCheck.grade(input: "ox", answer: "on"), .forgot)
        XCTAssertEqual(SpellCheck.grade(input: "", answer: "apple"), .forgot)
    }

    func testSpellInputKeepsEnglishAndDropsChinese() {
        XCTAssertTrue(SpellInput.accepts("don't"))
        XCTAssertTrue(SpellInput.accepts("well-known"))
        XCTAssertTrue(SpellInput.accepts("café"))
        XCTAssertTrue(SpellInput.accepts(""))
        XCTAssertFalse(SpellInput.accepts("苹果"))
        XCTAssertFalse(SpellInput.accepts("app苹果"))
        XCTAssertFalse(SpellInput.accepts("123"))
        XCTAssertEqual(SpellInput.normalize("don\u{2019}t"), "don't")
    }

    func testSpellHintKeepsFirstLetter() {
        XCTAssertEqual(SpellCheck.hint(for: "apple"), "a _ _ _ _")
    }
}
