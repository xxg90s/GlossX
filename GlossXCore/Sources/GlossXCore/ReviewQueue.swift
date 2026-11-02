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

    /// - Parameters:
    ///   - goal: Cards still needed for today's streak goal. When the regular queue is shorter,
    ///     it is padded with the earliest upcoming reviews, then with new cards beyond `maxNew`.
    ///   - excludedIds: Cards already reviewed today; never used for padding.
    public static func build(
        from items: [ReviewSourceItem],
        now: Double,
        goal: Int = 0,
        excludedIds: Set<String> = []
    ) -> Summary {
        let reviewable = items.filter(isReviewable)

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
        var cards = interleave(due: Array(dueCards), new: Array(newCards))
        var newCount = newCards.count
        var dueCount = dueCards.count

        let shortfall = goal - cards.count
        if shortfall > 0 {
            let taken = Set(cards.map(\.id)).union(excludedIds)
            let pool = reviewable.filter { !taken.contains($0.id) }
            let ahead = pool
                .filter { !isNew($0) }
                .sorted { $0.nextReviewAt < $1.nextReviewAt }
                .map { card(from: $0, mode: .cloze) }
            let extraNew = pool
                .filter { isNew($0) }
                .sorted { $0.addedAt > $1.addedAt }
                .map { card(from: $0, mode: .intro) }
            let padding = (ahead + extraNew).prefix(shortfall)
            cards.append(contentsOf: padding)
            newCount += padding.filter(\.isNew).count
            dueCount += padding.filter { !$0.isNew }.count
        }

        return Summary(cards: cards, newCount: newCount, dueCount: dueCount)
    }

    /// Cards that count toward the daily goal; cards reviewed today stay counted even if
    /// that review graduated them out of the queue.
    public static func reviewableCount(in items: [ReviewSourceItem], includingReviewed reviewedIds: Set<String> = []) -> Int {
        items.filter { isReviewable($0) || (reviewedIds.contains($0.id) && $0.kind != .sentence) }.count
    }

    public static func isReviewable(_ item: ReviewSourceItem) -> Bool {
        item.kind != .sentence
            && item.status != "mastered"
            && item.status != "familiar"
            && item.status != "skipped"
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
