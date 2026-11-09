import Foundation

public enum SpellInput {
    /// Curly quotes from some keyboards become the apostrophe used in words like "don't".
    public static func normalize(_ raw: String) -> String {
        raw
            .replacingOccurrences(of: "’", with: "'")
            .replacingOccurrences(of: "‘", with: "'")
            .replacingOccurrences(of: "＇", with: "'")
    }

    /// Latin letters, spaces, hyphens and apostrophes. Empty is allowed so deletion still works.
    /// Accented letters such as é stay; Han, kana and hangul do not.
    public static func accepts(_ text: String) -> Bool {
        normalize(text).allSatisfy { character in
            if character == " " || character == "'" || character == "-" { return true }
            guard character.isLetter else { return false }
            return character.unicodeScalars.allSatisfy { !isCJK($0.value) }
        }
    }

    private static func isCJK(_ value: UInt32) -> Bool {
        (0x3400...0x9FFF).contains(value)
            || (0xF900...0xFAFF).contains(value)
            || (0x3040...0x30FF).contains(value)
            || (0xAC00...0xD7AF).contains(value)
    }
}

public enum SpellCheck {
    public static func grade(input: String, answer: String) -> ReviewGrade {
        let typed = normalize(input)
        let expected = normalize(answer)
        guard !typed.isEmpty else { return .forgot }
        if typed == expected { return .remembered }
        if expected.count >= 4 && distance(typed, expected) == 1 { return .fuzzy }
        return .forgot
    }

    /// First letter plus one underscore per remaining character, e.g. `a _ _ _ _`.
    public static func hint(for answer: String) -> String {
        let letters = Array(answer.trimmingCharacters(in: .whitespacesAndNewlines))
        guard let first = letters.first else { return "" }
        return ([String(first)] + letters.dropFirst().map { $0 == " " ? " " : "_" }).joined(separator: " ")
    }

    private static func normalize(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func distance(_ a: String, _ b: String) -> Int {
        let a = Array(a)
        let b = Array(b)
        if a.isEmpty { return b.count }
        if b.isEmpty { return a.count }
        var previous = Array(0...b.count)
        for i in 1...a.count {
            var current = [i] + Array(repeating: 0, count: b.count)
            for j in 1...b.count {
                let cost = a[i - 1] == b[j - 1] ? 0 : 1
                current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
            }
            previous = current
        }
        return previous[b.count]
    }
}

