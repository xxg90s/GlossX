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

    private func snapshot(
        vocab: [String: [String: Any]],
        snippets: [String: [String: Any]],
        settings: [String: Any],
        updatedAt: Double
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
                wordRecords: [:]
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
