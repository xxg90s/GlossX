const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = {
    console,
    location: { href: "https://example.com/long-article" }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(
        path.resolve(__dirname, "../Shared (Extension)/Resources/lib/paragraph-translator.js"),
        "utf8"
    ),
    sandbox,
    { filename: "paragraph-translator.js" }
);

const translatorSource = fs.readFileSync(
    path.resolve(__dirname, "../Shared (Extension)/Resources/lib/paragraph-translator.js"),
    "utf8"
);
const replacerSource = fs.readFileSync(
    path.resolve(__dirname, "../Shared (Extension)/Resources/lib/replacer.js"),
    "utf8"
);

assert.match(
    translatorSource,
    /glossx-snippet-save-panel/,
    "sentence translator must skip the selection save panel"
);
assert.match(
    translatorSource,
    /hasUserRequest/,
    "sentence translator must yield while a user-facing snippet translation is in flight"
);
assert.match(
    replacerSource,
    /glossx-snippet-save-panel/,
    "word replacer must skip the selection save panel"
);

const Translator = sandbox.GlossX.ParagraphTranslator;
assert.equal(typeof Translator.sampleSentences, "function");

function makeCandidate(globalIndex) {
    const textNode = {
        parentElement: {
            tagName: "P",
            childNodes: []
        }
    };
    textNode.parentElement.childNodes = [textNode];
    const text = `这是第${globalIndex}句用于抽样的测试内容。`;
    return {
        textNode,
        start: 0,
        end: text.length,
        text,
        globalIndex
    };
}

function selectedIndexes(candidates, ratioKey) {
    const selected = Translator.sampleSentences(candidates, ratioKey);
    return candidates
        .filter((candidate) => selected.has(candidate.globalIndex))
        .map((candidate) => candidate.globalIndex);
}

{
    const candidates = Array.from({ length: 8 }, (_, i) => makeCandidate(i + 1));
    const selected = selectedIndexes(candidates, "max");
    assert.ok(selected.length >= 1);
    assert.ok(selected.length <= Translator.MAX_SENTENCES);
}

{
    const max = Translator.MAX_SENTENCES;
    const candidates = Array.from({ length: max * 6 }, (_, i) => makeCandidate(i + 1));
    const selected = selectedIndexes(candidates, "max");
    const total = candidates.length;
    const lastQuarterStart = Math.floor(total * 0.75);

    assert.ok(selected.length <= max, `cap should apply, got ${selected.length}`);
    assert.ok(selected.length >= Math.min(8, max));
    assert.ok(
        selected.some((index) => index <= Math.ceil(total * 0.25)),
        `expected coverage near the start, got ${selected.slice(0, 5).join(",")}`
    );
    assert.ok(
        selected.some((index) => index >= lastQuarterStart),
        `expected coverage near the end, got last=${selected[selected.length - 1]}`
    );
}

console.log("paragraph-sample tests passed");
