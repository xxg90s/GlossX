import Foundation

public enum Cloze {
    public static func make(
        english: String,
        chinese: String,
        target: String,
        lemma: String = ""
    ) -> ClozePrompt {
        let sentence = english.trimmingCharacters(in: .whitespacesAndNewlines)
        let chineseText = chinese.trimmingCharacters(in: .whitespacesAndNewlines)
        if let match = firstMatch(in: sentence, of: target) ?? firstMatch(in: sentence, of: lemma) {
            return ClozePrompt(
                before: String(sentence[..<match.range.lowerBound]),
                blank: match.text,
                after: String(sentence[match.range.upperBound...]),
                chinese: chineseText
            )
        }
        let fallback = target.trimmingCharacters(in: .whitespacesAndNewlines)
        return ClozePrompt(before: "", blank: fallback, after: "", chinese: chineseText)
    }

    private static func firstMatch(in sentence: String, of rawTarget: String) -> (range: Range<String.Index>, text: String)? {
        let target = rawTarget.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sentence.isEmpty, !target.isEmpty else { return nil }
        let escaped = NSRegularExpression.escapedPattern(for: target)
        let pattern = target.contains(" ") ? escaped : "\\b\(escaped)\\b"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
            return nil
        }
        let nsRange = NSRange(sentence.startIndex..<sentence.endIndex, in: sentence)
        guard let match = regex.firstMatch(in: sentence, options: [], range: nsRange),
              let range = Range(match.range, in: sentence) else {
            return nil
        }
        return (range, String(sentence[range]))
    }
}
