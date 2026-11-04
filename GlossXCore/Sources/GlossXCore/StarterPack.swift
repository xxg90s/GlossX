import Foundation

/// Seeds an empty library from the word lists bundled with the Safari extension (`lexicon-<id>.json`).
public enum StarterPack {
    public struct Lexicon: Equatable, Identifiable {
        public var id: String
        public var title: String
    }

    public struct Entry: Decodable, Equatable {
        public var zh: String
        public var en: String
        public var pos: String
        public var phonetic: String
        public var lexicon: String
    }

    public static let defaultLimit = 20

    public static let lexicons: [Lexicon] = [
        Lexicon(id: "daily", title: "日常高频"),
        Lexicon(id: "cet4", title: "四级"),
        Lexicon(id: "cet6", title: "六级"),
        Lexicon(id: "kaoyan", title: "考研"),
        Lexicon(id: "ielts", title: "雅思"),
        Lexicon(id: "toefl", title: "托福")
    ]

    public static func fileName(for lexiconId: String) -> String {
        "lexicon-\(lexiconId).json"
    }

    public static func parse(_ data: Data) -> [Entry] {
        let entries = (try? JSONDecoder().decode([Entry].self, from: data)) ?? []
        return entries.filter {
            !$0.en.trimmingCharacters(in: .whitespaces).isEmpty && !$0.zh.trimmingCharacters(in: .whitespaces).isEmpty
        }
    }

    /// Adds up to `limit` words not already collected, in list order (first entry is newest).
    public static func importWords(
        _ entries: [Entry],
        into snapshot: LibrarySnapshot,
        limit: Int = defaultLimit,
        now: Double
    ) -> (snapshot: LibrarySnapshot, added: Int) {
        var next = snapshot
        var added = 0
        for entry in entries where added < limit {
            guard let updated = LibraryMutator.addWord(
                to: next,
                word: entry.en,
                definition: entry.zh,
                example: "",
                exampleChinese: "",
                phonetic: entry.phonetic,
                pos: entry.pos,
                source: "starter:\(entry.lexicon)",
                now: now - Double(added)
            ) else { continue }
            next = updated
            added += 1
        }
        return (next, added)
    }
}
