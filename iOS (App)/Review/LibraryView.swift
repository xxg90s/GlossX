import SwiftUI
import GlossXCore

struct LibraryView: View {
    @EnvironmentObject private var store: LibraryStore
    @State private var filter: LibraryFilter = .all
    @State private var query = ""

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                filterBar
                list
            }
            .background(GlossXPalette.paper.ignoresSafeArea())
            .navigationTitle("词库")
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "搜索单词、短语或来源")
        }
        .navigationViewStyle(.stack)
    }

    private var filteredItems: [ReviewSourceItem] {
        LibraryCatalog.filtered(store.items, filter: filter, query: query)
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(LibraryFilter.allCases, id: \.self) { item in
                    Button {
                        filter = item
                    } label: {
                        Text(item.title)
                            .font(.subheadline.weight(.medium))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .foregroundColor(filter == item ? .white : GlossXPalette.ink)
                            .background(filter == item ? GlossXPalette.green : Color.white)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }

    @ViewBuilder
    private var list: some View {
        if filteredItems.isEmpty {
            VStack(spacing: 8) {
                Spacer()
                Text(store.items.isEmpty ? "还没有收藏" : "没有匹配的条目")
                    .font(.headline)
                    .foregroundColor(GlossXPalette.ink)
                Text(store.items.isEmpty
                     ? "在 Mac 的 Safari 里点词或划句，同步后会出现在这里。"
                     : "试试其他筛选或关键词。")
                    .font(.subheadline)
                    .foregroundColor(GlossXPalette.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                Spacer()
            }
            .frame(maxWidth: .infinity)
        } else {
            List(filteredItems) { item in
                NavigationLink(destination: LibraryDetailView(item: item)) {
                    LibraryRow(item: item)
                }
                .listRowBackground(Color.white)
            }
            .listStyle(.plain)
        }
    }
}

private struct LibraryRow: View {
    let item: ReviewSourceItem

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(item.target)
                    .font(.headline)
                    .foregroundColor(GlossXPalette.ink)
                Spacer()
                Text(item.statusTitle)
                    .font(.caption)
                    .foregroundColor(GlossXPalette.muted)
            }
            Text(item.definitionText.isEmpty ? item.chinese : item.definitionText)
                .font(.subheadline)
                .foregroundColor(GlossXPalette.muted)
                .lineLimit(2)
            HStack(spacing: 8) {
                Text(kindTitle)
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(GlossXPalette.green)
                if !item.hostname.isEmpty {
                    Text(item.hostname)
                        .font(.caption2)
                        .foregroundColor(GlossXPalette.muted)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var kindTitle: String {
        switch item.kind {
        case .word: return "单词"
        case .phrase: return "短语"
        case .sentence: return "整句"
        }
    }
}
