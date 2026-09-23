// tests/snippet-storage.test.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const storageData = {};
const sandbox = {
    console,
    setTimeout: (fn, ms, ...args) => setTimeout(fn, ms >= 1000 ? 30 : ms, ...args),
    clearTimeout,
    browser: {
        storage: {
            local: {
                async get(key) {
                    if (typeof key === "string") return { [key]: storageData[key] };
                    return { ...storageData };
                },
                async set(obj) {
                    Object.assign(storageData, obj);
                }
            }
        }
    }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

for (const file of ["snippet-utils.js", "snippet-storage.js"]) {
    vm.runInContext(
        fs.readFileSync(
            path.resolve(__dirname, `../Shared (Extension)/Resources/lib/${file}`),
            "utf8"
        ),
        sandbox,
        { filename: file }
    );
}

(async () => {
    const S = sandbox.GlossX.SnippetStorage;
    const payload = {
        text: "take into account",
        context: {
            fullEnglish: "We must take into account all factors.",
            fullChinese: "我们必须考虑所有因素。",
            pageUrl: "https://example.com/a",
            hostname: "example.com"
        }
    };
    const saved = await S.saveItem(payload);
    assert.equal(saved.ok, true);
    assert.equal(saved.isNew, true);
    assert.equal(saved.item.type, "phrase");

    const dup = await S.saveItem(payload);
    assert.equal(dup.ok, true);
    assert.equal(dup.isNew, false);

    const items = await S.getItems();
    assert.equal(Object.keys(items).length, 1);

    const removed = await S.removeItem(saved.item.id);
    assert.equal(removed.ok, true);
    assert.equal(Object.keys(await S.getItems()).length, 0);

    let lookupCalls = 0;
    sandbox.GlossX.AIClient = {
        translateSnippet: async () => {
            lookupCalls += 1;
            return { ok: true, translation: "不应查询" };
        }
    };
    const skipped = await S.saveItem({
        text: "on the other hand",
        skipLookup: true,
        context: {
            fullEnglish: "On the other hand, it works.",
            fullChinese: "另一方面，这样可行。",
            pageUrl: "https://example.com/b",
            hostname: "example.com"
        }
    });
    assert.equal(skipped.ok, true);
    assert.equal(lookupCalls, 0, "save while translation is still loading must not start another lookup");

    sandbox.GlossX.AIClient = {
        translateSnippet: () => new Promise(() => {})
    };
    const hungSave = await Promise.race([
        S.saveItem({
            text: "kick the bucket",
            context: {
                fullEnglish: "He kicked the bucket.",
                fullChinese: "他去世了。",
                pageUrl: "https://example.com/c",
                hostname: "example.com"
            }
        }),
        new Promise((resolve) => {
            setTimeout(() => resolve({ ok: false, error: "test_timeout" }), 200);
        })
    ]);
    assert.equal(hungSave.ok, true, "hung snippet translation must not block saving to the library");
    assert.equal(hungSave.item.text, "kick the bucket");

    console.log("snippet-storage tests passed");
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
