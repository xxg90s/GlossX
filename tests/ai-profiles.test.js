const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const resources = path.resolve(
    __dirname,
    "../Shared (Extension)/Resources"
);
const source = fs.readFileSync(path.join(resources, "background.js"), "utf8");

assert.match(source, /async function upsertAiProviderProfile/);
assert.match(source, /async function applyAiProviderProfile/);
assert.match(source, /async function deleteAiProviderProfile/);
assert.match(source, /type === "saveAiProviderProfile"/);
assert.match(source, /type === "applyAiProviderProfile"/);
assert.match(source, /type === "deleteAiProviderProfile"/);
assert.match(source, /MAX_AI_PROFILES = 20/);
assert.match(source, /useStoredKey/);
assert.match(source, /aiProviderProfiles/);

const optionsHtml = fs.readFileSync(path.join(resources, "options.html"), "utf8");
assert.match(optionsHtml, /id="ai-profile-name"/);
assert.match(optionsHtml, /id="ai-profile-select"/);
assert.match(optionsHtml, /id="ai-profile-save"/);
assert.match(optionsHtml, /id="ai-profile-apply"/);
assert.match(optionsHtml, /id="ai-profile-delete"/);

const settingsUi = fs.readFileSync(path.join(resources, "settings-ui.js"), "utf8");
assert.match(settingsUi, /saveAiProviderProfile/);
assert.match(settingsUi, /applyAiProviderProfile/);
assert.match(settingsUi, /deleteAiProviderProfile/);
assert.match(settingsUi, /getAiProviderProfiles/);
assert.match(settingsUi, /escapeHtml/);

const css = fs.readFileSync(path.join(resources, "popup.css"), "utf8");
assert.match(css, /\.ai-profile-actions/);

console.log("ai-profiles tests passed");
