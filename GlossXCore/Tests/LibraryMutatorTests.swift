import XCTest
@testable import GlossXCore

final class LibraryMutatorTests: XCTestCase {
    let now: Double = 1_700_000_000_000

    func testApplyGradeWritesReviewFieldsAndIncrementsStats() {
        var snapshot = SnapshotCodec.empty(now: now)
        snapshot.payload.vocabItems["hello"] = [
            "id": "hello",
            "word": "hello",
            "status": "new",
            "easeFactor": 2.5,
            "interval": 0,
            "repetitions": 0,
            "nextReviewAt": now,
            "addedAt": now
        ]
        snapshot.payload.stats = [
            "date": "2023-11-13",
            "vocabReviewedToday": 0,
            "streak": 2,
            "lastActiveDate": "2023-11-13"
        ]

        let next = LibraryMutator.applyGrade(
            to: snapshot,
            id: "hello",
            grade: .remembered,
            now: now,
            today: "2023-11-14"
        )

        XCTAssertEqual(JSONValue.int(next.payload.vocabItems["hello"]?["repetitions"]), 1)
        XCTAssertEqual(JSONValue.string(next.payload.vocabItems["hello"]?["status"]), "learning")
        XCTAssertEqual(JSONValue.double(next.payload.vocabItems["hello"]?["reviewedAt"]), now)
        XCTAssertEqual(JSONValue.int(next.payload.stats["vocabReviewedToday"]), 1)
        XCTAssertEqual(JSONValue.int(next.payload.stats["streak"]), 3)
        XCTAssertEqual(JSONValue.string(next.payload.stats["lastActiveDate"]), "2023-11-14")
        XCTAssertEqual(next.updatedAt, now)
    }

    func testMarkFamiliarUpdatesSnippetOnly() {
        var snapshot = SnapshotCodec.empty(now: now)
        snapshot.payload.snippetItems["s1"] = [
            "id": "s1",
            "text": "A long sentence.",
            "type": "sentence",
            "status": "new"
        ]

        let next = LibraryMutator.markFamiliar(in: snapshot, id: "s1", now: now)
        XCTAssertEqual(JSONValue.string(next.payload.snippetItems["s1"]?["status"]), "familiar")
        XCTAssertEqual(JSONValue.double(next.payload.snippetItems["s1"]?["familiarAt"]), now)
    }

    func testDeleteRemovesItemAndWritesTombstone() {
        var snapshot = SnapshotCodec.empty(now: 0)
        snapshot.payload.vocabItems["hello"] = ["id": "hello", "word": "hello"]
        snapshot.payload.snippetItems["s1"] = ["id": "s1", "text": "take off"]

        var next = LibraryMutator.delete(in: snapshot, id: "hello", now: now)
        next = LibraryMutator.delete(in: next, id: "s1", now: now + 1)

        XCTAssertNil(next.payload.vocabItems["hello"])
        XCTAssertNil(next.payload.snippetItems["s1"])
        XCTAssertEqual(next.payload.deletedItems["vocab:hello"], now)
        XCTAssertEqual(next.payload.deletedItems["snippet:s1"], now + 1)
    }

    func testSkipAndRestore() {
        var snapshot = SnapshotCodec.empty(now: 0)
        snapshot.payload.vocabItems["hello"] = ["id": "hello", "status": "learning", "repetitions": 2]
        snapshot.payload.vocabItems["fresh"] = ["id": "fresh", "status": "new", "repetitions": 0]

        var next = LibraryMutator.setSkipped(in: snapshot, id: "hello", skipped: true, now: now)
        XCTAssertEqual(JSONValue.string(next.payload.vocabItems["hello"]?["status"]), "skipped")
        XCTAssertEqual(JSONValue.double(next.payload.vocabItems["hello"]?["skippedAt"]), now)

        next = LibraryMutator.setSkipped(in: next, id: "hello", skipped: false, now: now + 1)
        XCTAssertEqual(JSONValue.string(next.payload.vocabItems["hello"]?["status"]), "learning")

        next = LibraryMutator.setSkipped(in: next, id: "fresh", skipped: true, now: now)
        next = LibraryMutator.setSkipped(in: next, id: "fresh", skipped: false, now: now)
        XCTAssertEqual(JSONValue.string(next.payload.vocabItems["fresh"]?["status"]), "new")
    }

