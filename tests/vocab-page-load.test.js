const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const vocabularyJs = fs.readFileSync(
    path.resolve(__dirname, "../Shared (Extension)/Resources/vocabulary.js"),
    "utf8"
);
const wordSavePanelJs = fs.readFileSync(
    path.resolve(
        __dirname,
        "../Shared (Extension)/Resources/lib/word-save-panel.js"
    ),
    "utf8"
);
const vocabMarkerJs = fs.readFileSync(
    path.resolve(
        __dirname,
        "../Shared (Extension)/Resources/lib/vocab-marker.js"
    ),
    "utf8"
);

// Safari async sendResponse is unreliable; the vocab page must read storage directly.
assert.match(
    vocabularyJs,
    /browser\.storage\.local\.get\(\s*(?:["']vocabItems["']|\[[^\]]*vocabItems[^\]]*\])\s*\)/,
    "vocabulary.js must load vocabItems from storage.local, not only via sendMessage"
);
assert.match(
    vocabularyJs,
    /stored\.vocabItems/,
    "vocabulary.js must assign list data from storage.local vocabItems"
);

// Save button must not flip to “已收藏” unless onSave reports success.
assert.match(
    wordSavePanelJs,
    /const\s+saveResult\s*=\s*await\s+onSave\s*\(/,
    "word-save-panel must capture onSave result before marking saved"
);
assert.match(
    wordSavePanelJs,
    /if\s*\(\s*!saveResult\?\.ok\s*\)/,
    "word-save-panel must abort UI update when save fails"
);

// handleSave must return the storage/background result for the panel to check.
assert.match(
    vocabMarkerJs,
    /return\s+result\s*;/,
    "vocab-marker handleSave must return save result"
);

console.log("vocab page load / save result tests passed");
