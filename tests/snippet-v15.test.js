const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(
    path.resolve(__dirname, "../Shared (Extension)/Resources/learning.html"),
    "utf8"
);

[
    "snippets-start-learn",
    "snippets-learn-overlay",
    "snippets-learn-body",
    "snippets-grade-review",
    "snippets-grade-mastered"
].forEach((id) => {
    if (!html.includes(`id="${id}"`)) {
        throw new Error(`learning.html missing #${id} for phrase learning flow`);
    }
});

const snippetsJs = fs.readFileSync(
    path.resolve(__dirname, "../Shared (Extension)/Resources/snippets.js"),
    "utf8"
);

[
    "gradeSnippetItem",
    "buildPhraseLearnQueue",
    "startLearning"
].forEach((token) => {
    if (!snippetsJs.includes(token)) {
        throw new Error(`snippets.js missing ${token}`);
    }
});

const markerJs = fs.readFileSync(
    path.resolve(__dirname, "../Shared (Extension)/Resources/lib/snippet-marker.js"),
    "utf8"
);

if (!markerJs.includes("glossx-snippet-saved")) {
    throw new Error("snippet-marker.js missing glossx-snippet-saved highlight");
}

console.log("snippet-v15 tests passed");
