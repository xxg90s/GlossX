(function (global) {
    const DENSITY_RATE = {
        minimal: 0.02,
        low: 0.05,
        medium: 0.10,
        high: 0.20,
        higher: 0.30,
        intense: 0.40,
        max: 0.50
    };
    const LEGACY_DENSITY_RATE = {
        low: 0.03,
        medium: 0.05,
        high: 0.08
    };
    const VERB_HINTS = /[了着过在被把将让]/;
    const NOUN_HINTS = /[的之]/;

    let entries = [];
    let byChinese = new Map();
    let maxZhLength = 1;

    function inferPosHint(text, index, length) {
        const before = text.slice(Math.max(0, index - 2), index);
        const after = text.slice(index + length, index + length + 2);
        const context = before + after;

        if (VERB_HINTS.test(context)) return "v";
        if (NOUN_HINTS.test(context)) return "n";
        if (/[很非常十分]/.test(before)) return "adj";
        return null;
    }

    function scoreEntry(entry, posHint) {
        if (!posHint) return 1;
        if (entry.pos === posHint) return 3;
        if (entry.pos.startsWith(posHint)) return 2;
        if (posHint === "v" && entry.pos === "n") return 0;
        return 1;
    }

    function pickBestEntry(candidates, text, index, length) {
        if (!candidates.length) return null;
        const posHint = inferPosHint(text, index, length);
        let best = candidates[0];
        let bestScore = -1;

        for (const entry of candidates) {
            const score = scoreEntry(entry, posHint);
            if (score > bestScore) {
                best = entry;
                bestScore = score;
            }
        }
        return bestScore > 0 ? best : candidates[0];
    }

    function needsAiDisambiguation(candidates, text, index, length) {
        if (candidates.length <= 1) return false;
        const posHint = inferPosHint(text, index, length);
        if (!posHint) return true;
        const scored = candidates.map((entry) => scoreEntry(entry, posHint));
        const max = Math.max(...scored);
        const winners = scored.filter((score) => score === max);
        return winners.length > 1 || max <= 1;
    }

    async function pickBestEntryAsync(candidates, text, index, length, settings) {
        const local = pickBestEntry(candidates, text, index, length);
        if (!settings?.aiEnabled || !global.GlossX?.AIService) {
            return local;
        }
        if (!needsAiDisambiguation(candidates, text, index, length)) {
            return local;
        }

        const contextStart = Math.max(0, index - 24);
        const contextEnd = Math.min(text.length, index + length + 24);
        const context = text.slice(contextStart, contextEnd);

        const aiEntry = await global.GlossX.AIService.resolveWord({
            zh: candidates[0].zh,
            context,
            candidates: candidates.map((item) => ({
                id: item.id,
                zh: item.zh,
                en: item.en,
                pos: item.pos,
                phonetic: item.phonetic || "",
                lexicon: item.lexicon
            }))
        });

        if (!aiEntry) return local;
        return candidates.find((item) => item.id === aiEntry.id) || aiEntry || local;
    }

    async function findMatchesAsync(text, settings) {
        const matches = [];
        let i = 0;

        while (i < text.length) {
            const ch = text[i];
            if (!/[\u4e00-\u9fff]/.test(ch)) {
                i += 1;
                continue;
            }

            let matched = null;
            let matchedLength = 0;

            for (let len = Math.min(maxZhLength, text.length - i); len >= 1; len -= 1) {
                const slice = text.slice(i, i + len);
                const candidates = byChinese.get(slice);
                if (!candidates || !candidates.length) continue;
                matched = await pickBestEntryAsync(candidates, text, i, len, settings);
                matchedLength = len;
                break;
            }

            if (matched) {
                matches.push({ index: i, length: matchedLength, entry: matched });
                i += matchedLength;
            } else {
                i += 1;
            }
        }

        return matches;
    }

    const Lexicon = {
        async load(activeLexicons) {
            const lexicons = activeLexicons && activeLexicons.length ? activeLexicons : ["cet4"];
            entries = [];
            byChinese = new Map();
            maxZhLength = 1;

            for (const name of lexicons) {
                const url = browser.runtime.getURL(`lexicon-${name}.json`);
                try {
                    const response = await fetch(url);
                    if (!response.ok) continue;
                    const data = await response.json();
                    entries.push(...data);
                } catch (error) {
                    console.warn("[GlossX] Failed to load lexicon:", name, error);
                }
            }

            for (const entry of entries) {
                if (!byChinese.has(entry.zh)) {
                    byChinese.set(entry.zh, []);
                }
                byChinese.get(entry.zh).push(entry);
                maxZhLength = Math.max(maxZhLength, entry.zh.length);
            }
        },

        getDensityRate(density) {
            if (DENSITY_RATE[density] !== undefined) {
                return DENSITY_RATE[density];
            }
            if (LEGACY_DENSITY_RATE[density] !== undefined) {
                return LEGACY_DENSITY_RATE[density];
            }
            return DENSITY_RATE.medium;
        },

        findMatches(text) {
            const matches = [];
            let i = 0;

            while (i < text.length) {
                const ch = text[i];
                if (!/[\u4e00-\u9fff]/.test(ch)) {
                    i += 1;
                    continue;
                }

                let matched = null;
                let matchedLength = 0;

                for (let len = Math.min(maxZhLength, text.length - i); len >= 1; len -= 1) {
                    const slice = text.slice(i, i + len);
                    const candidates = byChinese.get(slice);
                    if (!candidates || !candidates.length) continue;
                    matched = pickBestEntry(candidates, text, i, len);
                    matchedLength = len;
                    break;
                }

                if (matched) {
                    matches.push({ index: i, length: matchedLength, entry: matched });
                    i += matchedLength;
                } else {
                    i += 1;
                }
            }

            return matches;
        },

        findMatchesAsync,

        getAllEntries() {
            return entries;
        },

        findByEnglish(word) {
            const normalized = String(word || "").toLowerCase();
            if (!normalized) return null;

            const exact = entries.find((item) => item.en.toLowerCase() === normalized);
            if (exact) return exact;

            const stems = [];
            const push = (value) => {
                if (value && value.length >= 2 && !stems.includes(value)) stems.push(value);
            };
            push(normalized);
            if (normalized.endsWith("ies") && normalized.length > 4) push(`${normalized.slice(0, -3)}y`);
            if (normalized.endsWith("ing") && normalized.length > 5) {
                push(normalized.slice(0, -3));
                push(`${normalized.slice(0, -3)}e`);
            }
            if (normalized.endsWith("ied") && normalized.length > 4) push(`${normalized.slice(0, -3)}y`);
            if (normalized.endsWith("ed") && normalized.length > 4) {
                push(normalized.slice(0, -2));
                push(normalized.slice(0, -1));
            }
            if (normalized.endsWith("es") && normalized.length > 4) push(normalized.slice(0, -2));
            if (normalized.endsWith("s") && !normalized.endsWith("ss") && normalized.length > 3) {
                push(normalized.slice(0, -1));
            }

            for (const stem of stems) {
                const match = entries.find((item) => item.en.toLowerCase() === stem);
                if (match) return match;
            }
            return null;
        }
    };

    global.GlossX = global.GlossX || {};
    global.GlossX.Lexicon = Lexicon;
})(typeof globalThis !== "undefined" ? globalThis : window);
