import Foundation

public enum AIConfigError: String, Error, Equatable {
    case missingKey
    case missingEndpoint

    public var message: String {
        switch self {
        case .missingKey:
            return "请先在 Mac 的 GlossX 里填写当前服务商的 API Key，同步后再试。"
        case .missingEndpoint:
            return "请先在 Mac 的 GlossX 里配置模型接口地址和模型名称。"
        }
    }
}

public struct AIEndpoint: Equatable {
    public enum Style: String, Equatable {
        case openai
        case anthropic
    }

    public var style: Style
    public var url: URL
    public var model: String
    public var apiKey: String
    public var provider: String
}

public enum AIConfig {
    private static let catalog: [String: (url: String, defaultModel: String, style: AIEndpoint.Style)] = [
        "openai": ("https://api.openai.com/v1/chat/completions", "gpt-4o-mini", .openai),
        "deepseek": ("https://api.deepseek.com/v1/chat/completions", "deepseek-chat", .openai),
        "anthropic": ("https://api.anthropic.com/v1/messages", "claude-3-5-haiku-20241022", .anthropic),
        "moonshot": ("https://api.moonshot.cn/v1/chat/completions", "moonshot-v1-8k", .openai)
    ]

    public static func resolve(settings: [String: Any], aiKeys: [String: Any]) -> Result<AIEndpoint, AIConfigError> {
        let provider = JSONValue.string(settings["aiProvider"]).ifBlank("deepseek")
        let apiKey = JSONValue.string(aiKeys[provider])
        guard !apiKey.isEmpty else { return .failure(.missingKey) }

        if provider == "custom" {
            let rawURL = JSONValue.string(settings["aiCustomBaseUrl"]).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            let model = firstNonEmpty([
                JSONValue.string(settings["aiCustomModel"]),
                JSONValue.string(settings["aiModel"])
            ])
            guard let url = URL(string: rawURL), !model.isEmpty else { return .failure(.missingEndpoint) }
            return .success(AIEndpoint(style: .openai, url: url, model: model, apiKey: apiKey, provider: provider))
        }

        guard let known = catalog[provider] else { return .failure(.missingEndpoint) }
        let model = JSONValue.string(settings["aiModel"]).ifBlank(known.defaultModel)
        guard let url = URL(string: known.url), !model.isEmpty else { return .failure(.missingEndpoint) }
        return .success(AIEndpoint(style: known.style, url: url, model: model, apiKey: apiKey, provider: provider))
    }

    private static func firstNonEmpty(_ values: [String]) -> String {
        values.first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } ?? ""
    }
}

private extension String {
    func ifBlank(_ fallback: String) -> String {
        trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? fallback : self
    }
}
