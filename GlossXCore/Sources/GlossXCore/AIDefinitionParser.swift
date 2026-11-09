import Foundation

public struct AIDefinition: Equatable {
    public var definition: String
    public var phonetic: String
    public var pos: String

    public init(definition: String, phonetic: String, pos: String) {
        self.definition = definition
        self.phonetic = phonetic
        self.pos = pos
    }
}

public enum AIDefinitionParser {
    public static func prompt(word: String) -> String {
        """
        You are an English dictionary for Chinese learners in Mainland China.
        Word: \(word)
        Give the single most common learner meaning.
        Return ONLY JSON: {"definition":"简体中文","phonetic":"/.../","pos":"n"}
        definition MUST be Simplified Chinese and MUST NOT be the English word itself.
        phonetic and pos may be empty strings.
        """
    }

    public static func parse(_ content: String, word: String) -> AIDefinition? {
        guard let object = decodeJSON(content) else { return nil }
        let definition = JSONValue.string(object["definition"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let expected = word.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !definition.isEmpty, definition.compare(expected, options: .caseInsensitive) != .orderedSame else {
            return nil
        }
        return AIDefinition(
            definition: definition,
            phonetic: JSONValue.string(object["phonetic"]).trimmingCharacters(in: .whitespacesAndNewlines),
            pos: JSONValue.string(object["pos"]).trimmingCharacters(in: .whitespacesAndNewlines)
        )
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
