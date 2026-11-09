(function (global) {
    const SKIP_TAGS = new Set([
        "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
        "CODE", "PRE", "SVG", "MATH", "IFRAME"
    ]);
    const BLOCK_TAGS = new Set([
        "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "TD", "TH", "FIGCAPTION"
    ]);
    const PROCESSED_ATTR = "data-glossx-processed";
    const PROCESSED_BLOCK_ATTR = "data-glossx-processed-block";
    const INTERACTIVE_SELECTOR = "a, img, video, audio, iframe, input, button, svg, canvas";

    const BLOCK_CONTAINER_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, figcaption, section";
    const SENTENCE_SELECTOR = "[data-glossx-sentence], [data-glossx-sentence-pending], [data-glossx-original], .glossx-sentence";

    function containsSentence(element) {
        return !!element?.querySelector?.(SENTENCE_SELECTOR);
    }

    function isInSentenceTranslatedBlock(node) {
        const block = node.parentElement?.closest?.(BLOCK_CONTAINER_SELECTOR);
        if (!block) return false;
        return containsSentence(block);
    }

    function shouldSkipNode(node) {
        let parent = node.parentElement;
        while (parent) {
            if (SKIP_TAGS.has(parent.tagName)) return true;
            if (parent.isContentEditable) return true;
            if (parent.classList?.contains("glossx-word")) return true;
            if (parent.classList?.contains("glossx-sentence")) return true;
            if (parent.classList?.contains("glossx-sentence-block")) return true;
            if (parent.classList?.contains("glossx-sentence-en")) return true;
            if (parent.classList?.contains("glossx-sentence-cn")) return true;
            if (parent.hasAttribute?.("data-glossx-sentence")) return true;
            if (parent.hasAttribute?.("data-glossx-original")) return true;
            if (parent.hasAttribute?.(PROCESSED_ATTR)) return true;
            if (parent.hasAttribute?.(PROCESSED_BLOCK_ATTR)) return true;
            parent = parent.parentElement;
        }
        return isInSentenceTranslatedBlock(node);
    }

    function shouldSkipElement(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;
        if (SKIP_TAGS.has(element.tagName)) return true;
        if (element.isContentEditable) return true;
        if (element.classList?.contains("glossx-word")) return true;
        if (element.classList?.contains("glossx-sentence")) return true;
        if (element.classList?.contains("glossx-sentence-block")) return true;
        if (element.classList?.contains("glossx-sentence-en")) return true;
        if (element.classList?.contains("glossx-sentence-cn")) return true;
        if (element.hasAttribute?.("data-glossx-sentence")) return true;
        if (element.hasAttribute?.("data-glossx-original")) return true;
        if (element.hasAttribute?.(PROCESSED_BLOCK_ATTR)) return true;
        if (element.closest?.(".glossx-word, .glossx-sentence, .glossx-sentence-block, .glossx-sentence-en, .glossx-sentence-cn, .glossx-floating-control, .glossx-decode-panel, .glossx-word-save-panel, .glossx-snippet-save-panel, .glossx-hint-banner")) {
            return true;
        }
        return false;
    }

    function collectTextNodes(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue || !node.nodeValue.trim()) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (shouldSkipNode(node)) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (!/[\u4e00-\u9fff]/.test(node.nodeValue)) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        const nodes = [];
        while (walker.nextNode()) {
            nodes.push(walker.currentNode);
        }
        return nodes;
    }

    function collectBlockElements(root) {
        const blocks = [];
        const seen = new Set();

        function consider(element) {
            if (!element || seen.has(element) || shouldSkipElement(element)) return;
            if (element.querySelector?.(".glossx-word")) return;
            if (containsSentence(element)) return;

            const text = element.textContent || "";
            if (!/[\u4e00-\u9fff]/.test(text)) return;
            if (text.trim().length < 2) return;

            seen.add(element);
            blocks.push(element);
        }

        if (BLOCK_TAGS.has(root.tagName)) {
            consider(root);
        }

        root.querySelectorAll?.("p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, figcaption, section").forEach(consider);

        const weixinContent = root.querySelector?.("#js_content, .rich_media_content");
        if (weixinContent && weixinContent !== root) {
            weixinContent.querySelectorAll("p, section, span").forEach((element) => {
                if (element.tagName === "SPAN" && element.querySelector("span, a, img")) return;
                if (element.tagName === "SPAN" && (element.textContent || "").length >= 4) {
                    consider(element);
                }
            });
        }

        return blocks;
    }

    function displayText(entry, displayMode) {
        switch (displayMode) {
            case "cn_then_en":
                return `${entry.zh}(${entry.en})`;
            case "en_then_cn":
            case "english_with_cn":
                return `${entry.en}(${entry.zh})`;
            case "english_only":
            default:
                return entry.en;
        }
    }

    function applyWordStyle(span, settings) {
        if (settings?.highlightColor) {
            span.style.backgroundColor = settings.highlightColor;
        }
    }

    function createWordSpan(entry, settings, onHover) {
        const span = document.createElement("span");
        span.className = "glossx-word";
        span.dataset.wordId = entry.id;
        span.dataset.en = entry.en;
        span.dataset.zh = entry.zh;
        span.dataset.pos = entry.pos;
        span.dataset.phonetic = entry.phonetic || "";
        span.textContent = displayText(entry, settings.displayMode);
        applyWordStyle(span, settings);
        span.addEventListener("mouseenter", () => onHover(span, entry));
        span.addEventListener("mouseleave", () => onHover(null, null));
        span.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onHover(span, entry, true);
        });
        return span;
    }

    async function selectMatches(text, options) {
        const { Lexicon, SM2, settings, wordRecords } = options;
        const matches = settings.aiEnabled
            ? await Lexicon.findMatchesAsync(text, settings)
            : Lexicon.findMatches(text);
        if (!matches.length) return [];

        const density = Lexicon.getDensityRate(settings.replaceDensity);
        const dueMatches = [];
        const regularMatches = [];

        for (const match of matches) {
            const record = wordRecords[match.entry.id];
            const score = SM2.priorityScore(record);
            if (SM2.isDue(record)) {
                dueMatches.push(match);
            } else if (record?.status !== "skipped" && record?.status !== "mastered") {
                regularMatches.push({ ...match, score });
            } else if (!record) {
                regularMatches.push({ ...match, score: 0 });
            }
        }

        const targetCount = Math.max(1, Math.ceil(matches.length * density));
        const selected = new Map();

        for (const match of dueMatches) {
            selected.set(match.index, match);
        }

        const shuffled = regularMatches.sort((a, b) => b.score - a.score || Math.random() - 0.5);
        for (const match of shuffled) {
            if (selected.size >= targetCount) break;
            if (!selected.has(match.index)) {
                selected.set(match.index, match);
            }
        }

        return [...selected.values()].sort((a, b) => a.index - b.index);
    }

    function buildFragmentFromMatches(text, sortedMatches, options) {
        const { settings, onWordHover } = options;
        const fragment = document.createDocumentFragment();
        let cursor = 0;

        for (const match of sortedMatches) {
            if (match.index > cursor) {
                fragment.appendChild(document.createTextNode(text.slice(cursor, match.index)));
            }
            fragment.appendChild(createWordSpan(match.entry, settings, onWordHover));
            cursor = match.index + match.length;
        }

        if (cursor < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(cursor)));
        }

        return fragment;
    }

    async function notifyReplaced(sortedMatches, options) {
        for (const match of sortedMatches) {
            await options.onWordReplaced(match.entry);
        }
        return sortedMatches.length;
    }

    function isReplaceableTextNode(textNode, text) {
        return !!textNode.parentNode
            && textNode.nodeValue === text
            && !shouldSkipNode(textNode);
    }

    function isReplaceableBlock(element) {
        return !!element.isConnected
            && !shouldSkipElement(element)
            && !element.querySelector(INTERACTIVE_SELECTOR)
            && !element.querySelector(".glossx-word")
            && !containsSentence(element);
    }

    async function replaceInTextNode(textNode, options) {
        const text = textNode.nodeValue;
        if (!isReplaceableTextNode(textNode, text)) return 0;
        const sorted = await selectMatches(text, options);
        if (!sorted.length) return 0;

        // Matching may wait on AI; sentence translation can take over this node meanwhile.
        if (!isReplaceableTextNode(textNode, text)) return 0;
        textNode.parentNode.replaceChild(buildFragmentFromMatches(text, sorted, options), textNode);
        return notifyReplaced(sorted, options);
    }

    async function replaceInBlockElement(element, options) {
        if (!isReplaceableBlock(element)) return 0;

        const text = element.textContent || "";
        const sorted = await selectMatches(text, options);
        if (!sorted.length) return 0;

        // replaceChildren flattens the block, so it must not wipe sentence cards added while matching.
        if (!isReplaceableBlock(element) || element.textContent !== text) return 0;
        element.replaceChildren(buildFragmentFromMatches(text, sorted, options));
        element.setAttribute(PROCESSED_BLOCK_ATTR, "1");
        return notifyReplaced(sorted, options);
    }

    async function processRoot(root, options) {
        if (!root) return 0;

        let total = 0;
        const blocks = collectBlockElements(root);
        for (const block of blocks) {
            total += await replaceInBlockElement(block, options);
        }

        const nodes = collectTextNodes(root);
        for (const node of nodes) {
            total += await replaceInTextNode(node, options);
        }

        return total;
    }

    function restoreAll(root) {
        if (!root?.querySelectorAll) return;

        root.querySelectorAll(".glossx-word").forEach((span) => {
            const zh = span.dataset.zh;
            if (zh && span.parentNode) {
                span.parentNode.replaceChild(document.createTextNode(zh), span);
            }
        });

        root.querySelectorAll(`[${PROCESSED_BLOCK_ATTR}]`).forEach((element) => {
            element.removeAttribute(PROCESSED_BLOCK_ATTR);
        });
    }

    global.GlossX = global.GlossX || {};
    global.GlossX.Replacer = {
        processRoot,
        restoreAll,
        collectTextNodes,
        collectBlockElements,
        shouldSkipNode,
        PROCESSED_ATTR,
        PROCESSED_BLOCK_ATTR
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
