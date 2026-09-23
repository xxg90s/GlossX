(function (global) {
    const MAX_SNIPPET_ITEMS = 1000;
    const SAVE_TRANSLATE_TIMEOUT_MS = 8000;

    function normalizeText(value) {
        const utils = global.GlossX?.SnippetUtils;
        if (utils?.normalizeText) return utils.normalizeText(value);
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function withTimeout(promise, timeoutMs) {
        let timer = null;
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error("snippet_translate_timeout")), timeoutMs);
            })
        ]).finally(() => clearTimeout(timer));
    }

    async function getSnippetItems() {
        const result = await browser.storage.local.get("snippetItems");
        return result.snippetItems || {};
    }

    async function saveSnippetItems(items) {
        await browser.storage.local.set({ snippetItems: items });
    }

    function createInitialSnippetRecord(payload) {
        const record = {
            id: payload.id,
            text: payload.text,
            type: payload.type,
            context: payload.context,
            status: "new",
            addedAt: Date.now()
        };
        if (payload.translation) {
            record.translation = payload.translation;
        }
        if (payload.type === "phrase") {
            record.easeFactor = 2.5;
            record.interval = 0;
            record.repetitions = 0;
            record.nextReviewAt = Date.now();
        }
        return record;
    }

    async function getItems() {
        return getSnippetItems();
    }

    async function saveItem(payload) {
        const utils = global.GlossX?.SnippetUtils;
        const text = normalizeText(payload?.text);
        const context = payload?.context;
        const hostname = String(context?.hostname || "").trim();

        if (!text || !context || !hostname || !utils?.buildSnippetId || !utils?.detectType) {
            return { ok: false, error: "句子无效" };
        }

        const id = utils.buildSnippetId(text, hostname);
        const type = utils.detectType(text, context.fullEnglish);

        const items = await getSnippetItems();
        if (!items[id] && Object.keys(items).length >= MAX_SNIPPET_ITEMS) {
            return { ok: false, error: "句库已满（1000 条），请清理已熟悉句子" };
        }

        const isNew = !items[id];
        let translation = payload.translation ? String(payload.translation).trim() : "";

        if (!translation && !payload.skipLookup && global.GlossX?.AIClient?.translateSnippet) {
            try {
                const lookedUp = await withTimeout(
                    global.GlossX.AIClient.translateSnippet({
                        text,
                        context: {
                            fullEnglish: String(context.fullEnglish || ""),
                            fullChinese: String(context.fullChinese || ""),
                            pageUrl: String(context.pageUrl || ""),
                            pageTitle: context.pageTitle ? String(context.pageTitle) : undefined,
                            hostname
                        },
                        type,
                        preference: payload?.preference === "uk" ? "uk" : "us"
                    }),
                    SAVE_TRANSLATE_TIMEOUT_MS
                );
                if (lookedUp?.ok && lookedUp.translation) {
                    translation = String(lookedUp.translation).trim();
                }
            } catch (error) {
                console.warn("[GlossX] Snippet save lookup failed:", error);
            }
        }

        if (isNew) {
            items[id] = createInitialSnippetRecord({
                id,
                text,
                type,
                context: {
                    fullEnglish: String(context.fullEnglish || ""),
                    fullChinese: String(context.fullChinese || ""),
                    pageUrl: String(context.pageUrl || ""),
                    pageTitle: context.pageTitle ? String(context.pageTitle) : undefined,
                    hostname
                },
                translation: translation || undefined
            });
            await saveSnippetItems(items);

            try {
                const statsResult = await browser.storage.local.get("stats");
                const today = (() => {
                    const d = new Date();
                    const month = String(d.getMonth() + 1).padStart(2, "0");
                    const day = String(d.getDate()).padStart(2, "0");
                    return `${d.getFullYear()}-${month}-${day}`;
                })();
                const stats = statsResult.stats || {
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
                    stats.date = today;
                    stats.newWords = 0;
                    stats.reviews = 0;
                    stats.vocabNewToday = 0;
                    stats.vocabReviewedToday = 0;
                    stats.snippetNewToday = 0;
                    stats.snippetReviewedToday = 0;
                }
                stats.snippetNewToday = (stats.snippetNewToday || 0) + 1;
                stats.lastActiveDate = today;
                await browser.storage.local.set({ stats });
            } catch {
                // Stats are best-effort; snippet item is already persisted.
            }
        }

        return { ok: true, item: items[id], isNew };
    }

    async function removeItem(id) {
        const snippetId = String(id || "");
        if (!snippetId) return { ok: false, error: "句子无效" };

        const items = await getSnippetItems();
        if (!items[snippetId]) {
            return { ok: false, error: "未找到该句子" };
        }
        delete items[snippetId];
        await saveSnippetItems(items);
        return { ok: true };
    }

    async function markFamiliar(id) {
        const snippetId = String(id || "");
        if (!snippetId) return { ok: false, error: "句子无效" };

        const items = await getSnippetItems();
        if (!items[snippetId]) {
            return { ok: false, error: "未找到该句子" };
        }
        items[snippetId] = {
            ...items[snippetId],
            status: "familiar",
            familiarAt: Date.now()
        };
        await saveSnippetItems(items);
        return { ok: true };
    }

    function applyPhraseReview(record, grade) {
        const MS_PER_DAY = 86400000;
        const quality = grade === "mastered" ? 5 : 3;
        const next = { ...record };

        if (grade === "mastered") {
            next.status = "mastered";
            next.learnedAt = Date.now();
            next.repetitions = (next.repetitions || 0) + 1;
            next.interval = Math.max(next.interval || 0, 21);
            next.nextReviewAt = Date.now() + next.interval * MS_PER_DAY;
            return next;
        }

        if (quality < 3) {
            next.repetitions = 0;
            next.interval = 1;
            next.status = "learning";
        } else {
            next.repetitions = (next.repetitions || 0) + 1;
            if (next.repetitions === 1) {
                next.interval = 1;
            } else if (next.repetitions === 2) {
                next.interval = 6;
            } else {
                next.interval = Math.round((next.interval || 1) * (next.easeFactor || 2.5));
            }
            next.status = next.repetitions >= 3 ? "review" : "learning";
        }

        next.easeFactor = Math.max(
            1.3,
            (next.easeFactor || 2.5) + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        );
        next.nextReviewAt = Date.now() + (next.interval || 1) * MS_PER_DAY;
        return next;
    }

    async function gradeItem(id, grade) {
        const snippetId = String(id || "");
        if (!snippetId || !grade) return { ok: false, error: "参数无效" };

        const items = await getSnippetItems();
        const record = items[snippetId];
        if (!record) return { ok: false, error: "未找到该短语" };
        if (record.type !== "phrase") return { ok: false, error: "仅短语支持复习评分" };

        items[snippetId] = applyPhraseReview(record, grade);
        await saveSnippetItems(items);

        try {
            const statsResult = await browser.storage.local.get("stats");
            const today = (() => {
                const d = new Date();
                const month = String(d.getMonth() + 1).padStart(2, "0");
                const day = String(d.getDate()).padStart(2, "0");
                return `${d.getFullYear()}-${month}-${day}`;
            })();
            const stats = statsResult.stats || {
                date: today,
                snippetReviewedToday: 0
            };
            if (stats.date !== today) {
                stats.snippetReviewedToday = 0;
            }
            stats.snippetReviewedToday = (stats.snippetReviewedToday || 0) + 1;
            await browser.storage.local.set({ stats });
        } catch {
            // Stats are best-effort.
        }

        return { ok: true, item: items[snippetId] };
    }

    global.GlossX = global.GlossX || {};
    global.GlossX.SnippetStorage = {
        getItems,
        saveItem,
        removeItem,
        markFamiliar,
        gradeItem
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
