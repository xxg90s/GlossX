import XCTest
@testable import GlossXCore

final class SnapshotMergeTests: XCTestCase {
    func testKeepsCloudContentAndNewerReviewProgress() {
        let cloud = snapshot(
            vocab: [
                "hello": vocabJSON("hello", word: "hello", definitions: ["你好"], repetitions: 0, reviewedAt: 0, nextReviewAt: 100),
                "only-cloud": vocabJSON("only-cloud", word: "cloud", definitions: ["云"], repetitions: 0, reviewedAt: 0, nextReviewAt: 50)
            ],
            snippets: [
                "p1": snippetJSON("p1", text: "take into account", repetitions: 1, reviewedAt: 0, nextReviewAt: 200)
            ],
            settings: ["pronunciation": "uk"],
            updatedAt: 100
        )
        let local = snapshot(
            vocab: [
                "hello": vocabJSON("hello", word: "hello", definitions: ["旧"], repetitions: 2, reviewedAt: 300, nextReviewAt: 400),
                "only-local": vocabJSON("only-local", word: "local", definitions: ["本地"], repetitions: 1, reviewedAt: 300, nextReviewAt: 400)
            ],
            snippets: [
                "p1": snippetJSON("p1", text: "take into account", repetitions: 3, reviewedAt: 500, nextReviewAt: 800)
            ],
            settings: ["pronunciation": "us"],
            updatedAt: 90
        )

        let merged = SnapshotMerge.merge(cloud: cloud, local: local, now: 900)

        XCTAssertEqual(merged.updatedAt, 900)
        XCTAssertEqual(string(merged.payload.vocabItems["hello"], "definitions"), "你好")
        XCTAssertEqual(int(merged.payload.vocabItems["hello"], "repetitions"), 2)
        XCTAssertEqual(double(merged.payload.vocabItems["hello"], "reviewedAt"), 300)
        XCTAssertEqual(merged.payload.vocabItems["only-cloud"]?["word"] as? String, "cloud")
        XCTAssertEqual(merged.payload.vocabItems["only-local"]?["word"] as? String, "local")
        XCTAssertEqual(int(merged.payload.snippetItems["p1"], "repetitions"), 3)
        XCTAssertEqual(merged.payload.settings["pronunciation"] as? String, "uk")
    }

    func testPrefersCloudReviewWhenItIsNewer() {
        let cloud = snapshot(
            vocab: [
                "hello": vocabJSON("hello", word: "hello", definitions: ["你好"], repetitions: 4, reviewedAt: 800, nextReviewAt: 900)
            ],
            snippets: [:],
            settings: [:],
            updatedAt: 800
        )
        let local = snapshot(
            vocab: [
                "hello": vocabJSON("hello", word: "hello", definitions: ["你好"], repetitions: 1, reviewedAt: 100, nextReviewAt: 200)
            ],
            snippets: [:],
            settings: [:],
            updatedAt: 100
        )

        let merged = SnapshotMerge.merge(cloud: cloud, local: local, now: 1000)
        XCTAssertEqual(int(merged.payload.vocabItems["hello"], "repetitions"), 4)
    }

    func testTombstoneRemovesItemOnEitherSide() {
        var hello = vocabJSON("hello", word: "hello", definitions: ["你好"], repetitions: 1, reviewedAt: 300, nextReviewAt: 400)
        hello["addedAt"] = 100.0
        let cloud = snapshot(vocab: [:], snippets: [:], settings: [:], updatedAt: 500, deleted: ["vocab:hello": 200])
        let local = snapshot(vocab: ["hello": hello], snippets: [:], settings: [:], updatedAt: 400)

        let merged = SnapshotMerge.merge(cloud: cloud, local: local, now: 1000)

        XCTAssertNil(merged.payload.vocabItems["hello"])
        XCTAssertEqual(merged.payload.deletedItems["vocab:hello"], 200)
    }

