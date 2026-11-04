import UIKit
import UniformTypeIdentifiers
import GlossXCore

final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        Task { await saveAndFinish() }
    }

    private func saveAndFinish() async {
        let text = await selectedText()
        if let text, let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: StreakSharedState.appGroupID
        ) {
            let record = ShareInboxRecord(text: text, addedAt: Date().timeIntervalSince1970 * 1000)
            try? ShareInbox.write(record, in: container)
        }
        await MainActor.run {
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }

    private func selectedText() async -> String? {
        let providers = extensionContext?.inputItems
            .compactMap { $0 as? NSExtensionItem }
            .flatMap { $0.attachments ?? [] } ?? []
        for provider in providers {
            if let text = await loadString(provider, type: .plainText) { return text }
            if let text = await loadString(provider, type: .text) { return text }
        }
        return nil
    }

    private func loadString(_ provider: NSItemProvider, type: UTType) async -> String? {
        guard provider.hasItemConformingToTypeIdentifier(type.identifier) else { return nil }
        return await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { item, _ in
                if let text = item as? String {
                    continuation.resume(returning: ShareInbox.normalize(text))
                } else if let data = item as? Data, let text = String(data: data, encoding: .utf8) {
                    continuation.resume(returning: ShareInbox.normalize(text))
                } else if let url = item as? URL, let text = try? String(contentsOf: url, encoding: .utf8) {
                    continuation.resume(returning: ShareInbox.normalize(text))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }
}
