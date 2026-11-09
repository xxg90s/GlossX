import XCTest
@testable import GlossXCore

final class AIDefinitionTests: XCTestCase {
    func testParsesDefinitionPhoneticAndPos() {
        let parsed = AIDefinitionParser.parse(
            "{\"definition\":\"苹果\",\"phonetic\":\"/ˈæpl/\",\"pos\":\"n\"}",
            word: "apple"
        )
        XCTAssertEqual(parsed, AIDefinition(definition: "苹果", phonetic: "/ˈæpl/", pos: "n"))
    }

    func testRejectsEmptyJSONEchoAndNonJSON() {
        XCTAssertNil(AIDefinitionParser.parse("{\"definition\":\"\"}", word: "apple"))
        XCTAssertNil(AIDefinitionParser.parse("{\"definition\":\" Apple \"}", word: "apple"))
        XCTAssertNil(AIDefinitionParser.parse("not json", word: "apple"))
    }
}
