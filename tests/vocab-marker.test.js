const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        toggle(name, force) {
            if (force) values.add(name);
            else values.delete(name);
        },
        contains(name) {
            return values.has(name);
        }
    };
}

const matching = { classList: createClassList(["glossx-vocab-word"]) };
const unrelated = { classList: createClassList(["glossx-vocab-word"]) };
let queriedSelector = "";
const root = {
    querySelectorAll(selector) {
        queriedSelector = selector;
        return selector === '[data-vocab-word="capital"]'
            ? [matching]
            : [unrelated];
    }
};

const sandbox = {
    console,
    window: {},
    document: {},
    location: { href: "", hostname: "" }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(
        path.resolve(
            __dirname,
            "../Shared (Extension)/Resources/lib/vocab-marker.js"
        ),
        "utf8"
    ),
    sandbox,
    { filename: "vocab-marker.js" }
);

const marker = sandbox.GlossX.VocabMarker;
marker.updateSavedState("capital", true, root);

assert.equal(queriedSelector, '[data-vocab-word="capital"]');
assert.equal(matching.classList.contains("glossx-vocab-saved"), true);
assert.equal(unrelated.classList.contains("glossx-vocab-saved"), false);

marker.updateSavedState("capital", false, root);
assert.equal(matching.classList.contains("glossx-vocab-saved"), false);

console.log("vocab-marker targeted update tests passed");
