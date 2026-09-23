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

    const Storage = {
        async getSettings() {
            const result = await browser.storage.local.get("settings");
            return { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
        },

        async saveSettings(settings) {
            await browser.storage.local.set({ settings });
        },

        async updateSettings(partial) {
            const current = await this.getSettings();
            const next = { ...current, ...partial };
            await this.saveSettings(next);
            return next;
        },

        async getWordRecords() {
            const result = await browser.storage.local.get("wordRecords");
            return result.wordRecords || {};
        },

        async saveWordRecords(records) {
            await browser.storage.local.set({ wordRecords: records });
        },

        async getWordRecord(wordId) {
            const records = await this.getWordRecords();
            return records[wordId] || null;
        },

        async upsertWordRecord(wordId, patch) {
            const records = await this.getWordRecords();
            records[wordId] = { ...(records[wordId] || {}), ...patch, wordId };
            await this.saveWordRecords(records);
            return records[wordId];
        },

        async getVocabItems() {
            const result = await browser.storage.local.get("vocabItems");
            return result.vocabItems || {};
        },

        async saveVocabItems(items) {
            await browser.storage.local.set({ vocabItems: items });
        },

        async getVocabItem(id) {
            const items = await this.getVocabItems();
            return items[id] || null;
        },

        async upsertVocabItem(id, patch) {
            const items = await this.getVocabItems();
            items[id] = { ...(items[id] || {}), ...patch, id };
            await this.saveVocabItems(items);
            return items[id];
        },

        async removeVocabItem(id) {
            const items = await this.getVocabItems();
            delete items[id];
            await this.saveVocabItems(items);
        },

        async getStats() {
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
        },

        async incrementStat(field) {
            const stats = await this.getStats();
            stats[field] = (stats[field] || 0) + 1;
            stats.lastActiveDate = stats.date;
            await browser.storage.local.set({ stats });
            return stats;
        },

        hostnameFromUrl(url) {
            try {
                return new URL(url).hostname.replace(/^www\./, "");
            } catch {
                return "";
            }
        },

        async isSiteEnabled(url) {
            const settings = await this.getSettings();
            const hostname = this.hostnameFromUrl(url);

            if (!settings.globalEnabled || !hostname) {
                return false;
            }

            if (settings.pageDisabledHosts[hostname]) {
                return false;
            }

            if (settings.whitelistMode) {
                return settings.whitelist.includes(hostname);
            }

            return true;
        }
    };

    global.GlossX = global.GlossX || {};
    global.GlossX.Storage = Storage;
})(typeof globalThis !== "undefined" ? globalThis : window);
