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
assert.equal(U.detectType("The market responded positively to the news yesterday"), "sentence");
assert.equal(
    U.detectType("The government announced new policies yesterday.", "The government announced new policies yesterday."),
    "sentence"
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

console.log("snippet-utils tests passed");
