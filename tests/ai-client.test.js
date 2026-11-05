const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const resources = path.resolve(
    __dirname,
    "../Shared (Extension)/Resources"
);

const storage = {
    settings: {
        aiEnabled: true,
        aiProvider: "deepseek",
        aiModel: "deepseek-chat"
    },
    aiKeys: {
        deepseek: "sk-test"
    }
};

const sandbox = {
    console,
    TextDecoder,
    Uint8Array,
    Array,
    setTimeout,
    clearTimeout,
    fetch: async () => {
        throw new Error("network disabled in unit test");
    },
    AbortController,
    browser: {
        storage: {
            local: {
                async get(keys) {
                    const list = Array.isArray(keys) ? keys : [keys];
                    const out = {};
                    for (const key of list) out[key] = storage[key];
                    return out;
                }
            }
        }
    }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

for (const script of ["lib/ai-providers.js", "lib/ai-client.js", "lib/ai-service.js"]) {
    vm.runInContext(
        fs.readFileSync(path.join(resources, script), "utf8"),
        sandbox,
        { filename: script }
    );
}

const aiClientSource = fs.readFileSync(path.join(resources, "lib/ai-client.js"), "utf8");
const backgroundSource = fs.readFileSync(path.join(resources, "background.js"), "utf8");
for (const source of [aiClientSource, backgroundSource]) {
    assert.match(source, /sense-for-sense localization, NOT literal translation/);
    assert.match(source, /PARAGRAPH_AI_TEMPERATURE = 0\.4/);
    assert.match(source, /temperature: PARAGRAPH_AI_TEMPERATURE/);
}

assert.equal(typeof sandbox.GlossX.AIClient.translateParagraph, "function");
assert.equal(typeof sandbox.GlossX.AIClient.translateSnippet, "function");
assert.equal(typeof sandbox.GlossX.AIClient.hasUserRequest, "function");
assert.equal(typeof sandbox.GlossX.AIService.translateParagraph, "function");

const parsed = sandbox.GlossX.AIClient.parseAiJson('{"english":"Hello world"}');
assert.equal(parsed.english, "Hello world");

(async () => {
    const result = await sandbox.GlossX.AIService.translateParagraph({ text: "你好" });
    // Network is stubbed; should fail gracefully instead of hanging/undefined.
    assert.equal(result.ok, false);
    assert.equal(result.error, "翻译失败");

    sandbox.fetch = () => new Promise((resolve) => {
        setTimeout(() => {
            resolve({
                ok: false,
                status: 503,
                text: async () => "",
                json: async () => ({})
            });
        }, 80);
    });
    const pendingSnippet = sandbox.GlossX.AIClient.translateSnippet({
        text: "kick the bucket",
        context: { fullEnglish: "He kicked the bucket." }
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(
        sandbox.GlossX.AIClient.hasUserRequest(),
        true,
        "in-flight snippet translation must be visible so page sentence jobs can yield"
    );
    await pendingSnippet;
    assert.equal(
        sandbox.GlossX.AIClient.hasUserRequest(),
        false,
        "user-request flag must clear after snippet translation settles"
    );

    {
        const urls = [];
        sandbox.fetch = async (url) => {
            urls.push(String(url));
            if (String(url).includes("mymemory")) {
                return {
                    ok: true,
                    json: async () => ({ responseData: { translatedText: "一命呜呼" } })
                };
            }
            return {
                ok: false,
                status: 429,
                text: async () => "busy",
                json: async () => ({})
            };
        };

        const phrase = await sandbox.GlossX.AIClient.translateSnippet({
            text: "kick the bucket",
            context: {
                fullEnglish: "He kicked the bucket yesterday.",
                fullChinese: "他昨天去世了。"
            }
        });
        assert.equal(phrase.ok, false, "provider errors must be returned to the selection panel");
        assert.equal(phrase.error, "busy");
        const aiCalls = urls.filter((url) => !url.includes("mymemory"));
        assert.equal(
            aiCalls.length,
            1,
            "phrase translation must make one configured-provider request"
        );
        assert.equal(
            urls.some((url) => url.includes("mymemory")),
            false,
            "phrase translation must not bypass the configured AI provider"
        );
    }

    {
        const order = [];
        sandbox.fetch = async () => {
            await new Promise((resolve) => setTimeout(resolve, 30));
            order.push("done");
            return {
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: '{"translation":"用户"}' } }]
                })
            };
        };

        const pageP = sandbox.GlossX.AIClient.callAi({
            settings: storage.settings,
            apiKey: storage.aiKeys.deepseek,
            prompt: "page",
            priority: "page"
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
        const userP = sandbox.GlossX.AIClient.callAi({
            settings: storage.settings,
            apiKey: storage.aiKeys.deepseek,
            prompt: "user",
            priority: "user"
        });
        await Promise.all([pageP, userP]);
        assert.deepEqual(order, ["done", "done"]);
        const userResult = await userP;
        assert.equal(userResult.includes("用户"), true);
    }

    {
        let capturedBody = null;
        sandbox.fetch = async (_url, options) => {
            capturedBody = JSON.parse(options.body);
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: { content: '{"english":"This is worth thinking through carefully."}' }
                    }]
                })
            };
        };
        const result = await sandbox.GlossX.AIClient.translateParagraph({
            text: "这个问题值得我们认真思考一下。"
        });
        assert.equal(result.ok, true);
        assert.equal(result.source, "ai");
        assert.equal(capturedBody.temperature, 0.4);
        assert.match(capturedBody.messages[1].content, /sense-for-sense localization, NOT literal translation/);
        assert.match(capturedBody.messages[1].content, /这个问题值得我们认真思考一下/);
    }

    {
        let capturedBody = null;
        sandbox.fetch = async (_url, options) => {
            capturedBody = JSON.parse(options.body);
            return {
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: '{"ok":true}' } }]
                })
            };
        };
        await sandbox.GlossX.AIClient.callAi({
            settings: storage.settings,
            apiKey: storage.aiKeys.deepseek,
            prompt: "other"
        });
        assert.equal(capturedBody.temperature, 0.1);
    }

    {
        vm.runInContext(
            fs.readFileSync(path.join(resources, "lib/snippet-utils.js"), "utf8"),
            sandbox,
            { filename: "snippet-utils.js" }
        );
        const context = {
            fullEnglish: "We must take into account all factors.",
            fullChinese: "我们必须考虑所有因素。"
        };
        let prompt = "";
        sandbox.fetch = async (_url, options) => {
            prompt = JSON.parse(options.body).messages[1].content;
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: { content: '{"translation":"我们必须考虑所有因素。"}' }
                    }]
                })
            };
        };
        const echoed = await sandbox.GlossX.AIClient.translateSnippet({
            text: "take into account",
            context
        });
        assert.equal(echoed.ok, false);
        assert.equal(echoed.error, "译文未对应选区，点击重试");
        assert.match(prompt, /shorter than the full Chinese sentence/);

        sandbox.fetch = async () => ({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '{"translation":"考虑"}' } }]
            })
        });
        const partial = await sandbox.GlossX.AIClient.translateSnippet({
            text: "take into account",
            context
        });
        assert.equal(partial.ok, true);
        assert.equal(partial.translation, "考虑");
    }

    assert.doesNotMatch(backgroundSource, /if \(type === "sentence"\) return fullZh/);
    assert.match(backgroundSource, /shorter than the full Chinese sentence/);
    assert.match(backgroundSource, /译文未对应选区，点击重试/);

    console.log("ai-client tests passed");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
