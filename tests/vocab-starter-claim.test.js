const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const storageData = {};
const sandbox = {
    console,
    setTimeout,
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
vm.runInContext(
    fs.readFileSync(
        path.resolve(__dirname, "../Shared (Extension)/Resources/lib/vocab-storage.js"),
        "utf8"
    ),
    sandbox,
    { filename: "vocab-storage.js" }
);

const S = sandbox.GlossX.VocabStorage;

(async () => {
storageData.vocabItems = {
    time: {
        id: "time",
        word: "time",
        definitions: ["时间"],
        source: "starter:daily",
        status: "new"
    },
    apple: {
        id: "apple",
        word: "apple",
        definitions: ["苹果"],
        source: "ios",
        status: "new"
    }
};

const claimed = await S.saveItem({ id: "time", word: "time", definitions: ["时间"] });
assert.equal(claimed.ok, true);
assert.equal(storageData.vocabItems.time.source, "safari");

const kept = await S.saveItem({ id: "apple", word: "apple", definitions: ["苹果"] });
assert.equal(kept.ok, true);
assert.equal(storageData.vocabItems.apple.source, "ios");

const created = await S.saveItem({ id: "river", word: "river", definitions: ["河"] });
assert.equal(created.ok, true);
assert.equal(storageData.vocabItems.river.source, undefined);

console.log("vocab starter claim tests passed");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
