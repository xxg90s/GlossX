import Foundation
import GlossXCore
import WidgetKit

/// Owns the daily-streak record. The App Group copy feeds the widget; the iCloud
/// key-value copy survives reinstalls and is shared with the user's other iOS devices.
final class StreakStore {
    private(set) var record: StreakRecord
    private var reviewableCount: Int
    private let defaults = StreakSharedState.sharedDefaults
    private let cloud = NSUbiquitousKeyValueStore.default
    private var observer: NSObjectProtocol?

    var onExternalChange: (() -> Void)?

    init() {
        let shared = StreakSharedState.load(from: defaults)
        record = shared?.record ?? .empty
        reviewableCount = shared?.reviewableCount ?? 0
        observer = NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: cloud,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.mergeFromCloud()
                self?.onExternalChange?()
            }
        }
        cloud.synchronize()
        mergeFromCloud()
    }

    deinit {
        if let observer {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    func update(_ next: StreakRecord, reviewableCount: Int) {
        record = next
        self.reviewableCount = reviewableCount
        publish()
    }

    func refreshReviewableCount(_ count: Int) {
        guard count != reviewableCount else { return }
        reviewableCount = count
        publish(writeCloud: false)
    }

    private func mergeFromCloud() {
        guard let data = cloud.data(forKey: StreakSharedState.keyValueStoreKey),
              let remote = StreakRecord.decode(data) else {
            if record != .empty { publish() }
            return
        }
        let merged = StreakEngine.merge(record, remote)
        record = merged
        publish(writeCloud: merged != remote)
    }

    private func publish(writeCloud: Bool = true) {
        StreakSharedState(record: record, reviewableCount: reviewableCount).save(to: defaults)
        if writeCloud, let data = record.encoded() {
            cloud.set(data, forKey: StreakSharedState.keyValueStoreKey)
            cloud.synchronize()
        }
        WidgetCenter.shared.reloadTimelines(ofKind: StreakSharedState.widgetKind)
    }
}
