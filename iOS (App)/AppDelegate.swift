//
//  AppDelegate.swift
//  iOS (App)
//
//  Created by xxg90s on 2026/6/28.
//

import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        warmUpICloudContainer()
        return true
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

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

}
