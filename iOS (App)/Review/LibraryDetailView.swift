import SwiftUI
import GlossXCore

struct LibraryDetailView: View {
    @EnvironmentObject private var store: LibraryStore
    let item: ReviewSourceItem
    private let speaker = SpeechPlayer.shared

    private var liveItem: ReviewSourceItem {
        store.item(id: item.id) ?? item
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline) {
                    Text(liveItem.target)
                        .font(.largeTitle.weight(.bold))
                        .foregroundColor(GlossXPalette.ink)
                    Button {
                        speaker.speak(liveItem.target)
                    } label: {
                        Image(systemName: "speaker.wave.2.fill")
                            .foregroundColor(GlossXPalette.green)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("朗读")
                }
                if !liveItem.phonetic.isEmpty {
                    Text(liveItem.phonetic)
                        .foregroundColor(GlossXPalette.muted)
                }
                Text(liveItem.statusTitle)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(GlossXPalette.green)

                if !liveItem.definitionText.isEmpty {
                    detailBlock(title: "释义", text: [liveItem.pos, liveItem.definitionText].filter { !$0.isEmpty }.joined(separator: "  "))
                }
                if !liveItem.english.isEmpty {
                    detailBlock(title: "原句", text: liveItem.english)
                }
                if !liveItem.chinese.isEmpty {
                    detailBlock(title: "中文", text: liveItem.chinese)
                }
                if !liveItem.hostname.isEmpty {
                    detailBlock(title: "来源", text: liveItem.hostname)
                }
                if liveItem.nextReviewAt > 0 && liveItem.kind != .sentence {
                    detailBlock(title: "下次复习", text: formatted(liveItem.nextReviewAt))
                }

                if liveItem.kind == .sentence && liveItem.status != "familiar" && liveItem.status != "mastered" {
                    Button("标记已熟悉") {
                        store.markFamiliar(id: liveItem.id)
                    }
                    .buttonStyle(PrimaryReviewButtonStyle())
                    .padding(.top, 8)
                }
            }
            .padding(20)
        }
        .background(GlossXPalette.paper.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
    }

    private func detailBlock(title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundColor(GlossXPalette.muted)
            Text(text)
                .font(.body)
                .foregroundColor(GlossXPalette.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .background(GlossXPalette.card)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func formatted(_ milliseconds: Double) -> String {
        let date = Date(timeIntervalSince1970: milliseconds / 1000)
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }
}
