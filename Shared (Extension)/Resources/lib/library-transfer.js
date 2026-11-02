(function (global) {
    function planExport(storage, updatedAt) {
        return global.GlossX.ICloudSync.buildSnapshot(storage, updatedAt);
    }

    function planImport(text, existingStorage) {
        let snapshot;
        try {
            snapshot = JSON.parse(text);
        } catch {
            return { ok: false, error: "文件不是有效的 JSON" };
        }

        const applied = global.GlossX.ICloudSync.applySnapshot(snapshot, existingStorage);
        if (!applied.ok) {
            return { ok: false, error: applied.error || "无法识别的学习库文件" };
        }

        return {
            ok: true,
            storage: applied.storage,
            localUpdatedAt: Date.now()
        };
    }

    global.GlossX = global.GlossX || {};
    global.GlossX.LibraryTransfer = {
        planExport,
        planImport
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
