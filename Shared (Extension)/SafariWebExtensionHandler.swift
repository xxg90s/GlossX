//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Created by xxg90s on 2026/6/28.
//

import SafariServices
import os.log

#if os(macOS)
import AppKit
import UniformTypeIdentifiers
#endif

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    private let iCloudContainerId = "iCloud.com.xxg.Flipword"
    private let libraryRelativePath = "Flipword/library.json"
    private let downloadTimeout: TimeInterval = 10
    private let ubiquityLookupTimeout: TimeInterval = 10

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        os_log(.default, "Received message from browser.runtime.sendNativeMessage: %@ (profile: %@)", String(describing: message), profile?.uuidString ?? "none")

        guard let payload = message as? [String: Any],
              let type = payload["type"] as? String else {
            complete(context, with: ["ok": false, "error": "unsupported message"])
            return
        }

        switch type {
        case "saveMarkdown":
            handleSaveMarkdown(payload: payload, context: context)
        case "icloudStatus":
            // Never block the extension request thread on ubiquity URL lookup.
            DispatchQueue.global(qos: .userInitiated).async {
                self.complete(context, with: self.icloudStatus())
            }
        case "icloudRead":
            DispatchQueue.global(qos: .userInitiated).async {
                self.complete(context, with: self.icloudRead())
            }
        case "icloudWrite":
            let content = payload["content"] as? String ?? ""
            DispatchQueue.global(qos: .userInitiated).async {
                self.complete(context, with: self.icloudWrite(content))
            }
        default:
            complete(context, with: ["ok": false, "error": "unsupported message"])
        }
    }

    private func handleSaveMarkdown(payload: [String: Any], context: NSExtensionContext) {
        let filename = sanitizedFilename(payload["filename"] as? String)
        let content = payload["content"] as? String ?? ""

#if os(macOS)
        let work = {
            self.presentSavePanel(filename: filename, content: content, context: context)
        }
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
#else
        complete(context, with: [
            "ok": false,
            "error": "当前平台不支持另存为文件"
        ])
#endif
    }

    /// `url(forUbiquityContainerIdentifier:)` can hang for a long time; bound it so native messaging always completes.
    private func ubiquityContainerURL() -> (url: URL?, timedOut: Bool) {
        let box = UbiquityURLBox()
        let group = DispatchGroup()
        group.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            box.url = FileManager.default.url(forUbiquityContainerIdentifier: self.iCloudContainerId)
            group.leave()
        }
        let waited = group.wait(timeout: .now() + ubiquityLookupTimeout)
        if waited == .timedOut {
            os_log(.error, "iCloud container URL lookup timed out for %@", iCloudContainerId)
            return (nil, true)
        }
        return (box.url, false)
    }

    private func icloudStatus() -> [String: Any] {
        let signedIn = FileManager.default.ubiquityIdentityToken != nil
        let lookup = ubiquityContainerURL()
        if lookup.timedOut {
            return [
                "ok": false,
                "error": "iCloud 容器响应超时，请打开一次 GlossX 应用后重试"
            ]
        }
        return [
            "ok": true,
            "signedIn": signedIn,
            "available": lookup.url != nil
        ]
    }

    private func libraryFileURL() -> (url: URL?, timedOut: Bool) {
        let lookup = ubiquityContainerURL()
        guard let container = lookup.url else {
            return (nil, lookup.timedOut)
        }
        return (container.appendingPathComponent(libraryRelativePath), false)
    }

    private func icloudAccessError(for lookup: (url: URL?, timedOut: Bool)) -> [String: Any]? {
        if FileManager.default.ubiquityIdentityToken == nil {
            return ["ok": false, "status": "signedOut"]
        }
        if lookup.timedOut {
            return [
                "ok": false,
                "error": "iCloud 容器响应超时，请打开一次 GlossX 应用后重试"
            ]
        }
        if lookup.url == nil {
            return [
                "ok": false,
                "status": "unavailable",
                "error": "请先打开一次 GlossX 应用"
            ]
        }
        return nil
    }

    private func icloudRead() -> [String: Any] {
        let lookup = libraryFileURL()
        if let accessError = icloudAccessError(for: lookup) {
            return accessError
        }
        guard let url = lookup.url else {
            return [
                "ok": false,
                "status": "unavailable",
                "error": "请先打开一次 GlossX 应用"
            ]
        }

        if let downloadError = waitForCloudFile(url) {
            return downloadError
        }

        if !FileManager.default.fileExists(atPath: url.path) {
            return ["ok": true, "exists": false]
        }

        var content: String?
        var readError: String?
        let coordinator = NSFileCoordinator()
        var coordinatorError: NSError?
        coordinator.coordinate(readingItemAt: url, options: [], error: &coordinatorError) { readURL in
            do {
                content = try String(contentsOf: readURL, encoding: .utf8)
            } catch {
                readError = error.localizedDescription
            }
        }
        if let coordinatorError {
            return ["ok": false, "error": coordinatorError.localizedDescription]
        }
        if let readError {
            return ["ok": false, "error": readError]
        }
        guard let content else {
            return ["ok": true, "exists": false]
        }
        return ["ok": true, "exists": true, "content": content]
    }

    private func icloudWrite(_ content: String) -> [String: Any] {
        if content.isEmpty {
            return ["ok": false, "error": "empty snapshot"]
        }
        let lookup = libraryFileURL()
        if let accessError = icloudAccessError(for: lookup) {
            return accessError
        }
        guard let url = lookup.url else {
            return [
                "ok": false,
                "status": "unavailable",
                "error": "请先打开一次 GlossX 应用"
            ]
        }

        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
        } catch {
            return ["ok": false, "error": error.localizedDescription]
        }

        var writeError: String?
        let coordinator = NSFileCoordinator()
        var coordinatorError: NSError?
        coordinator.coordinate(writingItemAt: url, options: .forReplacing, error: &coordinatorError) { writeURL in
            do {
                try content.write(to: writeURL, atomically: true, encoding: .utf8)
            } catch {
                writeError = error.localizedDescription
            }
        }
        if let coordinatorError {
            return ["ok": false, "error": coordinatorError.localizedDescription]
        }
        if let writeError {
            return ["ok": false, "error": writeError]
        }
        return ["ok": true]
    }

    private func cloudFileState(_ url: URL) -> (exists: Bool, downloading: Bool, isUbiquitous: Bool) {
        let exists = FileManager.default.fileExists(atPath: url.path)
        let values = try? url.resourceValues(forKeys: [
            .isUbiquitousItemKey,
            .ubiquitousItemDownloadingStatusKey,
            .ubiquitousItemIsDownloadingKey
        ])
        let isUbiquitous = values?.isUbiquitousItem == true
        let downloading = values?.ubiquitousItemIsDownloading == true
            || values?.ubiquitousItemDownloadingStatus == URLUbiquitousItemDownloadingStatus.notDownloaded
        return (exists, downloading, isUbiquitous)
    }

    private func waitForCloudFile(_ url: URL) -> [String: Any]? {
        var state = cloudFileState(url)

        // Missing local file that is not a known ubiquitous stub → treat as absent (first push).
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
        if !state.exists && !state.downloading && !state.isUbiquitous {
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

        if cloudFileState(url).downloading {
            return ["ok": false, "status": "downloading"]
        }
        return nil
    }

    private func sanitizedFilename(_ raw: String?) -> String {
        let fallback = "GlossX.md"
        guard let raw, !raw.isEmpty else { return fallback }
        let cleaned = raw
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.isEmpty { return fallback }
        return cleaned.lowercased().hasSuffix(".md") ? cleaned : "\(cleaned).md"
    }

    private func complete(_ context: NSExtensionContext, with response: [String: Any]) {
        let item = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            item.userInfo = [SFExtensionMessageKey: response]
        } else {
            item.userInfo = ["message": response]
        }
        context.completeRequest(returningItems: [item], completionHandler: nil)
    }

#if os(macOS)
    private func presentSavePanel(filename: String, content: String, context: NSExtensionContext) {
        let panel = NSSavePanel()
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.title = "导出 Markdown"
        panel.message = "选择保存位置"
        panel.nameFieldLabel = "文件名："
        panel.nameFieldStringValue = filename
        panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        if #available(macOS 11.0, *) {
            panel.allowedContentTypes = [UTType(filenameExtension: "md") ?? .plainText]
        } else {
            panel.allowedFileTypes = ["md"]
        }

        NSApp.activate(ignoringOtherApps: true)
        var response: NSApplication.ModalResponse = .cancel
        if Thread.isMainThread {
            response = panel.runModal()
        } else {
            DispatchQueue.main.sync {
                response = panel.runModal()
            }
        }
        guard response == .OK, let url = panel.url else {
            complete(context, with: ["ok": false, "cancelled": true])
            return
        }

        do {
            try content.write(to: url, atomically: true, encoding: .utf8)
            complete(context, with: ["ok": true, "path": url.path])
        } catch {
            complete(context, with: [
                "ok": false,
                "error": error.localizedDescription
            ])
        }
    }
#endif
}

private final class UbiquityURLBox: @unchecked Sendable {
    var url: URL?
}
