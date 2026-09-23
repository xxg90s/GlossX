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
}
