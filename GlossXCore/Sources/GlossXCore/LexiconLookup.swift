import Foundation

public enum LexiconLookup {
    /// First exact `en` match. Catalogs are searched in the order given; within one catalog, the first entry wins.
    public static func find(word: String, in catalogs: [[StarterPack.Entry]]) -> StarterPack.Entry? {
        let key = word.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !key.isEmpty else { return nil }
        for entries in catalogs {
            if let match = entries.first(where: { $0.en.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == key }) {
                return match
            }
        }
        return nil
    }
}
