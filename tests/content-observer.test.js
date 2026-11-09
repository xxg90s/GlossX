const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const content = fs.readFileSync(
    path.resolve(__dirname, "../Shared (Extension)/Resources/content.js"),
    "utf8"
);

assert.match(
    content,
    /pendingAddedNodes/,
    "content script should queue added nodes so debounce cannot drop earlier mutations"
);
assert.match(
    content,
    /pendingAddedNodes\.push/,
    "new mutation batches must be appended, not replace the previous batch"
);
assert.match(
    content,
    /flushAddedNodes/,
    "queued nodes should flush after debounce, including nodes from earlier batches"
);

assert.match(
    content,
    /function isGlossXUiNode/,
    "observer must recognize GlossX UI nodes so page translation does not re-process them"
);
assert.match(
    content,
    /isGlossXUiNode\(node\)/,
    "queued GlossX UI nodes must be skipped during flush"
);
assert.match(
    content,
    /glossx-snippet-save-panel/,
    "selection save panel must not be treated as page content"
);

assert.match(
    content,
    /async function flushAddedNodes\(\)[\s\S]*?ParagraphTranslator\.unwrapNested\?\.\(document\.body\)/,
    "page mutations must unwrap sentence cards nested inside another card"
);

console.log("content-observer tests passed");
