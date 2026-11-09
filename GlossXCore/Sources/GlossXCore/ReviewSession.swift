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

    /// Self-grade buttons. Intro only acknowledges; spelling grades itself.
    public var showsGradeButtons: Bool {
        guard let current else { return false }
        if current.mode == .intro || current.mode.isAutoGraded { return false }
        return showsAnswer
    }

    public var progressText: String {
        guard !cards.isEmpty else { return "还剩 0" }
        if isFinished { return "还剩 0" }
        return "还剩 \(remaining)"
    }

    public mutating func handleTap() {
        guard current?.mode.revealsOnTap == true, !revealed else { return }
        revealed = true
    }

    /// Marks a new word as seen and queues a spelling card. Does not count as a grade.
    public mutating func acknowledgeIntro() {
        guard var card = current, card.mode == .intro else { return }
        card.mode = .spell
        let position = min(index + 1 + Self.relearnGap, cards.count)
        cards.insert(card, at: position)
        index += 1
        revealed = false
    }

    public mutating func advanceAfterGrade(_ grade: ReviewGrade = .remembered) {
        if let card = current {
            gradedIds.insert(card.id)
            if grade != .remembered {
                var again = card
                if again.mode == .intro {
                    again.mode = .spell
                }
                let position = min(index + 1 + Self.relearnGap, cards.count)
                cards.insert(again, at: position)
            }
        }
        index += 1
        revealed = false
    }
}
