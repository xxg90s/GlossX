import Foundation
import GlossXCore
import UserNotifications

enum ReviewReminder {
    static let identifierPrefix = "glossx.daily-review"
    private static let enabledKey = "glossx.dailyReminderEnabled"
    private static let minutesKey = "glossx.dailyReminderMinutes"
    private static let defaultMinutes = 20 * 60
    private static let daysAhead = 7

    /// Minutes after local midnight; 20:00 by default.
    static var minutesOfDay: Int {
        get {
            guard UserDefaults.standard.object(forKey: minutesKey) != nil else { return defaultMinutes }
            return min(max(UserDefaults.standard.integer(forKey: minutesKey), 0), 24 * 60 - 1)
        }
        set {
            UserDefaults.standard.set(newValue, forKey: minutesKey)
        }
    }

    static var timeLabel: String {
        String(format: "%02d:%02d", minutesOfDay / 60, minutesOfDay % 60)
    }

    static var isEnabled: Bool {
        get {
            if UserDefaults.standard.object(forKey: enabledKey) == nil { return true }
            return UserDefaults.standard.bool(forKey: enabledKey)
        }
        set {
            UserDefaults.standard.set(newValue, forKey: enabledKey)
        }
    }

    /// One-shot reminders at the chosen time for the next week, skipping any day whose goal is already met.
    /// Rescheduled whenever streak progress changes, so today's reminder disappears once done.
    static func sync(enabled: Bool, status: (String) -> StreakStatus) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        center.removePendingNotificationRequests(
            withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(identifierPrefix) }
        )
        guard enabled else { return }
        let granted: Bool
        do {
            granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            return
        }
        guard granted else { return }

        let calendar = Calendar.current
        let now = Date()
        let today = DayStamp.string(from: now)
        for offset in 0..<daysAhead {
            let day = DayStamp.adding(days: offset, to: today)
            guard let body = StreakEngine.reminderBody(for: status(day)),
                  let fireDate = reminderDate(for: day, calendar: calendar),
                  fireDate > now else {
                continue
            }
            let content = UNMutableNotificationContent()
            content.title = "GlossX"
            content.body = body
            content.sound = .default
            let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate)
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            let request = UNNotificationRequest(
                identifier: "\(identifierPrefix).\(day)",
                content: content,
                trigger: trigger
            )
            try? await center.add(request)
        }
    }

    private static func reminderDate(for day: String, calendar: Calendar) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        let minutes = minutesOfDay
        return calendar.date(from: DateComponents(
            year: parts[0],
            month: parts[1],
            day: parts[2],
            hour: minutes / 60,
            minute: minutes % 60
        ))
    }
}
