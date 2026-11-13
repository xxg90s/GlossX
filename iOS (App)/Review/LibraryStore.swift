import Combine
import Foundation
import GlossXCore
import SwiftUI

final class LibraryStore: ObservableObject {
    @Published var snapshot: LibrarySnapshot {
        didSet { rebuildItems() }
    }
    @Published var sync: SyncStatus
    private(set) var items: [ReviewSourceItem] = []
    private var itemsById: [String: ReviewSourceItem] = [:]
    @Published var session: ReviewSession?
    @Published var isReviewing = false
    @Published var reminderEnabled: Bool
    @Published var lastError: String = ""
    @Published var celebrationStreak: Int?
    @Published private(set) var undoStep: UndoStep?

    struct UndoStep {
        let session: ReviewSession
        let itemId: String
        let vocabItem: [String: Any]?
        let snippetItem: [String: Any]?
        let stats: [String: Any]
        let streak: StreakRecord
        let celebration: Int?
        let deletedItems: [String: Double]
        let starterPacks: [String: StarterPackRecord]?
    }

    private var pushTask: Task<Void, Never>?
    private var downloadRetries = 0
    private var pendingReviewLaunch = false
    private let streakStore = StreakStore()

    init() {
        if let cached = LocalLibraryCache.load() {
            snapshot = cached
            sync = .loading
        } else {
            snapshot = SnapshotCodec.empty(now: Self.now)
            sync = .loading
        }
        reminderEnabled = ReviewReminder.isEnabled
        rebuildItems()
        let packsBeforePrepare = snapshot.payload.starterPacks
        reconcilePacks()
        if snapshot.payload.starterPacks != packsBeforePrepare {
            persistLocal()
            schedulePush()
        }
        streakStore.onExternalChange = { [weak self] in
            self?.objectWillChange.send()
            self?.rescheduleReminder()
        }
    }

    func item(id: String) -> ReviewSourceItem? {
        itemsById[id]
    }

