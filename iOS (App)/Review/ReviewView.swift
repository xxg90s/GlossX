import SwiftUI
import UIKit
import GlossXCore

struct ReviewView: View {
    @EnvironmentObject private var store: LibraryStore
    @State private var keyboardOverlap: CGFloat = 0

    var body: some View {
        ZStack {
            GlossXPalette.paper.ignoresSafeArea()
            if let session = store.session, let card = session.current {
                VStack(spacing: 0) {
                    header(session: session)
                    ReviewCardView(card: card, session: session)
                        .id(session.index)
                }
            } else {
                VStack(spacing: 16) {
                    Text("本轮复习完成")
                        .font(.title2.weight(.semibold))
                        .foregroundColor(GlossXPalette.ink)
                    Button("完成") {
                        store.closeReview()
                    }
                    .buttonStyle(PrimaryReviewButtonStyle())
                    .padding(.horizontal, 48)
                    if store.undoStep != nil {
                        Button("撤销上一张") {
                            store.undoLastGrade()
                        }
                        .foregroundColor(GlossXPalette.muted)
                    }
                }
            }
        }
        .padding(.bottom, keyboardOverlap)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { notification in
            keyboardOverlap = Self.keyboardOverlap(from: notification)
        }
        .streakCelebration()
    }

    private static func keyboardOverlap(from notification: Notification) -> CGFloat {
        guard
            let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
            let window = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .flatMap(\.windows)
                .first(where: \.isKeyWindow)
        else { return 0 }
        let covered = window.bounds.maxY - window.convert(frame, from: nil).minY
        return max(0, covered - window.safeAreaInsets.bottom)
    }

    private func header(session: ReviewSession) -> some View {
        HStack {
            Button(action: { store.closeReview() }) {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .foregroundColor(GlossXPalette.ink)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("关闭")
            Spacer()
            Text(session.progressText)
                .font(.subheadline.weight(.medium))
                .foregroundColor(GlossXPalette.muted)
            Spacer()
            Button(action: { store.undoLastGrade() }) {
                Image(systemName: "arrow.uturn.backward")
                    .font(.body.weight(.semibold))
                    .foregroundColor(GlossXPalette.ink)
                    .frame(width: 44, height: 44)
            }
            .opacity(store.undoStep == nil ? 0 : 1)
            .disabled(store.undoStep == nil)
            .accessibilityLabel("撤销上一张")
        }
        .padding(.horizontal, 8)
    }
}

/// One card of the session. Recreated per session position so answer state never leaks between cards.
private struct ReviewCardView: View {
    @EnvironmentObject private var store: LibraryStore
    let card: ReviewCard
    let session: ReviewSession

    @State private var typed = ""
    @State private var result: ReviewGrade?
    private let speaker = SpeechPlayer.shared

    private var answered: Bool { result != nil }

    private var prompt: ClozePrompt {
        Cloze.make(english: card.english, chinese: card.chinese, target: card.target, lemma: card.lemma)
    }

    var body: some View {
        Group {
            if card.mode == .spell {
                spellBody
            } else {
                browsingBody
            }
        }
        .onAppear {
            if card.mode == .intro {
                speaker.speak(card.target)
            }
        }
    }

