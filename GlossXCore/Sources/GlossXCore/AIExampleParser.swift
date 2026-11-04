import Foundation

public struct AIExample: Equatable {
    public var english: String
    public var chinese: String

    public init(english: String, chinese: String) {
        self.english = english
        self.chinese = chinese
    }
}

public enum AIExampleParser {
    public static func prompt(word: String, definition: String, dialect: String) -> String {
        [
            "You are an English teacher for Chinese learners in Mainland China.",
            "Write TWO everyday example sentences that use the word naturally.",
            "Word: \(word)",
            definition.isEmpty ? nil : "Meaning: \(definition)",
            "Dialect: \(dialect).",
            "Rules:",
            "- Each sentence must contain the word (or a regular inflection).",
            "- Keep sentences short (8-16 words).",
            "- chinese MUST be Simplified Chinese and must translate english exactly.",
            "- Prefer the most common modern meaning for learners.",
            "Return ONLY JSON: {\"examples\":[{\"english\":\"...\",\"chinese\":\"简体中文\"},{\"english\":\"...\",\"chinese\":\"简体中文\"}]}"
        ].compactMap { $0 }.joined(separator: "\n")
    }

    public static func parse(_ content: String) -> [AIExample] {
        guard let object = decodeJSON(content) else { return [] }
        let rows: [[String: Any]]
        if let examples = object["examples"] as? [[String: Any]] {
            rows = examples
        } else if let example = object["example"] as? [String: Any] {
            rows = [example]
        } else {
            rows = []
        }
        return rows.compactMap { row in
            let english = JSONValue.string(row["english"]).trimmingCharacters(in: .whitespacesAndNewlines)
            let chinese = JSONValue.string(row["chinese"]).trimmingCharacters(in: .whitespacesAndNewlines)
            return english.isEmpty ? nil : AIExample(english: english, chinese: chinese)
        }.prefix(2).map { $0 }
    }

    private static func decodeJSON(_ content: String) -> [String: Any]? {
        var trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        trimmed = trimmed.replacingOccurrences(of: "^```(?:json|javascript|js)?\\s*", with: "", options: .regularExpression)
        trimmed = trimmed.replacingOccurrences(of: "\\s*```$", with: "", options: .regularExpression)
        if let data = trimmed.data(using: .utf8),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            return object
        }
        guard let range = trimmed.range(of: "\\{[\\s\\S]*\\}", options: .regularExpression) else { return nil }
        let slice = String(trimmed[range])
        guard let data = slice.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
}