    func testRecollectedItemSurvivesOlderTombstone() {
        var hello = vocabJSON("hello", word: "hello", definitions: ["你好"], repetitions: 0, reviewedAt: 0, nextReviewAt: 400)
        hello["addedAt"] = 300.0
        let cloud = snapshot(vocab: ["hello": hello], snippets: [:], settings: [:], updatedAt: 500)
        let local = snapshot(vocab: [:], snippets: [:], settings: [:], updatedAt: 400, deleted: ["vocab:hello": 200])

        let merged = SnapshotMerge.merge(cloud: cloud, local: local, now: 1000)

        XCTAssertNotNil(merged.payload.vocabItems["hello"])
    }

    func testPrunesTombstonesOlderThanRetention() {
        let now = SnapshotMerge.tombstoneRetention + 10_000
        let cloud = snapshot(vocab: [:], snippets: [:], settings: [:], updatedAt: 1, deleted: ["vocab:old": 1, "snippet:new": now - 5])
        let local = snapshot(vocab: [:], snippets: [:], settings: [:], updatedAt: 1)

        let merged = SnapshotMerge.merge(cloud: cloud, local: local, now: now)

        XCTAssertNil(merged.payload.deletedItems["vocab:old"])
        XCTAssertEqual(merged.payload.deletedItems["snippet:new"], now - 5)
    }

    func testNewerContentWinsIndependentlyOfReviewProgress() {
        var cloudItem = vocabJSON("hello", word: "hello", definitions: ["旧释义"], repetitions: 5, reviewedAt: 900, nextReviewAt: 2000)
        cloudItem["updatedAt"] = 100.0
        var localItem = vocabJSON("hello", word: "hello", definitions: ["新释义"], repetitions: 1, reviewedAt: 100, nextReviewAt: 200)
        localItem["updatedAt"] = 800.0
        let cloud = snapshot(vocab: ["hello": cloudItem], snippets: [:], settings: [:], updatedAt: 900)
        let local = snapshot(vocab: ["hello": localItem], snippets: [:], settings: [:], updatedAt: 800)

        let merged = SnapshotMerge.merge(cloud: cloud, local: local, now: 1000)

        XCTAssertEqual(string(merged.payload.vocabItems["hello"], "definitions"), "新释义")
        XCTAssertEqual(int(merged.payload.vocabItems["hello"], "repetitions"), 5)
    }

    func testNewerSkipOrFamiliarWinsOverOlderReview() {
        var cloudItem = vocabJSON("hello", word: "hello", definitions: ["你好"], repetitions: 2, reviewedAt: 100, nextReviewAt: 200)
        cloudItem["status"] = "skipped"
        cloudItem["skippedAt"] = 500.0
        let localItem = vocabJSON("hello", word: "hello", definitions: ["你好"], repetitions: 2, reviewedAt: 300, nextReviewAt: 400)
        let cloud = snapshot(vocab: ["hello": cloudItem], snippets: [:], settings: [:], updatedAt: 500)
        let local = snapshot(vocab: ["hello": localItem], snippets: [:], settings: [:], updatedAt: 300)

        let merged = SnapshotMerge.merge(cloud: cloud, local: local, now: 1000)

        XCTAssertEqual(merged.payload.vocabItems["hello"]?["status"] as? String, "skipped")
    }

    func testMetaKeysFollowMetaUpdatedAtNotSnapshotTime() {
        var cloud = snapshot(vocab: [:], snippets: [:], settings: ["pronunciation": "uk"], updatedAt: 900)
        cloud.metaUpdatedAt = 100
        var local = snapshot(vocab: [:], snippets: [:], settings: ["pronunciation": "us"], updatedAt: 200)
        local.metaUpdatedAt = 300

        let merged = SnapshotMerge.merge(cloud: cloud, local: local, now: 1000)

        XCTAssertEqual(merged.payload.settings["pronunciation"] as? String, "us")
        XCTAssertEqual(merged.metaUpdatedAt, 300)
    }

    func testEmptyMetaSideFallsBackToOther() {
        var cloud = snapshot(vocab: [:], snippets: [:], settings: [:], updatedAt: 900)
        cloud.metaUpdatedAt = 500
        var local = snapshot(vocab: [:], snippets: [:], settings: ["pronunciation": "us"], updatedAt: 200)
        local.metaUpdatedAt = 100

        let merged = SnapshotMerge.merge(cloud: cloud, local: local, now: 1000)

        XCTAssertEqual(merged.payload.settings["pronunciation"] as? String, "us")
    }

