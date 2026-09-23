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

assert.equal(normalize.isOpenCCReady(), true);

assert.equal(
    normalize.normalizeChineseText("可持續的；能長期維持的"),
    "可持续的；能长期维持的"
);
assert.equal(
    normalize.normalizeChineseText("我們需要找到更多可持續的能源生產方式。"),
    "我们需要找到更多可持续的能源生产方式。"
);
assert.deepEqual(
    Array.from(normalize.normalizeDefinitions(["詞彙", "处理"])),
    ["词汇", "处理"]
);
assert.deepEqual(
    JSON.parse(JSON.stringify(normalize.normalizeExample({
        english: "We need sustainable energy.",
        chinese: "我們需要可持續能源。"
    }))),
    {
        english: "We need sustainable energy.",
        chinese: "我们需要可持续能源。"
    }
);
assert.deepEqual(
    JSON.parse(JSON.stringify(normalize.selectBilingualExample(
        {
            english: "He does not have enough capital to start a business.",
            chinese: ""
        },
        {
            english: "Washington, D.C. is the capital of the United States.",
            chinese: "华盛顿特区是美国的首都。"
        }
    ))),
    {
        english: "Washington, D.C. is the capital of the United States.",
        chinese: "华盛顿特区是美国的首都。"
    }
);

assert.equal(normalize.looksLikeCjkMojibake("璧勪骇；鏈夊埄鏉′欢"), true);
assert.equal(normalize.normalizeChineseText("璧勪骇；鏈夊埄鏉′欢"), "");
assert.equal(normalize.looksLikeCjkMojibake("璧勪駭；鏈夊埄鏉′欢"), true);
assert.equal(normalize.normalizeChineseText("资产；有价值的东西"), "资产；有价值的东西");

// Short legitimate glosses must survive.
assert.equal(normalize.normalizeChineseText("弄乱"), "弄乱");
assert.equal(normalize.normalizeChineseText("搞砸"), "搞砸");
assert.equal(normalize.normalizeChineseText("利润"), "利润");
assert.equal(normalize.normalizeChineseText("互相回报"), "互相回报");

// shoes-style encoding junk must be rejected on AI gloss path.
assert.equal(normalize.looksLikeCjkMojibake("阒嬊紝阒嫔禤"), true);
assert.equal(normalize.looksLikeLowQualityChinese("阒嬊紝阒嫔禤"), true);
assert.deepEqual(normalize.normalizeDefinitionsFromAi(["阒嬊紝阒嫔禤"]), []);
assert.deepEqual(normalize.normalizeDefinitionsFromAi(["鞋子", "鞋类"]), ["鞋子", "鞋类"]);

console.log("text-normalize simplified-Chinese tests passed");
