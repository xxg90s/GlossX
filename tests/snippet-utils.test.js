// tests/snippet-utils.test.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = { console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(
        path.resolve(__dirname, "../Shared (Extension)/Resources/lib/snippet-utils.js"),
        "utf8"
    ),
    sandbox,
    { filename: "snippet-utils.js" }
);

const U = sandbox.GlossX.SnippetUtils;

assert.equal(U.detectType("take into account"), "phrase");
assert.equal(U.detectType("The market responded positively to the news yesterday"), "phrase");
assert.equal(U.PHRASE_MAX_WORDS, 12);
assert.equal(
    U.detectType("The government announced new policies yesterday.", "The government announced new policies yesterday."),
    "sentence"
);
assert.equal(
    U.detectType(
        "the government announced new policies yesterday",
        "The government announced new policies yesterday."
    ),
    "sentence"
);
assert.equal(
    U.detectType(
        "government announced new policies yesterday.",
        "The government announced new policies yesterday."
    ),
    "phrase"
);
assert.equal(
    U.detectType("one two three four five six seven eight nine ten eleven twelve"),
    "phrase"
);
assert.equal(
    U.detectType(
        "one two three four five six seven eight nine ten eleven twelve thirteen",
        "one two three four five six seven eight nine ten eleven twelve thirteen fourteen"
    ),
    "excerpt"
);
assert.equal(U.isValidSelection("a"), false);
assert.equal(U.isValidSelection("ab"), true);
assert.equal(U.buildSnippetId("Hello World", "example.com"), U.buildSnippetId("hello world", "example.com"));

const ctx = {
    fullEnglish: "The government announced new policies yesterday.",
    fullChinese: "政府昨天宣布了新政策。"
};
assert.equal(
    U.resolveTranslationFromContext(
        "The government announced new policies yesterday.",
        ctx,
        "sentence"
    ),
    "政府昨天宣布了新政策。"
);
assert.equal(
    U.resolveTranslationFromContext("announced new policies", ctx, "phrase"),
    null
);
assert.equal(
    U.resolveTranslationFromContext(
        "government announced new policies yesterday.",
        ctx,
        "sentence"
    ),
    null
);
assert.equal(
    U.resolveTranslationFromContext(
        "one two three four five six seven eight nine ten eleven twelve thirteen",
        {
            fullEnglish: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen",
            fullChinese: "这是整句中文。"
        },
        "excerpt"
    ),
    null
);
assert.equal(
    U.resolveTranslationFromContext(
        "the government announced new policies yesterday",
        ctx,
        "phrase"
    ),
    "政府昨天宣布了新政策。"
);

assert.equal(
    U.clipSelectionText(
        "take into account 我们必须考虑所有因素。",
        "We must take into account all factors.",
        "我们必须考虑所有因素。"
    ),
    "take into account"
);
assert.equal(
    U.clipSelectionText(
        "quick brown 敏捷",
        "The quick brown fox jumps.",
        "敏捷的棕色狐狸跳了过去。"
    ),
    "quick brown"
);

const echoContext = {
    fullEnglish: "We must take into account all factors.",
    fullChinese: "我们必须考虑所有因素。"
};
assert.equal(
    U.isFullSentenceEcho("take into account", "我们必须考虑所有因素。", echoContext),
    true
);
assert.equal(
    U.isFullSentenceEcho("take into account", "我们必须考虑所有因素", echoContext),
    true
);
assert.equal(
    U.isFullSentenceEcho("We must take into account all factors.", "我们必须考虑所有因素。", echoContext),
    false
);
assert.equal(U.isFullSentenceEcho("take into account", "考虑", echoContext), false);

console.log("snippet-utils tests passed");
