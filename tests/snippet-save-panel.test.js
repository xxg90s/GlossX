const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const panelJs = fs.readFileSync(
    path.resolve(
        __dirname,
        "../Shared (Extension)/Resources/lib/snippet-save-panel.js"
    ),
    "utf8"
);
const css = fs.readFileSync(
    path.resolve(__dirname, "../Shared (Extension)/Resources/content.css"),
    "utf8"
);

assert.match(panelJs, /global\.GlossX\.SnippetSavePanel\s*=\s*SnippetSavePanel/);
assert.match(panelJs, /id\s*=\s*"glossx-snippet-save-panel"/);
assert.match(panelJs, /insetInlineStart/);
assert.match(panelJs, /function escapeHtml/);
assert.match(panelJs, /onSave\(\{[\s\S]*text[,:][\s\S]*context:/);
assert.match(panelJs, /await onRemove\(snippetId\)/);
assert.match(panelJs, /PANEL_VERSION/);
assert.match(panelJs, /正在翻译/);
assert.match(panelJs, /skipLookup/);
assert.match(panelJs, /AIClient\.translateSnippet/);
assert.match(panelJs, /type:\s*"translateSnippet"/);

assert.match(css, /\.glossx-snippet-save-panel\s*\{[\s\S]*position:\s*fixed/);
assert.match(css, /\.glossx-snippet-save-panel\.visible/);
assert.match(css, /\.glossx-snippet-save-text/);
assert.match(css, /\.glossx-snippet-type-phrase/);
assert.match(css, /\.glossx-snippet-type-sentence/);
assert.match(css, /\.glossx-snippet-type-excerpt/);
assert.match(panelJs, /长片段/);

console.log("snippet-save-panel tests passed");
