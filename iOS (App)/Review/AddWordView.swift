import SwiftUI

struct AddWordView: View {
    @EnvironmentObject private var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @State private var word: String
    @State private var definition = ""
    @State private var example = ""
    @State private var exampleChinese = ""
    @State private var error = ""

    init(word: String = "") {
        _word = State(initialValue: word)
    }

    var body: some View {
        NavigationView {
            Form {
                Section {
                    LatinTextField(placeholder: "单词或短语", text: $word)
                        .frame(minHeight: 36)
                    TextField("中文释义", text: $definition)
                } footer: {
                    if !error.isEmpty {
                        Text(error).foregroundColor(GlossXPalette.danger)
                    }
                }
                Section("例句（可选）") {
                    LatinTextField(placeholder: "英文例句", text: $example)
                        .frame(minHeight: 36)
                    TextField("例句中文", text: $exampleChinese)
                }
            }
            .navigationTitle("添加单词")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("添加", action: save)
                        .disabled(word.trimmingCharacters(in: .whitespaces).isEmpty
                                  || definition.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func save() {
        if store.addWord(word, definition: definition, example: example, exampleChinese: exampleChinese) {
            dismiss()
        } else {
            error = "词库里已经有这个词了"
        }
    }
}