    func testStatsTakeNewerDateOrMaxCounters() {
        XCTAssertEqual(
            JSONValue.string(SnapshotMerge.mergeStats(
                cloud: ["date": "2026-11-03", "vocabReviewedToday": 9],
                local: ["date": "2026-11-04", "vocabReviewedToday": 2]
            )["date"]),
            "2026-11-04"
        )
        let same = SnapshotMerge.mergeStats(
            cloud: ["date": "2026-11-04", "vocabReviewedToday": 3, "snippetReviewedToday": 1],
            local: ["date": "2026-11-04", "vocabReviewedToday": 5, "snippetReviewedToday": 0]
        )
        XCTAssertEqual(JSONValue.int(same["vocabReviewedToday"]), 5)
        XCTAssertEqual(JSONValue.int(same["snippetReviewedToday"]), 1)
    }

    func testCodecRoundTripsTombstonesAndMetaTime() throws {
        var source = snapshot(vocab: [:], snippets: [:], settings: [:], updatedAt: 10, deleted: ["vocab:a": 5])
        source.metaUpdatedAt = 7
        let decoded = try SnapshotCodec.decode(SnapshotCodec.encode(source))
        XCTAssertEqual(decoded.payload.deletedItems["vocab:a"], 5)
        XCTAssertEqual(decoded.metaUpdatedAt, 7)
    }

    func testSamePayloadIgnoresUpdatedAtButNotTombstones() {
        let a = snapshot(vocab: ["a": ["word": "a"]], snippets: [:], settings: [:], updatedAt: 1)
        var b = a
        b.updatedAt = 99
        XCTAssertTrue(SnapshotCodec.samePayload(a, b))
        b.payload.deletedItems["vocab:x"] = 5
        XCTAssertFalse(SnapshotCodec.samePayload(a, b))
    }

    func testCodecFallsBackToUpdatedAtForLegacyMetaTime() throws {
        let legacy = #"{"version":1,"updatedAt":42,"payload":{}}"#.data(using: .utf8)!
        XCTAssertEqual(try SnapshotCodec.decode(legacy).metaUpdatedAt, 42)
    }

    private func snapshot(
        vocab: [String: [String: Any]],
        snippets: [String: [String: Any]],
        settings: [String: Any],
        updatedAt: Double,
        deleted: [String: Double] = [:]
    ) -> LibrarySnapshot {
        LibrarySnapshot(
            version: 1,
            updatedAt: updatedAt,
            payload: LibraryPayload(
                vocabItems: vocab,
                snippetItems: snippets,
                settings: settings,
                aiKeys: [:],
                aiProviderProfiles: [],
                stats: [:],
                wordRecords: [:],
                deletedItems: deleted
            )
        )
    }

    private func vocabJSON(
        _ id: String,
        word: String,
        definitions: [String],
        repetitions: Int,
        reviewedAt: Double,
        nextReviewAt: Double
    ) -> [String: Any] {
        [
            "id": id,
            "word": word,
            "definitions": definitions,
            "status": repetitions > 0 ? "learning" : "new",
            "repetitions": repetitions,
            "reviewedAt": reviewedAt,
            "nextReviewAt": nextReviewAt,
            "easeFactor": 2.5,
            "interval": repetitions
        ]
    }

    private func snippetJSON(
        _ id: String,
        text: String,
        repetitions: Int,
        reviewedAt: Double,
        nextReviewAt: Double
    ) -> [String: Any] {
        [
            "id": id,
            "text": text,
            "type": "phrase",
            "repetitions": repetitions,
            "reviewedAt": reviewedAt,
            "nextReviewAt": nextReviewAt
        ]
    }

    private func int(_ item: [String: Any]?, _ key: String) -> Int {
        JSONValue.int(item?[key])
    }

    private func double(_ item: [String: Any]?, _ key: String) -> Double {
        JSONValue.double(item?[key])
    }

    private func string(_ item: [String: Any]?, _ key: String) -> String {
        if let list = item?[key] as? [String] { return list.joined(separator: "；") }
        return ""
    }
}
