import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            TodayView()
                .tabItem {
                    Label("今日", systemImage: "sun.max")
                }
            LibraryView()
                .tabItem {
                    Label("词库", systemImage: "books.vertical")
                }
            SettingsView()
                .tabItem {
                    Label("我的", systemImage: "person")
                }
        }
        .tint(GlossXPalette.green)
    }
}
