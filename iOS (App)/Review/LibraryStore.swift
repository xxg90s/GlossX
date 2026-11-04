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
        if pendingReviewLaunch {
            pendingReviewLaunch = false
            startReview()
        }
    }

    func startReview() {
        let summary = queue
        guard !summary.cards.isEmpty else { return }
        session = ReviewSession(cards: QuizBuilder.prepare(summary.cards, pool: items))
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

    func grade(_ grade: ReviewGrade) {
        guard let current = session, let card = current.current else { return }
        undoStep = UndoStep(
            session: current,
            itemId: card.id,
            vocabItem: snapshot.payload.vocabItems[card.id],
            snippetItem: snapshot.payload.snippetItems[card.id],
            stats: snapshot.payload.stats,
            streak: streakStore.record,
            celebration: celebrationStreak
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
        snapshot.updatedAt = Self.now
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

    func setSkipped(id: String, skipped: Bool) {
        snapshot = LibraryMutator.setSkipped(in: snapshot, id: id, skipped: skipped, now: Self.now)
        libraryDidChange()
    }

    /// False when the word is blank or already collected.
    @discardableResult
    func addWord(_ word: String, definition: String, example: String, exampleChinese: String) -> Bool {
        guard let next = LibraryMutator.addWord(
            to: snapshot,
            word: word,
            definition: definition,
            example: example,
            exampleChinese: exampleChinese,
            now: Self.now
        ) else { return false }
        snapshot = next
        libraryDidChange()
        return true
    }

    private func libraryDidChange() {
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

    private func rescheduleReminder() {
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
                persistLocal()
                if !SnapshotCodec.samePayload(merged, cloud) {
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
