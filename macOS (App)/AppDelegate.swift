//
//  AppDelegate.swift
//  macOS (App)
//
//  Created by xxg90s on 2026/6/28.
//

import Cocoa

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        warmUpICloudContainer()
    }

    private func warmUpICloudContainer() {
        let containerId = "iCloud.com.xxg.Flipword"
        DispatchQueue.global(qos: .utility).async {
            guard let root = FileManager.default.url(forUbiquityContainerIdentifier: containerId) else {
                return
            }
            let folder = root.appendingPathComponent("GlossX", isDirectory: true)
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

}
