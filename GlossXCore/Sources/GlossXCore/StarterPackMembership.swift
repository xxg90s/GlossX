import Foundation

public struct StarterPackRecord: Equatable {
    public var enabled: Bool
    public var ids: [String]
    public var updatedAt: Double

    public init(enabled: Bool, ids: [String], updatedAt: Double) {
        self.enabled = enabled
        self.ids = ids
        self.updatedAt = updatedAt
    }
}

/// Pack membership for words imported from a bundled word list.
/// A missing `starterPacks` value means the snapshot has not been migrated.
public enum StarterPackMembership {
    /// `skip` when the bundled lists could not be read. `absent` when they were read and this word is not in them.
    public enum DefinitionMatch: Equatable {
        case skip
        case equals(String)
        case absent
    }

    public static func isPristine(
        _ item: [String: Any],
        lexiconId: String,
        definition: DefinitionMatch
    ) -> Bool {
        guard JSONValue.string(item["source"]) == "starter:\(lexiconId)" else { return false }
        guard JSONValue.string(item["status"]) == "new" else { return false }
        guard JSONValue.int(item["repetitions"]) == 0 else { return false }
        guard JSONValue.double(item["introducedAt"]) == 0 else { return false }
        switch definition {
        case .skip:
            break
        case .equals(let text):
            guard JSONValue.stringArray(item["definitions"]) == [text] else { return false }
        case .absent:
            return false
        }
        return !hasEnglish(item["usageExample"])
            && !hasEnglish(item["extraExample"])
            && !hasEnglish(item["exampleFromContext"])
    }

    /// Drops ids that are no longer pack-original. Does not turn a pack on or change `updatedAt`.
    public static func reconcile(
        _ snapshot: LibrarySnapshot,
        definitions: [String: [String: String]]?
    ) -> LibrarySnapshot {
        guard var packs = snapshot.payload.starterPacks else { return snapshot }
        var changed = false
        for (lexiconId, var record) in packs where record.enabled {
            let kept = record.ids.filter { id in
                guard let item = snapshot.payload.vocabItems[id] else { return false }
                return isPristine(item, lexiconId: lexiconId, definition: match(definitions, lexiconId: lexiconId, id: id))
            }
            guard kept != record.ids else { continue }
            record.ids = kept
            packs[lexiconId] = record
            changed = true
        }
        guard changed else { return snapshot }
        var next = snapshot
        next.payload.starterPacks = packs
        return next
    }

    /// One-time enrollment of pack-original words already stored with a `starter:` source.
    public static func migrate(
        _ snapshot: LibrarySnapshot,
        definitions: [String: [String: String]]?,
        now: Double
    ) -> LibrarySnapshot {
        guard snapshot.payload.starterPacks == nil else { return snapshot }
        var packs: [String: StarterPackRecord] = [:]
        for (id, item) in snapshot.payload.vocabItems {
            let source = JSONValue.string(item["source"])
            let prefix = "starter:"
            guard source.hasPrefix(prefix) else { continue }
            let lexiconId = String(source.dropFirst(prefix.count))
            guard !lexiconId.isEmpty else { continue }
            guard isPristine(item, lexiconId: lexiconId, definition: match(definitions, lexiconId: lexiconId, id: id)) else { continue }
            var record = packs[lexiconId] ?? StarterPackRecord(enabled: true, ids: [], updatedAt: now)
            record.ids.append(id)
            packs[lexiconId] = record
        }
        var next = snapshot
        next.payload.starterPacks = packs
        next.updatedAt = now
        return next
    }

    public static func prepare(
        _ snapshot: LibrarySnapshot,
        definitions: [String: [String: String]]?,
        now: Double
    ) -> LibrarySnapshot {
        reconcile(migrate(snapshot, definitions: definitions, now: now), definitions: definitions)
    }

    /// Adds words that are not already in the library. An enabled pack is left unchanged.
    public static func join(
        _ snapshot: LibrarySnapshot,
        lexiconId: String,
        entries: [StarterPack.Entry],
        limit: Int = StarterPack.defaultLimit,
        now: Double
    ) -> (snapshot: LibrarySnapshot, added: Int) {
        if snapshot.payload.starterPacks?[lexiconId]?.enabled == true {
            return (snapshot, 0)
        }
        let before = Set(snapshot.payload.vocabItems.keys)
        let imported = StarterPack.importWords(entries, into: snapshot, limit: limit, now: now)
        guard imported.added > 0 else { return (snapshot, 0) }
        var next = imported.snapshot
        var ids: [String] = []
        var seen = Set<String>()
        for entry in entries {
            let id = entry.en.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard !id.isEmpty, !seen.contains(id), !before.contains(id), next.payload.vocabItems[id] != nil else { continue }
            seen.insert(id)
            ids.append(id)
            if ids.count == imported.added { break }
        }
        var packs = next.payload.starterPacks ?? [:]
        packs[lexiconId] = StarterPackRecord(enabled: true, ids: ids, updatedAt: now)
        next.payload.starterPacks = packs
        return (next, imported.added)
    }

