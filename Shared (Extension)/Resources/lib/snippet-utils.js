// Shared (Extension)/Resources/lib/snippet-utils.js
(function (global) {
    const PHRASE_MAX_WORDS = 12;

    function normalizeText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function countWords(text) {
        const normalized = normalizeText(text);
        if (!normalized) return 0;
        return normalized.split(/\s+/).filter(Boolean).length;
    }

    function comparableText(value) {
        return normalizeText(value)
            .toLowerCase()
            .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
    }

    function compactChinese(value) {
        return normalizeText(value).replace(/[。！？…!?]+$/g, "");
    }

    function selectionCoversSentence(text, fullEnglish) {
        const selected = comparableText(text);
        const full = comparableText(fullEnglish);
        return !!selected && !!full && selected === full;
    }

    function detectType(text, fullEnglish) {
        if (selectionCoversSentence(text, fullEnglish)) return "sentence";
        return countWords(text) <= PHRASE_MAX_WORDS ? "phrase" : "excerpt";
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

    function resolveTranslationFromContext(text, context) {
        const fullZh = normalizeText(context?.fullChinese);
        if (!fullZh || !selectionCoversSentence(text, context?.fullEnglish)) return null;
        return fullZh;
    }

    function clipSelectionText(raw, fullEnglish, fullChinese) {
        let text = normalizeText(raw);
        const chinese = normalizeText(fullChinese);
        const english = normalizeText(fullEnglish);
        if (chinese && text.includes(chinese)) {
            text = normalizeText(text.split(chinese).join(" "));
        }
        if (english && !/[\u4e00-\u9fff]/.test(english) && /[\u4e00-\u9fff]/.test(text)) {
            text = normalizeText(text.replace(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g, " "));
        }
        return text;
    }

    function isFullSentenceEcho(text, translation, context) {
        const fullZh = compactChinese(context?.fullChinese);
        const translated = compactChinese(translation);
        if (!fullZh || !translated) return false;
        if (selectionCoversSentence(text, context?.fullEnglish)) return false;
        return translated === fullZh;
    }

    global.GlossX = global.GlossX || {};
    global.GlossX.SnippetUtils = {
        normalizeText,
        countWords,
        comparableText,
        selectionCoversSentence,
        detectType,
        buildSnippetId,
        isValidSelection,
        resolveTranslationFromContext,
        clipSelectionText,
        isFullSentenceEcho,
        PHRASE_MAX_WORDS
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
