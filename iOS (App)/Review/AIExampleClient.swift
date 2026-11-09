import Foundation
import GlossXCore

enum AIExampleClient {
    enum Failure: LocalizedError {
        case config(AIConfigError)
        case timeout
        case http(String)
        case empty

        var errorDescription: String? {
            switch self {
            case .config(let error): return error.message
            case .timeout: return "请求超时，请检查网络或 API Key"
            case .http(let message): return message
            case .empty: return "AI 返回内容无法解析"
            }
        }
    }

    static func generate(word: String, definition: String, dialect: String, snapshot: LibrarySnapshot) async throws -> [AIExample] {
        let endpoint: AIEndpoint
        switch AIConfig.resolve(settings: snapshot.payload.settings, aiKeys: snapshot.payload.aiKeys) {
        case .success(let value):
            endpoint = value
        case .failure(let error):
            throw Failure.config(error)
        }

        let prompt = AIExampleParser.prompt(word: word, definition: definition, dialect: dialect)
        let content = try await request(endpoint: endpoint, prompt: prompt)
        let examples = AIExampleParser.parse(content)
        guard !examples.isEmpty else { throw Failure.empty }
        return examples
    }

    static func request(endpoint: AIEndpoint, prompt: String) async throws -> String {
        var request = URLRequest(url: endpoint.url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Accept")

        let body: [String: Any]
        if endpoint.style == .anthropic {
            request.setValue(endpoint.apiKey, forHTTPHeaderField: "x-api-key")
            request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
            body = [
                "model": endpoint.model,
                "max_tokens": 400,
                "temperature": 0.4,
                "messages": [["role": "user", "content": prompt]]
            ]
        } else {
            request.setValue("Bearer \(endpoint.apiKey)", forHTTPHeaderField: "Authorization")
            body = [
                "model": endpoint.model,
                "temperature": 0.4,
                "max_tokens": 400,
                "messages": [
                    [
                        "role": "system",
                        "content": "Reply with valid JSON only. Chinese fields must be readable Simplified Chinese UTF-8 characters (简体中文)."
                    ],
                    ["role": "user", "content": prompt]
                ]
            ]
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch let error as URLError where error.code == .timedOut {
            throw Failure.timeout
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            throw Failure.http(text.isEmpty ? "HTTP \(status)" : String(text.prefix(180)))
        }

        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        if endpoint.style == .anthropic {
            let blocks = object?["content"] as? [[String: Any]] ?? []
            let text = blocks.first { JSONValue.string($0["type"]) == "text" }.map { JSONValue.string($0["text"]) } ?? ""
            return text
        }
        let choices = object?["choices"] as? [[String: Any]] ?? []
        let message = JSONValue.dictionary(choices.first?["message"])
        return JSONValue.string(message["content"])
    }
}

enum AIDefinitionClient {
    static func lookup(word: String, snapshot: LibrarySnapshot) async throws -> AIDefinition {
        let endpoint: AIEndpoint
        switch AIConfig.resolve(settings: snapshot.payload.settings, aiKeys: snapshot.payload.aiKeys) {
        case .success(let value):
            endpoint = value
        case .failure(let error):
            throw AIExampleClient.Failure.config(error)
        }
        let content = try await AIExampleClient.request(endpoint: endpoint, prompt: AIDefinitionParser.prompt(word: word))
        guard let parsed = AIDefinitionParser.parse(content, word: word) else {
            throw AIExampleClient.Failure.empty
        }
        return parsed
    }
}
