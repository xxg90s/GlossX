import SwiftUI
import GlossXCore

struct ReviewView: View {
    @EnvironmentObject private var store: LibraryStore
    @State private var spokenCardID: String?
    private let speaker = SpeechPlayer()

    var body: some View {
        ZStack {
            GlossXPalette.paper.ignoresSafeArea()
            if let session = store.session, let card = session.current {
                VStack(spacing: 0) {
                    header(session: session)
                    ScrollView {
                        cardBody(card: card, session: session)
                            .padding(.horizontal, 24)
                            .padding(.top, 24)
                            .padding(.bottom, 24)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if !session.showsAnswer {
                            store.handleCardTap()
                        }
                    }
                    if session.showsGradeButtons {
                        gradeBar
                            .padding(.horizontal, 16)
                            .padding(.bottom, 20)
                    }
                }
                .onAppear {
                    speakIfNeeded(card)
                }
                .onChange(of: card.id) { _ in
                    speakIfNeeded(card)
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

    @ViewBuilder
    private func cardBody(card: ReviewCard, session: ReviewSession) -> some View {
        let prompt = Cloze.make(
            english: card.english,
            chinese: card.chinese,
            target: card.target,
            lemma: card.lemma
        )
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 8) {
                Text(card.kind == .phrase ? "短语" : "单词")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(GlossXPalette.green)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(GlossXPalette.wash)
                    .clipShape(Capsule())
                if !session.isFirstAttempt {
                    Text("再练一次")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(GlossXPalette.danger)
                }
            }

            if card.mode == .intro || session.showsAnswer {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(card.target)
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(GlossXPalette.ink)
                    Button {
                        speaker.speak(card.target)
                    } label: {
                        Image(systemName: "speaker.wave.2.fill")
                            .foregroundColor(GlossXPalette.green)
                    }
                    .buttonStyle(.plain)
                }
                if !card.phonetic.isEmpty {
                    Text(card.phonetic)
                        .font(.title3)
                        .foregroundColor(GlossXPalette.muted)
                }
                if !card.pos.isEmpty || !card.definitionText.isEmpty {
                    Text([card.pos, card.definitionText].filter { !$0.isEmpty }.joined(separator: "  "))
                        .font(.title3)
                        .foregroundColor(GlossXPalette.ink)
                }
                sentenceView(prompt: prompt, revealed: true)
            } else {
                sentenceView(prompt: prompt, revealed: false)
                Text("点按查看答案")
                    .font(.subheadline)
                    .foregroundColor(GlossXPalette.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)
            }

            if !prompt.chinese.isEmpty {
                Text(prompt.chinese)
                    .font(.body)
                    .foregroundColor(GlossXPalette.ink)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            if !card.hostname.isEmpty && session.showsAnswer {
                Text(card.hostname)
                    .font(.footnote)
                    .foregroundColor(GlossXPalette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sentenceView(prompt: ClozePrompt, revealed: Bool) -> some View {
        Group {
            if prompt.before.isEmpty && prompt.after.isEmpty && !revealed {
                Text("______")
                    .font(.title3.weight(.medium))
                    .foregroundColor(GlossXPalette.green)
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

    private var gradeBar: some View {
        HStack(spacing: 10) {
            gradeButton(title: "忘了", kind: .forgot)
            gradeButton(title: "模糊", kind: .fuzzy)
            gradeButton(title: "记住了", kind: .remembered)
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
                .foregroundColor(kind == .remembered ? .white : GlossXPalette.ink)
                .background(kind == .remembered ? GlossXPalette.green : Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(kind == .forgot ? GlossXPalette.danger.opacity(0.35) : GlossXPalette.mint, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func speakIfNeeded(_ card: ReviewCard) {
        guard spokenCardID != card.id else { return }
        spokenCardID = card.id
        if card.mode == .intro {
            speaker.speak(card.target)
        }
    }
}
