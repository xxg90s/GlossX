import Foundation
import GlossXCore

enum LocalLibraryCache {
    private static var fileURL: URL {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let directory = root.appendingPathComponent("GlossX", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("library.json")
    }

    static func load() -> LibrarySnapshot? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? SnapshotCodec.decode(data)
    }

    static func save(_ snapshot: LibrarySnapshot) {
        guard let data = try? SnapshotCodec.encode(snapshot) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