    /// The prompt stays on screen while the keyboard is up. It is not inside a scroll view that can shrink to nothing.
    private var spellBody: some View {
        VStack(alignment: .leading, spacing: 16) {
            tags
            spellCue
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            spellDock
            footer
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    private var browsingBody: some View {
        VStack(spacing: 0) {
            ScrollView {
                content
                    .padding(24)
            }
            .contentShape(Rectangle())
            .onTapGesture {
                if card.mode.revealsOnTap && !session.showsAnswer {
                    store.handleCardTap()
                }
            }
            footer
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 20)
        }
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: 20) {
            tags
            switch card.mode {
            case .intro, .cloze:
                selfGradedPrompt
            case .recall:
                recallPrompt
            case .spell:
                EmptyView()
            }
            if showsChinese && !prompt.chinese.isEmpty {
                Text(prompt.chinese)
                    .font(.body)
                    .foregroundColor(GlossXPalette.ink)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(GlossXPalette.card)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            if !card.hostname.isEmpty && (session.showsAnswer || answered) {
                Text(card.hostname)
                    .font(.footnote)
                    .foregroundColor(GlossXPalette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var showsChinese: Bool {
        switch card.mode {
        case .spell: return answered
        case .recall: return false
        default: return true
        }
    }

    private var tags: some View {
        HStack(spacing: 8) {
            Text(kindTitle)
                .font(.caption.weight(.semibold))
                .foregroundColor(GlossXPalette.green)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(GlossXPalette.wash)
                .clipShape(Capsule())
            if let modeTitle {
                Text(modeTitle)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(GlossXPalette.muted)
            }
            if !session.isFirstAttempt {
                Text("再练一次")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(GlossXPalette.danger)
            }
        }
    }

    private var kindTitle: String {
        switch card.kind {
        case .word: return "单词"
        case .phrase: return "短语"
        case .excerpt: return "长片段"
        case .sentence: return "整句"
        }
    }

    private var modeTitle: String? {
        switch card.mode {
        case .spell: return "拼写"
        case .intro: return "新词"
        case .recall: return "回想英文"
        case .cloze: return nil
        }
    }

    @ViewBuilder
    private var selfGradedPrompt: some View {
        if session.showsAnswer {
            wordHeadline
            definitionLine
            sentence(revealed: true)
        } else {
            sentence(revealed: false)
            Text("点按查看答案")
                .font(.subheadline)
                .foregroundColor(GlossXPalette.muted)
                .frame(maxWidth: .infinity)
                .padding(.top, 12)
        }
    }

    @ViewBuilder
    private var recallPrompt: some View {
        Text(card.recallPrompt)
            .font(.title3.weight(.medium))
            .foregroundColor(GlossXPalette.ink)
            .lineSpacing(6)
        if session.showsAnswer {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(card.target)
                    .font(.title3)
                    .foregroundColor(GlossXPalette.green)
                    .lineSpacing(6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                speakButton
            }
            .padding(16)
            .background(GlossXPalette.card)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        } else {
            Text("先在心里说出英文原句，再点按查看")
                .font(.subheadline)
                .foregroundColor(GlossXPalette.muted)
                .frame(maxWidth: .infinity)
                .padding(.top, 12)
        }
    }

    private var wordHeadline: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(card.target)
                    .font(.largeTitle.weight(.bold))
                    .foregroundColor(GlossXPalette.ink)
                speakButton
            }
            if !card.phonetic.isEmpty {
                Text(card.phonetic)
                    .font(.title3)
                    .foregroundColor(GlossXPalette.muted)
            }
        }
    }

    @ViewBuilder
    private var definitionLine: some View {
        if !card.pos.isEmpty || !card.definitionText.isEmpty {
            Text([card.pos, card.definitionText].filter { !$0.isEmpty }.joined(separator: "  "))
                .font(.title3)
                .foregroundColor(GlossXPalette.ink)
                .lineLimit(card.mode == .spell ? 4 : nil)
        }
    }

    private var speakButton: some View {
        Button {
            speaker.speak(card.target)
        } label: {
            Image(systemName: "speaker.wave.2.fill")
                .foregroundColor(GlossXPalette.green)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("朗读")
    }

    @ViewBuilder
    private var spellCue: some View {
        definitionLine
        if !card.english.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            sentence(revealed: answered)
                .lineLimit(3)
        }
    }

    @ViewBuilder
    private var spellDock: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !answered {
                Text("凭释义拼出英文，大小写不计。")
                    .font(.subheadline)
                    .foregroundColor(GlossXPalette.muted)
                LatinTextField(
                    placeholder: "输入英文",
                    text: $typed,
                    isEnabled: true,
                    focusOnAppear: true,
                    onSubmit: submitSpelling
                )
                .padding(14)
                .background(GlossXPalette.card)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else if let result {
                if result != .remembered && !typed.trimmingCharacters(in: .whitespaces).isEmpty {
                    Text(typed)
                        .font(.title3)
                        .strikethrough()
                        .foregroundColor(GlossXPalette.danger)
                }
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(result == .remembered ? "正确" : (result == .fuzzy ? "差一点" : "正确答案"))
                        .font(.headline)
                        .foregroundColor(result == .forgot ? GlossXPalette.danger : GlossXPalette.green)
                    Text(card.target)
                        .font(.title2.weight(.bold))
                        .foregroundColor(GlossXPalette.ink)
                    speakButton
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sentence(revealed: Bool) -> some View {
        Group {
            if prompt.before.isEmpty && prompt.after.isEmpty && !revealed {
                Text("______")
                    .font(.title3.weight(.medium))
                    .foregroundColor(GlossXPalette.green)
            } else if prompt.before.isEmpty && prompt.after.isEmpty {
                EmptyView()
            } else {
                (
                    Text(prompt.before)
                    + Text(revealed ? prompt.blank : "______")
                        .foregroundColor(GlossXPalette.green)
                        .underline()
                    + Text(prompt.after)
                )
                .font(.title3)
                .foregroundColor(GlossXPalette.ink)
                .lineSpacing(6)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Footer

    @ViewBuilder
    private var footer: some View {
        if let result {
            Button("继续") {
                store.grade(result)
            }
            .buttonStyle(PrimaryReviewButtonStyle())
        } else if card.mode == .spell {
            VStack(spacing: 8) {
                Button("提交", action: submitSpelling)
                    .buttonStyle(PrimaryReviewButtonStyle())
                    .opacity(canSubmit ? 1 : 0.4)
                    .disabled(!canSubmit)
                Button("不会") {
                    finish(.forgot)
                }
                .font(.subheadline)
                .foregroundColor(GlossXPalette.muted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
        } else if card.mode == .intro {
            VStack(spacing: 8) {
                Text("先看清这个词。稍后要凭释义拼出来，这一下不算记住。")
                    .font(.footnote)
                    .foregroundColor(GlossXPalette.muted)
                    .multilineTextAlignment(.center)
                Button("看过了") {
                    store.acknowledgeIntro()
                }
                .buttonStyle(PrimaryReviewButtonStyle())
            }
        } else if session.showsGradeButtons {
            HStack(spacing: 10) {
                gradeButton(title: "忘了", kind: .forgot)
                gradeButton(title: "模糊", kind: .fuzzy)
                gradeButton(title: "记住了", kind: .remembered)
            }
        }
    }

    private func gradeButton(title: String, kind: ReviewGrade) -> some View {
        Button {
            store.grade(kind)
        } label: {
            Text(title)
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .foregroundColor(kind == .remembered ? GlossXPalette.onAccent : GlossXPalette.ink)
                .background(kind == .remembered ? GlossXPalette.green : GlossXPalette.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(kind == .forgot ? GlossXPalette.danger.opacity(0.35) : GlossXPalette.mint, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // MARK: Answering

    private var canSubmit: Bool {
        !typed.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func submitSpelling() {
        guard !answered, !typed.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        finish(SpellCheck.grade(input: typed, answer: card.target))
        speaker.speak(card.target)
    }

    private func finish(_ grade: ReviewGrade) {
        result = grade
        UINotificationFeedbackGenerator().notificationOccurred(grade == .remembered ? .success : .error)
    }
}

struct SecondaryReviewButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(GlossXPalette.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(GlossXPalette.card.opacity(configuration.isPressed ? 0.7 : 1))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(GlossXPalette.mint, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
