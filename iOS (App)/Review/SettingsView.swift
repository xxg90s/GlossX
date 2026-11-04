import SwiftUI
import GlossXCore

struct SettingsView: View {
    @EnvironmentObject private var store: LibraryStore
    @State private var accent = SpeechPlayer.accent

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
                    Text("晚上 8 点提醒；当天目标完成后不再提醒。")
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
                Section("说明") {
                    Text("手机用来查看和复习你在 Mac 上收藏的词与短语，不提供网页翻译。复习进度会写回同一 iCloud 学习库。")
                        .font(.footnote)
                        .foregroundColor(GlossXPalette.muted)
                }
            }
            .navigationTitle("我的")
        }
        .navigationViewStyle(.stack)
    }

    private var goalBinding: Binding<Int> {
        Binding(
            get: { store.dailyGoal },
            set: { store.setDailyGoal($0) }
        )
    }

    private var reminderBinding: Binding<Bool> {
        Binding(
            get: { store.reminderEnabled },
            set: { store.setReminderEnabled($0) }
        )
    }
}
