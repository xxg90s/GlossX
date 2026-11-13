import SwiftUI
import UIKit
import GlossXCore

/// English answer field. Prefers an installed English keyboard and refuses non-Latin text.
struct LatinTextField: UIViewRepresentable {
    var placeholder: String
    @Binding var text: String
    var isEnabled: Bool = true
    var focusOnAppear: Bool = false
    var onSubmit: () -> Void = {}

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> EnglishKeyboardTextField {
        let field = EnglishKeyboardTextField()
        field.delegate = context.coordinator
        field.placeholder = placeholder
        field.font = .preferredFont(forTextStyle: .title3)
        field.adjustsFontForContentSizeCategory = true
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.spellCheckingType = .no
        field.smartQuotesType = .no
        field.smartDashesType = .no
        field.smartInsertDeleteType = .no
        field.keyboardType = .asciiCapable
        field.returnKeyType = .done
        field.enablesReturnKeyAutomatically = true
        field.textContentType = nil
        field.backgroundColor = .clear
        field.tintColor = UIColor(GlossXPalette.green)
        field.setContentHuggingPriority(.defaultHigh, for: .vertical)
        field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        field.addTarget(context.coordinator, action: #selector(Coordinator.editingChanged), for: .editingChanged)
        field.pendingFocus = focusOnAppear
        return field
    }

    func updateUIView(_ field: EnglishKeyboardTextField, context: Context) {
        context.coordinator.parent = self
        if field.text != text {
            field.text = text
        }
        field.isEnabled = isEnabled
        field.focusIfPending()
        if !isEnabled, field.isFirstResponder {
            field.resignFirstResponder()
        }
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: LatinTextField

        init(_ parent: LatinTextField) {
            self.parent = parent
        }

        @objc func editingChanged(_ field: UITextField) {
            parent.text = field.text ?? ""
        }

        func textField(
            _ textField: UITextField,
            shouldChangeCharactersIn range: NSRange,
            replacementString string: String
        ) -> Bool {
            let normalized = SpellInput.normalize(string)
            guard SpellInput.accepts(normalized) else { return false }
            guard normalized != string,
                  let text = textField.text,
                  let swiftRange = Range(range, in: text) else { return true }
            let next = text.replacingCharacters(in: swiftRange, with: normalized)
            textField.text = next
            parent.text = next
            return false
        }

        func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            parent.onSubmit()
            return false
        }
    }
}

final class EnglishKeyboardTextField: UITextField {
    var pendingFocus = false
    private var focusRetries = 0

    override func didMoveToWindow() {
        super.didMoveToWindow()
        focusIfPending()
    }

    /// Focus is deferred until the field is in a window; a refused request is retried briefly
    /// so a presentation transition cannot leave the keyboard down.
    func focusIfPending() {
        guard pendingFocus, window != nil, isEnabled else { return }
        pendingFocus = false
        DispatchQueue.main.async { [weak self] in
            guard let self, self.window != nil, !self.isFirstResponder else { return }
            if !self.becomeFirstResponder(), self.focusRetries < 10 {
                self.focusRetries += 1
                self.pendingFocus = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                    self?.focusIfPending()
                }
            }
        }
    }

    override var textInputMode: UITextInputMode? {
        UITextInputMode.activeInputModes.first { mode in
            mode.primaryLanguage?.hasPrefix("en") == true
        } ?? super.textInputMode
    }
}
