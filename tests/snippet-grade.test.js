const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const storageData = {};
const sandbox = {
    console,
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
    },
    globalThis: {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
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

    const review = await S.gradeItem(saved.item.id, "review");
    assert.equal(review.ok, true);
    assert.equal(review.item.status, "learning");
    assert.ok(review.item.nextReviewAt > Date.now());

    const mastered = await S.gradeItem(saved.item.id, "mastered");
    assert.equal(mastered.ok, true);
    assert.equal(mastered.item.status, "mastered");
    assert.ok(mastered.item.learnedAt);

    const sentence = await S.saveItem({
        text: "We must take into account all factors in this decision today.",
        context: {
            fullEnglish: "We must take into account all factors in this decision today.",
            fullChinese: "我们必须考虑这个决定中的所有因素。",
            pageUrl: "https://example.com/b",
            hostname: "example.com"
        }
    });
    assert.equal(sentence.ok, true);
    const badGrade = await S.gradeItem(sentence.item.id, "mastered");
    assert.equal(badGrade.ok, false);

    console.log("snippet-grade tests passed");
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
