const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const resources = path.resolve(
    __dirname,
    "../Shared (Extension)/Resources"
);
const manifest = JSON.parse(
    fs.readFileSync(path.join(resources, "manifest.json"), "utf8")
);

const loadedScripts = [
    ...(manifest.background?.scripts || []),
    ...((manifest.content_scripts || []).flatMap((entry) => entry.js || []))
];

for (const script of ["opencc-t2cn.js", "text-normalize.js"]) {
    assert.ok(
        loadedScripts.includes(script),
        `${script} must use its flattened Xcode bundle path`
    );
}

assert.ok(
    loadedScripts.includes("ai-client.js"),
    "content scripts must load ai-client.js for in-page translation"
);
assert.ok(
    loadedScripts.includes("vocab-storage.js"),
    "content scripts must load vocab-storage.js for in-page vocab save"
);

for (const page of ["options.html", "learning.html"]) {
    const html = fs.readFileSync(path.join(resources, page), "utf8");
    for (const script of ["opencc-t2cn.js", "text-normalize.js"]) {
        assert.match(
            html,
            new RegExp(`src="${script.replace(".", "\\.")}"`),
            `${page} must load flattened ${script}`
        );
    }
}

const vocabularyHtml = fs.readFileSync(
    path.join(resources, "vocabulary.html"),
    "utf8"
);
assert.match(
    vocabularyHtml,
    /src="vocabulary-redirect\.js"/,
    "vocabulary.html must load an external redirect script for Chrome extension CSP"
);
assert.doesNotMatch(
    vocabularyHtml,
    /<script>/,
    "vocabulary.html must not contain an inline script"
);
const vocabularyRedirect = fs.readFileSync(
    path.join(resources, "vocabulary-redirect.js"),
    "utf8"
);
assert.match(
    vocabularyRedirect,
    /learning\.html#vocab/,
    "vocabulary-redirect.js must redirect to learning.html#vocab"
);

const learningHtml = fs.readFileSync(
    path.join(resources, "learning.html"),
    "utf8"
);
const learningResourcePaths = {
    "learning.css": "learning.css",
    "learning.js": "learning.js",
    "snippets.js": "snippets.js",
    "vocabulary.js": "vocabulary.js",
    "snippet-utils.js": "lib/snippet-utils.js",
    "snippet-storage.js": "lib/snippet-storage.js"
};
for (const [reference, diskPath] of Object.entries(learningResourcePaths)) {
    assert.match(
        learningHtml,
        new RegExp(reference.replace(".", "\\.")),
        `learning.html must reference ${reference}`
    );
    assert.ok(
        fs.existsSync(path.join(resources, diskPath)),
        `${reference} referenced by learning.html must exist on disk at ${diskPath}`
    );
}

const exportHtml = fs.readFileSync(
    path.join(resources, "export.html"),
    "utf8"
);
const exportResourcePaths = {
    "export.css": "export.css",
    "export.js": "export.js",
    "learning-export.js": "lib/learning-export.js"
};
for (const [reference, diskPath] of Object.entries(exportResourcePaths)) {
    assert.match(
        exportHtml,
        new RegExp(reference.replace(".", "\\.")),
        `export.html must reference ${reference}`
    );
    assert.ok(
        fs.existsSync(path.join(resources, diskPath)),
        `${reference} referenced by export.html must exist on disk at ${diskPath}`
    );
}

const accessible = (manifest.web_accessible_resources || [])
    .flatMap((entry) => entry.resources || []);
assert.ok(
    accessible.includes("export.html"),
    "manifest must expose export.html as a web accessible resource"
);