    private func rebuildItems() {
        items = LibraryMapper.items(from: snapshot)
        itemsById = Dictionary(items.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }

    var queue: ReviewQueue.Summary {
        ReviewQueue.build(
            from: items,
            now: Self.now,
            goal: streakStatus.remaining,
            excludedIds: todayReviewedIds
        )
    }

    var streakStatus: StreakStatus {
        StreakEngine.status(streakStore.record, reviewableCount: reviewableCount, today: Self.today)
    }

    var streak: Int {
        streakStatus.streak
    }

    var stats: LibraryStatsSummary {
        LibraryStats.summarize(items: items, record: streakStore.record, today: Self.today, now: Self.now)
    }

    var dailyGoal: Int {
        streakStore.record.goal
    }

    var homeState: TodayHomeState {
        TodayHome.state(
            sync: sync,
            queue: queue,
            streak: streak,
            remainingOverride: session.map(\.remaining),
            hasCollectibles: !items.isEmpty
        )
    }

    private var todayReviewedIds: Set<String> {
        let progress = streakStore.record.today
        return progress.date == Self.today ? Set(progress.reviewedIds) : []
    }

    private var reviewableCount: Int {
        ReviewQueue.reviewableCount(in: items, includingReviewed: todayReviewedIds, now: Self.now)
    }

    var syncLabel: String {
        switch sync {
        case .synced(let label):
            return label
        case .error(let message):
            return message
        case .signedOut:
            return "未登录 iCloud，收藏仅保存在本机"
        case .unavailable:
            return "正在连接 iCloud…"
        case .downloading, .loading:
            return "正在从 iCloud 读取…"
        }
    }

    func refresh() async {
        if isReviewing { return }
        if snapshot.payload.vocabItems.isEmpty && snapshot.payload.snippetItems.isEmpty {
            sync = .loading
        }
        let result = await Self.readCloud()
        applyRead(result)
        streakStore.refreshReviewableCount(reviewableCount)
        rescheduleReminder()
        let unresolved = await backfillLexiconDefinitions()
        if pendingReviewLaunch {
            pendingReviewLaunch = false
            startReview()
        }
        await backfillAIDefinitions(unresolved)
    }

    func startReview() {
        let summary = queue
        guard !summary.cards.isEmpty else { return }
        session = ReviewSession(cards: summary.cards)
        undoStep = nil
        isReviewing = true
    }

    /// Opened from the widget: start right away from the local cache, or once the iCloud read lands.
    func openReviewFromWidget() {
        guard !isReviewing else { return }
        if queue.cards.isEmpty {
            pendingReviewLaunch = true
        } else {
            startReview()
        }
    }

    func setDailyGoal(_ goal: Int) {
        let next = StreakEngine.setGoal(
            streakStore.record,
            goal: goal,
            reviewableCount: reviewableCount,
            today: Self.today,
            now: Self.now
        )
        streakStore.update(next, reviewableCount: reviewableCount)
        objectWillChange.send()
        rescheduleReminder()
    }

    func dismissCelebration() {
        celebrationStreak = nil
    }

    func closeReview() {
        isReviewing = false
        session = nil
        undoStep = nil
        objectWillChange.send()
    }

    func handleCardTap() {
        session?.handleTap()
        objectWillChange.send()
    }

    /// Seen the new word. The spelling card later in this session is the first real grade.
    func acknowledgeIntro() {
        guard let current = session, let card = current.current, card.mode == .intro else { return }
        undoStep = UndoStep(
            session: current,
            itemId: card.id,
            vocabItem: snapshot.payload.vocabItems[card.id],
            snippetItem: snapshot.payload.snippetItems[card.id],
            stats: snapshot.payload.stats,
            streak: streakStore.record,
            celebration: celebrationStreak,
            deletedItems: snapshot.payload.deletedItems,
            starterPacks: snapshot.payload.starterPacks
        )
        snapshot = LibraryMutator.markIntroduced(in: snapshot, id: card.id, now: Self.now)
        reconcilePacks()
        session?.acknowledgeIntro()
        persistLocal()
        schedulePush()
        objectWillChange.send()
    }

    @discardableResult
    func saveDefinition(id: String, definition: String) -> Bool {
        guard let next = LibraryMutator.fillDefinition(
            in: snapshot,
            id: id,
            definition: definition,
            now: Self.now
        ) else { return false }
        snapshot = next
        libraryDidChange()
        return true
    }

    var wordsAwaitingDefinition: Int {
        items.filter {
            $0.kind == .word && $0.definitionText.isEmpty && $0.status != "familiar" && $0.status != "skipped"
        }.count
    }

    var hasAnythingToReview: Bool {
        reviewableCount > 0
    }

    func grade(_ grade: ReviewGrade) {
        guard let current = session, let card = current.current else { return }
        undoStep = UndoStep(
            session: current,
            itemId: card.id,
            vocabItem: snapshot.payload.vocabItems[card.id],
            snippetItem: snapshot.payload.snippetItems[card.id],
            stats: snapshot.payload.stats,
            streak: streakStore.record,
            celebration: celebrationStreak,
            deletedItems: snapshot.payload.deletedItems,
            starterPacks: snapshot.payload.starterPacks
        )
        if current.isFirstAttempt {
            let wasCompleted = streakStatus.todayCompleted
            snapshot = LibraryMutator.applyGrade(
                to: snapshot,
                id: card.id,
                grade: grade,
                now: Self.now,
                today: Self.today
            )
            reconcilePacks()
            recordStreakReview(id: card.id, wasCompleted: wasCompleted)
            persistLocal()
            schedulePush()
        }
        session?.advanceAfterGrade(grade)
        objectWillChange.send()
    }

    func undoLastGrade() {
        guard let step = undoStep else { return }
        undoStep = nil
        snapshot.payload.vocabItems[step.itemId] = step.vocabItem
        snapshot.payload.snippetItems[step.itemId] = step.snippetItem
        snapshot.payload.stats = step.stats
        snapshot.payload.deletedItems = step.deletedItems
        snapshot.payload.starterPacks = step.starterPacks
        snapshot.updatedAt = Self.now
        reconcilePacks()
        streakStore.update(step.streak, reviewableCount: reviewableCount)
        celebrationStreak = step.celebration
        session = step.session
        isReviewing = true
        persistLocal()
        schedulePush()
        rescheduleReminder()
        objectWillChange.send()
    }

    func markFamiliar(id: String) {
        snapshot = LibraryMutator.markFamiliar(in: snapshot, id: id, now: Self.now)
        libraryDidChange()
    }

    func deleteItem(id: String) {
        snapshot = LibraryMutator.delete(in: snapshot, id: id, now: Self.now)
        libraryDidChange()
    }

    /// Removes the card being practiced. It leaves this round, including a later copy, and can be undone.
    func deleteCurrentCard() {
        guard let current = session, let card = current.current else { return }
        undoStep = UndoStep(
            session: current,
            itemId: card.id,
            vocabItem: snapshot.payload.vocabItems[card.id],
            snippetItem: snapshot.payload.snippetItems[card.id],
            stats: snapshot.payload.stats,
            streak: streakStore.record,
            celebration: celebrationStreak,
            deletedItems: snapshot.payload.deletedItems,
            starterPacks: snapshot.payload.starterPacks
        )
        snapshot = LibraryMutator.delete(in: snapshot, id: card.id, now: Self.now)
        session?.drop(id: card.id)
        streakStore.refreshReviewableCount(reviewableCount)
        persistLocal()
        schedulePush()
        rescheduleReminder()
        objectWillChange.send()
    }

    func setSkipped(id: String, skipped: Bool) {
        snapshot = LibraryMutator.setSkipped(in: snapshot, id: id, skipped: skipped, now: Self.now)
        libraryDidChange()
    }

    /// False when the word is blank or already collected.
    @discardableResult
    func addWord(_ word: String, definition: String, example: String, exampleChinese: String) -> Bool {
        if let next = LibraryMutator.addWord(
            to: snapshot,
            word: word,
            definition: definition,
            example: example,
            exampleChinese: exampleChinese,
            now: Self.now
        ) {
            snapshot = next
            libraryDidChange()
            return true
        }
        let id = word.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let claimed = StarterPackMembership.claim(snapshot, id: id, source: "ios", now: Self.now) {
            snapshot = claimed
            libraryDidChange()
        }
        return false
    }

    @discardableResult
    func setExtraExample(id: String, english: String, chinese: String) -> Bool {
        guard let next = LibraryMutator.setExtraExample(
            in: snapshot,
            id: id,
            english: english,
            chinese: chinese,
            now: Self.now
        ) else { return false }
        snapshot = next
        libraryDidChange()
        return true
    }

    func importShareInbox() {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: StreakSharedState.appGroupID
        ) else { return }
        let records = (try? ShareInbox.consume(in: container)) ?? []
        guard !records.isEmpty else { return }
        var next = snapshot
        var changed = false
        for record in records {
            let now = record.addedAt > 0 ? record.addedAt : Self.now
            if let updated = LibraryMutator.importSharedText(record.text, into: next, now: now) {
                next = updated
                changed = true
            } else if ShareInbox.classify(record.text) == .word {
                let id = ShareInbox.normalize(record.text).lowercased()
                if let claimed = StarterPackMembership.claim(next, id: id, source: "share", now: now) {
                    next = claimed
                    changed = true
                }
            }
        }
        guard changed else { return }
        snapshot = next
        libraryDidChange()
    }

