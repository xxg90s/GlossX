import SwiftUI
import GlossXCore

struct LibraryView: View {
    @EnvironmentObject private var store: LibraryStore
    @State private var filter: LibraryFilter = .all
    @State private var query = ""
    @State private var showsAddWord = false
    @State private var pendingDelete: ReviewSourceItem?

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                filterBar
                list
            }
            .background(GlossXPalette.paper.ignoresSafeArea())
            .navigationTitle("词库")
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "搜索单词、短语或来源")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showsAddWord = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("添加单词")
                }
            }
            .sheet(isPresented: $showsAddWord) {
                AddWordView()
                    .environmentObject(store)
            }
            .confirmationDialog(
                "删除“\(pendingDelete?.target ?? "")”？",
                isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
                titleVisibility: .visible
            ) {
                Button("删除", role: .destructive) {
                    if let item = pendingDelete {
                        store.deleteItem(id: item.id)
                    }
                    pendingDelete = nil
                }
            } message: {
                Text("会同时从 Mac 和其他设备的词库中删除，复习进度不会保留。")
            }
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
                            .foregroundColor(filter == item ? GlossXPalette.onAccent : GlossXPalette.ink)
                            .background(filter == item ? GlossXPalette.green : GlossXPalette.card)
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
                     ? "在 Safari 里点词或划句，或在任意 App 选中文字后点“分享 → GlossX”。也可以点右上角手动添加。"
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
                .listRowBackground(GlossXPalette.card)
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        pendingDelete = item
                    } label: {
                        Label("删除", systemImage: "trash")
                    }
                    if item.status == "skipped" {
                        Button {
                            store.setSkipped(id: item.id, skipped: false)
                        } label: {
                            Label("恢复", systemImage: "arrow.uturn.backward")
                        }
                        .tint(GlossXPalette.green)
                    } else if item.status != "familiar" {
                        Button {
                            store.setSkipped(id: item.id, skipped: true)
                        } label: {
                            Label("太简单", systemImage: "forward")
                        }
                        .tint(.gray)
                    }
                }
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