const exportJs = fs.readFileSync(path.join(resources, "export.js"), "utf8");
assert.doesNotMatch(
    exportJs,
    /window\.print\s*\(/,
    "export.js must not open the system print dialog"
);
assert.match(
    exportJs,
    /downloadViaFrame|download-frame/,
    "export.js must download Markdown via the Safari iframe workaround"
);
assert.match(
    exportHtml,
    /id="export-download"/,
    "export.html must provide a Markdown download control"
);
assert.match(
    exportHtml,
    /下载 Markdown/,
    "export.html must label the primary action as Markdown download"
);
assert.doesNotMatch(
    exportHtml,
    /存储为 PDF|id="export-copy"/,
    "export.html must not present PDF print or copy-only as the primary export path"
);

const downloadFrameHtml = fs.readFileSync(
    path.join(resources, "download-frame.html"),
    "utf8"
);
const downloadFrameJs = fs.readFileSync(
    path.join(resources, "download-frame.js"),
    "utf8"
);
assert.match(downloadFrameHtml, /download-frame\.js/);
assert.match(downloadFrameJs, /createObjectURL/);
assert.match(downloadFrameJs, /\.download\s*=/);
assert.ok(
    accessible.includes("download-frame.html"),
    "manifest must expose download-frame.html for Safari download workaround"
);

assert.ok(
    (manifest.background?.scripts || []).includes("icloud-sync.js"),
    "background scripts must load flattened icloud-sync.js before background.js"
);
assert.ok(
    fs.existsSync(path.join(resources, "icloud-sync.js")),
    "icloud-sync.js must live next to background.js so Safari can load it"
);
const backgroundScripts = manifest.background?.scripts || [];
assert.ok(
    backgroundScripts.indexOf("icloud-sync.js") < backgroundScripts.indexOf("background.js"),
    "icloud-sync.js must load before background.js"
);
const backgroundJs = fs.readFileSync(path.join(resources, "background.js"), "utf8");
assert.match(
    backgroundJs,
    /saveMarkdownFile/,
    "background.js must relay saveMarkdownFile to the native handler"
);
assert.match(
    backgroundJs,
    /icloudSyncNow/,
    "background.js must expose icloudSyncNow for settings and learning pages"
);
assert.match(
    backgroundJs,
    /\\u539f\\u751f\\u8c03\\u7528\\u8d85\\u65f6|原生调用超时/,
    "background.js must time out hung native iCloud calls"
);
assert.match(
    backgroundJs,
    /ICLOUD_SYNC_STALE_MS/,
    "background.js must abandon stale in-flight iCloud syncs"
);
assert.match(
    backgroundJs,
    /noop: already in sync/,
    "background.js must clear pushing status on noop or UI falsely reports native hang"
);
assert.match(
    backgroundJs,
    /icloudSyncInFlight === pending/,
    "background.js must not clear a newer in-flight sync from an older finally"
);

const handlerSwift = fs.readFileSync(
    path.join(__dirname, "../Shared (Extension)/SafariWebExtensionHandler.swift"),
    "utf8"
);
assert.match(
    handlerSwift,
    /saveMarkdown/,
    "native handler must implement saveMarkdown"
);
assert.match(
    handlerSwift,
    /NSSavePanel/,
    "native handler must present NSSavePanel on macOS"
);
assert.match(
    handlerSwift,
    /downloadTimeout: TimeInterval = 10/,
    "native handler download timeout must match the 10s spec"
);
assert.match(
    handlerSwift,
    /ubiquityLookupTimeout: TimeInterval = 10/,
    "native handler ubiquity lookup timeout must match the 10s spec"
);
assert.match(
    backgroundJs,
    /ICLOUD_NATIVE_TIMEOUT_MS = 10000/,
    "background.js native iCloud timeout must align with the 10s spec"
);
assert.match(
    handlerSwift,
    /iCloud\.com\.xxg\.Flipword/,
    "native handler must use the GlossX iCloud container"
);
assert.match(
    handlerSwift,
    /Flipword\/library\.json/,
    "native handler must store the snapshot outside Documents"
);

const manifestPermissions = manifest.permissions || [];
assert.ok(
    manifestPermissions.includes("nativeMessaging"),
    "manifest must declare nativeMessaging so sendNativeMessage can reach the macOS handler"
);

const optionsHtml = fs.readFileSync(path.join(resources, "options.html"), "utf8");
assert.match(
    optionsHtml,
    /src="ai-providers\.js"/,
    "options.html must load flattened ai-providers.js for local provider catalog"
);
assert.match(
    optionsHtml,
    /src="ai-profiles\.js"/,
    "options.html must load flattened ai-profiles.js for local profile storage"
);
assert.match(
    optionsHtml,
    /id="icloud-sync-status"/,
    "options.html must show iCloud sync status"
);
assert.match(
    optionsHtml,
    /id="icloud-sync-now"/,
    "options.html must provide a manual iCloud sync control"
);
assert.match(
    optionsHtml,
    /立即同步/,
    "options.html must label the manual iCloud sync button"
);
assert.match(
    optionsHtml,
    /section-heading">iCloud 同步/,
    "options.html must place the iCloud sync section near the top settings"
);
const popupHtml = fs.readFileSync(path.join(resources, "popup.html"), "utf8");
assert.match(
    popupHtml,
    /id="icloud-sync-now"/,
    "popup.html must expose manual iCloud sync"
);
assert.match(
    fs.readFileSync(path.join(resources, "popup.html"), "utf8"),
    /src="icloud-sync\.js"/,
    "popup.html must load icloud-sync.js to poll sync results from storage"
);
assert.match(
    optionsHtml,
    /src="icloud-sync\.js"/,
    "options.html must load icloud-sync.js to poll sync results from storage"
);
assert.match(
    optionsHtml,
    /同步到你的私有 iCloud 容器/,
    "options.html privacy copy must mention private iCloud sync"
);
assert.match(
    fs.readFileSync(path.join(resources, "settings-ui.js"), "utf8"),
    /syncIcloudAndReload/,
    "settings-ui.js must reload settings after a manual iCloud sync"
);

console.log("flattened extension resource path tests passed");