    func isStarterPackEnabled(_ lexiconId: String) -> Bool {
        snapshot.payload.starterPacks?[lexiconId]?.enabled == true
    }

    func starterPackRemovableCount(_ lexiconId: String) -> Int {
        guard isStarterPackEnabled(lexiconId) else { return 0 }
        return snapshot.payload.starterPacks?[lexiconId]?.ids.count ?? 0
    }

    func starterPackDetail(_ lexiconId: String) -> String {
        guard isStarterPackEnabled(lexiconId) else { return "未加入" }
        let count = starterPackRemovableCount(lexiconId)
        if count == 0 { return "已加入，没有可移出的词" }
        return "已加入，还可移出 \(count) 个"
    }

    func starterPackLeaveMessage(_ lexiconId: String) -> String {
        let count = starterPackRemovableCount(lexiconId)
        if count == 0 {
            return "没有可移出的词。这个词包会关掉，已练过的会留在词库里。"
        }
        return "将移出 \(count) 个还没练过的词。已练过或你另外收藏的会保留。"
    }

    /// `nil` when the word list cannot be read. `0` when every word is already in the library.
    @discardableResult
    func joinStarterPack(_ lexiconId: String, limit: Int = StarterPack.defaultLimit) -> Int? {
        guard let url = Bundle.main.builtInPlugInsURL?
            .appendingPathComponent("GlossX Extension.appex")
            .appendingPathComponent(StarterPack.fileName(for: lexiconId)),
            let data = try? Data(contentsOf: url)
        else { return nil }
        let result = StarterPackMembership.join(
            snapshot,
            lexiconId: lexiconId,
            entries: StarterPack.parse(data),
            limit: limit,
            now: Self.now
        )
        guard result.added > 0 else { return 0 }
        snapshot = result.snapshot
        libraryDidChange()
        return result.added
    }

    func leaveStarterPack(_ lexiconId: String) {
        let result = StarterPackMembership.leave(snapshot, lexiconId: lexiconId, now: Self.now)
        snapshot = result.snapshot
        if var current = session {
            for id in result.removedIds {
                current.drop(id: id)
            }
            session = current
        }
        libraryDidChange()
    }

