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

const normalize = sandbox.GlossX.TextNormalize;

assert.deepEqual(
    normalize.normalizeDefinitionsFromAi(["可持續的", "利润"]),
    ["可持续的", "利润"]
);

// Clear UTF-8-as-GBK mojibake must still be rejected.
assert.deepEqual(
    normalize.normalizeDefinitionsFromAi(["\u93f5\u9b5a\u8d21"]),
    []
);
assert.equal(normalize.looksLikeCjkMojibake("浜挈浉浜ゆ偟"), true);
assert.deepEqual(normalize.normalizeDefinitionsFromAi(["浜挈浉浜ゆ偟"]), []);
assert.deepEqual(normalize.normalizeDefinitionsFromAi(["浜掔浉鍥炴姤"]), []);
assert.deepEqual(normalize.normalizeDefinitionsFromAi(["利润", "回报"]), ["利润", "回报"]);
assert.deepEqual(normalize.normalizeDefinitionsFromAi(["互相回报"]), ["互相回报"]);
assert.deepEqual(normalize.normalizeDefinitionsFromAi(["阒嬊紝阒嫔禤"]), []);
assert.deepEqual(normalize.normalizeDefinitionsFromAi(["鞋子；鞋类"]), ["鞋子；鞋类"]);

function parseAiJson(content) {
    if (!content) return null;
    let trimmed = String(content).trim();
    trimmed = trimmed
        .replace(/^```(?:json|javascript|js)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        const match = trimmed.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }
}

function coerceAiDefinitionList(parsed) {
    if (!parsed || typeof parsed !== "object") return [];
    const candidates = [
        parsed.definitions,
        parsed.definition,
        parsed.meanings,
        parsed.meaning,
        parsed.glosses,
        parsed.gloss,
        parsed.zh,
        parsed.chinese,
        parsed.translation,
        parsed.translations
    ];
    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            return candidate.flatMap((item) => {
                if (item == null) return [];
                if (typeof item === "string") {
                    return [item.trim()].filter(Boolean);
                }
                if (typeof item === "object") {
                    const nested = item.zh || item.chinese || item.definition
                        || item.meaning || item.gloss || item.text || "";
                    return [String(nested).trim()].filter(Boolean);
                }
                return [String(item).trim()].filter(Boolean);
            });
        }
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate
                .split(/[;；,，\n|/]+/)
                .map((item) => item.trim())
                .filter(Boolean);
        }
    }
    return [];
}

assert.deepEqual(
    coerceAiDefinitionList({ definitions: "利润；收益" }),
    ["利润", "收益"]
);
assert.deepEqual(
    coerceAiDefinitionList({ definitions: "利润，收益" }),
    ["利润", "收益"]
);
assert.deepEqual(
    coerceAiDefinitionList({ definition: "利润" }),
    ["利润"]
);
assert.deepEqual(
    coerceAiDefinitionList({ meanings: ["利润", "收益"] }),
    ["利润", "收益"]
);
assert.deepEqual(
    coerceAiDefinitionList({ definitions: [{ zh: "利润" }, { chinese: "收益" }] }),
    ["利润", "收益"]
);
assert.deepEqual(
    normalize.normalizeDefinitionsFromAi(
        coerceAiDefinitionList({ definitions: "利润；收益" })
    ),
    ["利润", "收益"]
);

const fenced = parseAiJson("```json\n{\"definitions\":[\"利润\",\"收益\"]}\n```");
assert.deepEqual(coerceAiDefinitionList(fenced), ["利润", "收益"]);

assert.equal(normalize.normalizeDefinitionsFromAi(["利润"]).length, 1);
assert.equal(normalize.normalizeDefinitionsFromAi(["收益"]).length, 1);

// Background vocab path must not call local lexicon / Free Dictionary / MyMemory.
const background = fs.readFileSync(
    path.join(resources, "background.js"),
    "utf8"
);
assert.equal(background.includes("lookupWordInLexicon"), false);
assert.equal(background.includes("lookupFreeDictionary"), false);
assert.equal(background.includes("translateGlossToChinese"), false);
assert.equal(background.includes("resolveDefinitionsFromRaw"), false);
assert.equal(background.includes("api.dictionaryapi.dev"), false);
assert.match(background, /async function lookupVocabWord/);
assert.match(background, /enrichVocabWithAi/);

console.log("vocab-definitions tests passed");
