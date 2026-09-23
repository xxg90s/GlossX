const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const resources = path.resolve(
    __dirname,
    "../Shared (Extension)/Resources"
);

const backgroundSource = fs.readFileSync(path.join(resources, "background.js"), "utf8");
const popupSource = fs.readFileSync(path.join(resources, "popup.js"), "utf8");
const popupStorageSource = fs.readFileSync(path.join(resources, "popup-storage.js"), "utf8");
const storageSource = fs.readFileSync(
    path.join(resources, "lib/storage.js"),
    "utf8"
);
const settingsUiSource = fs.readFileSync(path.join(resources, "settings-ui.js"), "utf8");
const optionsHtml = fs.readFileSync(path.join(resources, "options.html"), "utf8");

assert.match(
    backgroundSource,
    /learningOpenMode:\s*"tab"/,
    "background defaults must open learning in a tab"
);
assert.match(
    popupStorageSource,
    /learningOpenMode:\s*"tab"/,
    "popup-storage defaults must open learning in a tab"
);
assert.match(
    storageSource,
    /learningOpenMode:\s*"tab"/,
    "storage defaults must open learning in a tab"
);

assert.match(optionsHtml, /id="learning-open-mode"/);
assert.match(optionsHtml, /value="tab"/);
assert.match(optionsHtml, /value="window"/);
assert.match(optionsHtml, /在当前窗口右侧插入标签页/);
assert.match(optionsHtml, /以新窗口打开/);

assert.match(settingsUiSource, /#learning-open-mode/);
assert.match(settingsUiSource, /learningOpenMode/);

assert.match(popupSource, /type:\s*"openLearningPage"/);
assert.doesNotMatch(
    popupSource,
    /window\.open\(\s*browser\.runtime\.getURL\(\s*"learning\.html"/,
    "popup must not open learning.html with window.open"
);

assert.match(backgroundSource, /type === "openLearningPage"/);
assert.match(backgroundSource, /async function openLearningPage/);
assert.match(backgroundSource, /browser\.tabs\.create/);
assert.match(backgroundSource, /browser\.windows\?\.create/);

const helperStart = backgroundSource.indexOf("function normalizeLearningOpenMode");
const helperEnd = backgroundSource.indexOf("async function openLearningPage");
assert.ok(helperStart >= 0 && helperEnd > helperStart, "must extract learning open helpers");

const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
    backgroundSource.slice(helperStart, helperEnd),
    sandbox,
    { filename: "learning-open-helpers.js" }
);

const { normalizeLearningOpenMode, buildLearningOpenPlan } = sandbox;
const url = "safari-web-extension://glossx/learning.html";

assert.equal(normalizeLearningOpenMode("tab"), "tab");
assert.equal(normalizeLearningOpenMode("window"), "window");
assert.equal(normalizeLearningOpenMode(undefined), "tab");
assert.equal(normalizeLearningOpenMode("other"), "tab");

const tabPlan = buildLearningOpenPlan(url, "tab", { index: 2, windowId: 7 });
assert.equal(tabPlan.method, "tab");
assert.equal(tabPlan.options.url, url);
assert.equal(tabPlan.options.active, true);
assert.equal(tabPlan.options.index, 3);
assert.equal(tabPlan.options.windowId, 7);

const fallbackTabPlan = buildLearningOpenPlan(url, undefined, null);
assert.equal(fallbackTabPlan.method, "tab");
assert.equal(fallbackTabPlan.options.url, url);
assert.equal(fallbackTabPlan.options.active, true);
assert.equal(fallbackTabPlan.options.index, undefined);
assert.equal(fallbackTabPlan.options.windowId, undefined);

const windowPlan = buildLearningOpenPlan(url, "window", { index: 0, windowId: 1 });
assert.equal(windowPlan.method, "window");
assert.equal(windowPlan.options.url, url);
assert.equal(windowPlan.options.active, undefined);
assert.equal(windowPlan.options.index, undefined);

console.log("learning-open-mode tests passed");
