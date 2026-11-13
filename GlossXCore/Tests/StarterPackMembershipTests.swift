import XCTest
@testable import GlossXCore

final class StarterPackMembershipTests: XCTestCase {
    private let entries: [StarterPack.Entry] = [
        entry("time", "时间"),
        entry("day", "天"),
        entry("hand", "手")
    ]

    func testJoinSkipsWordsAlreadyCollected() throws {
        var snapshot = SnapshotCodec.empty(now: 0)
        snapshot.payload.vocabItems["time"] = word("time", source: "safari", definition: "时间")

        let result = StarterPackMembership.join(snapshot, lexiconId: "daily", entries: entries, now: 1000)

        XCTAssertEqual(result.added, 2)
        XCTAssertEqual(result.snapshot.payload.starterPacks?["daily"]?.ids, ["day", "hand"])
        XCTAssertEqual(JSONValue.string(result.snapshot.payload.vocabItems["time"]?["source"]), "safari")
        XCTAssertEqual(JSONValue.string(result.snapshot.payload.vocabItems["day"]?["source"]), "starter:daily")
    }

    func testEnabledPackDoesNotAddWordsBack() {
        let joined = StarterPackMembership.join(SnapshotCodec.empty(now: 0), lexiconId: "daily", entries: entries, now: 1000)
        var snapshot = joined.snapshot
        snapshot = LibraryMutator.delete(in: snapshot, id: "time", now: 1100)
        XCTAssertEqual(snapshot.payload.starterPacks?["daily"]?.enabled, true)
        XCTAssertFalse(snapshot.payload.starterPacks?["daily"]?.ids.contains("time") ?? true)

        let again = StarterPackMembership.join(snapshot, lexiconId: "daily", entries: entries, now: 1200)

        XCTAssertEqual(again.added, 0)
        XCTAssertNil(again.snapshot.payload.vocabItems["time"])
    }

    func testPracticeSkipEditAndExampleLeaveTheListButKeepTheWord() throws {
        let joined = StarterPackMembership.join(SnapshotCodec.empty(now: 0), lexiconId: "daily", entries: entries, now: 1000).snapshot
        var practiced = joined
        practiced.payload.vocabItems["time"]?["repetitions"] = 1
        practiced.payload.vocabItems["time"]?["status"] = "learning"
        var seen = joined
        seen.payload.vocabItems["day"]?["introducedAt"] = 50
        var skipped = LibraryMutator.setSkipped(in: joined, id: "hand", skipped: true, now: 60)
        skipped = StarterPackMembership.reconcile(skipped, definitions: definitions)
        let edited = replaceDefinition(joined, id: "time", definition: "时光")
        let withExample = LibraryMutator.setExtraExample(
            in: joined, id: "day", english: "Have a good day.", chinese: "过得愉快。", now: 70
        )

        XCTAssertEqual(ids(StarterPackMembership.reconcile(practiced, definitions: definitions)), ["day", "hand"])
        XCTAssertNotNil(practiced.payload.vocabItems["time"])
        XCTAssertEqual(ids(StarterPackMembership.reconcile(seen, definitions: definitions)), ["time", "hand"])
        XCTAssertEqual(ids(skipped), ["time", "day"])
        XCTAssertNotNil(skipped.payload.vocabItems["hand"])
        XCTAssertEqual(ids(StarterPackMembership.reconcile(edited, definitions: definitions)), ["day", "hand"])
        let exampleSnapshot = try XCTUnwrap(withExample)
        XCTAssertEqual(ids(StarterPackMembership.reconcile(exampleSnapshot, definitions: definitions)), ["time", "hand"])
    }

    func testClaimRewritesSourceAndDropsTheWordFromTheList() throws {
        let joined = StarterPackMembership.join(SnapshotCodec.empty(now: 0), lexiconId: "daily", entries: entries, now: 1000).snapshot
        let claimed = try XCTUnwrap(StarterPackMembership.claim(joined, id: "time", source: "safari", now: 1100))
        let reconciled = StarterPackMembership.reconcile(claimed, definitions: definitions)

        XCTAssertEqual(JSONValue.string(reconciled.payload.vocabItems["time"]?["source"]), "safari")
        XCTAssertEqual(ids(reconciled), ["day", "hand"])
        XCTAssertNotNil(reconciled.payload.vocabItems["time"])
        XCTAssertNil(StarterPackMembership.claim(joined, id: "missing", source: "share", now: 1))
    }

