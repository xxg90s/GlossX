import Foundation

public enum SnapshotCodec {
    public static func decode(_ data: Data) throws -> LibrarySnapshot {
        let object = try JSONSerialization.jsonObject(with: data)
        guard let root = object as? [String: Any] else {
            throw CodecError.invalid
        }
        let version = JSONValue.int(root["version"])
        guard version == 1 else { throw CodecError.unsupportedVersion }
        let payload = JSONValue.dictionary(root["payload"])
        let updatedAt = JSONValue.double(root["updatedAt"])
        let metaUpdatedAt = JSONValue.double(root["metaUpdatedAt"])
        return LibrarySnapshot(
            version: version,
            updatedAt: updatedAt,
            metaUpdatedAt: metaUpdatedAt > 0 ? metaUpdatedAt : updatedAt,
            payload: LibraryPayload(
                vocabItems: mapObject(payload["vocabItems"]),
                snippetItems: mapObject(payload["snippetItems"]),
                settings: JSONValue.dictionary(payload["settings"]),
                aiKeys: JSONValue.dictionary(payload["aiKeys"]),
                aiProviderProfiles: payload["aiProviderProfiles"] as? [Any] ?? [],
                stats: JSONValue.dictionary(payload["stats"]),
                wordRecords: mapLooseObject(payload["wordRecords"]),
                deletedItems: mapTimestamps(payload["deletedItems"])
            )
        )
    }

    public static func encode(_ snapshot: LibrarySnapshot) throws -> Data {
        let root: [String: Any] = [
            "version": snapshot.version,
            "updatedAt": snapshot.updatedAt,
            "metaUpdatedAt": snapshot.metaUpdatedAt,
            "payload": [
                "vocabItems": snapshot.payload.vocabItems,
                "snippetItems": snapshot.payload.snippetItems,
                "settings": snapshot.payload.settings,
                "aiKeys": snapshot.payload.aiKeys,
                "aiProviderProfiles": snapshot.payload.aiProviderProfiles,
                "stats": snapshot.payload.stats,
                "wordRecords": snapshot.payload.wordRecords,
                "deletedItems": snapshot.payload.deletedItems
            ]
        ]
        return try JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted, .sortedKeys])
    }

    /// True when both snapshots would sync the same content, ignoring `updatedAt`.
    public static func samePayload(_ a: LibrarySnapshot, _ b: LibrarySnapshot) -> Bool {
        guard a.metaUpdatedAt == b.metaUpdatedAt else { return false }
        var left = a
        var right = b
        left.updatedAt = 0
        right.updatedAt = 0
        guard let leftData = try? encode(left), let rightData = try? encode(right) else { return false }
        return leftData == rightData
    }

    public static func empty(now: Double) -> LibrarySnapshot {
        LibrarySnapshot(
            version: 1,
            updatedAt: now,
            metaUpdatedAt: 0,
            payload: LibraryPayload(
                vocabItems: [:],
                snippetItems: [:],
                settings: [:],
                aiKeys: [:],
                aiProviderProfiles: [],
                stats: [:],
                wordRecords: [:]
            )
        )
    }

    private static func mapObject(_ value: Any?) -> [String: [String: Any]] {
        guard let object = value as? [String: Any] else { return [:] }
        var result: [String: [String: Any]] = [:]
        for (key, item) in object {
            result[key] = JSONValue.dictionary(item)
        }
        return result
    }

    private static func mapLooseObject(_ value: Any?) -> [String: Any] {
        value as? [String: Any] ?? [:]
    }

    private static func mapTimestamps(_ value: Any?) -> [String: Double] {
        guard let object = value as? [String: Any] else { return [:] }
        var result: [String: Double] = [:]
        for (key, raw) in object {
            let time = JSONValue.double(raw)
            if time > 0 { result[key] = time }
        }
        return result
    }

    public enum CodecError: Error {
        case invalid
        case unsupportedVersion
    }
}
