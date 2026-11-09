import Foundation

public enum LibraryMapper {
    public static func items(from snapshot: LibrarySnapshot) -> [ReviewSourceItem] {
        let vocab = snapshot.payload.vocabItems.map { key, json in
            vocabItem(id: key, json: json)
        }
        let snippets = snapshot.payload.snippetItems.map { key, json in
            snippetItem(id: key, json: json)
        }
        return (vocab + snippets).sorted { $0.addedAt > $1.addedAt }
    }

    public static func vocabItem(id: String, json: [String: Any]) -> ReviewSourceItem {
        let context = JSONValue.dictionary(json["exampleFromContext"])
        let usage = JSONValue.dictionary(json["usageExample"])
        let extra = JSONValue.dictionary(json["extraExample"])
        let extraEnglish = JSONValue.string(extra["english"])
        let extraChinese = JSONValue.string(extra["chinese"])
        let english = firstNonEmpty([
            extraEnglish,
            JSONValue.string(context["english"]),
            JSONValue.string(usage["english"])
        ])
        let chinese = firstNonEmpty([
            extraChinese,
            JSONValue.string(context["chinese"]),
            JSONValue.string(usage["chinese"])
        ])
        return ReviewSourceItem(
            id: JSONValue.string(json["id"]).ifEmpty(id),
            kind: .word,
            target: JSONValue.string(json["word"]),
            lemma: JSONValue.string(json["lemma"]),
            phonetic: JSONValue.string(json["phonetic"]),
            pos: JSONValue.string(json["pos"]),
            definitions: JSONValue.stringArray(json["definitions"]),
            english: english,
            chinese: chinese,
            hostname: JSONValue.string(context["hostname"]),
            status: JSONValue.string(json["status"]).ifEmpty("new"),
            addedAt: JSONValue.double(json["addedAt"]),
            repetitions: JSONValue.int(json["repetitions"]),
            nextReviewAt: JSONValue.double(json["nextReviewAt"]),
            introducedAt: JSONValue.double(json["introducedAt"]),
            sourceURL: JSONValue.string(context["pageUrl"]),
            extraEnglish: extraEnglish,
            extraChinese: extraChinese,
            contextEnglish: JSONValue.string(context["english"]),
            contextChinese: JSONValue.string(context["chinese"])
        )
    }

    public static func snippetItem(id: String, json: [String: Any]) -> ReviewSourceItem {
        let context = JSONValue.dictionary(json["context"])
        let type = JSONValue.string(json["type"])
        let text = JSONValue.string(json["text"])
        let translation = JSONValue.string(json["translation"])
        let fullEnglish = JSONValue.string(context["fullEnglish"])
        let fullChinese = JSONValue.string(context["fullChinese"])
        let definitions: [String]
        if !translation.isEmpty {
            definitions = [translation]
        } else if !fullChinese.isEmpty && coversContext(text: text, fullEnglish: fullEnglish) {
            definitions = [fullChinese]
        } else {
            definitions = []
        }
        let kind: ItemKind
        switch type {
        case "sentence":
            kind = .sentence
        case "excerpt":
            kind = .excerpt
        default:
            kind = .phrase
        }
        return ReviewSourceItem(
            id: JSONValue.string(json["id"]).ifEmpty(id),
            kind: kind,
            target: text,
            lemma: "",
            phonetic: "",
            pos: "",
            definitions: definitions,
            english: firstNonEmpty([fullEnglish, text]),
            chinese: fullChinese,
            hostname: JSONValue.string(context["hostname"]),
            status: JSONValue.string(json["status"]).ifEmpty("new"),
            addedAt: JSONValue.double(json["addedAt"]),
            repetitions: JSONValue.int(json["repetitions"]),
            nextReviewAt: JSONValue.double(json["nextReviewAt"]),
            sourceURL: JSONValue.string(context["pageUrl"])
        )
    }

    public static func record(from json: [String: Any], now: Double) -> ReviewRecord {
        ReviewRecord(
            status: JSONValue.string(json["status"]).ifEmpty("new"),
            easeFactor: {
                let value = JSONValue.double(json["easeFactor"])
                return value > 0 ? value : 2.5
            }(),
            interval: JSONValue.int(json["interval"]),
            repetitions: JSONValue.int(json["repetitions"]),
            nextReviewAt: JSONValue.double(json["nextReviewAt"]).nonZero(now),
            reviewedAt: JSONValue.double(json["reviewedAt"]),
            learnedAt: JSONValue.double(json["learnedAt"])
        )
    }

    public static func apply(_ record: ReviewRecord, to json: [String: Any]) -> [String: Any] {
        var next = json
        next["status"] = record.status
        next["easeFactor"] = record.easeFactor
        next["interval"] = record.interval
        next["repetitions"] = record.repetitions
        next["nextReviewAt"] = record.nextReviewAt
        next["reviewedAt"] = record.reviewedAt
        if record.learnedAt > 0 {
            next["learnedAt"] = record.learnedAt
        }
        return next
    }

    /// Display fallback for snippets saved without their own translation.
    /// The extension no longer treats partial selections as the whole sentence.
    private static let sentenceCoverageRatio = 0.8

    private static func coversContext(text: String, fullEnglish: String) -> Bool {
        let selected = collapseWhitespace(text)
        let full = collapseWhitespace(fullEnglish)
        guard !selected.isEmpty, !full.isEmpty else { return false }
        return Double(selected.count) / Double(full.count) >= sentenceCoverageRatio
    }

    private static func collapseWhitespace(_ value: String) -> String {
        value.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    private static func firstNonEmpty(_ values: [String]) -> String {
        values.first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } ?? ""
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String {
        isEmpty ? fallback : self
    }
}

private extension Double {
    func nonZero(_ fallback: Double) -> Double {
        self == 0 ? fallback : self
    }
}
