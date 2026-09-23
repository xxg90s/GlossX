const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const resources = path.resolve(__dirname, "../Shared (Extension)/Resources");
const manifest = JSON.parse(
    fs.readFileSync(path.join(resources, "manifest.json"), "utf8")
);

const jscCandidates = [
    "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc",
    "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"
];
const jscPath = jscCandidates.find((candidate) => fs.existsSync(candidate));
assert.ok(jscPath, "JavaScriptCore jsc helper must exist on macOS");

const scriptSets = [
    ["background bundle", manifest.background?.scripts || []],
    [
        "content bundle",
        (manifest.content_scripts || []).flatMap((entry) => entry.js || [])
    ]
];

function resolveScript(relativePath) {
    const direct = path.join(resources, relativePath);
    if (fs.existsSync(direct)) return direct;
    const nested = path.join(resources, "lib", path.basename(relativePath));
    assert.ok(fs.existsSync(nested), `${relativePath} must exist for JSC syntax check`);
    return nested;
}

function assertParsesInJsc(label, relativePaths) {
    const combined = relativePaths.map((relativePath) => {
        const absolutePath = resolveScript(relativePath);
        const source = fs.readFileSync(absolutePath, "utf8");
        return `\n/* ${relativePath} */\n${source}\n`;
    }).join("\n");

    const tempFile = path.join(__dirname, `.jsc-syntax-${label.replace(/\s+/g, "-")}.js`);
    fs.writeFileSync(tempFile, combined, "utf8");
    try {
        execFileSync(jscPath, [
            "-e",
            `const code = read(${JSON.stringify(tempFile)}); new Function(code);`
        ], { encoding: "utf8" });
    } catch (error) {
        assert.fail(`${label} failed JavaScriptCore syntax check: ${error.stderr || error.message}`);
    } finally {
        fs.rmSync(tempFile, { force: true });
    }
}

for (const [label, scripts] of scriptSets) {
    assert.ok(scripts.length > 0, `${label} must list at least one script`);
    assertParsesInJsc(label, scripts);
}

const backgroundScripts = manifest.background?.scripts || [];
const cjkTemplatePattern = /`[^`]*[\u3400-\u9fff\uf900-\ufaff][^`]*`/g;
const icloudSyncSource = fs.readFileSync(
    resolveScript("icloud-sync.js"),
    "utf8"
);
const icloudHits = icloudSyncSource.match(cjkTemplatePattern) || [];
assert.equal(
    icloudHits.length,
    0,
    "icloud-sync.js must not use template literals containing CJK in the Safari background bundle"
);

// Background scripts may be decoded with a non-UTF-8 fallback; keep user-facing
// strings in icloud-sync.js as \\u escapes so labels never mojibake.
const rawCjkInIcloudSync = /["'`][^"'`]*[\u3400-\u9fff][^"'`]*["'`]/;
assert.equal(
    rawCjkInIcloudSync.test(icloudSyncSource),
    false,
    "icloud-sync.js must use \\u escapes for CJK string literals (Safari background encoding)"
);
assert.match(
    icloudSyncSource,
    /\\u5df2\\u540c\\u6b65/,
    "icloud-sync.js must contain escaped 已同步 label"
);

const returnCjkTemplatePattern = /return[^\n;`]*`[^`]*[\u3400-\u9fff\uf900-\ufaff][^`]*`/g;
for (const relativePath of backgroundScripts) {
    const source = fs.readFileSync(resolveScript(relativePath), "utf8");
    const hits = source.match(returnCjkTemplatePattern) || [];
    assert.equal(
        hits.length,
        0,
        `${relativePath} must not return CJK template literals on one line`
    );
}

console.log("JavaScriptCore syntax tests passed");
