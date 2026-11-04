import XCTest
@testable import GlossXCore

final class ShareInboxTests: XCTestCase {
    func testClassifiesWordPhraseAndSentence() {
        XCTAssertEqual(ShareInbox.classify("  Process "), .word)
        XCTAssertEqual(ShareInbox.classify("take into account"), .phrase)
        XCTAssertEqual(ShareInbox.classify("We must take into account all factors."), .phrase)
    }

    func testRejectsBlankOrNonEnglish() {
        XCTAssertNil(ShareInbox.classify(" "))
        XCTAssertNil(ShareInbox.classify("a"))
        XCTAssertNil(ShareInbox.classify("你好世界"))
    }

    func testSnippetIdMatchesExtension() {
        XCTAssertEqual(ShareInbox.snippetId("take into account"), "snip_ki2c6v")
        XCTAssertEqual(ShareInbox.snippetId("We must take into account all factors."), "snip_hemo23")
    }

    func testImportAddsWordAndSnippetAndSkipsDuplicates() throws {
        var snapshot = SnapshotCodec.empty(now: 0)
        snapshot = try XCTUnwrap(LibraryMutator.importSharedText("Process", into: snapshot, now: 10))
        snapshot = try XCTUnwrap(LibraryMutator.importSharedText("take into account", into: snapshot, now: 11))
        snapshot = try XCTUnwrap(LibraryMutator.importSharedText("We must take into account all factors.", into: snapshot, now: 12))

        XCTAssertEqual(JSONValue.string(snapshot.payload.vocabItems["process"]?["source"]), "share")
        XCTAssertEqual(JSONValue.string(snapshot.payload.snippetItems["snip_ki2c6v"]?["type"]), "phrase")
        XCTAssertEqual(JSONValue.string(snapshot.payload.snippetItems["snip_hemo23"]?["type"]), "phrase")
        XCTAssertNil(LibraryMutator.importSharedText("process", into: snapshot, now: 13))
    }

    func testConsumeReadsAndDeletesInboxFiles() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        try ShareInbox.write(ShareInboxRecord(text: "hello", addedAt: 1), in: root)
        try ShareInbox.write(ShareInboxRecord(text: "take off", addedAt: 2), in: root)
        let records = try ShareInbox.consume(in: root)
        XCTAssertEqual(Set(records.map(\.text)), ["hello", "take off"])
        XCTAssertTrue(try ShareInbox.consume(in: root).isEmpty)
    }
}
