import Foundation

public enum ItemKind: String, Equatable {
    case word
    case phrase
    case sentence
}

public enum CardMode: String, Equatable {
    /// New card: everything shown, self-graded.
    case intro
    /// Fill the blank in the source sentence, self-graded.
    case cloze
    /// Pick the Chinese definition for the English word; auto-graded.
    case choice
    /// Pick the Chinese definition after hearing the word; auto-graded.
    case listen
    /// Type the word from its definition and sentence; auto-graded.
    case spell
    /// Whole sentence: recall the English from its Chinese, self-graded.
    case recall

    /// Modes that hide the answer until tapped.
    public var revealsOnTap: Bool {
        self == .cloze || self == .recall
    }

    /// Objective modes grade themselves from the user's answer.
    public var isAutoGraded: Bool {
        self == .choice || self == .listen || self == .spell
    }
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
    public var repetitions: Int
    /// Choice/listen options; empty for other modes.
    public var options: [String]
    /// The correct option for choice/listen.
    public var answer: String

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
        hostname: String,
        repetitions: Int = 0,
        options: [String] = [],
        answer: String = ""
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
        self.repetitions = repetitions
        self.options = options
        self.answer = answer
    }

    public var isNew: Bool { mode == .intro }

    public var definitionText: String {
        definitions.joined(separator: "；")
    }

    /// The Chinese shown on a sentence recall card.
    public var recallPrompt: String {
        definitions.first ?? chinese
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
    /// Last change to settings, aiKeys, aiProviderProfiles or wordRecords; the phone never edits these.
    public var metaUpdatedAt: Double
    public var payload: LibraryPayload

    public init(version: Int, updatedAt: Double, metaUpdatedAt: Double? = nil, payload: LibraryPayload) {
        self.version = version
        self.updatedAt = updatedAt
        self.metaUpdatedAt = metaUpdatedAt ?? updatedAt
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
    /// Tombstones keyed `vocab:<id>` / `snippet:<id>`, valued with the deletion time in ms.
    public var deletedItems: [String: Double]

    public init(
        vocabItems: [String: [String: Any]],
        snippetItems: [String: [String: Any]],
        settings: [String: Any],
        aiKeys: [String: Any],
        aiProviderProfiles: [Any],
        stats: [String: Any],
        wordRecords: [String: Any],
        deletedItems: [String: Double] = [:]
    ) {
        self.vocabItems = vocabItems
        self.snippetItems = snippetItems
        self.settings = settings
        self.aiKeys = aiKeys
        self.aiProviderProfiles = aiProviderProfiles
        self.stats = stats
        self.wordRecords = wordRecords
        self.deletedItems = deletedItems
    }
}

public enum TombstoneKey {
    public static func vocab(_ id: String) -> String { "vocab:\(id)" }
    public static func snippet(_ id: String) -> String { "snippet:\(id)" }
}