    /// Number of words added; 0 when the list is missing or every word is already collected.
    @discardableResult
    func importStarterPack(_ lexiconId: String, limit: Int = StarterPack.defaultLimit) -> Int {
        joinStarterPack(lexiconId, limit: limit) ?? 0
    }

    private func libraryDidChange() {
        reconcilePacks()
        streakStore.refreshReviewableCount(reviewableCount)
        persistLocal()
        schedulePush()
        rescheduleReminder()
    }

    func setReminderEnabled(_ enabled: Bool) {
        reminderEnabled = enabled
        ReviewReminder.isEnabled = enabled
        rescheduleReminder()
    }

    var reminderMinutes: Int {
        ReviewReminder.minutesOfDay
    }

    func setReminderMinutes(_ minutes: Int) {
        ReviewReminder.minutesOfDay = minutes
        objectWillChange.send()
        rescheduleReminder()
    }

    private func recordStreakReview(id: String, wasCompleted: Bool) {
        var reviewed = todayReviewedIds
        reviewed.insert(id)
        let count = ReviewQueue.reviewableCount(in: items, includingReviewed: reviewed, now: Self.now)
        let next = StreakEngine.recordReview(
            streakStore.record,
            id: id,
            reviewableCount: count,
            today: Self.today,
            now: Self.now
        )
        streakStore.update(next, reviewableCount: count)
        let status = streakStatus
        if !wasCompleted && status.todayCompleted {
            celebrationStreak = status.streak
        }
        rescheduleReminder()
    }

    /// Waits for onboarding so the notification permission prompt doesn't cover the welcome screens.
    func rescheduleReminder() {
        guard Onboarding.isDone else { return }
        let record = streakStore.record
        let count = reviewableCount
        let enabled = reminderEnabled
        Task {
            await ReviewReminder.sync(enabled: enabled) { day in
                StreakEngine.status(record, reviewableCount: count, today: day)
            }
        }
    }

    private func applyRead(_ result: ICloudReadResult) {
        let now = Self.now
        switch result {
        case .signedOut:
            downloadRetries = 0
            sync = .signedOut
        case .unavailable:
            sync = snapshotHasItems ? syncAfterLocal("正在连接 iCloud…") : .unavailable
        case .downloading:
            sync = .downloading
            if downloadRetries < 5 {
                downloadRetries += 1
                Task {
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    await refresh()
                }
            } else {
                downloadRetries = 0
                sync = snapshotHasItems
                    ? .synced(label: "正在连接 iCloud…")
                    : .error("正在从 iCloud 读取…超时")
            }
        case .missing:
            downloadRetries = 0
            persistLocal()
            if snapshotHasItems {
                schedulePush()
                sync = .synced(label: TodayHome.formatSyncLabel(status: "synced", lastAt: now, now: now))
            } else {
                sync = .synced(label: TodayHome.formatSyncLabel(status: "synced", lastAt: 0, now: now))
            }
        case .content(let data):
            downloadRetries = 0
            do {
                let cloud = try SnapshotCodec.decode(data)
                let local = snapshot
                let merged = SnapshotMerge.merge(cloud: cloud, local: local, now: now)
                snapshot = merged
                reconcilePacks()
                persistLocal()
                if !SnapshotCodec.samePayload(snapshot, cloud) {
                    schedulePush()
                }
                sync = .synced(label: TodayHome.formatSyncLabel(status: "synced", lastAt: now, now: now))
            } catch SnapshotCodec.CodecError.unsupportedVersion {
                lastError = "云端数据版本过新，请更新 GlossX"
                sync = .error(lastError)
            } catch {
                lastError = "云端数据无法读取"
                sync = .error(lastError)
            }
        case .failure(let message):
            lastError = message
            sync = snapshotHasItems ? .error("上次同步失败：\(message)") : .error(message)
        }
    }

    private var snapshotHasItems: Bool {
        !snapshot.payload.vocabItems.isEmpty || !snapshot.payload.snippetItems.isEmpty
    }

    private static var lexiconCatalogs: [[StarterPack.Entry]]?

    private func reconcilePacks() {
        let next = StarterPackMembership.prepare(
            snapshot,
            definitions: Self.lexiconDefinitions(),
            now: Self.now
        )
        if next.payload.starterPacks != snapshot.payload.starterPacks {
            snapshot = next
        }
    }

