import Foundation

/// Mirrors `mergePayloads` in the extension's icloud-sync.js; keep both in step.
public enum SnapshotMerge {
    public static let tombstoneRetention: Double = 180 * 24 * 60 * 60 * 1000

    private static let reviewFields: Set<String> = [
        "status", "easeFactor", "interval", "repetitions",
        "nextReviewAt", "reviewedAt", "learnedAt", "familiarAt"
    ]

    private static let maxedStats = [
        "newWords", "reviews", "vocabNewToday", "vocabReviewedToday",
        "snippetNewToday", "snippetReviewedToday", "streak"
    ]

    public static func merge(cloud: LibrarySnapshot, local: LibrarySnapshot, now: Double) -> LibrarySnapshot {
        let deleted = mergeTombstones(cloud.payload.deletedItems, local.payload.deletedItems, now: now)
        let metaFromLocal = local.metaUpdatedAt > cloud.metaUpdatedAt
        let primary = metaFromLocal ? local.payload : cloud.payload
        let secondary = metaFromLocal ? cloud.payload : local.payload
        return LibrarySnapshot(
            version: 1,
            updatedAt: now,
            metaUpdatedAt: max(cloud.metaUpdatedAt, local.metaUpdatedAt),
            payload: LibraryPayload(
                vocabItems: mergeItems(
                    cloud: cloud.payload.vocabItems,
                    local: local.payload.vocabItems,
                    tombstones: deleted,
                    key: TombstoneKey.vocab
                ),
                snippetItems: mergeItems(
                    cloud: cloud.payload.snippetItems,
                    local: local.payload.snippetItems,
                    tombstones: deleted,
                    key: TombstoneKey.snippet
                ),
                settings: primary.settings.isEmpty ? secondary.settings : primary.settings,
                aiKeys: primary.aiKeys.isEmpty ? secondary.aiKeys : primary.aiKeys,
                aiProviderProfiles: primary.aiProviderProfiles.isEmpty
                    ? secondary.aiProviderProfiles
                    : primary.aiProviderProfiles,
                stats: mergeStats(cloud: cloud.payload.stats, local: local.payload.stats),
                wordRecords: primary.wordRecords.isEmpty ? secondary.wordRecords : primary.wordRecords,
                deletedItems: deleted
            )
        )
    }

    public static func mergeItems(
        cloud: [String: [String: Any]],
        local: [String: [String: Any]],
        tombstones: [String: Double] = [:],
        key: (String) -> String = { $0 }
    ) -> [String: [String: Any]] {
        var merged: [String: [String: Any]] = [:]
        let ids = Set(cloud.keys).union(local.keys)
        for id in ids {
            let item: [String: Any]
            switch (cloud[id], local[id]) {
            case let (cloudItem?, localItem?):
                item = mergeItem(cloud: cloudItem, local: localItem)
            case let (cloudItem?, nil):
                item = cloudItem
            case let (nil, localItem?):
                item = localItem
            default:
                continue
            }
            if let deletedAt = tombstones[key(id)], deletedAt >= JSONValue.double(item["addedAt"]) {
                continue
            }
            merged[id] = item
        }
        return merged
    }

    public static func mergeItem(cloud: [String: Any], local: [String: Any]) -> [String: Any] {
        var result = contentTimestamp(local) > contentTimestamp(cloud) ? local : cloud
        let reviewWinner = reviewTimestamp(local) >= reviewTimestamp(cloud) ? local : cloud
        for field in reviewFields {
            if let value = reviewWinner[field] {
                result[field] = value
            } else {
                result.removeValue(forKey: field)
            }
        }
        return result
    }

    public static func contentTimestamp(_ item: [String: Any]) -> Double {
        let updatedAt = JSONValue.double(item["updatedAt"])
        return updatedAt > 0 ? updatedAt : JSONValue.double(item["addedAt"])
    }

    public static func reviewTimestamp(_ item: [String: Any]) -> Double {
        let reviewedAt = JSONValue.double(item["reviewedAt"])
        if reviewedAt > 0 { return reviewedAt }
        let learnedAt = JSONValue.double(item["learnedAt"])
        if learnedAt > 0 { return learnedAt }
        let familiarAt = JSONValue.double(item["familiarAt"])
        if familiarAt > 0 { return familiarAt }
        if JSONValue.int(item["repetitions"]) > 0 {
            return JSONValue.double(item["nextReviewAt"])
        }
        return 0
    }

    public static func mergeTombstones(_ a: [String: Double], _ b: [String: Double], now: Double) -> [String: Double] {
        var merged = a.merging(b) { max($0, $1) }
        merged = merged.filter { now - $0.value <= tombstoneRetention }
        return merged
    }

    public static func mergeStats(cloud: [String: Any], local: [String: Any]) -> [String: Any] {
        if cloud.isEmpty { return local }
        if local.isEmpty { return cloud }
        let cloudDate = JSONValue.string(cloud["date"])
        let localDate = JSONValue.string(local["date"])
        if cloudDate != localDate {
            return localDate > cloudDate ? local : cloud
        }
        var stats = cloud
        for key in maxedStats {
            let value = max(JSONValue.int(cloud[key]), JSONValue.int(local[key]))
            if cloud[key] != nil || local[key] != nil {
                stats[key] = value
            }
        }
        return stats
    }
}
