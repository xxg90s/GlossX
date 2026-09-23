import Foundation

public struct ReviewSession: Equatable {
    public var cards: [ReviewCard]
    public var index: Int
    public var revealed: Bool

    public init(cards: [ReviewCard], index: Int = 0, revealed: Bool = false) {
        self.cards = cards
        self.index = index
        self.revealed = revealed
    }

    public var current: ReviewCard? {
        guard index >= 0, index < cards.count else { return nil }
        return cards[index]
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

    public var showsGradeButtons: Bool {
        current != nil && showsAnswer
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

    public mutating func advanceAfterGrade() {
        index += 1
        revealed = false
    }
}
