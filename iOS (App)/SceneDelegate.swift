import UIKit
import SwiftUI
import GlossXCore

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?
    let store = LibraryStore()

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        let root = RootView().environmentObject(store)
        window.rootViewController = UIHostingController(rootView: root)
        self.window = window
        window.makeKeyAndVisible()
        handle(connectionOptions.urlContexts)
        Task { await store.refresh() }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        handle(URLContexts)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        Task { await store.refresh() }
    }

    private func handle(_ contexts: Set<UIOpenURLContext>) {
        let reviewURL = StreakSharedState.reviewURL
        guard contexts.contains(where: { $0.url.scheme == reviewURL.scheme && $0.url.host == reviewURL.host }) else {
            return
        }
        store.openReviewFromWidget()
    }
}
