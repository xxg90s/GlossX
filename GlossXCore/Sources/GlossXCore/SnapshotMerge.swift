import Foundation

public enum SnapshotMerge {
    private static let contentIgnoredOnPhone: Set<String> = [
        "status", "easeFactor", "interval", "repetitions",
        "nextReviewAt", "reviewedAt", "learnedAt", "familiarAt"
    ]

    public static func merge(cloud: LibrarySnapshot, local: LibrarySnapshot, now: Double) -> LibrarySnapshot {
        LibrarySnapshot(
            version: 1,
            updatedAt: now,
            payload: LibraryPayload(
                vocabItems: mergeItems(cloud: cloud.payload.vocabItems, local: local.payload.vocabItems),
                snippetItems: mergeItems(cloud: cloud.payload.snippetItems, local: local.payload.snippetItems),
                settings: cloud.payload.settings.isEmpty ? local.payload.settings : cloud.payload.settings,
                aiKeys: cloud.payload.aiKeys.isEmpty ? local.payload.aiKeys : cloud.payload.aiKeys,
                aiProviderProfiles: cloud.payload.aiProviderProfiles.isEmpty
                    ? local.payload.aiProviderProfiles
                    : cloud.payload.aiProviderProfiles,
                stats: mergeStats(cloud: cloud.payload.stats, local: local.payload.stats),
                wordRecords: cloud.payload.wordRecords.isEmpty ? local.payload.wordRecords : cloud.payload.wordRecords
            )
        )
    }

    public static func mergeItems(
        cloud: [String: [String: Any]],
        local: [String: [String: Any]]
    ) -> [String: [String: Any]] {
        var merged: [String: [String: Any]] = [:]
        let keys = Set(cloud.keys).union(local.keys)
        for key in keys {
            switch (cloud[key], local[key]) {
            case let (cloudItem?, localItem?):
                merged[key] = mergeItem(cloud: cloudItem, local: localItem)
            case let (cloudItem?, nil):
                merged[key] = cloudItem
            case let (nil, localItem?):
                merged[key] = localItem
            default:
                break
            }
        }
        return merged
    }

    public static func mergeItem(cloud: [String: Any], local: [String: Any]) -> [String: Any] {
        var result = cloud
        let winner = reviewTimestamp(local) >= reviewTimestamp(cloud) ? local : cloud
        for field in contentIgnoredOnPhone {
            if let value = winner[field] {
                result[field] = value
            } else {
                result.removeValue(forKey: field)
            }
        }
        return result
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

    public static func mergeStats(cloud: [String: Any], local: [String: Any]) -> [String: Any] {
        if cloud.isEmpty { return local }
        var stats = cloud
        let localReviewed = JSONValue.int(local["vocabReviewedToday"])
        if localReviewed > JSONValue.int(stats["vocabReviewedToday"]) {
            stats["vocabReviewedToday"] = localReviewed
        }
        let localStreak = JSONValue.int(local["streak"])
        if localStreak > JSONValue.int(stats["streak"]) {
            stats["streak"] = localStreak
        }
        return stats
    }
}
