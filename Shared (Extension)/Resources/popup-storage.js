(function (global) {
    const DEFAULT_SETTINGS = {
        globalEnabled: false,
        whitelistMode: true,
        whitelist: [],
        pageDisabledHosts: {},
        wordReplaceEnabled: true,
        replaceDensity: "medium",
        displayMode: "english_only",
        paragraphModeEnabled: false,
        paragraphRatio: "low",
        paragraphDisplayMode: "en_then_cn",
        pronunciation: "us",
        hoverAutoPlay: false,
        activeLexicons: ["cet4"],
        highlightColor: "",
        showPageAssist: true,
        onboardingComplete: false,
        aiEnabled: false,
        aiProvider: "deepseek",
        aiModel: "",
        aiCustomBaseUrl: "",
        aiCustomModel: "",
        learningOpenMode: "tab"
    };

    function hostnameFromUrl(url) {
        try {
            return new URL(url).hostname.replace(/^www\./, "");
        } catch {
            return "";
        }
    }

    function isSiteEnabled(settings, url) {
        const hostname = hostnameFromUrl(url);
        if (!settings.globalEnabled || !hostname) return false;
        if (settings.pageDisabledHosts?.[hostname]) return false;
        if (settings.whitelistMode) return (settings.whitelist || []).includes(hostname);
        return true;
    }

    async function getSettings() {
        const result = await browser.storage.local.get("settings");
        return { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
    }

    async function saveSettings(settings) {
        await browser.storage.local.set({ settings });
    }

    async function updateSettings(partial) {
        const current = await getSettings();
        const next = { ...current, ...partial };
        await saveSettings(next);
        return next;
    }

    async function getStats() {
        const result = await browser.storage.local.get("stats");
        const today = new Date().toISOString().slice(0, 10);
        const stats = result.stats || {
            date: today,
            newWords: 0,
            reviews: 0,
            vocabNewToday: 0,
            vocabReviewedToday: 0,
            snippetNewToday: 0,
            snippetReviewedToday: 0,
            streak: 0,
            lastActiveDate: null
        };

        if (stats.date !== today) {
            const yesterday = stats.date;
            const lastActive = stats.lastActiveDate;
            let streak = stats.streak || 0;
            if (lastActive === yesterday) {
                streak += 1;
            } else if (lastActive !== today) {
                streak = 1;
            }
            return {
                date: today,
                newWords: 0,
                reviews: 0,
                vocabNewToday: 0,
                vocabReviewedToday: 0,
                snippetNewToday: 0,
                snippetReviewedToday: 0,
                streak,
                lastActiveDate: today
            };
        }
        return stats;
    }

    async function getVocabItems() {
        const result = await browser.storage.local.get("vocabItems");
        return result.vocabItems || {};
    }

    async function getActiveTab() {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        return tabs.find((tab) => tab.url && /^https?:/i.test(tab.url)) || null;
    }

    async function getTabContext() {
        const tab = await getActiveTab();
        if (!tab?.url) {
            return { hostname: "", siteEnabled: false, tabId: null };
        }
        const settings = await getSettings();
        return {
            hostname: hostnameFromUrl(tab.url),
            siteEnabled: isSiteEnabled(settings, tab.url),
            tabId: tab.id
        };
    }

    async function broadcastRefresh(tabId) {
        const tabs = tabId
            ? [{ id: tabId }]
            : await browser.tabs.query({});

        for (const tab of tabs) {
            if (!tab.id) continue;
            try {
                await browser.tabs.sendMessage(tab.id, { type: "refreshContent" });
            } catch {
                // Tab may not have content script.
            }
        }
    }

    async function enableSite(hostname) {
        const settings = await getSettings();
        const whitelist = new Set(settings.whitelist || []);
        whitelist.add(hostname);
        const next = await updateSettings({
            globalEnabled: true,
            whitelistMode: true,
            whitelist: [...whitelist],
            pageDisabledHosts: {
                ...(settings.pageDisabledHosts || {}),
                [hostname]: false
            }
        });
        const tab = await getActiveTab();
        await broadcastRefresh(tab?.id || null);
        return next;
    }

    async function toggleGlobal() {
        const settings = await getSettings();
        const nextEnabled = !settings.globalEnabled;
        const partial = { globalEnabled: nextEnabled };

        if (nextEnabled && settings.whitelistMode) {
            const tab = await getActiveTab();
            if (tab?.url) {
                const hostname = hostnameFromUrl(tab.url);
                if (hostname) {
                    const whitelist = new Set(settings.whitelist || []);
                    whitelist.add(hostname);
                    partial.whitelist = [...whitelist];
                    partial.pageDisabledHosts = {
                        ...(settings.pageDisabledHosts || {}),
                        [hostname]: false
                    };
                }
            }
        }

        const next = await updateSettings(partial);
        const tab = await getActiveTab();
        await broadcastRefresh(tab?.id || null);
        return next;
    }

    async function toggleCurrentSite(hostname) {
        const settings = await getSettings();
        const whitelist = new Set(settings.whitelist || []);

        if (whitelist.has(hostname)) {
            whitelist.delete(hostname);
        } else {
            whitelist.add(hostname);
        }

        const next = await updateSettings({
            globalEnabled: true,
            whitelist: [...whitelist],
            pageDisabledHosts: {
                ...(settings.pageDisabledHosts || {}),
                [hostname]: false
            }
        });
        const tab = await getActiveTab();
        await broadcastRefresh(tab?.id || null);
        return next;
    }

    global.GlossXPopup = {
        DEFAULT_SETTINGS,
        getSettings,
        updateSettings,
        getStats,
        getVocabItems,
        getTabContext,
        enableSite,
        toggleGlobal,
        toggleCurrentSite,
        broadcastRefresh
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
