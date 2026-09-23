// Shared (Extension)/Resources/lib/snippet-utils.js
(function (global) {
    const PHRASE_MAX_WORDS = 6;
    const SENTENCE_COVERAGE_RATIO = 0.8;

    function normalizeText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function countWords(text) {
        const normalized = normalizeText(text);
        if (!normalized) return 0;
        return normalized.split(/\s+/).filter(Boolean).length;
    }

    function detectType(text, fullEnglish) {
        const normalized = normalizeText(text);
        const wordCount = countWords(normalized);
        if (fullEnglish) {
            const full = normalizeText(fullEnglish);
            if (full && normalized.length / full.length >= SENTENCE_COVERAGE_RATIO) {
                return "sentence";
            }
        }
        return wordCount <= PHRASE_MAX_WORDS ? "phrase" : "sentence";
    }

    function buildSnippetId(text, hostname) {
        const key = `${normalizeText(text).toLowerCase()}|${String(hostname || "").toLowerCase()}`;
        let hash = 0;
        for (let i = 0; i < key.length; i += 1) {
            hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
        }
        return `snip_${Math.abs(hash).toString(36)}`;
    }

    function isValidSelection(text) {
        const normalized = normalizeText(text);
        if (normalized.length < 2) return false;
        return /[a-zA-Z]/.test(normalized);
    }

    function resolveTranslationFromContext(text, context, type) {
        const selected = normalizeText(text);
        const fullEn = normalizeText(context?.fullEnglish);
        const fullZh = normalizeText(context?.fullChinese);
        if (!selected || !fullZh) return null;

        if (type === "sentence") return fullZh;

        const selectedLower = selected.toLowerCase();
        const fullEnLower = fullEn.toLowerCase();
        if (fullEnLower && selectedLower === fullEnLower) return fullZh;
        if (fullEn && selected.length / fullEn.length >= SENTENCE_COVERAGE_RATIO) {
            return fullZh;
        }
        return null;
    }

    global.GlossX = global.GlossX || {};
    global.GlossX.SnippetUtils = {
        normalizeText,
        countWords,
        detectType,
        buildSnippetId,
        isValidSelection,
        resolveTranslationFromContext,
        PHRASE_MAX_WORDS,
        SENTENCE_COVERAGE_RATIO
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
