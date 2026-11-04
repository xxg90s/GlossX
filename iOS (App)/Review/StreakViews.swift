import SwiftUI
import UIKit
import GlossXCore

struct StreakSummaryView: View {
    let status: StreakStatus

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "flame.fill")
                    .foregroundColor(status.todayCompleted ? GlossXPalette.flame : GlossXPalette.flameIdle)
                Text(status.streak > 0 ? "连续 \(status.streak) 天" : "开始连胜")
                    .foregroundColor(GlossXPalette.ink)
            }
            .font(.headline)
            Text(progressText)
                .font(.subheadline)
                .foregroundColor(GlossXPalette.muted)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(GlossXPalette.wash)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var progressText: String {
        if status.todayCompleted { return "今日目标已完成" }
        if !status.hasTask { return "收藏后即可开始每日目标" }
        return "今日目标 \(status.todayReviewed) / \(status.effectiveGoal) 张"
    }
}

struct CelebrationBanner: View {
    let streak: Int

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "flame.fill")
                .font(.title2)
                .foregroundColor(GlossXPalette.flame)
            VStack(alignment: .leading, spacing: 2) {
                Text("连续 \(streak) 天")
                    .font(.headline)
                    .foregroundColor(GlossXPalette.ink)
                Text("今日目标完成，可以继续复习")
                    .font(.subheadline)
                    .foregroundColor(GlossXPalette.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(GlossXPalette.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: Color.black.opacity(0.12), radius: 12, y: 4)
        .padding(.horizontal, 16)
    }
}

private struct CelebrationOverlay: ViewModifier {
    @EnvironmentObject private var store: LibraryStore

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let streak = store.celebrationStreak {
                CelebrationBanner(streak: streak)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onTapGesture { store.dismissCelebration() }
                    .task(id: streak) {
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                        try? await Task.sleep(nanoseconds: 2_500_000_000)
                        withAnimation { store.dismissCelebration() }
                    }
            }
        }
        .animation(.spring(), value: store.celebrationStreak)
    }
}

extension View {
    func streakCelebration() -> some View {
        modifier(CelebrationOverlay())
    }
}
