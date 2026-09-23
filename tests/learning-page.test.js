const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(
    path.resolve(__dirname, "../Shared (Extension)/Resources/learning.html"),
    "utf8"
);

["learning.css", "learning.js", "vocabulary.js", "snippets.js"].forEach((file) => {
    if (!html.includes(file)) {
        throw new Error(`learning.html missing script/style: ${file}`);
    }
});

["snippets-list", "snippets-empty", "snippets-stat-new", "snippets-tabs", "learning-export"].forEach((id) => {
    if (!html.includes(id)) {
        throw new Error(`learning.html missing snippets element: ${id}`);
    }
});

if (html.includes("导出 PDF") || html.includes('id="learning-export-pdf"')) {
    throw new Error("learning.html must export Markdown, not PDF");
}

const learningJs = fs.readFileSync(
    path.resolve(__dirname, "../Shared (Extension)/Resources/learning.js"),
    "utf8"
);
if (!learningJs.includes("export.html")) {
    throw new Error("learning.js must open export.html for Markdown export");
}
if (!learningJs.includes("learning-export")) {
    throw new Error("learning.js must wire the export button");
}

console.log("learning-page smoke test passed");
