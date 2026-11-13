import Foundation

public enum ItemKind: String, Equatable {
    case word
    case phrase
    case excerpt
    case sentence
}

public enum CardMode: String, Equatable {
    /// First sight of a new word: show it once. Does not grade.
    case intro
    /// Phrase: fill the blank, then self-grade.
    case cloze
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
        self == .spell
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
    /// When the learner first saw this word. `0` means the intro card is still due.
    public var introducedAt: Double
    /// Page the item was collected from, when the extension recorded it.
    public var sourceURL: String
    /// User-chosen AI example; when set it becomes the review sentence.
    public var extraEnglish: String
    public var extraChinese: String
    public var contextEnglish: String
    public var contextChinese: String

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
        nextReviewAt: Double,
        introducedAt: Double = 0,
        sourceURL: String = "",
        extraEnglish: String = "",
        extraChinese: String = "",
        contextEnglish: String = "",
        contextChinese: String = ""
    ) {
        self.sourceURL = sourceURL
        self.extraEnglish = extraEnglish
        self.extraChinese = extraChinese
        self.contextEnglish = contextEnglish
        self.contextChinese = contextChinese
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
        self.introducedAt = introducedAt
    }

    public var definitionText: String {
        definitions.joined(separator: "；")
    }

    public var statusTitle: String {
        switch status {
        case "mastered": return "已掌握"
        case "familiar": return "已熟悉"
        case "learning", "review": return "学习中"
        case "skipped": return "已跳过"
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
    public var options: [String]
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
    /// `nil` means this snapshot has not been checked for existing starter-pack words.
    public var starterPacks: [String: StarterPackRecord]?

    public init(
        vocabItems: [String: [String: Any]],
        snippetItems: [String: [String: Any]],
        settings: [String: Any],
        aiKeys: [String: Any],
        aiProviderProfiles: [Any],
        stats: [String: Any],
        wordRecords: [String: Any],
        deletedItems: [String: Double] = [:],
        starterPacks: [String: StarterPackRecord]? = nil
    ) {
        self.vocabItems = vocabItems
        self.snippetItems = snippetItems
        self.settings = settings
        self.aiKeys = aiKeys
        self.aiProviderProfiles = aiProviderProfiles
        self.stats = stats
        self.wordRecords = wordRecords
        self.deletedItems = deletedItems
        self.starterPacks = starterPacks
    }
}

public enum TombstoneKey {
    public static func vocab(_ id: String) -> String { "vocab:\(id)" }
    public static func snippet(_ id: String) -> String { "snippet:\(id)" }
}
