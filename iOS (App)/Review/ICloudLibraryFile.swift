import Foundation

enum ICloudReadResult: Sendable {
    case signedOut
    case unavailable
    case downloading
    case missing
    case content(Data)
    case failure(String)
}

enum ICloudWriteResult: Sendable {
    case signedOut
    case unavailable
    case success
    case failure(String)
}

enum ICloudLibraryFile {
    static let containerId = "iCloud.com.xxg.Flipword"
    static let libraryRelativePath = "Flipword/library.json"
    static let downloadTimeout: TimeInterval = 10
    static let lookupTimeout: TimeInterval = 10

    nonisolated static func read() -> ICloudReadResult {
        if FileManager.default.ubiquityIdentityToken == nil {
            return .signedOut
        }
        let lookup = libraryFileURL()
        if lookup.timedOut || lookup.url == nil {
            return .unavailable
        }
        guard let url = lookup.url else { return .unavailable }
        if let downloading = waitForCloudFile(url), downloading {
            return .downloading
        }
        if !FileManager.default.fileExists(atPath: url.path) {
            return .missing
        }
        var content: Data?
        var readError: String?
        let coordinator = NSFileCoordinator()
        var coordinatorError: NSError?
        coordinator.coordinate(readingItemAt: url, options: [], error: &coordinatorError) { readURL in
            do {
                content = try Data(contentsOf: readURL)
            } catch {
                readError = error.localizedDescription
            }
        }
        if let coordinatorError {
            return .failure(coordinatorError.localizedDescription)
        }
        if let readError {
            return .failure(readError)
        }
        guard let content else { return .missing }
        return .content(content)
    }

    nonisolated static func write(_ data: Data) -> ICloudWriteResult {
        if data.isEmpty { return .failure("empty snapshot") }
        if FileManager.default.ubiquityIdentityToken == nil {
            return .signedOut
        }
        let lookup = libraryFileURL()
        guard let url = lookup.url else { return .unavailable }
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
        } catch {
            return .failure(error.localizedDescription)
        }
        var writeError: String?
        let coordinator = NSFileCoordinator()
        var coordinatorError: NSError?
        coordinator.coordinate(writingItemAt: url, options: .forReplacing, error: &coordinatorError) { writeURL in
            do {
                try data.write(to: writeURL, options: .atomic)
            } catch {
                writeError = error.localizedDescription
            }
        }
        if let coordinatorError {
            return .failure(coordinatorError.localizedDescription)
        }
        if let writeError {
            return .failure(writeError)
        }
        return .success
    }

    nonisolated private static func libraryFileURL() -> (url: URL?, timedOut: Bool) {
        let box = UbiquityURLBox()
        let group = DispatchGroup()
        group.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            box.url = FileManager.default.url(forUbiquityContainerIdentifier: containerId)
            group.leave()
        }
        if group.wait(timeout: .now() + lookupTimeout) == .timedOut {
            return (nil, true)
        }
        guard let container = box.url else { return (nil, false) }
        return (container.appendingPathComponent(libraryRelativePath), false)
    }

    nonisolated private static func waitForCloudFile(_ url: URL) -> Bool? {
        var state = cloudFileState(url)
        if !state.exists && !state.isUbiquitous && !state.downloading {
            return nil
        }
        if state.downloading || (state.isUbiquitous && !state.exists) {
            try? FileManager.default.startDownloadingUbiquitousItem(at: url)
            state = cloudFileState(url)
        }
        if state.exists && !state.downloading {
            return nil
        }
        let deadline = Date().addingTimeInterval(downloadTimeout)
        while Date() < deadline {
            state = cloudFileState(url)
            if state.exists && !state.downloading {
                return nil
            }
            if !state.exists && !state.downloading && !state.isUbiquitous {
                return nil
            }
            Thread.sleep(forTimeInterval: 0.2)
        }
        return cloudFileState(url).downloading ? true : nil
    }

    nonisolated private static func cloudFileState(_ url: URL) -> (exists: Bool, downloading: Bool, isUbiquitous: Bool) {
        let exists = FileManager.default.fileExists(atPath: url.path)
        let values = try? url.resourceValues(forKeys: [
            .isUbiquitousItemKey,
            .ubiquitousItemDownloadingStatusKey,
            .ubiquitousItemIsDownloadingKey
        ])
        let isUbiquitous = values?.isUbiquitousItem == true
        let downloading = values?.ubiquitousItemIsDownloading == true
            || values?.ubiquitousItemDownloadingStatus == .notDownloaded
        return (exists, downloading, isUbiquitous)
    }
}

private final class UbiquityURLBox: @unchecked Sendable {
    var url: URL?
}