    func testAddWordCreatesNewCardAndClearsTombstone() throws {
        var snapshot = SnapshotCodec.empty(now: 0)
        snapshot.payload.deletedItems["vocab:serendipity"] = now - 10

        let next = try XCTUnwrap(LibraryMutator.addWord(
            to: snapshot,
            word: "  Serendipity ",
            definition: "意外发现珍宝的运气",
            example: "It was pure serendipity.",
            exampleChinese: "这纯属机缘巧合。",
            now: now
        ))

        let item = try XCTUnwrap(next.payload.vocabItems["serendipity"])
        XCTAssertEqual(JSONValue.string(item["word"]), "Serendipity")
        XCTAssertEqual(JSONValue.stringArray(item["definitions"]), ["意外发现珍宝的运气"])
        XCTAssertEqual(JSONValue.string(item["status"]), "new")
        XCTAssertEqual(JSONValue.double(item["addedAt"]), now)
        XCTAssertEqual(JSONValue.string(JSONValue.dictionary(item["usageExample"])["english"]), "It was pure serendipity.")
        XCTAssertNil(next.payload.deletedItems["vocab:serendipity"])
        XCTAssertEqual(LibraryMapper.items(from: next).first?.english, "It was pure serendipity.")
    }

    func testAddWordRejectsDuplicatesAndBlanks() {
        var snapshot = SnapshotCodec.empty(now: 0)
        snapshot.payload.vocabItems["hello"] = ["id": "hello"]
        XCTAssertNil(LibraryMutator.addWord(to: snapshot, word: "Hello", definition: "你好", example: "", exampleChinese: "", now: now))
        XCTAssertNil(LibraryMutator.addWord(to: snapshot, word: "  ", definition: "空", example: "", exampleChinese: "", now: now))
    }

    func testMarkIntroducedLeavesTheScheduleUntouched() {
        var snapshot = SnapshotCodec.empty(now: 0)
        snapshot.payload.vocabItems["hello"] = [
            "id": "hello",
            "status": "new",
            "repetitions": 0,
            "interval": 0,
            "nextReviewAt": now - 50,
            "easeFactor": 2.5
        ]

        let next = LibraryMutator.markIntroduced(in: snapshot, id: "hello", now: now)
        let item = next.payload.vocabItems["hello"]
        XCTAssertEqual(JSONValue.double(item?["introducedAt"]), now)
        XCTAssertEqual(JSONValue.double(item?["updatedAt"]), now)
        XCTAssertEqual(JSONValue.string(item?["status"]), "new")
        XCTAssertEqual(JSONValue.int(item?["repetitions"]), 0)
        XCTAssertEqual(JSONValue.int(item?["interval"]), 0)
        XCTAssertEqual(JSONValue.double(item?["nextReviewAt"]), now - 50)
        XCTAssertEqual(JSONValue.double(item?["easeFactor"]), 2.5)
    }

    func testFillDefinitionWritesCueAndDoesNotOverwrite() {
        var snapshot = SnapshotCodec.empty(now: 0)
        snapshot.payload.vocabItems["apple"] = ["id": "apple", "status": "learning", "repetitions": 2]
        snapshot.payload.vocabItems["river"] = ["id": "river", "definitions": ["河流"], "status": "new"]

        let filled = LibraryMutator.fillDefinition(
            in: snapshot,
            id: "apple",
            definition: " 苹果 ",
            phonetic: "/ˈæpl/",
            pos: "n",
            now: now
        )
        let apple = filled?.payload.vocabItems["apple"]
        XCTAssertEqual(JSONValue.stringArray(apple?["definitions"]), ["苹果"])
        XCTAssertEqual(JSONValue.string(apple?["phonetic"]), "/ˈæpl/")
        XCTAssertEqual(JSONValue.string(apple?["pos"]), "n")
        XCTAssertEqual(JSONValue.double(apple?["updatedAt"]), now)
        XCTAssertEqual(JSONValue.string(apple?["status"]), "learning")
        XCTAssertEqual(JSONValue.int(apple?["repetitions"]), 2)

        XCTAssertNil(LibraryMutator.fillDefinition(in: snapshot, id: "river", definition: "江", now: now))
        XCTAssertNil(LibraryMutator.fillDefinition(in: snapshot, id: "missing", definition: "无", now: now))
        XCTAssertNil(LibraryMutator.fillDefinition(in: snapshot, id: "apple", definition: "  ", now: now))
    }
}
