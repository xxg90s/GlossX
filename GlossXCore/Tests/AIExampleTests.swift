import XCTest
@testable import GlossXCore

final class AIExampleTests: XCTestCase {
    func testResolvesOpenAICompatibleEndpoint() throws {
        let endpoint = try XCTUnwrap(AIConfig.resolve(
            settings: ["aiProvider": "deepseek", "aiModel": "deepseek-chat"],
            aiKeys: ["deepseek": "sk-test"]
        ).get())
        XCTAssertEqual(endpoint.style, .openai)
        XCTAssertEqual(endpoint.url.absoluteString, "https://api.deepseek.com/v1/chat/completions")
        XCTAssertEqual(endpoint.model, "deepseek-chat")
        XCTAssertEqual(endpoint.apiKey, "sk-test")
    }

    func testResolvesAnthropicAndCustom() throws {
        let anthropic = try XCTUnwrap(AIConfig.resolve(
            settings: ["aiProvider": "anthropic", "aiModel": "claude-3-5-haiku-20241022"],
            aiKeys: ["anthropic": "sk-ant"]
        ).get())
        XCTAssertEqual(anthropic.style, .anthropic)
        XCTAssertEqual(anthropic.url.absoluteString, "https://api.anthropic.com/v1/messages")

        let custom = try XCTUnwrap(AIConfig.resolve(
            settings: [
                "aiProvider": "custom",
                "aiCustomBaseUrl": "https://example.com/v1/chat/completions/",
                "aiCustomModel": "my-model"
            ],
            aiKeys: ["custom": "key"]
        ).get())
        XCTAssertEqual(custom.url.absoluteString, "https://example.com/v1/chat/completions")
        XCTAssertEqual(custom.model, "my-model")
    }

    func testMissingKeyAndEndpoint() {
        XCTAssertEqual(
            AIConfig.resolve(settings: ["aiProvider": "openai"], aiKeys: [:]).error,
            .missingKey
        )
        XCTAssertEqual(
            AIConfig.resolve(
                settings: ["aiProvider": "custom", "aiCustomBaseUrl": "", "aiCustomModel": ""],
                aiKeys: ["custom": "key"]
            ).error,
            .missingEndpoint
        )
    }

    func testParsesTwoExamplesFromFencedJSON() {
        let text = """
        ```json
        {"examples":[
          {"english":"She processed the data.","chinese":"她处理了这些数据。"},
          {"english":"This process takes time.","chinese":"这个过程需要时间。"},
          {"english":"ignore","chinese":"忽略"}
        ]}
        ```
        """
        let examples = AIExampleParser.parse(text)
        XCTAssertEqual(examples.count, 2)
        XCTAssertEqual(examples[0].english, "She processed the data.")
        XCTAssertEqual(examples[1].chinese, "这个过程需要时间。")
    }

    func testParseDropsBlankEnglish() {
        XCTAssertTrue(AIExampleParser.parse("{\"examples\":[{\"english\":\"\",\"chinese\":\"空\"}]}").isEmpty)
        XCTAssertEqual(AIExampleParser.parse("not json").count, 0)
    }

    func testSetExtraExampleBecomesReviewSentence() throws {
        var snapshot = SnapshotCodec.empty(now: 0)
        snapshot.payload.vocabItems["process"] = [
            "id": "process",
            "word": "process",
            "exampleFromContext": ["english": "Old sentence.", "chinese": "旧句。"],
            "updatedAt": 1
        ]

        let next = try XCTUnwrap(LibraryMutator.setExtraExample(
            in: snapshot,
            id: "process",
            english: "She processed the data.",
            chinese: "她处理了这些数据。",
            now: 99
        ))
        let extra = JSONValue.dictionary(next.payload.vocabItems["process"]?["extraExample"])
        XCTAssertEqual(JSONValue.string(extra["english"]), "She processed the data.")
        XCTAssertEqual(JSONValue.double(next.payload.vocabItems["process"]?["updatedAt"]), 99)
        XCTAssertEqual(LibraryMapper.items(from: next).first?.english, "She processed the data.")
        XCTAssertEqual(LibraryMapper.items(from: next).first?.extraEnglish, "She processed the data.")
    }
}

private extension Result {
    var error: Failure? {
        if case .failure(let error) = self { return error }
        return nil
    }
}
