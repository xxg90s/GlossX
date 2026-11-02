const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const resources = path.join(root, "Shared (Extension)/Resources");
const out = path.join(root, "dist/chrome");

const built = spawnSync(process.execPath, ["scripts/build-chrome.js"], {
    cwd: root,
    encoding: "utf8"
});
assert.equal(built.status, 0, built.stderr || built.stdout);

const safari = JSON.parse(fs.readFileSync(path.join(resources, "manifest.json"), "utf8"));
const chrome = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));

assert.equal(chrome.manifest_version, 3);
assert.equal(chrome.background.service_worker, "service-worker.js");
assert.equal(chrome.background.scripts, undefined);
assert.equal(chrome.background.persistent, undefined);
assert.deepEqual(chrome.content_scripts, safari.content_scripts);
assert.ok(chrome.permissions.includes("storage"));
assert.ok(!chrome.permissions.includes("nativeMessaging"));
assert.ok(!chrome.permissions.includes("windows"));
assert.ok(!chrome.permissions.includes("downloads"));

for (const script of chrome.content_scripts[0].js) {
    assert.ok(fs.existsSync(path.join(out, script)), `missing content script ${script}`);
}
assert.ok(fs.existsSync(path.join(out, "images/icon-48.png")));
assert.ok(fs.existsSync(path.join(out, "_locales/zh_CN/messages.json")));
assert.ok(fs.existsSync(path.join(out, "lexicon-cet4.json")));
assert.ok(fs.existsSync(path.join(out, "opencc-t2cn.js")));
assert.ok(fs.existsSync(path.join(out, "library-transfer.js")));
assert.equal(fs.existsSync(path.join(out, "lib")), false);
assert.equal(fs.existsSync(path.join(out, "data")), false);

const worker = fs.readFileSync(path.join(out, "service-worker.js"), "utf8");
assert.match(worker, /importScripts\(/);
assert.ok(
    worker.indexOf("icloud-sync.js") < worker.indexOf("background.js"),
    "service worker must load icloud-sync.js before background.js"
);
for (const script of safari.background.scripts) {
    assert.match(worker, new RegExp(script.replace(".", "\\.")));
    assert.ok(fs.existsSync(path.join(out, script)), `missing background script ${script}`);
}

const backgroundJs = fs.readFileSync(path.join(resources, "background.js"), "utf8");
assert.match(
    backgroundJs,
    /shouldRunNativeSync\(browser\.runtime\)/,
    "background.js must skip iCloud when the browser has no native messaging"
);
assert.match(backgroundJs, /localOnlyStatus\(/);

const settingsUi = fs.readFileSync(path.join(resources, "settings-ui.js"), "utf8");
const popupJs = fs.readFileSync(path.join(resources, "popup.js"), "utf8");
assert.match(settingsUi, /shouldRunNativeSync\(browser\.runtime\)/);
assert.match(popupJs, /shouldRunNativeSync\(browser\.runtime\)/);

const optionsHtml = fs.readFileSync(path.join(resources, "options.html"), "utf8");
assert.match(optionsHtml, /id="library-export"/);
assert.match(optionsHtml, /id="library-import"/);
assert.match(optionsHtml, /src="library-transfer\.js"/);

const project = fs.readFileSync(path.join(root, "GlossX.xcodeproj/project.pbxproj"), "utf8");
for (const resource of ["Resources/lib/library-transfer.js", "Resources/vocabulary-redirect.js"]) {
    const matches = project.match(new RegExp(resource.replace(/[.]/g, "\\."), "g")) || [];
    assert.ok(matches.length >= 2, `${resource} must belong to both Safari extension targets`);
}

console.log("chrome extension tests passed");
