const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const resources = path.resolve(
    __dirname,
    "../Shared (Extension)/Resources"
);

const storage = {
    aiProviderProfiles: [],
    aiKeys: {},
    settings: {}
};

const sandbox = {
    console,
    crypto: {
        _n: 0,
        randomUUID() {
            this._n += 1;
            return `profile-test-id-${this._n}`;
        }
    },
    browser: {
        storage: {
            local: {
                async get(keys) {
                    const list = Array.isArray(keys) ? keys : [keys];
                    const out = {};
                    for (const key of list) out[key] = storage[key];
                    return out;
                },
                async set(values) {
                    Object.assign(storage, values);
                }
            }
        }
    }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

for (const script of ["lib/ai-providers.js", "lib/ai-profiles.js"]) {
    vm.runInContext(
        fs.readFileSync(path.join(resources, script), "utf8"),
        sandbox,
        { filename: script }
    );
}

const api = sandbox.GlossX.AIProfiles;

(async () => {
    let result = await api.upsert({
        name: "公司 DeepSeek",
        provider: "deepseek",
        model: "deepseek-chat",
        apiKey: "sk-test-key-123456"
    });
    assert.equal(result.ok, true);
    assert.equal(result.profiles.length, 1);
    assert.equal(result.profiles[0].name, "公司 DeepSeek");

    result = await api.upsert({
        name: "缺 key",
        provider: "deepseek",
        model: "deepseek-chat",
        apiKey: ""
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "请先填写或保存 API Key");

    storage.aiKeys.deepseek = "sk-stored-key-abcdef";
    result = await api.upsert({
        name: "用已存 Key",
        provider: "deepseek",
        model: "deepseek-chat",
        apiKey: "",
        useStoredKey: true
    });
    assert.equal(result.ok, true);

    result = await api.apply(result.profiles.find((item) => item.name === "用已存 Key").id);
    assert.equal(result.ok, true);
    assert.equal(storage.settings.aiProvider, "deepseek");
    assert.equal(storage.aiKeys.deepseek, "sk-stored-key-abcdef");

    console.log("ai-profiles storage tests passed");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
