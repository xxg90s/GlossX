import Foundation

/// Picks a question type per card by familiarity: recognise first, then hear, then produce.
public enum QuizBuilder {
    public static let optionCount = 4

    public static func prepare(_ cards: [ReviewCard], pool: [ReviewSourceItem]) -> [ReviewCard] {
        let definitions = pool
            .filter { $0.kind != .sentence && !$0.definitionText.isEmpty }
            .map { (id: $0.id, text: $0.definitionText) }
        return cards.map { prepare($0, definitions: definitions) }
    }

    private static func prepare(_ card: ReviewCard, definitions: [(id: String, text: String)]) -> ReviewCard {
        guard card.mode == .cloze else { return card }
        var next = card
        switch preferredMode(for: card) {
        case .choice, .listen:
            guard let options = options(for: card, definitions: definitions) else { return card }
            next.mode = preferredMode(for: card)
            next.options = options
            next.answer = card.definitionText
        case .spell:
            next.mode = .spell
        default:
            break
        }
        return next
    }

    private static func preferredMode(for card: ReviewCard) -> CardMode {
        let isWord = card.kind == .word
        switch card.repetitions {
        case ..<2:
            return .choice
        case 2:
            return isWord ? .listen : .choice
        default:
            return isWord && StableHash.value(card.id) % 2 == 0 ? .spell : .cloze
        }
    }

    private static func options(for card: ReviewCard, definitions: [(id: String, text: String)]) -> [String]? {
        let correct = card.definitionText
        guard !correct.isEmpty else { return nil }
        var seen: Set<String> = [correct]
        let distractors = definitions
            .filter { $0.id != card.id }
            .sorted { StableHash.value(card.id + $0.id) < StableHash.value(card.id + $1.id) }
            .compactMap { candidate -> String? in
                guard !seen.contains(candidate.text) else { return nil }
                seen.insert(candidate.text)
                return candidate.text
            }
            .prefix(optionCount - 1)
        guard distractors.count == optionCount - 1 else { return nil }
        var options = Array(distractors)
        options.insert(correct, at: Int(StableHash.value(card.id) % UInt64(optionCount)))
        return options
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

/// FNV-1a; stable across launches, unlike `Hasher`.
enum StableHash {
    static func value(_ text: String) -> UInt64 {
        var hash: UInt64 = 0xcbf29ce484222325
        for byte in text.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 0x100000001b3
        }
        return hash
    }
}
