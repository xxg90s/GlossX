const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = { console, setTimeout, clearTimeout };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(
        path.resolve(__dirname, "../Shared (Extension)/Resources/icloud-sync.js"),
        "utf8"
    ),
    sandbox,
    { filename: "icloud-sync.js" }
);

const S = sandbox.GlossX.ICloudSync;

function same(actual, expected) {
    assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

assert.equal(
    JSON.stringify(S.SYNC_KEYS),
    JSON.stringify([
        "vocabItems",
        "snippetItems",
        "settings",
        "aiKeys",
        "aiProviderProfiles",
        "stats",
        "wordRecords",
        "deletedItems",
        "starterPacks"
    ])
);

assert.equal(S.hasUserData({}), false);
assert.equal(S.hasUserData({ settings: { aiEnabled: true } }), false);
assert.equal(S.hasUserData({ vocabItems: { hello: { word: "hello" } } }), true);
assert.equal(S.hasUserData({ snippetItems: { a: {} } }), true);
assert.equal(S.hasUserData({ aiKeys: { deepseek: "sk" } }), true);
assert.equal(S.hasUserData({ wordRecords: { w1: {} } }), true);
assert.equal(S.hasUserData({ aiProviderProfiles: [{ id: "p1" }] }), true);
assert.equal(S.hasUserData({ aiProviderProfiles: [] }), false);

assert.equal(
    S.decideSyncAction({
        localUpdatedAt: undefined,
        hasUserData: false,
        cloudExists: true,
        cloudUpdatedAt: 100,
        cloudDownloading: false
    }),
    "pull"
);
assert.equal(
    S.decideSyncAction({
        localUpdatedAt: undefined,
        hasUserData: false,
        cloudExists: false,
        cloudDownloading: false
    }),
    "noop"
);
assert.equal(
    S.decideSyncAction({
        localUpdatedAt: undefined,
        hasUserData: true,
        cloudExists: false,
        cloudDownloading: false
    }),
    "push"
);
assert.equal(
    S.decideSyncAction({
        localUpdatedAt: 200,
        hasUserData: true,
        cloudExists: true,
        cloudUpdatedAt: 100,
        cloudDownloading: false
    }),
    "push"
);
assert.equal(
    S.decideSyncAction({
        localUpdatedAt: 100,
        hasUserData: true,
        cloudExists: true,
        cloudUpdatedAt: 200,
        cloudDownloading: false
    }),
    "pull"
);
assert.equal(
    S.decideSyncAction({
        localUpdatedAt: 150,
        hasUserData: true,
        cloudExists: true,
        cloudUpdatedAt: 150,
        cloudDownloading: false
    }),
    "noop"
);
assert.equal(
    S.decideSyncAction({
        localUpdatedAt: undefined,
        hasUserData: false,
        cloudExists: false,
        cloudDownloading: true
    }),
    "retry"
);
assert.equal(
    S.decideSyncAction({
        localUpdatedAt: 50,
        hasUserData: false,
        cloudExists: false,
        cloudDownloading: false
    }),
    "push"
);
assert.equal(
    S.decideSyncAction({
        localUpdatedAt: 999,
        hasUserData: false,
        cloudExists: true,
        cloudUpdatedAt: 100,
        cloudDownloading: false
    }),
    "pull"
);

const snapshot = S.buildSnapshot(
    { vocabItems: { a: { word: "a" } }, settings: { aiEnabled: true } },
    123
);
assert.equal(snapshot.version, 1);
assert.equal(snapshot.updatedAt, 123);
same(snapshot.payload.vocabItems, { a: { word: "a" } });
same(snapshot.payload.snippetItems, {});
same(snapshot.payload.aiProviderProfiles, []);
same(snapshot.payload.settings, { aiEnabled: true });
assert.equal(Object.prototype.hasOwnProperty.call(snapshot.payload, "starterPacks"), false);

const existing = { icloudMeta: { lastStatus: "synced" }, extraKey: 1, vocabItems: { old: true } };
const applied = S.applySnapshot(snapshot, existing);
assert.equal(applied.ok, true);
assert.equal(applied.localUpdatedAt, 123);
same(applied.storage.vocabItems, { a: { word: "a" } });
assert.equal(applied.storage.icloudMeta.lastStatus, "synced");
assert.equal(applied.storage.extraKey, 1);
same(applied.storage.snippetItems, {});
same(applied.storage.aiProviderProfiles, []);

const incomplete = S.applySnapshot(
    { version: 1, updatedAt: 9, payload: { vocabItems: { b: {} } } },
    { keep: true }
);
assert.equal(incomplete.ok, true);
same(incomplete.storage.snippetItems, {});
assert.equal(incomplete.storage.keep, true);

const rejected = S.applySnapshot({ version: 2, updatedAt: 1, payload: {} }, {});
assert.equal(rejected.ok, false);
assert.equal(rejected.error, "云端数据版本过新，请更新 GlossX");

const now = 1_700_000_000_000;
assert.equal(
    S.formatSyncLabel({ lastStatus: "synced", lastPushAt: now - 59_000, now }),
    "已同步 · 刚才"
);
assert.equal(
    S.formatSyncLabel({ lastStatus: "synced", lastPullAt: now - 3 * 60_000, now }),
    "已同步 · 3 分钟前"
);
assert.equal(
    S.formatSyncLabel({ lastStatus: "synced", lastPushAt: now - 2 * 3600_000, now }),
    "已同步 · 2 小时前"
);
assert.equal(
    S.formatSyncLabel({ lastStatus: "synced", lastPushAt: now - 3 * 86400_000, now }),
    "已同步 · 3 天前"
);
assert.equal(
    S.formatSyncLabel({ lastStatus: "signedOut" }),
    "未登录 iCloud，收藏仅保存在本机"
);
assert.equal(
    S.formatSyncLabel({ lastStatus: "downloading" }),
    "正在从 iCloud 恢复…"
);
assert.equal(
    S.formatSyncLabel({ lastStatus: "unavailable" }),
    "请先打开一次 GlossX 应用"
);
assert.equal(
    S.formatSyncLabel({ lastStatus: "pushing" }),
    "正在上传…"
);
assert.equal(
    S.formatSyncLabel({ lastStatus: "error", lastError: "网络中断" }),
    "上次同步失败：网络中断"
);
assert.equal(
    S.formatSyncLabel({ lastStatus: "error" }),
    "上次同步失败：未知错误"
);

assert.equal(S.isTransientStatus("pushing"), true);
assert.equal(S.isTransientStatus("downloading"), true);
assert.equal(S.isTransientStatus("synced"), false);
assert.equal(
    S.labelFromMeta({ lastLabel: "已同步 · 刚才" }),
    "已同步 · 刚才"
);
assert.equal(
    S.labelFromMeta({ lastStatus: "unavailable" }),
    "请先打开一次 GlossX 应用"
);

assert.equal(
    S.resolveDisplayStatus({ signedIn: false, available: true, lastStatus: "synced" }),
    "signedOut"
);
assert.equal(
    S.resolveDisplayStatus({ signedIn: true, available: false, lastStatus: "synced" }),
    "unavailable"
);
assert.equal(
    S.resolveDisplayStatus({ signedIn: true, available: true, lastStatus: "error" }),
    "error"
);
assert.equal(
    S.labelFromMeta({
        lastStatus: "synced",
        lastPushAt: Date.now(),
        lastLabel: "正在同步…"
    }, Date.now()),
    "已同步 · 刚才"
);

assert.equal(S.shouldRunNativeSync(undefined), false);
assert.equal(S.shouldRunNativeSync({}), false);
assert.equal(S.shouldRunNativeSync({ sendNativeMessage() {} }), true);
const localOnly = S.localOnlyStatus();
assert.equal(localOnly.ok, true);
assert.equal(localOnly.supported, false);
assert.equal(localOnly.lastStatus, "unsupported");
assert.equal(localOnly.label, "仅保存在本机");
assert.equal(S.isLocalOnlyStatus(localOnly), true);
assert.equal(S.isLocalOnlyStatus({ lastStatus: "synced" }), false);
assert.equal(S.formatSyncLabel({ lastStatus: "unsupported" }), "仅保存在本机");
assert.equal(S.labelFromMeta({ lastStatus: "unsupported", lastLabel: "正在同步…" }), "仅保存在本机");

(async () => {
    const store = {
        icloudMeta: { syncEpoch: 1, lastStatus: "pushing" }
    };
    const storageLocal = {
        async get(key) {
            return { [key]: store[key] };
        },
        async set(values) {
            Object.assign(store, values);
        }
    };
    setTimeout(() => {
        store.icloudMeta = {
            syncEpoch: 2,
            lastStatus: "error",
            lastError: "原生通道不可用",
            lastLabel: "上次同步失败：原生通道不可用"
        };
    }, 50);
    const waited = await S.waitForSyncResult(storageLocal, {
        beforeEpoch: 1,
        timeoutMs: 1000,
        intervalMs: 20
    });
    assert.equal(waited.lastStatus, "error");
    assert.equal(waited.lastLabel, "上次同步失败：原生通道不可用");

    const noProgress = await S.waitForSyncResult({
        async get() {
            return { icloudMeta: { syncEpoch: 1, lastStatus: "synced" } };
        }
    }, {
        beforeEpoch: 1,
        timeoutMs: 200,
        intervalMs: 20,
        progressTimeoutMs: 50
    });
    assert.match(noProgress.lastLabel, /扩展后台未开始同步/);

    const stuck = await S.waitForSyncResult({
        async get() {
            return { icloudMeta: { syncEpoch: 9, lastStatus: "pushing" } };
        }
    }, {
        beforeEpoch: 1,
        timeoutMs: 120,
        intervalMs: 20
    });
    assert.match(stuck.lastLabel, /原生 iCloud 无响应/);

    const stillDownloading = await S.waitForSyncResult({
        async get() {
            return { icloudMeta: { syncEpoch: 9, lastStatus: "downloading" } };
        }
    }, {
        beforeEpoch: 1,
        timeoutMs: 120,
        intervalMs: 20
    });
    assert.match(stillDownloading.lastLabel, /正在从 iCloud 恢复/);

    store.icloudMeta = { syncEpoch: 5, lastStatus: "synced" };
    delete store.icloudSyncRequest;

    const started = await S.beginSyncRequest(storageLocal);
    assert.ok(started.epoch > started.beforeEpoch);
    assert.equal(store.icloudMeta.syncEpoch, 5);
    assert.equal(store.icloudMeta.lastStatus, "synced");
    assert.equal(store.icloudSyncRequest.epoch, started.epoch);

    console.log("icloud-sync tests passed");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