    func testLeaveDeletesOnlyListedWordsAndWritesTombstones() throws {
        var joined = StarterPackMembership.join(SnapshotCodec.empty(now: 0), lexiconId: "daily", entries: entries, now: 1000).snapshot
        joined = try XCTUnwrap(StarterPackMembership.claim(joined, id: "time", source: "ios", now: 1100))
        let left = StarterPackMembership.leave(joined, lexiconId: "daily", now: 1200)

        XCTAssertEqual(left.removedIds, ["day", "hand"])
        XCTAssertNotNil(left.snapshot.payload.vocabItems["time"])
        XCTAssertNil(left.snapshot.payload.vocabItems["day"])
        XCTAssertNil(left.snapshot.payload.vocabItems["hand"])
        XCTAssertEqual(left.snapshot.payload.starterPacks?["daily"]?.enabled, false)
        XCTAssertEqual(left.snapshot.payload.starterPacks?["daily"]?.ids, [])
        let dayAdded = JSONValue.double(joined.payload.vocabItems["day"]?["addedAt"])
        XCTAssertGreaterThan(left.snapshot.payload.deletedItems["vocab:day"] ?? 0, dayAdded)
    }

    func testRejoinRestoresRemovedWordsWithoutDuplicatingKeptOnes() {
        var joined = StarterPackMembership.join(SnapshotCodec.empty(now: 0), lexiconId: "daily", entries: entries, now: 1000).snapshot
        joined = StarterPackMembership.claim(joined, id: "time", source: "share", now: 1100) ?? joined
        let left = StarterPackMembership.leave(joined, lexiconId: "daily", now: 1200).snapshot
        let again = StarterPackMembership.join(left, lexiconId: "daily", entries: entries, now: 1300)

        XCTAssertEqual(again.added, 2)
        XCTAssertEqual(again.snapshot.payload.starterPacks?["daily"]?.ids, ["day", "hand"])
        XCTAssertEqual(JSONValue.string(again.snapshot.payload.vocabItems["time"]?["source"]), "share")
        XCTAssertEqual(again.snapshot.payload.vocabItems.keys.filter { $0 == "time" }.count, 1)
    }

    func testEmptyListDoesNotTurnThePackOn() {
        let result = StarterPackMembership.join(SnapshotCodec.empty(now: 0), lexiconId: "daily", entries: [], now: 1000)
        XCTAssertEqual(result.added, 0)
        XCTAssertEqual(result.snapshot.payload.starterPacks, [:])
    }

    func testMigrationEnrollsOnlyPristineStarterWords() {
        var snapshot = SnapshotCodec.empty(now: 0)
        snapshot.payload.starterPacks = nil
        snapshot.payload.vocabItems["time"] = word("time", source: "starter:daily", definition: "时间")
        snapshot.payload.vocabItems["day"] = word("day", source: "starter:daily", definition: "天", repetitions: 2)
        snapshot.payload.vocabItems["hand"] = word("hand", source: "safari", definition: "手")

        let migrated = StarterPackMembership.migrate(snapshot, definitions: definitions, now: 500)

        XCTAssertEqual(migrated.payload.starterPacks?["daily"]?.enabled, true)
        XCTAssertEqual(Set(migrated.payload.starterPacks?["daily"]?.ids ?? []), ["time"])
        XCTAssertNotNil(migrated.payload.vocabItems["day"])
        XCTAssertNil(migrated.payload.starterPacks?["hand"])
        let second = StarterPackMembership.migrate(migrated, definitions: definitions, now: 800)
        XCTAssertEqual(second.payload.starterPacks?["daily"]?.updatedAt, 500)
    }

