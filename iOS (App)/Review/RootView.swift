import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: LibraryStore
    @State private var showsOnboarding = !Onboarding.isDone

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
        .fullScreenCover(isPresented: $showsOnboarding) {
            OnboardingView()
                .environmentObject(store)
        }
    }
}
