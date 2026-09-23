(function (global) {
    const SKIP_TAGS = new Set([
        "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
        "CODE", "PRE", "SVG", "MATH", "IFRAME"
    ]);
    const SENTENCE_ATTR = "data-glossx-sentence";
    const ORIGINAL_ATTR = "data-glossx-original";
    const PENDING_ATTR = "data-glossx-sentence-pending";
    const MIN_SENTENCE_CHARS = 4;
    const MAX_SENTENCES = 80;
    const MAX_CONCURRENT = 1;

    const PARAGRAPH_RATIO = {
        minimal: 0.10,
        low: 0.20,
        medium: 0.30,
        high: 0.40,
        max: 0.50
    };

    let activeCount = 0;

    function stableHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i += 1) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    function countChineseChars(text) {
        const matches = text.match(/[\u4e00-\u9fff]/g);
        return matches ? matches.length : 0;
    }

    function shouldSkipTextNode(node) {
        let parent = node.parentElement;
        while (parent) {
            if (SKIP_TAGS.has(parent.tagName)) return true;
            if (parent.isContentEditable) return true;
            if (parent.classList?.contains("glossx-word")) return true;
            if (parent.classList?.contains("glossx-sentence")) return true;
            if (parent.hasAttribute?.(SENTENCE_ATTR)) return true;
            if (parent.hasAttribute?.(PENDING_ATTR)) return true;
            if (parent.closest?.(
                ".glossx-sentence, .glossx-word, .glossx-floating-control, "
                + ".glossx-decode-panel, .glossx-word-save-panel, .glossx-snippet-save-panel, "
                + ".glossx-hint-banner"
            )) {
                return true;
            }
            parent = parent.parentElement;
        }
        return false;
    }

    function splitSentences(text) {
        if (!text) return [];

        const sentences = [];
        const regex = /[^。！？；.!?…\n]+(?:[。！？；.!?…]|\n+|$)/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const chunk = match[0];
            if (countChineseChars(chunk) >= MIN_SENTENCE_CHARS) {
                sentences.push({
                    text: chunk,
                    start: match.index,
                    end: match.index + chunk.length
                });
            }
        }

        return sentences;
    }

    function collectTextNodes(root) {
        const nodes = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue || !node.nodeValue.trim()) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (shouldSkipTextNode(node)) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (!/[\u4e00-\u9fff]/.test(node.nodeValue)) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        while (walker.nextNode()) {
            nodes.push(walker.currentNode);
        }
        return nodes;
    }

    function collectSentenceCandidates(root) {
        const candidates = [];
        let globalIndex = 0;

        collectTextNodes(root).forEach((textNode) => {
            splitSentences(textNode.nodeValue || "").forEach((sentence) => {
                candidates.push({
                    textNode,
                    start: sentence.start,
                    end: sentence.end,
                    text: sentence.text,
                    globalIndex: globalIndex += 1
                });
            });
        });

        return candidates;
    }

    function getSentenceSampleId(candidate) {
        const parent = candidate.textNode.parentElement;
        const parentTag = parent?.tagName || "";
        const parentIndex = parent
            ? Array.prototype.indexOf.call(parent.childNodes, candidate.textNode)
            : 0;
        return stableHash(
            `${location.href}|${candidate.text}|${candidate.start}|${parentTag}|${parentIndex}`
        );
    }

    function sampleSentences(candidates, ratioKey, pageUrl) {
        const rate = PARAGRAPH_RATIO[ratioKey] ?? PARAGRAPH_RATIO.low;
        const selected = new Set();

        candidates.forEach((candidate) => {
            const bucket = getSentenceSampleId(candidate) % 10000;
            if (bucket / 10000 < rate) {
                selected.add(candidate.globalIndex);
            }
        });

        if (!selected.size && candidates.length > 0 && rate > 0) {
            selected.add(candidates[0].globalIndex);
        }

        const ordered = candidates.filter((candidate) => selected.has(candidate.globalIndex));
        return new Set(takeEvenlySpaced(ordered, MAX_SENTENCES).map((candidate) => candidate.globalIndex));
    }

    function takeEvenlySpaced(items, limit) {
        if (items.length <= limit) return items;

        const picked = [];
        for (let i = 0; i < limit; i += 1) {
            picked.push(items[Math.floor((i * items.length) / limit)]);
        }
        return picked;
    }

    async function waitForSlot() {
        while (
            activeCount >= MAX_CONCURRENT
            || global.GlossX?.AIClient?.hasUserRequest?.()
        ) {
            await new Promise((resolve) => setTimeout(resolve, 80));
        }
        activeCount += 1;
    }

    function releaseSlot() {
        activeCount = Math.max(0, activeCount - 1);
    }

    async function requestTranslation(text) {
        const { AIService } = global.GlossX || {};
        if (!AIService?.translateParagraph) {
            throw new Error("翻译服务不可用");
        }
        return AIService.translateParagraph({ text });
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function buildSentenceMarkup(originalText, english, displayMode) {
        const safeOriginal = escapeHtml(originalText);
        const safeEnglish = escapeHtml(english || originalText);

        switch (displayMode) {
            case "cn_then_en":
                return [
                    `<span class="glossx-sentence-cn">${safeOriginal}</span>`,
                    `<span class="glossx-sentence-en glossx-sentence-secondary">${safeEnglish}</span>`
                ].join("");
            case "en_then_cn":
                return [
                    `<span class="glossx-sentence-en">${safeEnglish}</span>`,
                    `<span class="glossx-sentence-cn glossx-sentence-secondary">${safeOriginal}</span>`
                ].join("");
            case "english_only":
            default:
                return `<span class="glossx-sentence-en">${safeEnglish}</span>`;
        }
    }

    function usesBlockLayout(displayMode) {
        return displayMode === "en_then_cn" || displayMode === "cn_then_en";
    }

    function createPendingSentenceSpan(originalText, displayMode) {
        const span = document.createElement("span");
        span.className = "glossx-sentence glossx-sentence-loading";
        if (usesBlockLayout(displayMode)) {
            span.classList.add("glossx-sentence-block");
        }
        span.setAttribute(PENDING_ATTR, "1");
        span.setAttribute(ORIGINAL_ATTR, originalText);
        span.innerHTML = `<span class="glossx-sentence-cn">${escapeHtml(originalText)}</span>`;
        return span;
    }

    function applySentenceTranslation(span, originalText, english, source, displayMode) {
        span.removeAttribute(PENDING_ATTR);
        span.setAttribute(SENTENCE_ATTR, "1");
        span.dataset.source = source || "ai";
        span.classList.remove("glossx-sentence-loading", "glossx-sentence-failed");
        span.classList.add("glossx-sentence");
        span.classList.toggle("glossx-sentence-block", usesBlockLayout(displayMode));
        span.innerHTML = buildSentenceMarkup(originalText, english, displayMode);
    }

    function markSentenceFailed(span, originalText) {
        span.removeAttribute(PENDING_ATTR);
        span.classList.remove("glossx-sentence-loading");
        span.classList.add("glossx-sentence-failed");
        span.textContent = originalText;
        setTimeout(() => {
            span.classList.remove("glossx-sentence-failed");
        }, 3000);
    }

    async function translateSentenceSpan(span, settings) {
        const originalText = span.getAttribute(ORIGINAL_ATTR) || span.textContent || "";
        if (!originalText.trim()) return false;

        await waitForSlot();
        try {
            const result = await requestTranslation(originalText.trim());
            if (!result?.ok || !result.english) {
                markSentenceFailed(span, originalText);
                return false;
            }

            applySentenceTranslation(
                span,
                originalText,
                result.english,
                result.source,
                settings.paragraphDisplayMode || "en_then_cn"
            );
            global.GlossX?.VocabMarker?.refresh(span);
            return true;
        } catch (error) {
            console.warn("[GlossX] Sentence translation failed:", error);
            markSentenceFailed(span, originalText);
            return false;
        } finally {
            releaseSlot();
        }
    }

    function replaceTextNodeWithSentences(textNode, sentenceCandidates, selectedSet, displayMode) {
        const text = textNode.nodeValue || "";
        const parent = textNode.parentNode;
        if (!parent) return [];

        const sorted = [...sentenceCandidates].sort((a, b) => a.start - b.start);
        const fragments = [];
        const pendingSpans = [];
        let pos = 0;

        sorted.forEach((candidate) => {
            if (candidate.start > pos) {
                fragments.push(document.createTextNode(text.slice(pos, candidate.start)));
            }

            if (selectedSet.has(candidate.globalIndex)) {
                const span = createPendingSentenceSpan(
                    candidate.text,
                    displayMode || "en_then_cn"
                );
                fragments.push(span);
                pendingSpans.push(span);
            } else {
                fragments.push(document.createTextNode(candidate.text));
            }

            pos = candidate.end;
        });

        if (pos < text.length) {
            fragments.push(document.createTextNode(text.slice(pos)));
        }

        fragments.forEach((fragment) => parent.insertBefore(fragment, textNode));
        parent.removeChild(textNode);
        return pendingSpans;
    }

    function restoreSentenceSpan(span) {
        const original = span.getAttribute(ORIGINAL_ATTR);
        if (!original || !span.parentNode) return;

        span.parentNode.replaceChild(document.createTextNode(original), span);
    }

    const ParagraphTranslator = {
        async processRoot(root, options) {
            if (!root || !options?.settings) return 0;

            const candidates = collectSentenceCandidates(root);
            if (!candidates.length) return 0;

            const selectedSet = sampleSentences(
                candidates,
                options.settings.paragraphRatio || "low"
            );
            if (!selectedSet.size) return 0;

            const selectedCandidates = candidates.filter((candidate) => (
                selectedSet.has(candidate.globalIndex)
            ));
            const affectedTextNodes = new Set(
                selectedCandidates.map((candidate) => candidate.textNode)
            );

            const displayMode = options.settings.paragraphDisplayMode || "en_then_cn";

            const pendingSpans = [];
            affectedTextNodes.forEach((textNode) => {
                if (!textNode.parentNode) return;
                const sentencesInNode = candidates.filter((candidate) => candidate.textNode === textNode);
                pendingSpans.push(
                    ...replaceTextNodeWithSentences(
                        textNode,
                        sentencesInNode,
                        selectedSet,
                        displayMode
                    )
                );
            });

            let count = 0;
            const results = await Promise.all(
                pendingSpans.map((span) => translateSentenceSpan(span, options.settings))
            );
            results.forEach((ok) => {
                if (ok) count += 1;
            });
            return count;
        },

        restoreAll(root) {
            if (!root?.querySelectorAll) return;

            root.querySelectorAll(`[${SENTENCE_ATTR}], [${PENDING_ATTR}]`).forEach((element) => {
                restoreSentenceSpan(element);
            });
        },

        sampleSentences,
        MAX_SENTENCES,
        PARAGRAPH_RATIO
    };

    global.GlossX = global.GlossX || {};
    global.GlossX.ParagraphTranslator = ParagraphTranslator;
})(typeof globalThis !== "undefined" ? globalThis : window);
