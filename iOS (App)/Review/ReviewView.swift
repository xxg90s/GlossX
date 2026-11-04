import SwiftUI
import UIKit
import GlossXCore

struct ReviewView: View {
    @EnvironmentObject private var store: LibraryStore

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
        .streakCelebration()
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

    @State private var selected: String?
    @State private var typed = ""
    @State private var result: ReviewGrade?
    @FocusState private var spellFocused: Bool
    private let speaker = SpeechPlayer.shared

    private var answered: Bool { result != nil }

    private var prompt: ClozePrompt {
        Cloze.make(english: card.english, chinese: card.chinese, target: card.target, lemma: card.lemma)
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                content
                    .padding(24)
            }
            .contentShape(Rectangle())
            .onTapGesture {
                if card.mode == .cloze && !session.showsAnswer {
                    store.handleCardTap()
                }
            }
            footer
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
        }
        .onAppear {
            switch card.mode {
            case .intro, .listen:
                speaker.speak(card.target)
            case .spell:
                spellFocused = true
            default:
                break
            }
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
            case .choice:
                wordHeadline
                optionList
            case .listen:
                listenPrompt
                optionList
            case .spell:
                spellPrompt
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
        case .choice, .listen: return answered
        default: return true
        }
    }

    private var tags: some View {
        HStack(spacing: 8) {
            Text(card.kind == .phrase ? "短语" : "单词")
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

    private var modeTitle: String? {
        switch card.mode {
        case .choice: return "选出释义"
        case .listen: return "听音选义"
        case .spell: return "拼写"
        case .intro: return "新词"
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
    private var listenPrompt: some View {
        Button {
            speaker.speak(card.target)
        } label: {
            Image(systemName: "speaker.wave.3.fill")
                .font(.system(size: 44))
                .foregroundColor(GlossXPalette.green)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
                .background(GlossXPalette.wash)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("再听一遍")
        if answered {
            wordHeadline
        }
    }

    private var optionList: some View {
        VStack(spacing: 10) {
            ForEach(card.options, id: \.self) { option in
                Button {
                    choose(option)
                } label: {
                    Text(option)
                        .font(.body.weight(.medium))
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .foregroundColor(optionForeground(option))
                        .background(optionBackground(option))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(optionBorder(option), lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(answered)
            }
        }
    }

    private func optionForeground(_ option: String) -> Color {
        answered && option == card.answer ? GlossXPalette.onAccent : GlossXPalette.ink
    }

    private func optionBackground(_ option: String) -> Color {
        guard answered else { return GlossXPalette.card }
        if option == card.answer { return GlossXPalette.green }
        if option == selected { return GlossXPalette.danger.opacity(0.15) }
        return GlossXPalette.card
    }

    private func optionBorder(_ option: String) -> Color {
        answered && option == selected && option != card.answer ? GlossXPalette.danger : GlossXPalette.mint
    }

    @ViewBuilder
    private var spellPrompt: some View {
        definitionLine
        sentence(revealed: answered)
        Text(SpellCheck.hint(for: card.target))
            .font(.title3.monospaced())
            .foregroundColor(GlossXPalette.muted)
        TextField("输入英文", text: $typed)
            .font(.title3)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($spellFocused)
            .submitLabel(.done)
            .onSubmit(submitSpelling)
            .disabled(answered)
            .padding(14)
            .background(GlossXPalette.card)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        if let result {
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
            HStack(spacing: 10) {
                Button("不会") {
                    finish(.forgot)
                }
                .buttonStyle(SecondaryReviewButtonStyle())
                Button("提交", action: submitSpelling)
                    .buttonStyle(PrimaryReviewButtonStyle())
                    .disabled(typed.trimmingCharacters(in: .whitespaces).isEmpty)
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

    private func choose(_ option: String) {
        guard !answered else { return }
        selected = option
        finish(option == card.answer ? .remembered : .forgot)
        if card.mode == .choice {
            speaker.speak(card.target)
        }
    }

    private func submitSpelling() {
        guard !answered, !typed.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        finish(SpellCheck.grade(input: typed, answer: card.target))
        speaker.speak(card.target)
    }

    private func finish(_ grade: ReviewGrade) {
        result = grade
        spellFocused = false
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
