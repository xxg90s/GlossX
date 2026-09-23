import Foundation

public enum ItemKind: String, Equatable {
    case word
    case phrase
    case sentence
}

public enum CardMode: String, Equatable {
    case intro
    case cloze
}

public enum ReviewGrade: String, Equatable {
    case forgot
    case fuzzy
    case remembered
}

public struct ClozePrompt: Equatable {
    public var before: String
    public var blank: String
    public var after: String
    public var chinese: String

    public init(before: String, blank: String, after: String, chinese: String) {
        self.before = before
        self.blank = blank
        self.after = after
        self.chinese = chinese
    }

    public var displaySentence: String {
        before + "______" + after
    }
}

public struct ReviewRecord: Equatable {
    public var status: String
    public var easeFactor: Double
    public var interval: Int
    public var repetitions: Int
    public var nextReviewAt: Double
    public var reviewedAt: Double
    public var learnedAt: Double

    public init(
        status: String,
        easeFactor: Double,
        interval: Int,
        repetitions: Int,
        nextReviewAt: Double,
        reviewedAt: Double,
        learnedAt: Double
    ) {
        self.status = status
        self.easeFactor = easeFactor
        self.interval = interval
        self.repetitions = repetitions
        self.nextReviewAt = nextReviewAt
        self.reviewedAt = reviewedAt
        self.learnedAt = learnedAt
    }

    public static func fresh(now: Double) -> ReviewRecord {
        ReviewRecord(
            status: "new",
            easeFactor: 2.5,
            interval: 0,
            repetitions: 0,
            nextReviewAt: now,
            reviewedAt: 0,
            learnedAt: 0
        )
    }
}

public struct ReviewSourceItem: Equatable, Identifiable {
    public var id: String
    public var kind: ItemKind
    public var target: String
    public var lemma: String
    public var phonetic: String
    public var pos: String
    public var definitions: [String]
    public var english: String
    public var chinese: String
    public var hostname: String
    public var status: String
    public var addedAt: Double
    public var repetitions: Int
    public var nextReviewAt: Double

    public init(
        id: String,
        kind: ItemKind,
        target: String,
        lemma: String,
        phonetic: String,
        pos: String,
        definitions: [String],
        english: String,
        chinese: String,
        hostname: String,
        status: String,
        addedAt: Double,
        repetitions: Int,
        nextReviewAt: Double
    ) {
        self.id = id
        self.kind = kind
        self.target = target
        self.lemma = lemma
        self.phonetic = phonetic
        self.pos = pos
        self.definitions = definitions
        self.english = english
        self.chinese = chinese
        self.hostname = hostname
        self.status = status
        self.addedAt = addedAt
        self.repetitions = repetitions
        self.nextReviewAt = nextReviewAt
    }

    public var definitionText: String {
        definitions.joined(separator: "；")
    }

    public var statusTitle: String {
        switch status {
        case "mastered": return "已掌握"
        case "familiar": return "已熟悉"
        case "learning", "review": return "学习中"
        default: return "新词"
        }
    }
}

public struct ReviewCard: Equatable, Identifiable {
    public var id: String
    public var kind: ItemKind
    public var mode: CardMode
    public var target: String
    public var lemma: String
    public var phonetic: String
    public var pos: String
    public var definitions: [String]
    public var english: String
    public var chinese: String
    public var hostname: String

    public init(
        id: String,
        kind: ItemKind,
        mode: CardMode,
        target: String,
        lemma: String,
        phonetic: String,
        pos: String,
        definitions: [String],
        english: String,
        chinese: String,
        hostname: String
    ) {
        self.id = id
        self.kind = kind
        self.mode = mode
        self.target = target
        self.lemma = lemma
        self.phonetic = phonetic
        self.pos = pos
        self.definitions = definitions
        self.english = english
        self.chinese = chinese
        self.hostname = hostname
    }

    public var isNew: Bool { mode == .intro }

    public var definitionText: String {
        definitions.joined(separator: "；")
    }

    public static func stub(id: String, isNew: Bool) -> ReviewCard {
        ReviewCard(
            id: id,
            kind: .word,
            mode: isNew ? .intro : .cloze,
            target: id,
            lemma: "",
            phonetic: "",
            pos: "",
            definitions: [],
            english: "",
            chinese: "",
            hostname: ""
        )
    }
}

public struct LibrarySnapshot {
    public var version: Int
    public var updatedAt: Double
    public var payload: LibraryPayload

    public init(version: Int, updatedAt: Double, payload: LibraryPayload) {
        self.version = version
        self.updatedAt = updatedAt
        self.payload = payload
    }
}

public struct LibraryPayload {
    public var vocabItems: [String: [String: Any]]
    public var snippetItems: [String: [String: Any]]
    public var settings: [String: Any]
    public var aiKeys: [String: Any]
    public var aiProviderProfiles: [Any]
    public var stats: [String: Any]
    public var wordRecords: [String: Any]

    public init(
        vocabItems: [String: [String: Any]],
        snippetItems: [String: [String: Any]],
        settings: [String: Any],
        aiKeys: [String: Any],
        aiProviderProfiles: [Any],
        stats: [String: Any],
        wordRecords: [String: Any]
    ) {
        self.vocabItems = vocabItems
        self.snippetItems = snippetItems
        self.settings = settings
        self.aiKeys = aiKeys
        self.aiProviderProfiles = aiProviderProfiles
        self.stats = stats
        self.wordRecords = wordRecords
    }
}
