import SwiftUI
import GlossXCore

struct SettingsView: View {
    @EnvironmentObject private var store: LibraryStore
    @State private var accent = SpeechPlayer.accent
    @State private var showsStarterPack = false
    @State private var showsOnboarding = false

    private var accentBinding: Binding<SpeechPlayer.Accent> {
        Binding(
            get: { accent },
            set: {
                accent = $0
                SpeechPlayer.accent = $0
                SpeechPlayer.shared.speak("pronunciation")
            }
        )
    }

    var body: some View {
        NavigationView {
            List {
                Section("iCloud") {
                    Text(store.syncLabel)
                        .foregroundColor(GlossXPalette.ink)
                    Button("立即同步") {
                        Task { await store.refresh() }
                    }
                    .foregroundColor(GlossXPalette.green)
                }
                Section("复习") {
                    Stepper(value: goalBinding, in: StreakRecord.goalRange, step: 5) {
                        HStack {
                            Text("每日目标")
                            Spacer()
                            Text("\(store.dailyGoal) 张")
                                .foregroundColor(GlossXPalette.muted)
                        }
                    }
                    Text("每天在手机上复习满目标张数，连续天数 +1。")
                        .font(.footnote)
                        .foregroundColor(GlossXPalette.muted)
                    Toggle("每日提醒", isOn: reminderBinding)
                    if store.reminderEnabled {
                        DatePicker("提醒时间", selection: reminderTimeBinding, displayedComponents: .hourAndMinute)
                    }
                    Text("每天 \(ReviewReminder.timeLabel) 提醒；当天目标完成后不再提醒。")
                        .font(.footnote)
                        .foregroundColor(GlossXPalette.muted)
                }
                Section("发音") {
                    Picker("口音", selection: accentBinding) {
                        ForEach(SpeechPlayer.Accent.allCases, id: \.self) { accent in
                            Text(accent.title).tag(accent)
                        }
                    }
                    .pickerStyle(.segmented)
                    Text("可在 iPhone 设置 → 辅助功能 → 朗读内容 → 声音中下载“增强”英语语音，发音更自然。")
                        .font(.footnote)
                        .foregroundColor(GlossXPalette.muted)
                }
                Section("入门") {
                    Button("导入入门词包") { showsStarterPack = true }
                    Button("查看新手引导") { showsOnboarding = true }
                }
                .foregroundColor(GlossXPalette.green)
                Section("说明") {
                    Text("在 iPhone 或 Mac 的 Safari 里点词、划句即可收藏；收藏与复习进度通过 iCloud 在两端同步。")
                        .font(.footnote)
                        .foregroundColor(GlossXPalette.muted)
                }
            }
            .navigationTitle("我的")
        }
        .navigationViewStyle(.stack)
        .sheet(isPresented: $showsStarterPack) {
            StarterPackSheet()
                .environmentObject(store)
        }
        .fullScreenCover(isPresented: $showsOnboarding) {
            OnboardingView()
                .environmentObject(store)
        }
    }

    private var goalBinding: Binding<Int> {
        Binding(
            get: { store.dailyGoal },
            set: { store.setDailyGoal($0) }
        )
    }

    private var reminderTimeBinding: Binding<Date> {
        Binding(
            get: {
                let minutes = store.reminderMinutes
                return Calendar.current.date(
                    bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: Date()
                ) ?? Date()
            },
            set: { date in
                let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
                store.setReminderMinutes((parts.hour ?? 20) * 60 + (parts.minute ?? 0))
            }
        )
    }

    private var reminderBinding: Binding<Bool> {
        Binding(
            get: { store.reminderEnabled },
            set: { store.setReminderEnabled($0) }
        )
    }
}
