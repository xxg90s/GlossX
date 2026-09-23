import Foundation

public enum LibraryFilter: String, CaseIterable, Equatable {
    case all
    case words
    case phrases
    case sentences
    case learning
    case mastered

    public var title: String {
        switch self {
        case .all: return "全部"
        case .words: return "单词"
        case .phrases: return "短语"
        case .sentences: return "整句"
        case .learning: return "学习中"
        case .mastered: return "已掌握"
        }
    }
}

public enum LibraryCatalog {
    public static func filtered(_ items: [ReviewSourceItem], filter: LibraryFilter, query: String) -> [ReviewSourceItem] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return items.filter { item in
            matches(item, filter: filter) && (needle.isEmpty || matches(item, query: needle))
        }
    }

    public static func matches(_ item: ReviewSourceItem, filter: LibraryFilter) -> Bool {
        switch filter {
        case .all:
            return true
        case .words:
            return item.kind == .word
        case .phrases:
            return item.kind == .phrase
        case .sentences:
            return item.kind == .sentence
        case .learning:
            return item.status != "mastered" && item.status != "familiar"
        case .mastered:
            return item.status == "mastered" || item.status == "familiar"
        }
    }

    private static func matches(_ item: ReviewSourceItem, query: String) -> Bool {
        let fields = [
            item.target,
            item.lemma,
            item.definitions.joined(separator: " "),
            item.english,
            item.chinese,
            item.hostname
        ]
        return fields.contains { $0.lowercased().contains(query) }
    }
}
