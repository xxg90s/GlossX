import XCTest
@testable import GlossXCore

final class LibraryMapperTests: XCTestCase {
    private let paragraphEnglish = "We must take into account all factors. Then we can decide what to do next."
    private let paragraphChinese = "我们必须考虑所有因素。然后我们才能决定下一步做什么。"

    func testPhraseUsesItsOwnTranslation() {
        let item = LibraryMapper.snippetItem(id: "s1", json: [
            "type": "phrase",
            "text": "take into account",
            "translation": "考虑",
            "context": ["fullEnglish": paragraphEnglish, "fullChinese": paragraphChinese]
        ])

        XCTAssertEqual(item.definitions, ["考虑"])
    }

    func testPhraseWithoutTranslationDoesNotBorrowParagraphChinese() {
        let item = LibraryMapper.snippetItem(id: "s1", json: [
            "type": "phrase",
            "text": "take into account",
            "context": ["fullEnglish": paragraphEnglish, "fullChinese": paragraphChinese]
        ])

        XCTAssertEqual(item.definitions, [])
        XCTAssertEqual(item.chinese, paragraphChinese)
    }

    func testWholeSentenceSelectionFallsBackToContextChinese() {
        let item = LibraryMapper.snippetItem(id: "s1", json: [
            "type": "sentence",
            "text": paragraphEnglish,
            "context": ["fullEnglish": paragraphEnglish, "fullChinese": paragraphChinese]
        ])

        XCTAssertEqual(item.definitions, [paragraphChinese])
    }

    func testVocabIntroducedAtRoundTrips() {
        let item = LibraryMapper.vocabItem(id: "apple", json: [
            "word": "apple",
            "definitions": ["苹果"],
            "introducedAt": 42
        ])
        XCTAssertEqual(item.introducedAt, 42)
    }

    func testExcerptStaysOutOfPhraseAndSentenceKinds() {
        let item = LibraryMapper.snippetItem(id: "s1", json: [
            "type": "excerpt",
            "text": "reviewed every proposal before publishing the final written decision yesterday evening",
            "translation": "审议了每项提案",
            "context": ["fullEnglish": paragraphEnglish, "fullChinese": paragraphChinese]
        ])

        XCTAssertEqual(item.introducedAt, 0)
        XCTAssertEqual(item.kind, .excerpt)
        XCTAssertEqual(item.definitions, ["审议了每项提案"])
    }
}