    /// Deletes words still on the list and marks the pack off.
    public static func leave(
        _ snapshot: LibrarySnapshot,
        lexiconId: String,
        now: Double
    ) -> (snapshot: LibrarySnapshot, removedIds: [String]) {
        var next = snapshot
        let ids = next.payload.starterPacks?[lexiconId]?.ids ?? []
        var removed: [String] = []
        for id in ids {
            guard let item = next.payload.vocabItems[id] else { continue }
            let addedAt = JSONValue.double(item["addedAt"])
            let stamp = now > addedAt ? now : addedAt + 1
            next = LibraryMutator.delete(in: next, id: id, now: stamp)
            removed.append(id)
        }
        var packs = next.payload.starterPacks ?? [:]
        packs[lexiconId] = StarterPackRecord(enabled: false, ids: [], updatedAt: now)
        next.payload.starterPacks = packs
        next.updatedAt = now
        return (next, removed)
    }

    /// A later collect from Safari, share, or manual add takes the word off the pack.
    public static func claim(
        _ snapshot: LibrarySnapshot,
        id: String,
        source: String,
        now: Double
    ) -> LibrarySnapshot? {
        guard var item = snapshot.payload.vocabItems[id] else { return nil }
        guard JSONValue.string(item["source"]).hasPrefix("starter:") else { return nil }
        item["source"] = source
        item["updatedAt"] = now
        var next = snapshot
        next.payload.vocabItems[id] = item
        next = removeFromLists(next, id: id)
        next.updatedAt = now
        return next
    }

    public static func removeFromLists(_ snapshot: LibrarySnapshot, id: String) -> LibrarySnapshot {
        guard var packs = snapshot.payload.starterPacks else { return snapshot }
        var changed = false
        for (lexiconId, var record) in packs {
            guard let index = record.ids.firstIndex(of: id) else { continue }
            record.ids.remove(at: index)
            packs[lexiconId] = record
            changed = true
        }
        guard changed else { return snapshot }
        var next = snapshot
        next.payload.starterPacks = packs
        return next
    }

    /// `nil` on both sides stays `nil`, so an old snapshot is not treated as “all packs off”.
    public static func mergePacks(
        local: [String: StarterPackRecord]?,
        cloud: [String: StarterPackRecord]?
    ) -> [String: StarterPackRecord]? {
        switch (local, cloud) {
        case (nil, nil):
            return nil
        case (nil, let cloud?):
            return cloud
        case (let local?, nil):
            return local
        case (let local?, let cloud?):
            var merged: [String: StarterPackRecord] = [:]
            for id in Set(local.keys).union(cloud.keys) {
                merged[id] = mergeRecord(local[id], cloud[id])
            }
            return merged
        }
    }

    public static func encode(_ packs: [String: StarterPackRecord]) -> [String: Any] {
        var object: [String: Any] = [:]
        for (id, record) in packs {
            object[id] = [
                "enabled": record.enabled,
                "ids": record.ids,
                "updatedAt": record.updatedAt
            ]
        }
        return object
    }

    public static func decode(_ value: Any?) -> [String: StarterPackRecord]? {
        guard let object = value as? [String: Any] else { return nil }
        var packs: [String: StarterPackRecord] = [:]
        for (id, raw) in object {
            let record = JSONValue.dictionary(raw)
            let enabled = (record["enabled"] as? Bool)
                ?? (record["enabled"] as? NSNumber)?.boolValue
                ?? false
            packs[id] = StarterPackRecord(
                enabled: enabled,
                ids: JSONValue.stringArray(record["ids"]),
                updatedAt: JSONValue.double(record["updatedAt"])
            )
        }
        return packs
    }

    private static func mergeRecord(
        _ local: StarterPackRecord?,
        _ cloud: StarterPackRecord?
    ) -> StarterPackRecord {
        switch (local, cloud) {
        case (nil, let cloud?):
            return cloud
        case (let local?, nil):
            return local
        case (let local?, let cloud?):
            let enabled: Bool
            let updatedAt: Double
            if cloud.updatedAt > local.updatedAt {
                enabled = cloud.enabled
                updatedAt = cloud.updatedAt
            } else if local.updatedAt > cloud.updatedAt {
                enabled = local.enabled
                updatedAt = local.updatedAt
            } else {
                enabled = local.enabled || cloud.enabled
                updatedAt = local.updatedAt
            }
            let ids = enabled ? unique(local.ids + cloud.ids) : []
            return StarterPackRecord(enabled: enabled, ids: ids, updatedAt: updatedAt)
        default:
            return StarterPackRecord(enabled: false, ids: [], updatedAt: 0)
        }
    }

    private static func match(
        _ definitions: [String: [String: String]]?,
        lexiconId: String,
        id: String
    ) -> DefinitionMatch {
        guard let definitions else { return .skip }
        guard let text = definitions[lexiconId]?[id] else { return .absent }
        return .equals(text)
    }

    private static func unique(_ ids: [String]) -> [String] {
        var seen = Set<String>()
        return ids.filter { seen.insert($0).inserted }
    }

    private static func hasEnglish(_ value: Any?) -> Bool {
        if value is NSNull { return false }
        let english = JSONValue.string(JSONValue.dictionary(value)["english"])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return !english.isEmpty
    }
}
