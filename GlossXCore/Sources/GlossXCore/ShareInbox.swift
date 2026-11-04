import Foundation

public struct ShareInboxRecord: Equatable, Codable {
    public var text: String
    public var addedAt: Double

    public init(text: String, addedAt: Double) {
        self.text = text
        self.addedAt = addedAt
    }
}

/// App Group inbox used by the Share Extension. Files live in `<container>/inbox/*.json`.
public enum ShareInbox {
    public static let directoryName = "inbox"
    public static let hostname = "share"

    public static func normalize(_ text: String) -> String {
        text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    public static func classify(_ raw: String) -> ItemKind? {
        let text = normalize(raw)
        guard text.count >= 2, text.contains(where: { $0.isLetter && $0.isASCII }) else { return nil }
        let words = text.split(whereSeparator: { $0.isWhitespace })
        return words.count == 1 ? .word : .phrase
    }

    /// Mirrors `buildSnippetId` in the extension's snippet-utils.js.
    public static func snippetId(_ raw: String, hostname: String = hostname) -> String {
        let key = "\(normalize(raw).lowercased())|\(hostname.lowercased())"
        var hash: Int32 = 0
        for unit in key.utf16 {
            hash = hash &* 31 &+ Int32(bitPattern: UInt32(unit))
        }
        return "snip_" + String(abs(Int64(hash)), radix: 36)
    }

    public static func write(_ record: ShareInboxRecord, in container: URL) throws {
        let folder = container.appendingPathComponent(directoryName, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(record)
        let url = folder.appendingPathComponent("\(UUID().uuidString).json")
        try data.write(to: url, options: .atomic)
    }

    public static func consume(in container: URL) throws -> [ShareInboxRecord] {
        let folder = container.appendingPathComponent(directoryName, isDirectory: true)
        let urls = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
        var records: [ShareInboxRecord] = []
        for url in urls where url.pathExtension == "json" {
            if let data = try? Data(contentsOf: url),
               let record = try? JSONDecoder().decode(ShareInboxRecord.self, from: data) {
                records.append(record)
            }
            try? FileManager.default.removeItem(at: url)
        }
        return records.sorted { $0.addedAt < $1.addedAt }
    }
}