    private static func lexiconDefinitions() -> [String: [String: String]]? {
        let catalogs = loadLexiconCatalogs()
        guard !catalogs.isEmpty else { return nil }
        var index: [String: [String: String]] = [:]
        for entries in catalogs {
            for entry in entries {
                let id = entry.en.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                guard !id.isEmpty else { continue }
                var words = index[entry.lexicon] ?? [:]
                if words[id] == nil {
                    words[id] = entry.zh
                }
                index[entry.lexicon] = words
            }
        }
        return index
    }

    private static func loadLexiconCatalogs() -> [[StarterPack.Entry]] {
        if let lexiconCatalogs { return lexiconCatalogs }
        guard let plugins = Bundle.main.builtInPlugInsURL else {
            lexiconCatalogs = []
            return []
        }
        let loaded = StarterPack.lexicons.compactMap { lexicon -> [StarterPack.Entry]? in
            let url = plugins
                .appendingPathComponent("GlossX Extension.appex")
                .appendingPathComponent(StarterPack.fileName(for: lexicon.id))
            guard let data = try? Data(contentsOf: url) else { return nil }
            let entries = StarterPack.parse(data)
            return entries.isEmpty ? nil : entries
        }
        lexiconCatalogs = loaded
        return loaded
    }

    /// Fills empty definitions from the bundled word lists. Returns words the lists do not contain.
    private func backfillLexiconDefinitions() async -> [(id: String, word: String)] {
        guard !isReviewing else { return [] }
        let catalogs = Self.loadLexiconCatalogs()
        var next = snapshot
        var changed = false
        var unresolved: [(id: String, word: String)] = []
        for (id, raw) in snapshot.payload.vocabItems where JSONValue.stringArray(raw["definitions"]).isEmpty {
            let stored = JSONValue.string(raw["word"]).trimmingCharacters(in: .whitespacesAndNewlines)
            let word = stored.isEmpty ? id : stored
            if let entry = LexiconLookup.find(word: word, in: catalogs),
               let updated = LibraryMutator.fillDefinition(
                in: next,
                id: id,
                definition: entry.zh,
                phonetic: entry.phonetic,
                pos: entry.pos,
                now: Self.now
               ) {
                next = updated
                changed = true
            } else {
                unresolved.append((id, word))
            }
        }
        if changed {
            snapshot = next
            libraryDidChange()
        }
        return unresolved
    }

    /// One model request per word the lexicon missed. Stops if a review starts.
    private func backfillAIDefinitions(_ unresolved: [(id: String, word: String)]) async {
        guard !isReviewing else { return }
        guard !unresolved.isEmpty,
              case .success = AIConfig.resolve(settings: snapshot.payload.settings, aiKeys: snapshot.payload.aiKeys)
        else { return }
        for item in unresolved {
            if Task.isCancelled || isReviewing { return }
            guard JSONValue.stringArray(snapshot.payload.vocabItems[item.id]?["definitions"]).isEmpty else { continue }
            guard let parsed = try? await AIDefinitionClient.lookup(word: item.word, snapshot: snapshot),
                  let updated = LibraryMutator.fillDefinition(
                    in: snapshot,
                    id: item.id,
                    definition: parsed.definition,
                    phonetic: parsed.phonetic,
                    pos: parsed.pos,
                    now: Self.now
                  )
            else { continue }
            snapshot = updated
            libraryDidChange()
        }
    }

    private func persistLocal() {
        LocalLibraryCache.save(snapshot)
    }

    private func schedulePush() {
        pushTask?.cancel()
        let data: Data
        do {
            data = try SnapshotCodec.encode(snapshot)
        } catch {
            lastError = error.localizedDescription
            sync = .error("上次同步失败：\(error.localizedDescription)")
            return
        }
        pushTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            let result = await Self.writeCloud(data)
            if Task.isCancelled { return }
            switch result {
            case .success:
                sync = .synced(label: TodayHome.formatSyncLabel(status: "synced", lastAt: Self.now, now: Self.now))
            case .signedOut:
                sync = .signedOut
            case .unavailable:
                break
            case .failure(let message):
                lastError = message
                sync = .error("上次同步失败：\(message)")
            }
        }
    }

    private static var now: Double {
        Date().timeIntervalSince1970 * 1000
    }

    private static var today: String {
        DayStamp.string(fromMilliseconds: now)
    }

    private static func readCloud() async -> ICloudReadResult {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                continuation.resume(returning: ICloudLibraryFile.read())
            }
        }
    }

    private static func writeCloud(_ data: Data) async -> ICloudWriteResult {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                continuation.resume(returning: ICloudLibraryFile.write(data))
            }
        }
    }

    private func syncAfterLocal(_ fallback: String) -> SyncStatus {
        snapshotHasItems ? .synced(label: fallback) : .unavailable
    }
}
