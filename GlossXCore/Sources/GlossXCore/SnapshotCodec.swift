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
        return LibrarySnapshot(
            version: version,
            updatedAt: JSONValue.double(root["updatedAt"]),
            payload: LibraryPayload(
                vocabItems: mapObject(payload["vocabItems"]),
                snippetItems: mapObject(payload["snippetItems"]),
                settings: JSONValue.dictionary(payload["settings"]),
                aiKeys: JSONValue.dictionary(payload["aiKeys"]),
                aiProviderProfiles: payload["aiProviderProfiles"] as? [Any] ?? [],
                stats: JSONValue.dictionary(payload["stats"]),
                wordRecords: mapLooseObject(payload["wordRecords"]),
            )
        )
    }

    public static func encode(_ snapshot: LibrarySnapshot) throws -> Data {
        let root: [String: Any] = [
            "version": snapshot.version,
            "updatedAt": snapshot.updatedAt,
            "payload": [
                "vocabItems": snapshot.payload.vocabItems,
                "snippetItems": snapshot.payload.snippetItems,
                "settings": snapshot.payload.settings,
                "aiKeys": snapshot.payload.aiKeys,
                "aiProviderProfiles": snapshot.payload.aiProviderProfiles,
                "stats": snapshot.payload.stats,
                "wordRecords": snapshot.payload.wordRecords
            ]
        ]
        return try JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted, .sortedKeys])
    }

    public static func empty(now: Double) -> LibrarySnapshot {
        LibrarySnapshot(
            version: 1,
            updatedAt: now,
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

    public enum CodecError: Error {
        case invalid
        case unsupportedVersion
    }
}
