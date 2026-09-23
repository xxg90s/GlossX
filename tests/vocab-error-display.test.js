const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const resources = path.resolve(
    __dirname,
    "../Shared (Extension)/Resources"
);
const sandbox = {
    TextDecoder,
    Uint8Array,
    Array,
    console
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

for (const script of ["lib/opencc-t2cn.js", "lib/text-normalize.js"]) {
    vm.runInContext(
        fs.readFileSync(path.join(resources, script), "utf8"),
        sandbox,
        { filename: script }
    );
}

const TN = sandbox.GlossX.TextNormalize;

assert.equal(typeof TN.resolveUiError, "function");

// Error codes must resolve to readable Simplified Chinese in the UI layer.
assert.equal(
    TN.resolveUiError("vocab_ai_gloss_unrecognized"),
    "AI 返回的释义无法识别，请稍后重试"
);
assert.equal(
    TN.resolveUiError("vocab_no_api_key"),
    "请先在设置中配置 AI API Key，生词释义仅通过 AI 查询"
);
assert.equal(
    TN.resolveUiError("vocab_ai_gloss_empty"),
    "AI 未返回可用释义，请稍后重试"
);

// UTF-8-as-GBK corruption of the old Chinese error must never reach the panel.
const utf8AsGbk = require("node:child_process")
    .execFileSync("python3", ["-c", "print('AI 返回的释义无法识别，请稍后重试'.encode('utf-8').decode('gbk', errors='replace'), end='')"])
    .toString("utf8");
assert.equal(TN.looksLikeCjkMojibake(utf8AsGbk), true);
assert.equal(
    TN.resolveUiError(utf8AsGbk, "暂无释义"),
    "暂无释义"
);
assert.equal(
    TN.resolveUiError(utf8AsGbk),
    "暂无释义"
);

// Readable Chinese errors still pass through (legacy / non-code paths).
assert.equal(
    TN.resolveUiError("查询失败，请重试"),
    "查询失败，请重试"
);

const background = fs.readFileSync(
    path.join(resources, "background.js"),
    "utf8"
);
// Vocab lookup failures must return stable ASCII error codes, not Chinese literals.
assert.match(background, /vocab_ai_gloss_unrecognized/);
assert.match(background, /error:\s*"vocab_no_api_key"/);
assert.match(background, /vocab_ai_gloss_empty/);
assert.equal(
    background.includes("AI 返回的释义无法识别，请稍后重试"),
    false
);

const panel = fs.readFileSync(
    path.join(resources, "lib/word-save-panel.js"),
    "utf8"
);
assert.match(panel, /resolveUiError/);
assert.match(panel, /errorText/);

console.log("vocab-error-display tests passed");
