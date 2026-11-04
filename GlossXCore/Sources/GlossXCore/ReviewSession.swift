import Foundation

public struct ReviewSession: Equatable {
    /// Cards answered "forgot" or "fuzzy" come back this many cards later, until remembered.
    public static let relearnGap = 3

    public var cards: [ReviewCard]
    public var index: Int
    public var revealed: Bool
    public var gradedIds: Set<String>

    public init(cards: [ReviewCard], index: Int = 0, revealed: Bool = false) {
        self.cards = cards
        self.index = index
        self.revealed = revealed
        self.gradedIds = []
    }

    public var current: ReviewCard? {
        guard index >= 0, index < cards.count else { return nil }
        return cards[index]
    }

    /// Only a card's first grade in a session reaches SM-2 and the streak.
    public var isFirstAttempt: Bool {
        guard let current else { return false }
        return !gradedIds.contains(current.id)
    }

    public var remaining: Int {
        max(0, cards.count - index)
    }

    public var isFinished: Bool {
        index >= cards.count
    }

    public var showsAnswer: Bool {
        guard let current else { return false }
        return current.mode == .intro || revealed
    }

    /// Self-grade buttons; auto-graded modes grade from the answer instead.
    public var showsGradeButtons: Bool {
        guard let current else { return false }
        return showsAnswer && !current.mode.isAutoGraded
    }

    public var progressText: String {
        guard !cards.isEmpty else { return "0 / 0" }
        if isFinished { return "\(cards.count) / \(cards.count)" }
        return "\(index + 1) / \(cards.count)"
    }

    public mutating func handleTap() {
        guard current?.mode == .cloze, !revealed else { return }
        revealed = true
    }

    public mutating func advanceAfterGrade(_ grade: ReviewGrade = .remembered) {
        if let card = current {
            gradedIds.insert(card.id)
            if grade != .remembered {
                var again = card
                if again.mode == .intro {
                    again.mode = .cloze
                }
                let position = min(index + 1 + Self.relearnGap, cards.count)
                cards.insert(again, at: position)
            }
        }
        index += 1
        revealed = false
    }
}
