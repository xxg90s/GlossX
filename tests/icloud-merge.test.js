const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = { console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, "../Shared (Extension)/Resources/icloud-sync.js"), "utf8"),
    sandbox,
    { filename: "icloud-sync.js" }
);

const S = sandbox.GlossX.ICloudSync;
const DAY = 24 * 60 * 60 * 1000;

function snap(payload, updatedAt, metaUpdatedAt) {
    const snapshot = S.buildSnapshot(payload, updatedAt, metaUpdatedAt);
    return snapshot;
}

assert.ok(S.SYNC_KEYS.includes("deletedItems"));

// Cloud content wins on a tie; newer review progress wins independently.
{
    const merged = S.mergePayloads({
        local: {
            vocabItems: {
                hello: { id: "hello", definitions: ["旧"], repetitions: 2, reviewedAt: 300 },
                onlyLocal: { id: "onlyLocal", addedAt: 1 }
            }
        },
        localMetaUpdatedAt: 90,
        cloud: snap({
            vocabItems: {
                hello: { id: "hello", definitions: ["你好"], repetitions: 0, reviewedAt: 0 },
                onlyCloud: { id: "onlyCloud", addedAt: 1 }
            }
        }, 100),
        preferLocalContent: false,
        now: 1000
    });
    assert.deepEqual([...merged.payload.vocabItems.hello.definitions], ["你好"]);
    assert.equal(merged.payload.vocabItems.hello.repetitions, 2);
    assert.ok(merged.payload.vocabItems.onlyLocal);
    assert.ok(merged.payload.vocabItems.onlyCloud);
}

// Mac keeps its own content on a tie.
{
    const merged = S.mergePayloads({
        local: { vocabItems: { hello: { id: "hello", definitions: ["本地"] } } },
        cloud: snap({ vocabItems: { hello: { id: "hello", definitions: ["云端"] } } }, 100),
        preferLocalContent: true,
        now: 1000
    });
    assert.deepEqual([...merged.payload.vocabItems.hello.definitions], ["本地"]);
}

// Newer updatedAt content wins even when the other side has newer reviews.
{
    const merged = S.mergePayloads({
        local: { vocabItems: { hello: { definitions: ["旧释义"], repetitions: 5, reviewedAt: 900, updatedAt: 100 } } },
        cloud: snap({ vocabItems: { hello: { definitions: ["新释义"], repetitions: 1, reviewedAt: 100, updatedAt: 800 } } }, 900),
        preferLocalContent: true,
        now: 1000
    });
    assert.deepEqual([...merged.payload.vocabItems.hello.definitions], ["新释义"]);
    assert.equal(merged.payload.vocabItems.hello.repetitions, 5);
}

// Tombstones delete on either side; re-collecting after deletion survives.
{
    const deleted = S.mergePayloads({
        local: { vocabItems: { hello: { addedAt: 100, reviewedAt: 300 } } },
        cloud: snap({ deletedItems: { "vocab:hello": 200 } }, 500),
        now: 1000
    });
    assert.equal(deleted.payload.vocabItems.hello, undefined);
    assert.equal(deleted.payload.deletedItems["vocab:hello"], 200);

    const recollected = S.mergePayloads({
        local: { deletedItems: { "snippet:s1": 200 } },
        cloud: snap({ snippetItems: { s1: { addedAt: 300 } } }, 500),
        now: 1000
    });
    assert.ok(recollected.payload.snippetItems.s1);
}

// Tombstones older than 180 days are pruned.
{
    const now = 200 * DAY;
    const merged = S.mergePayloads({
        local: { deletedItems: { "vocab:old": 1, "vocab:new": now - 5 } },
        cloud: snap({}, 1),
        now
    });
    assert.equal(merged.payload.deletedItems["vocab:old"], undefined);
    assert.equal(merged.payload.deletedItems["vocab:new"], now - 5);
}

// Meta keys follow metaUpdatedAt; legacy snapshots fall back to updatedAt; empty side falls back.
{
    const byMeta = S.mergePayloads({
        local: { settings: { pronunciation: "us" } },
        localMetaUpdatedAt: 300,
        cloud: snap({ settings: { pronunciation: "uk" } }, 900, 100),
        now: 1000
    });
    assert.equal(byMeta.payload.settings.pronunciation, "us");
    assert.equal(byMeta.metaUpdatedAt, 300);

    const legacy = S.mergePayloads({
        local: { settings: { pronunciation: "us" } },
        localMetaUpdatedAt: 300,
        cloud: { version: 1, updatedAt: 900, payload: { settings: { pronunciation: "uk" } } },
        now: 1000
    });
    assert.equal(legacy.payload.settings.pronunciation, "uk");

    const emptyWinner = S.mergePayloads({
        local: { settings: { pronunciation: "us" } },
        localMetaUpdatedAt: 100,
        cloud: snap({}, 900, 500),
        now: 1000
    });
    assert.equal(emptyWinner.payload.settings.pronunciation, "us");
}

// Stats: newer date wins; same date takes max counters.
{
    assert.equal(S.mergeStats({ date: "2026-11-04", vocabReviewedToday: 2 }, { date: "2026-11-03", vocabReviewedToday: 9 }).date, "2026-11-04");
    const same = S.mergeStats(
        { date: "2026-11-04", vocabReviewedToday: 5, snippetReviewedToday: 0 },
        { date: "2026-11-04", vocabReviewedToday: 3, snippetReviewedToday: 1 }
    );
    assert.equal(same.vocabReviewedToday, 5);
    assert.equal(same.snippetReviewedToday, 1);
}

// Snapshot carries metaUpdatedAt.
{
    const snapshot = S.buildSnapshot({ settings: {} }, 10, 7);
    assert.equal(snapshot.metaUpdatedAt, 7);
    assert.deepEqual({ ...snapshot.payload.deletedItems }, {});
}

// collectTombstones records removed ids and clears re-added ones.
{
    const next = S.collectTombstones({
        vocabItems: { oldValue: { a: {}, b: {} }, newValue: { b: {} } },
        snippetItems: { oldValue: { s1: {} }, newValue: { s2: {} } }
    }, { "snippet:s2": 5 }, 1000);
    assert.equal(next["vocab:a"], 1000);
    assert.equal(next["snippet:s1"], 1000);
    assert.equal(next["snippet:s2"], undefined);
    assert.equal(S.collectTombstones({ settings: { oldValue: {}, newValue: {} } }, {}, 1), null);
}

// payloadsEqual ignores key order.
assert.equal(S.payloadsEqual({ vocabItems: { a: { x: 1, y: 2 } } }, { vocabItems: { a: { y: 2, x: 1 } } }), true);
assert.equal(S.payloadsEqual({ vocabItems: { a: { x: 1 } } }, { vocabItems: { a: { x: 2 } } }), false);

console.log("icloud-merge tests passed");
