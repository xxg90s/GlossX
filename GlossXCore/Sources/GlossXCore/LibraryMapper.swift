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
        let english = firstNonEmpty([
            JSONValue.string(context["english"]),
            JSONValue.string(usage["english"]),
            JSONValue.string(extra["english"])
        ])
        let chinese = firstNonEmpty([
            JSONValue.string(context["chinese"]),
            JSONValue.string(usage["chinese"]),
            JSONValue.string(extra["chinese"])
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
            nextReviewAt: JSONValue.double(json["nextReviewAt"])
        )
    }

    public static func snippetItem(id: String, json: [String: Any]) -> ReviewSourceItem {
        let context = JSONValue.dictionary(json["context"])
        let type = JSONValue.string(json["type"])
        let text = JSONValue.string(json["text"])
        let translation = JSONValue.string(json["translation"])
        let fullChinese = JSONValue.string(context["fullChinese"])
        return ReviewSourceItem(
            id: JSONValue.string(json["id"]).ifEmpty(id),
            kind: type == "sentence" ? .sentence : .phrase,
            target: text,
            lemma: "",
            phonetic: "",
            pos: "",
            definitions: translation.isEmpty ? (fullChinese.isEmpty ? [] : [fullChinese]) : [translation],
            english: firstNonEmpty([JSONValue.string(context["fullEnglish"]), text]),
            chinese: fullChinese,
            hostname: JSONValue.string(context["hostname"]),
            status: JSONValue.string(json["status"]).ifEmpty("new"),
            addedAt: JSONValue.double(json["addedAt"]),
            repetitions: JSONValue.int(json["repetitions"]),
            nextReviewAt: JSONValue.double(json["nextReviewAt"])
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
