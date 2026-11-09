import XCTest
@testable import GlossXCore

final class LexiconLookupTests: XCTestCase {
    func testPrefersEarlierCatalogAndMatchesCaseInsensitively() {
        let daily = [entry("apple", "苹果", "daily")]
        let cet4 = [entry("Apple", "苹果公司", "cet4"), entry("river", "河", "cet4")]

        let match = LexiconLookup.find(word: " apple ", in: [daily, cet4])
        XCTAssertEqual(match?.zh, "苹果")
        XCTAssertEqual(match?.lexicon, "daily")
        XCTAssertEqual(LexiconLookup.find(word: "RIVER", in: [daily, cet4])?.zh, "河")
    }

    func testMissesPartialAndEmptyWords() {
        let catalog = [entry("apple", "苹果", "daily")]
        XCTAssertNil(LexiconLookup.find(word: "app", in: [catalog]))
        XCTAssertNil(LexiconLookup.find(word: "  ", in: [catalog]))
        XCTAssertNil(LexiconLookup.find(word: "apple", in: []))
    }

    private func entry(_ en: String, _ zh: String, _ lexicon: String) -> StarterPack.Entry {
        let data = Data("{\"en\":\"\(en)\",\"zh\":\"\(zh)\",\"pos\":\"n\",\"phonetic\":\"/x/\",\"lexicon\":\"\(lexicon)\"}".utf8)
        return try! JSONDecoder().decode(StarterPack.Entry.self, from: data)
    }
}
