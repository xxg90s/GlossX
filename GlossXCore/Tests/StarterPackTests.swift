import XCTest
@testable import GlossXCore

final class StarterPackTests: XCTestCase {
    private let json = """
    [
      {"id":"process_v","zh":"处理","en":"process","pos":"v","phonetic":"/ˈprɑːses/","lexicon":"cet4"},
      {"id":"process_n","zh":"加工","en":"process","pos":"n","phonetic":"/ˈprɑːses/","lexicon":"cet4"},
      {"id":"data_n","zh":"数据","en":"data","pos":"n","phonetic":"/ˈdeɪtə/","lexicon":"cet4"},
      {"id":"bad","zh":"","en":"","pos":"n","phonetic":"","lexicon":"cet4"},
      {"id":"system_n","zh":"系统","en":"System","pos":"n","phonetic":"/ˈsɪstəm/","lexicon":"cet4"}
    ]
    """.data(using: .utf8)!

    func testParsesAndDropsBlankEntries() {
        let entries = StarterPack.parse(json)
        XCTAssertEqual(entries.map(\.en), ["process", "process", "data", "System"])
    }

    func testImportsUniqueWordsSkippingExistingAndKeepsOrder() throws {
        var snapshot = SnapshotCodec.empty(now: 0)
        snapshot.payload.vocabItems["data"] = ["id": "data"]

        let result = StarterPack.importWords(StarterPack.parse(json), into: snapshot, limit: 5, now: 1000)

        XCTAssertEqual(result.added, 2)
        let process = try XCTUnwrap(result.snapshot.payload.vocabItems["process"])
        XCTAssertEqual(JSONValue.stringArray(process["definitions"]), ["处理"])
        XCTAssertEqual(JSONValue.string(process["pos"]), "v")
        XCTAssertEqual(JSONValue.string(process["phonetic"]), "/ˈprɑːses/")
        XCTAssertEqual(JSONValue.string(process["source"]), "starter:cet4")
        XCTAssertNotNil(result.snapshot.payload.vocabItems["system"])
        XCTAssertEqual(LibraryMapper.items(from: result.snapshot).prefix(2).map(\.id), ["process", "system"])
    }

    func testRespectsLimit() {
        let result = StarterPack.importWords(StarterPack.parse(json), into: SnapshotCodec.empty(now: 0), limit: 1, now: 1000)
        XCTAssertEqual(result.added, 1)
    }

    func testCatalogListsAllBundledLexicons() {
        XCTAssertEqual(StarterPack.lexicons.map(\.id), ["daily", "cet4", "cet6", "kaoyan", "ielts", "toefl"])
    }
}
