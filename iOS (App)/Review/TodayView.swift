import SwiftUI
import GlossXCore

struct TodayView: View {
    @EnvironmentObject private var store: LibraryStore

    var body: some View {
        NavigationView {
            ZStack {
                GlossXPalette.paper.ignoresSafeArea()
                content
                    .padding(.horizontal, 24)
            }
            .navigationBarTitleDisplayMode(.inline)
        }
        .navigationViewStyle(.stack)
        .streakCelebration()
        .fullScreenCover(isPresented: $store.isReviewing) {
            ReviewView()
                .environmentObject(store)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch store.homeState {
        case .loading:
            statusBlock(title: "正在读取收藏…", detail: nil, streak: nil, buttonTitle: nil)
        case .signedOut:
            statusBlock(
                title: "还没有收藏",
                detail: "登录同一 Apple ID 的 iCloud 后，Mac 上收藏的词会出现在这里。",
                streak: nil,
                buttonTitle: nil
            )
        case .empty:
            statusBlock(
                title: "还没有收藏",
                detail: "在 Mac 的 Safari 里点词或划句，同步后会出现在这里。",
                streak: nil,
                buttonTitle: nil
            )
        case .due(let remaining, let newCount, let reviewCount, let streak, let syncLabel):
            statusBlock(
                title: "今日还剩 \(remaining) 张",
                detail: "新词 \(newCount) · 复习 \(reviewCount)",
                streak: streak,
                buttonTitle: "开始复习 · \(remaining)",
                syncLabel: syncLabel
            )
        case .done(let streak, let syncLabel):
            statusBlock(
                title: "今日复习完成",
                detail: "可以去词库里翻看收藏。",
                streak: streak,
                buttonTitle: nil,
                syncLabel: syncLabel
            )
        }
    }

    private func statusBlock(
        title: String,
        detail: String?,
        streak: Int?,
        buttonTitle: String?,
        syncLabel: String? = nil
    ) -> some View {
        VStack(spacing: 18) {
            Spacer()
            if streak != nil {
                StreakSummaryView(status: store.streakStatus)
            }
            Text(title)
                .font(.system(size: 28, weight: .semibold))
                .foregroundColor(GlossXPalette.ink)
                .multilineTextAlignment(.center)
            if let detail {
                Text(detail)
                    .font(.body)
                    .foregroundColor(GlossXPalette.muted)
                    .multilineTextAlignment(.center)
            }
            if let buttonTitle {
                Button(buttonTitle) {
                    store.startReview()
                }
                .buttonStyle(PrimaryReviewButtonStyle())
                .padding(.top, 8)
            }
            Spacer()
            Text(syncLabel ?? store.syncLabel)
                .font(.footnote)
                .foregroundColor(GlossXPalette.muted)
                .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity)
    }
}

struct PrimaryReviewButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(GlossXPalette.green.opacity(configuration.isPressed ? 0.82 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
