import SwiftUI
import UIKit
import GlossXCore

enum Onboarding {
    private static let doneKey = "glossx.onboardingDone"

    static var isDone: Bool {
        get { UserDefaults.standard.bool(forKey: doneKey) }
        set { UserDefaults.standard.set(newValue, forKey: doneKey) }
    }
}

struct OnboardingView: View {
    @EnvironmentObject private var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @State private var page = 0

    var body: some View {
        VStack(spacing: 0) {
            TabView(selection: $page) {
                welcome.tag(0)
                SafariSetupView().tag(1)
                StarterPackPicker(onFinish: finish).tag(2)
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .indexViewStyle(.page(backgroundDisplayMode: .always))

            if page < 2 {
                Button(page == 0 ? "开始" : "下一步") {
                    withAnimation { page += 1 }
                }
                .buttonStyle(PrimaryReviewButtonStyle())
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
            }
        }
        .background(GlossXPalette.paper.ignoresSafeArea())
        .overlay(alignment: .topTrailing) {
            Button("跳过", action: finish)
                .foregroundColor(GlossXPalette.muted)
                .padding(20)
        }
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 24) {
            Spacer()
            Text("GlossX")
                .font(.largeTitle.weight(.bold))
                .foregroundColor(GlossXPalette.green)
            Text("在阅读里收词，用原句记住它")
                .font(.title2.weight(.semibold))
                .foregroundColor(GlossXPalette.ink)
            VStack(alignment: .leading, spacing: 16) {
                feature("safari", "在 Safari 里点词、划句，随读随收")
                feature("rectangle.stack", "带着原文例句复习，四选一、听音、拼写循序渐进")
                feature("icloud", "Mac 与 iPhone 通过 iCloud 同步进度")
                feature("flame", "每日目标与连胜，坚持看得见")
            }
            Spacer()
            Spacer()
        }
        .padding(.horizontal, 28)
    }

    private func feature(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(GlossXPalette.green)
                .frame(width: 28)
            Text(text)
                .foregroundColor(GlossXPalette.ink)
        }
    }

    private func finish() {
        Onboarding.isDone = true
        store.rescheduleReminder()
        dismiss()
    }
}

struct SafariSetupView: View {
    private let steps = [
        "打开 iPhone「设置」",
        "进入「Safari 浏览器」→「扩展」（iOS 18 起先进入「App」）",
        "选择 GlossX，打开开关",
        "在「权限」里选择「允许」所有网站"
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Spacer()
            Image(systemName: "safari")
                .font(.system(size: 48))
                .foregroundColor(GlossXPalette.green)
            Text("开启 Safari 扩展")
                .font(.title2.weight(.semibold))
                .foregroundColor(GlossXPalette.ink)
            Text("开启后在 Safari 里点按单词即可查看释义并收藏。任意 App 里选中文字后，也可以通过“分享”存入 GlossX。")
                .foregroundColor(GlossXPalette.muted)
            VStack(alignment: .leading, spacing: 12) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text("\(index + 1)")
                            .font(.footnote.weight(.bold))
                            .foregroundColor(GlossXPalette.onAccent)
                            .frame(width: 22, height: 22)
                            .background(Circle().fill(GlossXPalette.green))
                        Text(step)
                            .foregroundColor(GlossXPalette.ink)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(GlossXPalette.card)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            Button("打开设置") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .foregroundColor(GlossXPalette.green)
            Spacer()
            Spacer()
        }
        .padding(.horizontal, 28)
    }
}

struct StarterPackPicker: View {
    @EnvironmentObject private var store: LibraryStore
    @State private var selection = "daily"
    @State private var message: String?
    var onFinish: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Spacer()
            Text("先来一组入门词")
                .font(.title2.weight(.semibold))
                .foregroundColor(GlossXPalette.ink)
            Text("挑一个词表，导入 \(StarterPack.defaultLimit) 个词马上开始复习。之后在阅读中收的词会一起排进每日复习。")
                .foregroundColor(GlossXPalette.muted)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(StarterPack.lexicons) { lexicon in
                    Button {
                        selection = lexicon.id
                    } label: {
                        Text(lexicon.title)
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .foregroundColor(selection == lexicon.id ? GlossXPalette.onAccent : GlossXPalette.ink)
                            .background(selection == lexicon.id ? GlossXPalette.green : GlossXPalette.card)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .accessibilityAddTraits(selection == lexicon.id ? .isSelected : [])
                }
            }
            if let message {
                Text(message)
                    .font(.footnote)
                    .foregroundColor(GlossXPalette.muted)
            }
            Button("导入并开始") {
                let added = store.importStarterPack(selection)
                if added > 0 {
                    onFinish()
                } else {
                    message = "这个词表里的词都已在词库中，换一个试试。"
                }
            }
            .buttonStyle(PrimaryReviewButtonStyle())
            Button("暂不导入", action: onFinish)
                .frame(maxWidth: .infinity)
                .foregroundColor(GlossXPalette.muted)
            Spacer()
        }
        .padding(.horizontal, 28)
    }
}

struct StarterPackSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        StarterPackPicker(onFinish: { dismiss() })
            .background(GlossXPalette.paper.ignoresSafeArea())
    }
}
