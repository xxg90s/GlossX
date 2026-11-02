const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = { console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

for (const file of ["icloud-sync.js", "lib/library-transfer.js"]) {
    vm.runInContext(
        fs.readFileSync(
            path.resolve(__dirname, "../Shared (Extension)/Resources", file),
            "utf8"
        ),
        sandbox,
        { filename: file }
    );
}

const Transfer = sandbox.GlossX.LibraryTransfer;
const storage = {
    vocabItems: { hello: { id: "hello", word: "hello" } },
    snippetItems: {},
    settings: { globalEnabled: true },
    aiKeys: { deepseek: "sk-test" },
    aiProviderProfiles: [],
    stats: { streak: 2 },
    wordRecords: {},
    icloudMeta: { localUpdatedAt: 1 }
};

const snapshot = Transfer.planExport(storage, 1700000000000);
assert.equal(snapshot.version, 1);
assert.equal(snapshot.updatedAt, 1700000000000);
assert.equal(snapshot.payload.vocabItems.hello.word, "hello");
assert.equal(snapshot.payload.aiKeys.deepseek, "sk-test");
assert.equal(Object.hasOwn(snapshot, "icloudMeta"), false);
assert.equal(Object.hasOwn(snapshot.payload, "icloudMeta"), false);

const imported = Transfer.planImport(JSON.stringify(snapshot), {
    vocabItems: { old: { id: "old" } },
    icloudMeta: { localUpdatedAt: 1 }
});
assert.equal(imported.ok, true);
assert.equal(imported.storage.vocabItems.hello.word, "hello");
assert.equal(imported.storage.vocabItems.old, undefined);
assert.equal(imported.storage.icloudMeta.localUpdatedAt, 1);
assert.ok(imported.localUpdatedAt >= 1700000000000);

const invalid = Transfer.planImport("{", {});
assert.equal(invalid.ok, false);
assert.match(invalid.error, /JSON/);

const unknown = Transfer.planImport(JSON.stringify({ version: 2, payload: {} }), {});
assert.equal(unknown.ok, false);

console.log("library-transfer tests passed");
