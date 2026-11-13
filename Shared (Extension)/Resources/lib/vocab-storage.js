(function (global) {
    const MAX_VOCAB_ITEMS = 2000;
    const VOCAB_EXAMPLE_VERSION = 2;

    function sanitizeText(value) {
        const TN = global.GlossX?.TextNormalize;
        if (TN?.normalizeUiText) return TN.normalizeUiText(value);
        return String(value || "").trim();
    }

    function sanitizeDefinitions(definitions) {
        const TN = global.GlossX?.TextNormalize;
        if (TN?.normalizeDefinitionsFromAi) {
            return TN.normalizeDefinitionsFromAi(definitions);
        }
        return (definitions || [])
            .map((item) => String(item || "").trim())
            .filter(Boolean);
    }

    function sanitizeExample(example) {
        const TN = global.GlossX?.TextNormalize;
        if (TN?.normalizeExample) return TN.normalizeExample(example);
        if (!example?.english) return null;
        return {
            english: String(example.english),
            chinese: String(example.chinese || "")
        };
    }

    async function getVocabItems() {
        const result = await browser.storage.local.get("vocabItems");
        return result.vocabItems || {};
    }

    async function saveVocabItems(items) {
        await browser.storage.local.set({ vocabItems: items });
    }

    function createInitialVocabRecord(payload) {
        return {
            id: payload.id,
            word: sanitizeText(payload.word),
            lemma: sanitizeText(payload.lemma || ""),
            phonetic: sanitizeText(payload.phonetic || ""),
            pos: sanitizeText(payload.pos || ""),
            definitions: sanitizeDefinitions(payload.definitions || []),
            usageExample: sanitizeExample(payload.usageExample) || null,
            extraExample: sanitizeExample(payload.usageExample) || null,
            exampleVersion: VOCAB_EXAMPLE_VERSION,
            exampleFromContext: null,
            status: "new",
            addedAt: Date.now(),
            easeFactor: 2.5,
            interval: 0,
            repetitions: 0,
            nextReviewAt: Date.now()
        };
    }

    async function saveItem(payload) {
        const id = String(payload?.id || "").toLowerCase();
        const word = String(payload?.word || "").trim();
        if (!id || !word) {
            return { ok: false, error: "单词无效" };
        }

        const items = await getVocabItems();
        if (!items[id] && Object.keys(items).length >= MAX_VOCAB_ITEMS) {
            return { ok: false, error: "生词本已满（2000 条），请清理已掌握词" };
        }

        const isNew = !items[id];
        let definitions = sanitizeDefinitions(payload.definitions || items[id]?.definitions || []);
        let usageExample = sanitizeExample(payload.usageExample || items[id]?.usageExample || null);
        let lemma = sanitizeText(payload.lemma || items[id]?.lemma || "");
        let phonetic = sanitizeText(payload.phonetic || items[id]?.phonetic || "");
        let pos = sanitizeText(payload.pos || items[id]?.pos || "");

        if (!definitions.length && global.GlossX?.AIClient?.lookupVocabWord) {
            const lookedUp = await global.GlossX.AIClient.lookupVocabWord({
                word,
                preference: payload?.preference === "uk" ? "uk" : "us"
            });
            if (lookedUp?.ok) {
                lemma = sanitizeText(lookedUp.lemma || lemma);
                phonetic = phonetic || sanitizeText(lookedUp.phonetic || "");
                pos = pos || sanitizeText(lookedUp.pos || "");
                definitions = sanitizeDefinitions(lookedUp.definitions || []);
                usageExample = usageExample || sanitizeExample(lookedUp.example);
            }
        }

        if (lemma && lemma.toLowerCase() === word.toLowerCase()) {
            lemma = "";
        }

        const base = items[id] || createInitialVocabRecord({
            id,
            word,
            lemma,
            phonetic,
            pos,
            definitions,
            usageExample
        });

        const item = {
            ...base,
            word: sanitizeText(word),
            lemma,
            phonetic,
            pos,
            definitions,
            usageExample: usageExample || null,
            extraExample: usageExample || null,
            exampleVersion: VOCAB_EXAMPLE_VERSION,
            status: base.status === "mastered" ? "learning" : (base.status || "new")
        };
        if (String(base.source || "").startsWith("starter:")) {
            item.source = "safari";
        }

        items[id] = item;
        await saveVocabItems(items);

        if (isNew) {
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
                    streak: 0,
                    lastActiveDate: null
                };
                if (stats.date !== today) {
                    stats.date = today;
                    stats.newWords = 0;
                    stats.reviews = 0;
                    stats.vocabNewToday = 0;
                    stats.vocabReviewedToday = 0;
                }
                stats.vocabNewToday = (stats.vocabNewToday || 0) + 1;
                stats.lastActiveDate = today;
                await browser.storage.local.set({ stats });
            } catch {
                // Stats are best-effort; vocab item is already persisted.
            }
        }

        return { ok: true, item, isNew };
    }

    async function removeItem(id) {
        const vocabId = String(id || "").toLowerCase();
        if (!vocabId) return { ok: false, error: "单词无效" };

        const items = await getVocabItems();
        if (!items[vocabId]) {
            return { ok: false, error: "未找到该生词" };
        }
        delete items[vocabId];
        await saveVocabItems(items);
        return { ok: true };
    }

    global.GlossX = global.GlossX || {};
    global.GlossX.VocabStorage = {
        saveItem,
        removeItem,
        getVocabItems
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
