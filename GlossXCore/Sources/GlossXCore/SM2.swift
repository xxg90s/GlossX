import Foundation

public enum SM2 {
    public static let msPerDay: Double = 24 * 60 * 60 * 1000

    public static func apply(_ record: ReviewRecord, grade: ReviewGrade, now: Double) -> ReviewRecord {
        var next = record
        next.reviewedAt = now
        let quality: Double
        switch grade {
        case .forgot:
            quality = 1
        case .fuzzy:
            quality = 3
        case .remembered:
            quality = 4
        }

        next.easeFactor = max(1.3, next.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))

        if grade == .forgot {
            next.repetitions = 0
            next.interval = 1
            next.status = "learning"
            next.nextReviewAt = now + msPerDay
            return next
        }

        next.repetitions += 1
        if next.repetitions == 1 {
            next.interval = 1
        } else if next.repetitions == 2 {
            next.interval = 6
        } else {
            next.interval = max(1, Int((Double(next.interval) * next.easeFactor).rounded()))
        }

        if grade == .remembered && next.repetitions >= 4 {
            next.status = "mastered"
            next.interval = max(next.interval, 21)
            next.learnedAt = now
        } else if next.repetitions >= 3 {
            next.status = "review"
        } else {
            next.status = "learning"
        }

        next.nextReviewAt = now + Double(next.interval) * msPerDay
        return next
    }
}