    func testNewerDisableWinsAndPracticeIsNotRestoredToTheList() {
        let local = pack(enabled: true, ids: ["time", "day"], updatedAt: 100)
        let cloud = pack(enabled: false, ids: [], updatedAt: 200)
        let merged = StarterPackMembership.mergePacks(local: ["daily": local], cloud: ["daily": cloud])
        XCTAssertEqual(merged?["daily"]?.enabled, false)
        XCTAssertEqual(merged?["daily"]?.ids, [])

        var snapshot = SnapshotCodec.empty(now: 0)
        snapshot.payload.starterPacks = StarterPackMembership.mergePacks(
            local: ["daily": pack(enabled: true, ids: ["time", "day"], updatedAt: 100)],
            cloud: ["daily": pack(enabled: true, ids: ["time"], updatedAt: 100)]
        )
        snapshot.payload.vocabItems["time"] = word("time", source: "starter:daily", definition: "时间", repetitions: 1)
        snapshot.payload.vocabItems["day"] = word("day", source: "starter:daily", definition: "天")
        let reconciled = StarterPackMembership.reconcile(snapshot, definitions: definitions)
        XCTAssertEqual(reconciled.payload.starterPacks?["daily"]?.enabled, true)
        XCTAssertEqual(reconciled.payload.starterPacks?["daily"]?.ids, ["day"])
    }

    func testMissingPackKeyStaysMissingUntilMigration() throws {
        let legacy = #"{"version":1,"updatedAt":42,"payload":{"vocabItems":{}}}"#.data(using: .utf8)!
        let decoded = try SnapshotCodec.decode(legacy)
        XCTAssertNil(decoded.payload.starterPacks)

        let empty = try SnapshotCodec.decode(SnapshotCodec.encode(SnapshotCodec.empty(now: 1)))
        XCTAssertEqual(empty.payload.starterPacks, [:])

        var withPack = SnapshotCodec.empty(now: 1)
        withPack.payload.starterPacks = ["daily": pack(enabled: true, ids: ["time"], updatedAt: 9)]
        let roundTrip = try SnapshotCodec.decode(SnapshotCodec.encode(withPack))
        XCTAssertEqual(roundTrip.payload.starterPacks?["daily"]?.ids, ["time"])
        XCTAssertEqual(roundTrip.payload.starterPacks?["daily"]?.enabled, true)
    }

    func testMergeThroughSnapshotKeepsUnmigratedSide() {
        var local = SnapshotCodec.empty(now: 0)
        local.payload.starterPacks = nil
        var cloud = SnapshotCodec.empty(now: 0)
        cloud.payload.starterPacks = ["daily": pack(enabled: true, ids: ["time"], updatedAt: 10)]
        let merged = SnapshotMerge.merge(cloud: cloud, local: local, now: 20)
        XCTAssertEqual(merged.payload.starterPacks?["daily"]?.ids, ["time"])

        local.payload.starterPacks = nil
        cloud.payload.starterPacks = nil
        XCTAssertNil(SnapshotMerge.merge(cloud: cloud, local: local, now: 20).payload.starterPacks)
    }

    private func ids(_ snapshot: LibrarySnapshot) -> [String] {
        snapshot.payload.starterPacks?["daily"]?.ids ?? []
    }

    private func replaceDefinition(_ snapshot: LibrarySnapshot, id: String, definition: String) -> LibrarySnapshot {
        var next = snapshot
        next.payload.vocabItems[id]?["definitions"] = [definition]
        return next
    }

    private func pack(enabled: Bool, ids: [String], updatedAt: Double) -> StarterPackRecord {
        StarterPackRecord(enabled: enabled, ids: ids, updatedAt: updatedAt)
    }

    private var definitions: [String: [String: String]] {
        ["daily": ["time": "时间", "day": "天", "hand": "手"]]
    }

    private func word(
        _ id: String,
        source: String,
        definition: String,
        repetitions: Int = 0
    ) -> [String: Any] {
        [
            "id": id,
            "word": id,
            "source": source,
            "status": repetitions > 0 ? "learning" : "new",
            "definitions": [definition],
            "repetitions": repetitions,
            "introducedAt": 0
        ]
    }

    private static func entry(_ en: String, _ zh: String) -> StarterPack.Entry {
        let data = Data("{\"en\":\"\(en)\",\"zh\":\"\(zh)\",\"pos\":\"n\",\"phonetic\":\"\",\"lexicon\":\"daily\"}".utf8)
        return try! JSONDecoder().decode(StarterPack.Entry.self, from: data)
    }
}
