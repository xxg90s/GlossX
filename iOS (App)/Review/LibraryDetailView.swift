import SwiftUI
import GlossXCore

struct LibraryDetailView: View {
    @EnvironmentObject private var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @State private var confirmsDelete = false
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
                if liveItem.nextReviewAt > 0 && liveItem.status != "familiar" && liveItem.status != "skipped" {
                    detailBlock(title: "下次复习", text: formatted(liveItem.nextReviewAt))
                }

                if let url = sourceURL {
                    Link(destination: url) {
                        Label("打开原文", systemImage: "safari")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(SecondaryReviewButtonStyle())
                    .padding(.top, 8)
                }

                if liveItem.kind == .sentence && liveItem.status != "familiar" && liveItem.status != "mastered" {
                    Button("标记已熟悉") {
                        store.markFamiliar(id: liveItem.id)
                    }
                    .buttonStyle(PrimaryReviewButtonStyle())
                }

                if liveItem.status == "skipped" {
                    Button("恢复复习") {
                        store.setSkipped(id: liveItem.id, skipped: false)
                    }
                    .buttonStyle(PrimaryReviewButtonStyle())
                } else if liveItem.status != "familiar" {
                    Button("太简单，跳过") {
                        store.setSkipped(id: liveItem.id, skipped: true)
                    }
                    .buttonStyle(SecondaryReviewButtonStyle())
                }

                Button("删除", role: .destructive) {
                    confirmsDelete = true
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
            }
            .padding(20)
        }
        .background(GlossXPalette.paper.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("删除“\(liveItem.target)”？", isPresented: $confirmsDelete, titleVisibility: .visible) {
            Button("删除", role: .destructive) {
                store.deleteItem(id: liveItem.id)
                dismiss()
            }
        } message: {
            Text("会同时从 Mac 和其他设备的词库中删除，复习进度不会保留。")
        }
    }

    private var sourceURL: URL? {
        guard let url = URL(string: liveItem.sourceURL), let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else { return nil }
        return url
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
