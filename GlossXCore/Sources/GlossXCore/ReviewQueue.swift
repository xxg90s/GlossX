import Foundation

public enum ReviewQueue {
    public static let maxNew = 10
    public static let maxDue = 20

    public struct Summary: Equatable {
        public var cards: [ReviewCard]
        public var newCount: Int
        public var dueCount: Int

        public static let empty = Summary(cards: [], newCount: 0, dueCount: 0)

        public init(cards: [ReviewCard], newCount: Int, dueCount: Int) {
            self.cards = cards
            self.newCount = newCount
            self.dueCount = dueCount
        }
    }

    public static func build(from items: [ReviewSourceItem], now: Double) -> Summary {
        let reviewable = items.filter { item in
            item.kind != .sentence
                && item.status != "mastered"
                && item.status != "familiar"
                && item.status != "skipped"
        }

        let newItems = reviewable
            .filter { isNew($0) }
            .sorted { $0.addedAt > $1.addedAt }
            .prefix(maxNew)

        let dueItems = reviewable
            .filter { !isNew($0) && $0.nextReviewAt <= now }
            .sorted { $0.nextReviewAt < $1.nextReviewAt }
            .prefix(maxDue)

        let newCards = newItems.map { card(from: $0, mode: .intro) }
        let dueCards = dueItems.map { card(from: $0, mode: .cloze) }
        return Summary(
            cards: interleave(due: Array(dueCards), new: Array(newCards)),
            newCount: newCards.count,
            dueCount: dueCards.count
        )
    }

    public static func isNew(_ item: ReviewSourceItem) -> Bool {
        item.status == "new" && item.repetitions == 0
    }

    private static func card(from item: ReviewSourceItem, mode: CardMode) -> ReviewCard {
        ReviewCard(
            id: item.id,
            kind: item.kind,
            mode: mode,
            target: item.target,
            lemma: item.lemma,
            phonetic: item.phonetic,
            pos: item.pos,
            definitions: item.definitions,
            english: item.english,
            chinese: item.chinese,
            hostname: item.hostname
        )
    }

    private static func interleave(due: [ReviewCard], new: [ReviewCard]) -> [ReviewCard] {
        var cards: [ReviewCard] = []
        var dueIndex = 0
        var newIndex = 0
        while dueIndex < due.count || newIndex < new.count {
            let dueChunk = min(2, due.count - dueIndex)
            if dueChunk > 0 {
                cards.append(contentsOf: due[dueIndex..<(dueIndex + dueChunk)])
                dueIndex += dueChunk
            }
            if newIndex < new.count {
                cards.append(new[newIndex])
                newIndex += 1
            }
        }
        return cards
    }
}
