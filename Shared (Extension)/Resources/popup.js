document.addEventListener("DOMContentLoaded", () => {
    const api = window.GlossXPopup;
    if (!api) {
        document.getElementById("status-banner").textContent = "GlossX 初始化失败：缺少 popup-storage.js";
        return;
    }

    const globalEnabled = document.getElementById("global-enabled");
    const siteEnabled = document.getElementById("site-enabled");
    const siteName = document.getElementById("site-name");
    const siteToggleLabel = document.getElementById("site-toggle-label");
    const statusBanner = document.getElementById("status-banner");
    const statNew = document.getElementById("stat-new");
    const statNewItem = document.getElementById("stat-new-item");
    const statReview = document.getElementById("stat-review");
    const statStreak = document.getElementById("stat-streak");
    const openLearning = document.getElementById("open-learning");
    const learningMeta = document.getElementById("learning-meta");
    const enableCurrentSite = document.getElementById("enable-current-site");
    const enableWeixin = document.getElementById("enable-weixin");
    const openOptions = document.getElementById("open-options");
    const wordReplaceEnabled = document.getElementById("word-replace-enabled");
    const density = document.getElementById("density");
    const paragraphModeEnabled = document.getElementById("paragraph-mode-enabled");
    const paragraphRatio = document.getElementById("paragraph-ratio");
    const paragraphDisplayMode = document.getElementById("paragraph-display-mode");
    const paragraphAiHint = document.getElementById("paragraph-ai-hint");
    const icloudSyncStatus = document.getElementById("icloud-sync-status");
    const icloudSyncNow = document.getElementById("icloud-sync-now");

    let currentHostname = "";

    function setBanner(text, kind) {
        statusBanner.textContent = text;
        statusBanner.className = `popup-section status-banner ${kind}`;
    }

    function setBusy(button, busy, label) {
        if (!button) return;
        button.disabled = busy;
        if (label) button.textContent = label;
    }

    function updateParagraphAiHint(settings, aiState) {
        const provider = settings.aiProvider || "deepseek";
        const configured = !!aiState?.configured?.[provider];
        paragraphAiHint.textContent = configured
            ? "已配置 AI，语句将优先使用 AI 翻译为地道英文。"
            : "未配置 AI Key，将使用备用翻译；在完整设置中配置 AI 可获得更地道译文。";
    }

    function updateStatusBanner(settings, siteEnabledNow) {
        if (!settings.globalEnabled) {
            setBanner("总开关未开启：网页不会出现英文词替换或语句翻译。", "warn");
            return;
        }

        if (!currentHostname) {
            setBanner("未检测到当前网页标签，请先打开一个网站。", "warn");
            return;
        }

        if (!siteEnabledNow) {
            setBanner(`「${currentHostname}」尚未加入白名单，点击下方按钮或网页右下角圆点启用。`, "warn");
            return;
        }

        const modes = [];
        if (settings.wordReplaceEnabled !== false) modes.push("词级替换");
        if (settings.paragraphModeEnabled) modes.push("语句英文化");
        const modeText = modes.length ? modes.join("、") : "尚未开启任何阅读模式";

        setBanner(`「${currentHostname}」已启用（${modeText}），刷新页面即可生效。`, "ok");
    }

    async function saveSetting(partial) {
        await api.updateSettings(partial);
        const tab = await api.getTabContext();
        await api.broadcastRefresh(tab.tabId);
        await loadState();
    }

    async function loadState() {
        const [settings, stats, tabContext, state] = await Promise.all([
            api.getSettings(),
            api.getStats(),
            api.getTabContext(),
            browser.runtime.sendMessage({ type: "getState" }).catch(() => null)
        ]);

        currentHostname = tabContext.hostname || "";

        globalEnabled.checked = !!settings.globalEnabled;
        siteEnabled.checked = !!tabContext.siteEnabled;
        wordReplaceEnabled.checked = settings.wordReplaceEnabled !== false;
        density.value = settings.replaceDensity || "medium";
        paragraphModeEnabled.checked = !!settings.paragraphModeEnabled;
        paragraphRatio.value = settings.paragraphRatio || "low";
        paragraphDisplayMode.value = settings.paragraphDisplayMode || "en_then_cn";
        siteEnabled.disabled = !currentHostname;
        siteName.textContent = currentHostname
            ? `当前站点：${currentHostname}`
            : "未检测到网页标签";
        siteToggleLabel.textContent = currentHostname
            ? `白名单：${currentHostname}`
            : "当前站点白名单";

        const lexiconNew = stats.newWords || 0;
        const vocabNew = stats.vocabNewToday || 0;
        const snippetNew = stats.snippetNewToday || 0;
        statNew.textContent = String(lexiconNew + vocabNew + snippetNew);
        if (statNewItem) {
            statNewItem.title = `词库 ${lexiconNew} · 生词 ${vocabNew} · 句库 ${snippetNew}`;
        }
        if (learningMeta) {
            learningMeta.textContent = `生词 ${vocabNew} · 句库 ${snippetNew}`;
        }
        statReview.textContent = String(stats.reviews || 0);
        statStreak.textContent = String(stats.streak || 0);

        enableCurrentSite.disabled = false;
        enableWeixin.classList.toggle("hidden", currentHostname === "mp.weixin.qq.com");
        updateParagraphAiHint(settings, state?.aiState);
        updateStatusBanner(settings, !!tabContext.siteEnabled);
        await refreshIcloudStatus(false);
    }

    async function refreshIcloudStatus(syncFirst) {
        if (!icloudSyncStatus) return;
        const Sync = window.GlossX?.ICloudSync;
        icloudSyncStatus.textContent = syncFirst ? "正在同步…" : "正在检查同步状态…";

        if (syncFirst && Sync?.beginSyncRequest && Sync?.waitForSyncResult) {
            const started = await Sync.beginSyncRequest(browser.storage.local);
            browser.runtime.sendMessage({
                type: "icloudSyncNow",
                epoch: started.epoch
            }).catch(() => {});
            const meta = await Sync.waitForSyncResult(browser.storage.local, {
                beforeEpoch: started.beforeEpoch,
                timeoutMs: 15000,
                progressTimeoutMs: 5000
            });
            icloudSyncStatus.textContent = Sync.labelFromMeta(meta);
            return;
        }

        try {
            const response = await browser.runtime.sendMessage({ type: "getIcloudStatus" });
            // Format in this page (charset=utf-8); do not trust background-produced Chinese labels.
            icloudSyncStatus.textContent = Sync?.labelFromMeta?.(response)
                || response?.label
                || "正在检查同步状态…";
        } catch (error) {
            const stored = await browser.storage.local.get("icloudMeta");
            const meta = stored.icloudMeta || {};
            icloudSyncStatus.textContent = Sync?.labelFromMeta?.(meta)
                || `上次同步失败：${error?.message || "未知错误"}`;
        }
    }

    async function runAction(button, busyLabel, action) {
        const original = button.textContent;
        try {
            setBusy(button, true, busyLabel);
            await action();
            await loadState();
        } catch (error) {
            setBanner(`操作失败：${error.message || error}`, "error");
        } finally {
            setBusy(button, false, original);
        }
    }

    globalEnabled.addEventListener("change", () => {
        runAction(globalEnabled, "处理中…", () => api.toggleGlobal());
    });

    siteEnabled.addEventListener("change", () => {
        if (!currentHostname) return;
        runAction(siteEnabled, "处理中…", () => api.toggleCurrentSite(currentHostname));
    });

    enableCurrentSite.addEventListener("click", () => {
        runAction(enableCurrentSite, "启用中…", async () => {
            if (currentHostname) {
                await api.enableSite(currentHostname);
                return;
            }
            const tab = await api.getTabContext();
            if (!tab.hostname) {
                throw new Error("请先打开一个网页");
            }
            await api.enableSite(tab.hostname);
        });
    });

    enableWeixin.addEventListener("click", () => {
        runAction(enableWeixin, "启用中…", () => api.enableSite("mp.weixin.qq.com"));
    });

    wordReplaceEnabled.addEventListener("change", async () => {
        try {
            await saveSetting({ wordReplaceEnabled: wordReplaceEnabled.checked });
        } catch (error) {
            setBanner(`保存失败：${error.message || error}`, "error");
        }
    });

    density.addEventListener("change", async () => {
        try {
            await saveSetting({ replaceDensity: density.value });
        } catch (error) {
            setBanner(`保存密度失败：${error.message || error}`, "error");
        }
    });

    paragraphModeEnabled.addEventListener("change", async () => {
        try {
            await saveSetting({ paragraphModeEnabled: paragraphModeEnabled.checked });
        } catch (error) {
            setBanner(`保存失败：${error.message || error}`, "error");
        }
    });

    paragraphRatio.addEventListener("change", async () => {
        try {
            await saveSetting({ paragraphRatio: paragraphRatio.value });
        } catch (error) {
            setBanner(`保存失败：${error.message || error}`, "error");
        }
    });

    paragraphDisplayMode.addEventListener("change", async () => {
        try {
            await saveSetting({ paragraphDisplayMode: paragraphDisplayMode.value });
        } catch (error) {
            setBanner(`保存失败：${error.message || error}`, "error");
        }
    });

    openOptions.addEventListener("click", () => {
        if (browser.runtime.openOptionsPage) {
            browser.runtime.openOptionsPage();
        } else {
            window.open(browser.runtime.getURL("options.html"));
        }
    });

    openLearning.addEventListener("click", () => {
        browser.runtime.sendMessage({ type: "openLearningPage" });
    });

    if (icloudSyncNow) {
        icloudSyncNow.addEventListener("click", async () => {
            const original = icloudSyncNow.textContent;
            try {
                setBusy(icloudSyncNow, true, "同步中…");
                await refreshIcloudStatus(true);
            } catch (error) {
                if (icloudSyncStatus) {
                    icloudSyncStatus.textContent = `上次同步失败：${error?.message || "未知错误"}`;
                }
            } finally {
                setBusy(icloudSyncNow, false, original);
            }
        });
    }

    loadState().catch((error) => {
        setBanner(`加载失败：${error.message || error}`, "error");
    });
});
