import Foundation

public enum SyncStatus: Equatable {
    case loading
    case signedOut
    case unavailable
    case downloading
    case synced(label: String)
    case error(String)
}

public enum TodayHomeState: Equatable {
    case loading
    case signedOut
    case empty
    case due(remaining: Int, newCount: Int, reviewCount: Int, streak: Int, syncLabel: String)
    case done(streak: Int, syncLabel: String)
}

public enum TodayHome {
    public static func state(
        sync: SyncStatus,
        queue: ReviewQueue.Summary,
        streak: Int,
        remainingOverride: Int? = nil,
        hasCollectibles: Bool = false
    ) -> TodayHomeState {
        switch sync {
        case .loading, .downloading:
            return .loading
        case .signedOut:
            if queue.cards.isEmpty && remainingOverride != 0 {
                return .signedOut
            }
        case .unavailable, .error, .synced:
            break
        }

        let remaining = remainingOverride ?? queue.cards.count
        let label = syncLabel(sync)
        if remaining == 0 {
            if queue.cards.isEmpty && !hasCollectibles && remainingOverride == nil {
                return .empty
            }
            return .done(streak: streak, syncLabel: label)
        }
        return .due(
            remaining: remaining,
            newCount: queue.newCount,
            reviewCount: queue.dueCount,
            streak: streak,
            syncLabel: label
        )
    }

    public static func formatSyncLabel(status: String, lastError: String = "", lastAt: Double, now: Double) -> String {
        switch status {
        case "signedOut":
            return "未登录 iCloud，收藏仅保存在本机"
        case "downloading":
            return "正在从 iCloud 读取…"
        case "unavailable":
            return "正在连接 iCloud…"
        case "pushing":
            return "正在上传…"
        case "error":
            return "上次同步失败：\(lastError.isEmpty ? "未知错误" : lastError)"
        default:
            break
        }
        let delta = max(0, now - lastAt)
        if lastAt <= 0 { return "已同步 · 刚才" }
        if delta < 60_000 { return "已同步 · 刚才" }
        let minutes = Int(delta / 60_000)
        if minutes < 60 { return "已同步 · \(minutes) 分钟前" }
        let hours = Int(delta / 3_600_000)
        if hours < 24 { return "已同步 · \(hours) 小时前" }
        let days = Int(delta / 86_400_000)
        return "已同步 · \(days) 天前"
    }

    private static func syncLabel(_ sync: SyncStatus) -> String {
        switch sync {
        case .synced(let label):
            return label
        case .error(let message):
            return message
        case .unavailable:
            return "正在连接 iCloud…"
        default:
            return ""
        }
    }
}
