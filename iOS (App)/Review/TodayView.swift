import SwiftUI
import GlossXCore

struct TodayView: View {
    @EnvironmentObject private var store: LibraryStore
    @State private var showsStarterPack = false
    @State private var showsSafariSetup = false

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
        .sheet(isPresented: $showsStarterPack) {
            StarterPackSheet()
                .environmentObject(store)
        }
        .sheet(isPresented: $showsSafariSetup) {
            SafariSetupView()
                .background(GlossXPalette.paper.ignoresSafeArea())
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
                detail: "在 Safari 里点词即可收藏，也可以选中文字后通过“分享”存入；登录 iCloud 后还会同步 Mac 上的收藏。",
                streak: nil,
                buttonTitle: nil,
                showsEmptyActions: true
            )
        case .empty:
            statusBlock(
                title: "还没有收藏",
                detail: "在 Safari 里点词、划句，或在任意 App 选中文字后点“分享 → GlossX”。也可以先导入一组入门词。",
                streak: nil,
                buttonTitle: nil,
                showsEmptyActions: true
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
            if store.wordsAwaitingDefinition > 0 && !store.hasAnythingToReview {
                statusBlock(
                    title: "有 \(store.wordsAwaitingDefinition) 个词还没有释义",
                    detail: "补上释义之后才能拼写。到词库打开该词填写。",
                    streak: streak,
                    buttonTitle: nil,
                    syncLabel: syncLabel
                )
            } else if store.wordsAwaitingDefinition > 0 && store.queue.cards.isEmpty {
                statusBlock(
                    title: "今日复习完成",
                    detail: "另有 \(store.wordsAwaitingDefinition) 个词还没有释义，补上之后会进入拼写。",
                    streak: streak,
                    buttonTitle: nil,
                    syncLabel: syncLabel
                )
            } else {
                statusBlock(
                    title: "今日复习完成",
                    detail: "可以去词库里翻看收藏。",
                    streak: streak,
                    buttonTitle: nil,
                    syncLabel: syncLabel
                )
            }
        }
    }

    private func statusBlock(
        title: String,
        detail: String?,
        streak: Int?,
        buttonTitle: String?,
        syncLabel: String? = nil,
        showsEmptyActions: Bool = false
    ) -> some View {
        VStack(spacing: 18) {
            Spacer()
            if streak != nil {
                StreakSummaryView(status: store.streakStatus)
            }
            Text(title)
                .font(.title.weight(.semibold))
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
            if showsEmptyActions {
                Button("导入入门词包") {
                    showsStarterPack = true
                }
                .buttonStyle(PrimaryReviewButtonStyle())
                .padding(.top, 8)
                Button("如何开启 Safari 扩展") {
                    showsSafariSetup = true
                }
                .foregroundColor(GlossXPalette.green)
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
            .foregroundColor(GlossXPalette.onAccent)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(GlossXPalette.green.opacity(configuration.isPressed ? 0.82 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
