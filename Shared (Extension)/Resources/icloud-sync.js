(function (global) {
    const SYNC_KEYS = [
        "vocabItems",
        "snippetItems",
        "settings",
        "aiKeys",
        "aiProviderProfiles",
        "stats",
        "wordRecords",
        "deletedItems",
        "starterPacks"
    ];
    const META_KEYS = ["settings", "aiKeys", "aiProviderProfiles", "wordRecords"];
    const ITEM_KEYS = { vocabItems: "vocab", snippetItems: "snippet" };
    const REVIEW_FIELDS = [
        "status", "easeFactor", "interval", "repetitions",
        "nextReviewAt", "reviewedAt", "learnedAt", "familiarAt", "skippedAt"
    ];
    const MAXED_STATS = [
        "newWords", "reviews", "vocabNewToday", "vocabReviewedToday",
        "snippetNewToday", "snippetReviewedToday", "streak"
    ];
    const TOMBSTONE_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

    function emptyPayload() {
        return {
            vocabItems: {},
            snippetItems: {},
            settings: {},
            aiKeys: {},
            aiProviderProfiles: [],
            stats: {},
            wordRecords: {},
            deletedItems: {},
            starterPacks: null
        };
    }

    function isPlainObject(value) {
        return !!value && typeof value === "object" && !Array.isArray(value);
    }

    function objectHasKeys(value) {
        return isPlainObject(value) && Object.keys(value).length > 0;
    }

    function hasUserData(payload) {
        const data = payload || {};
        if (objectHasKeys(data.vocabItems)) return true;
        if (objectHasKeys(data.snippetItems)) return true;
        if (objectHasKeys(data.aiKeys)) return true;
        if (objectHasKeys(data.wordRecords)) return true;
        if (Array.isArray(data.aiProviderProfiles) && data.aiProviderProfiles.length > 0) {
            return true;
        }
        return false;
    }

    function decideSyncAction(input) {
        const {
            localUpdatedAt,
            hasUserData: localHasUserData,
            cloudExists,
            cloudUpdatedAt,
            cloudDownloading
        } = input || {};
        if (cloudDownloading) return "retry";
        const hasLocalTs = localUpdatedAt != null && Number.isFinite(Number(localUpdatedAt));
        if (!hasLocalTs) {
            if (cloudExists) return "pull";
            if (localHasUserData) return "push";
            return "noop";
        }
        // Onboarding may stamp localUpdatedAt on empty settings; never overwrite cloud with an empty library.
        if (!localHasUserData && cloudExists) return "pull";
        if (!cloudExists) return "push";
        if (Number(cloudUpdatedAt) > Number(localUpdatedAt)) return "pull";
        if (Number(localUpdatedAt) > Number(cloudUpdatedAt)) return "push";
        return "noop";
    }

    function clonePayloadValue(key, value, fallback) {
        if (key === "starterPacks") {
            return isPlainObject(value) ? value : null;
        }
        if (key === "aiProviderProfiles") {
            return Array.isArray(value) ? value : fallback.aiProviderProfiles;
        }
        return isPlainObject(value) ? value : fallback[key];
    }

    function buildSnapshot(payload, updatedAt, metaUpdatedAt) {
        const source = payload || {};
        const fallback = emptyPayload();
        const nextPayload = emptyPayload();
        for (const key of SYNC_KEYS) {
            nextPayload[key] = clonePayloadValue(key, source[key], fallback);
        }
        if (nextPayload.starterPacks == null) delete nextPayload.starterPacks;
        const snapshot = {
            version: 1,
            updatedAt,
            payload: nextPayload
        };
        if (Number.isFinite(Number(metaUpdatedAt)) && metaUpdatedAt != null) {
            snapshot.metaUpdatedAt = Number(metaUpdatedAt);
        }
        return snapshot;
    }

    function num(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function isEmptyValue(value) {
        if (Array.isArray(value)) return value.length === 0;
        return !objectHasKeys(value);
    }

    function contentTimestamp(item) {
        const updatedAt = num(item?.updatedAt);
        return updatedAt > 0 ? updatedAt : num(item?.addedAt);
    }

    function reviewTimestamp(item) {
        const latest = Math.max(
            num(item?.reviewedAt),
            num(item?.learnedAt),
            num(item?.familiarAt),
            num(item?.skippedAt)
        );
        if (latest > 0) return latest;
        if (num(item?.repetitions) > 0) return num(item.nextReviewAt);
        return 0;
    }

    function mergeItem(local, cloud, preferLocalContent) {
        const localContent = contentTimestamp(local);
        const cloudContent = contentTimestamp(cloud);
        const contentFromLocal = localContent === cloudContent ? preferLocalContent : localContent > cloudContent;
        const result = { ...(contentFromLocal ? local : cloud) };
        const reviewWinner = reviewTimestamp(local) >= reviewTimestamp(cloud) ? local : cloud;
        for (const field of REVIEW_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(reviewWinner, field)) {
                result[field] = reviewWinner[field];
            } else {
                delete result[field];
            }
        }
        return result;
    }

    function mergeTombstones(a, b, now) {
        const merged = {};
        for (const source of [a, b]) {
            if (!isPlainObject(source)) continue;
            for (const [key, value] of Object.entries(source)) {
                const time = num(value);
                if (time <= 0 || now - time > TOMBSTONE_RETENTION_MS) continue;
                merged[key] = Math.max(merged[key] || 0, time);
            }
        }
        return merged;
    }

    function mergeItemMap(local, cloud, tombstones, prefix, preferLocalContent) {
        const localItems = isPlainObject(local) ? local : {};
        const cloudItems = isPlainObject(cloud) ? cloud : {};
        const merged = {};
        const ids = new Set([...Object.keys(localItems), ...Object.keys(cloudItems)]);
        for (const id of ids) {
            const l = localItems[id];
            const c = cloudItems[id];
            const item = l && c ? mergeItem(l, c, preferLocalContent) : (l || c);
            if (!item) continue;
            const deletedAt = tombstones[`${prefix}:${id}`];
            if (deletedAt != null && deletedAt >= num(item.addedAt)) continue;
            merged[id] = item;
        }
        return merged;
    }

    function mergeStats(a, b) {
        const left = isPlainObject(a) ? a : {};
        const right = isPlainObject(b) ? b : {};
        if (!objectHasKeys(right)) return left;
        if (!objectHasKeys(left)) return right;
        const leftDate = String(left.date || "");
        const rightDate = String(right.date || "");
        if (leftDate !== rightDate) {
            return leftDate > rightDate ? left : right;
        }
        const stats = { ...left };
        for (const key of MAXED_STATS) {
            if (key in left || key in right) {
                stats[key] = Math.max(num(left[key]), num(right[key]));
            }
        }
        return stats;
    }

    /**
     * Mirrors SnapshotMerge.swift. Items merge per entry; meta keys follow metaUpdatedAt.
     * `preferLocalContent` breaks content ties: the Mac owns item content, the phone does not.
     */
    function mergePayloads({ local, localMetaUpdatedAt, cloud, preferLocalContent = true, now = Date.now() }) {
        const localPayload = local || {};
        const cloudPayload = cloud?.payload || {};
        const cloudMeta = num(cloud?.metaUpdatedAt) || num(cloud?.updatedAt);
        const localMeta = num(localMetaUpdatedAt);
        const deletedItems = mergeTombstones(localPayload.deletedItems, cloudPayload.deletedItems, now);
        const payload = emptyPayload();
        for (const [key, prefix] of Object.entries(ITEM_KEYS)) {
            payload[key] = mergeItemMap(localPayload[key], cloudPayload[key], deletedItems, prefix, preferLocalContent);
        }
        const metaFromLocal = localMeta > cloudMeta;
        const primary = metaFromLocal ? localPayload : cloudPayload;
        const secondary = metaFromLocal ? cloudPayload : localPayload;
        const fallback = emptyPayload();
        for (const key of META_KEYS) {
            const chosen = isEmptyValue(primary[key]) ? secondary[key] : primary[key];
            payload[key] = clonePayloadValue(key, chosen, fallback);
        }
        payload.stats = mergeStats(localPayload.stats, cloudPayload.stats);
        payload.deletedItems = deletedItems;
        const starterPacks = mergeStarterPacks(localPayload.starterPacks, cloudPayload.starterPacks);
        if (starterPacks) payload.starterPacks = starterPacks;
        else delete payload.starterPacks;
        return { payload, metaUpdatedAt: Math.max(localMeta, cloudMeta) };
    }

    function uniqueStrings(list) {
        const out = [];
        const seen = new Set();
        for (const id of list || []) {
            const text = String(id || "");
            if (!text || seen.has(text)) continue;
            seen.add(text);
            out.push(text);
        }
        return out;
    }

    function normalizeStarterPack(record) {
        return {
            enabled: !!record.enabled,
            ids: record.enabled ? uniqueStrings(record.ids) : [],
            updatedAt: num(record.updatedAt)
        };
    }

    function mergeStarterPackRecord(local, cloud) {
        const left = isPlainObject(local) ? local : null;
        const right = isPlainObject(cloud) ? cloud : null;
        if (!left && !right) return { enabled: false, ids: [], updatedAt: 0 };
        if (!left) return normalizeStarterPack(right);
        if (!right) return normalizeStarterPack(left);
        const leftAt = num(left.updatedAt);
        const rightAt = num(right.updatedAt);
        let enabled;
        let updatedAt;
        if (rightAt > leftAt) {
            enabled = !!right.enabled;
            updatedAt = rightAt;
        } else if (leftAt > rightAt) {
            enabled = !!left.enabled;
            updatedAt = leftAt;
        } else {
            enabled = !!(left.enabled || right.enabled);
            updatedAt = leftAt;
        }
        return {
            enabled,
            ids: enabled ? uniqueStrings([].concat(left.ids || [], right.ids || [])) : [],
            updatedAt
        };
    }

    /// Missing on both sides stays missing, so an old library is not treated as every pack being off.
    function mergeStarterPacks(local, cloud) {
        const localOk = isPlainObject(local);
        const cloudOk = isPlainObject(cloud);
        if (!localOk && !cloudOk) return null;
        if (!localOk) return cloud;
        if (!cloudOk) return local;
        const merged = {};
        for (const id of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
            merged[id] = mergeStarterPackRecord(local[id], cloud[id]);
        }
        return merged;
    }

    /** Tombstones for items removed by a storage.onChanged event, or null when nothing changed. */
    function collectTombstones(changes, existing, now) {
        let changed = false;
        const next = { ...(isPlainObject(existing) ? existing : {}) };
        for (const [key, prefix] of Object.entries(ITEM_KEYS)) {
            const change = changes?.[key];
            if (!change) continue;
            const before = isPlainObject(change.oldValue) ? change.oldValue : {};
            const after = isPlainObject(change.newValue) ? change.newValue : {};
            for (const id of Object.keys(before)) {
                if (!(id in after)) {
                    next[`${prefix}:${id}`] = now;
                    changed = true;
                }
            }
            for (const id of Object.keys(after)) {
                const tombKey = `${prefix}:${id}`;
                if (tombKey in next && !(id in before)) {
                    delete next[tombKey];
                    changed = true;
                }
            }
        }
        return changed ? next : null;
    }

    function stableStringify(value) {
        if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
        if (isPlainObject(value)) {
            const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
            return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
        }
        return JSON.stringify(value === undefined ? null : value);
    }

    function payloadsEqual(a, b) {
        const fallback = emptyPayload();
        return SYNC_KEYS.every((key) => stableStringify(clonePayloadValue(key, a?.[key], fallback))
            === stableStringify(clonePayloadValue(key, b?.[key], fallback)));
    }

    function applySnapshot(snapshot, existingStorage) {
        if (!snapshot || snapshot.version !== 1) {
            return { ok: false, error: "\u4e91\u7aef\u6570\u636e\u7248\u672c\u8fc7\u65b0\uff0c\u8bf7\u66f4\u65b0 GlossX" };
        }
        const fallback = emptyPayload();
        const incoming = snapshot.payload || {};
        const storage = { ...(existingStorage || {}) };
        for (const key of SYNC_KEYS) {
            if (key === "starterPacks") {
                if (isPlainObject(incoming[key])) storage[key] = incoming[key];
                continue;
            }
            storage[key] = clonePayloadValue(key, incoming[key], fallback);
        }
        return {
            ok: true,
            storage,
            localUpdatedAt: snapshot.updatedAt
        };
    }

    function formatRelativeTime(deltaMs) {
        if (deltaMs < 60 * 1000) return "\u521a\u624d";
        const minutes = Math.floor(deltaMs / (60 * 1000));
        if (minutes < 60) return minutes + " \u5206\u949f\u524d";
        const hours = Math.floor(deltaMs / (3600 * 1000));
        if (hours < 24) return hours + " \u5c0f\u65f6\u524d";
        const days = Math.floor(deltaMs / (86400 * 1000));
        return days + " \u5929\u524d";
    }

    function formatSyncLabel(input) {
        const {
            lastStatus,
            lastError,
            lastPushAt,
            lastPullAt,
            now
        } = input || {};
        if (lastStatus === "unsupported") return "\u4ec5\u4fdd\u5b58\u5728\u672c\u673a";
        if (lastStatus === "signedOut") return "\u672a\u767b\u5f55 iCloud\uff0c\u6536\u85cf\u4ec5\u4fdd\u5b58\u5728\u672c\u673a";
        if (lastStatus === "downloading") return "\u6b63\u5728\u4ece iCloud \u6062\u590d\u2026";
        if (lastStatus === "unavailable") return "\u8bf7\u5148\u6253\u5f00\u4e00\u6b21 GlossX \u5e94\u7528";
        if (lastStatus === "pushing") return "\u6b63\u5728\u4e0a\u4f20\u2026";
        if (lastStatus === "error") {
            return "\u4e0a\u6b21\u540c\u6b65\u5931\u8d25\uff1a" + (lastError || "\u672a\u77e5\u9519\u8bef");
        }
        const stamp = Math.max(Number(lastPushAt) || 0, Number(lastPullAt) || 0);
        const clock = Number.isFinite(Number(now)) ? Number(now) : Date.now();
        const delta = stamp ? Math.max(0, clock - stamp) : 0;
        return "\u5df2\u540c\u6b65 \u00b7 " + formatRelativeTime(delta);
    }

    function resolveDisplayStatus(input) {
        const { signedIn, available, lastStatus } = input || {};
        if (signedIn === false) return "signedOut";
        if (available === false) return "unavailable";
        return lastStatus || "synced";
    }

    function isTransientStatus(status) {
        return status === "pushing" || status === "downloading";
    }

    function shouldRunNativeSync(runtime) {
        return typeof runtime?.sendNativeMessage === "function";
    }

    function localOnlyStatus() {
        return {
            ok: true,
            supported: false,
            lastStatus: "unsupported",
            label: "\u4ec5\u4fdd\u5b58\u5728\u672c\u673a"
        };
    }

    function isLocalOnlyStatus(status) {
        return status?.supported === false || status?.lastStatus === "unsupported";
    }

    function labelFromMeta(meta, now) {
        // Prefer live status formatting so stale transient labels cannot mask completion.
        if (meta?.lastStatus) {
            return formatSyncLabel({
                lastStatus: meta.lastStatus,
                lastError: meta.lastError,
                lastPushAt: meta.lastPushAt,
                lastPullAt: meta.lastPullAt,
                now
            });
        }
        if (meta?.lastLabel) return meta.lastLabel;
        return formatSyncLabel({
            lastStatus: meta?.lastStatus,
            lastError: meta?.lastError,
            lastPushAt: meta?.lastPushAt,
            lastPullAt: meta?.lastPullAt,
            now
        });
    }

    function timedOutSyncMeta(meta, beforeEpoch) {
        const epoch = Number(meta?.syncEpoch) || 0;
        if (epoch <= beforeEpoch) {
            return {
                lastStatus: "error",
                lastError: "\u6269\u5c55\u540e\u53f0\u672a\u5f00\u59cb\u540c\u6b65\uff0c\u8bf7\u91cd\u65b0\u7f16\u8bd1\u5b89\u88c5\u6269\u5c55",
                lastLabel: "\u4e0a\u6b21\u540c\u6b65\u5931\u8d25\uff1a\u6269\u5c55\u540e\u53f0\u672a\u5f00\u59cb\u540c\u6b65\uff0c\u8bf7\u91cd\u65b0\u7f16\u8bd1\u5b89\u88c5\u6269\u5c55",
                syncEpoch: meta?.syncEpoch
            };
        }
        if (meta?.lastStatus === "downloading") {
            return {
                ...meta,
                lastLabel: "\u6b63\u5728\u4ece iCloud \u6062\u590d\u2026\u8bf7\u7a0d\u540e\u518d\u6253\u5f00\u8bbe\u7f6e\u67e5\u770b"
            };
        }
        if (isTransientStatus(meta?.lastStatus)) {
            return {
                lastStatus: "error",
                lastError: "\u539f\u751f iCloud \u65e0\u54cd\u5e94\uff0c\u8bf7\u6253\u5f00\u4e00\u6b21 GlossX \u5e94\u7528\u540e\u91cd\u8bd5",
                lastLabel: "\u4e0a\u6b21\u540c\u6b65\u5931\u8d25\uff1a\u539f\u751f iCloud \u65e0\u54cd\u5e94\uff0c\u8bf7\u6253\u5f00\u4e00\u6b21 GlossX \u5e94\u7528\u540e\u91cd\u8bd5",
                syncEpoch: meta?.syncEpoch
            };
        }
        return {
            ...meta,
            lastLabel: labelFromMeta(meta, Date.now())
        };
    }

    async function beginSyncRequest(storageLocal) {
        const current = (await storageLocal.get("icloudMeta")).icloudMeta || {};
        const beforeEpoch = Number(current.syncEpoch) || 0;
        const epoch = Date.now();
        // Only queue the request; background.js bumps syncEpoch when sync actually starts.
        await storageLocal.set({
            icloudSyncRequest: { epoch, at: Date.now() }
        });
        return { beforeEpoch, epoch, meta: current };
    }

    async function waitForSyncResult(storageLocal, options = {}) {
        const beforeEpoch = Number(options.beforeEpoch) || 0;
        // Cover status + read + write native round-trips (each may take several seconds).
        const timeoutMs = Number(options.timeoutMs) || 45000;
        const intervalMs = Number(options.intervalMs) || 400;
        const progressTimeoutMs = Number(options.progressTimeoutMs) || 10000;
        const start = Date.now();
        let sawProgress = false;

        while (Date.now() - start < timeoutMs) {
            const result = await storageLocal.get("icloudMeta");
            const meta = result.icloudMeta || {};
            const epoch = Number(meta.syncEpoch) || 0;
            if (epoch > beforeEpoch) {
                sawProgress = true;
                if (!isTransientStatus(meta.lastStatus)) {
                    return {
                        ...meta,
                        lastLabel: labelFromMeta(meta, Date.now())
                    };
                }
            } else if (!sawProgress && Date.now() - start >= progressTimeoutMs) {
                return timedOutSyncMeta(meta, beforeEpoch);
            }
            await new Promise((resolve) => global.setTimeout(resolve, intervalMs));
        }

        const timedOut = await storageLocal.get("icloudMeta");
        return timedOutSyncMeta(timedOut.icloudMeta || {}, beforeEpoch);
    }

    global.GlossX = global.GlossX || {};
    global.GlossX.ICloudSync = {
        SYNC_KEYS,
        META_KEYS,
        hasUserData,
        decideSyncAction,
        buildSnapshot,
        applySnapshot,
        mergePayloads,
        mergeStats,
        collectTombstones,
        payloadsEqual,
        formatSyncLabel,
        resolveDisplayStatus,
        isTransientStatus,
        shouldRunNativeSync,
        localOnlyStatus,
        isLocalOnlyStatus,
        labelFromMeta,
        beginSyncRequest,
        waitForSyncResult
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
