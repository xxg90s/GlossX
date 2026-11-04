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
            StatsView()
                .tabItem {
                    Label("统计", systemImage: "chart.bar.fill")
                }
            SettingsView()
                .tabItem {
                    Label("我的", systemImage: "person")
                }
        }
        .tint(GlossXPalette.green)
    }
}
