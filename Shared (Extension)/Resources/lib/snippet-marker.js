(function (global) {
    let snippetItems = {};
    let settings = {};
    let initialized = false;
    let recentSelectionFlag = false;
    let recentSelectionTimer = null;

    function normalizeText(value) {
        const utils = global.GlossX?.SnippetUtils;
        if (utils?.normalizeText) return utils.normalizeText(value);
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function showToast(message) {
        let toast = document.getElementById("glossx-vocab-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "glossx-vocab-toast";
            toast.className = "glossx-vocab-toast";
            document.documentElement.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add("visible");
        window.setTimeout(() => toast.classList.remove("visible"), 1800);
    }

    function getTextNodesIn(element) {
        const nodes = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
        let node = walker.nextNode();
        while (node) {
            if (node.textContent) nodes.push(node);
            node = walker.nextNode();
        }
        return nodes;
    }

    function wrapSnippetText(element, searchText, snippetId) {
        if (!element || !searchText || !snippetId) return false;
        if (element.querySelector(`[data-snippet-id="${snippetId}"]`)) return true;

        const target = normalizeText(searchText);
        if (!target) return false;

        const textNodes = getTextNodesIn(element);
        if (!textNodes.length) return false;

        const combined = textNodes.map((node) => node.textContent).join("");
        const idx = combined.toLowerCase().indexOf(target.toLowerCase());
        if (idx === -1) return false;

        const endIdx = idx + target.length;
        let charCount = 0;
        let startNode = null;
        let startOffset = 0;
        let endNode = null;
        let endOffset = 0;

        for (const node of textNodes) {
            const len = node.textContent.length;
            if (!startNode && charCount + len > idx) {
                startNode = node;
                startOffset = idx - charCount;
            }
            if (!endNode && charCount + len >= endIdx) {
                endNode = node;
                endOffset = endIdx - charCount;
                break;
            }
            charCount += len;
        }

        if (!startNode || !endNode) return false;

        try {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            const mark = document.createElement("mark");
            mark.className = "glossx-snippet-saved";
            mark.dataset.snippetId = snippetId;
            range.surroundContents(mark);
            return true;
        } catch {
            return false;
        }
    }

    function applyHighlights(root = document) {
        if (!root?.querySelectorAll) return;

        root.querySelectorAll(".glossx-sentence-en").forEach((enElement) => {
            if (enElement.closest("[data-glossx-sentence-pending]")) return;

            const fullText = normalizeText(enElement.textContent || "");
            if (!fullText) return;

            Object.values(snippetItems).forEach((snippet) => {
                const snippetText = normalizeText(snippet?.text);
                if (!snippetText) return;
                if (!fullText.toLowerCase().includes(snippetText.toLowerCase())) return;
                wrapSnippetText(enElement, snippetText, snippet.id);
            });
        });
    }

    async function handleSave(payload) {
        try {
            let result = null;
            if (global.GlossX?.SnippetStorage?.saveItem) {
                result = await global.GlossX.SnippetStorage.saveItem(payload);
            } else {
                result = await browser.runtime.sendMessage({
                    type: "saveSnippetItem",
                    payload
                });
            }
            if (!result?.ok) {
                const TN = global.GlossX?.TextNormalize;
                showToast(TN?.resolveUiError
                    ? TN.resolveUiError(result?.error, "保存失败")
                    : (result?.error || "保存失败"));
                return result || { ok: false, error: "保存失败" };
            }
            if (result.item?.id) {
                snippetItems[result.item.id] = result.item;
            }
            applyHighlights(document.body);
            showToast("已加入句库");
            return result;
        } catch (error) {
            showToast(error?.message || "保存失败");
            return { ok: false, error: error?.message || "保存失败" };
        }
    }

    async function handleRemove(snippetId) {
        try {
            let result = null;
            if (global.GlossX?.SnippetStorage?.removeItem) {
                result = await global.GlossX.SnippetStorage.removeItem(snippetId);
            } else {
                result = await browser.runtime.sendMessage({
                    type: "removeSnippetItem",
                    payload: { id: snippetId }
                });
            }
            if (!result?.ok) {
                const TN = global.GlossX?.TextNormalize;
                showToast(TN?.resolveUiError
                    ? TN.resolveUiError(result?.error, "取消失败")
                    : (result?.error || "取消失败"));
                return result || { ok: false, error: "取消失败" };
            }
            delete snippetItems[snippetId];
            document.querySelectorAll(`[data-snippet-id="${snippetId}"]`).forEach((mark) => {
                const parent = mark.parentNode;
                if (!parent) return;
                while (mark.firstChild) {
                    parent.insertBefore(mark.firstChild, mark);
                }
                parent.removeChild(mark);
            });
            showToast("已移出句库");
            return result;
        } catch (error) {
            showToast(error?.message || "取消失败");
            return { ok: false, error: error?.message || "取消失败" };
        }
    }

    async function handleUpdateTranslation(snippetId, translation) {
        try {
            let result = null;
            if (global.GlossX?.SnippetStorage?.updateTranslation) {
                result = await global.GlossX.SnippetStorage.updateTranslation(snippetId, translation);
            } else {
                result = await browser.runtime.sendMessage({
                    type: "updateSnippetTranslation",
                    payload: { id: snippetId, translation }
                });
            }
            if (result?.ok && result.item?.id) {
                snippetItems[result.item.id] = result.item;
            }
            return result;
        } catch (error) {
            console.warn("[GlossX] Snippet translation update failed:", error);
            return { ok: false, error: error?.message || "更新失败" };
        }
    }

    function rawSelectionText(selection, element) {
        const range = typeof selection.getRangeAt === "function" ? selection.getRangeAt(0) : null;
        if (
            range
            && element
            && typeof range.compareBoundaryPoints === "function"
            && typeof range.cloneRange === "function"
            && typeof document.createRange === "function"
        ) {
            try {
                const bounds = document.createRange();
                bounds.selectNodeContents(element);
                const startsAfter = range.compareBoundaryPoints(Range.END_TO_START, bounds) > 0;
                const endsBefore = range.compareBoundaryPoints(Range.START_TO_END, bounds) < 0;
                if (startsAfter || endsBefore) return "";
                const clipped = range.cloneRange();
                if (range.compareBoundaryPoints(Range.START_TO_START, bounds) < 0) {
                    clipped.setStart(bounds.startContainer, bounds.startOffset);
                }
                if (range.compareBoundaryPoints(Range.END_TO_END, bounds) > 0) {
                    clipped.setEnd(bounds.endContainer, bounds.endOffset);
                }
                return clipped.toString() || "";
            } catch {
                // Fall through to the raw selection string.
            }
        }
        return selection.toString() || "";
    }

    function handleMouseUp(event) {
        const enElement = event.target.closest(".glossx-sentence-en");
        if (!enElement) return;
        if (enElement.closest("[data-glossx-sentence-pending]")) return;

        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

        const sentence = enElement.closest(".glossx-sentence");
        if (!sentence) return;

        const fullEnglish = (sentence.querySelector(".glossx-sentence-en")?.textContent || "").trim();
        const fullChinese = (sentence.querySelector(".glossx-sentence-cn")?.textContent || "").trim();
        const utils = global.GlossX?.SnippetUtils;
        const rawText = rawSelectionText(selection, enElement);
        const text = utils?.clipSelectionText
            ? utils.clipSelectionText(rawText, fullEnglish, fullChinese)
            : String(rawText || "").trim();
        if (!utils?.isValidSelection?.(text)) return;
        const context = {
            fullEnglish,
            fullChinese,
            pageUrl: location.href,
            pageTitle: document.title,
            hostname: location.hostname
        };

        const type = utils.detectType(text, fullEnglish);
        const snippetId = utils.buildSnippetId(text, context.hostname);
        const savedItem = snippetItems[snippetId];
        const saved = !!savedItem;

        global.GlossX?.WordSavePanel?.hide(true);

        const anchorRect = selection.getRangeAt(0).getBoundingClientRect();
        if (!anchorRect || (anchorRect.width === 0 && anchorRect.height === 0)) return;

        global.GlossX?.SnippetSavePanel?.show({
            text,
            type,
            context,
            anchorRect,
            saved,
            snippetId: saved ? snippetId : "",
            translation: savedItem?.translation || "",
            pronunciation: settings?.pronunciation || "us"
        });

        selection.removeAllRanges();

        recentSelectionFlag = true;
        clearTimeout(recentSelectionTimer);
        recentSelectionTimer = window.setTimeout(() => {
            recentSelectionFlag = false;
        }, 300);
    }

    const SnippetMarker = {
        init(currentSettings, items) {
            settings = currentSettings || {};
            snippetItems = items || {};

            if (!initialized) {
                initialized = true;
                document.addEventListener("mouseup", handleMouseUp);
                global.GlossX?.SnippetSavePanel?.init({
                    onSave: handleSave,
                    onRemove: handleRemove,
                    onUpdateTranslation: handleUpdateTranslation
                });
            }
        },

        refresh(root = document) {
            applyHighlights(root);
        },

        setSnippetItems(items) {
            snippetItems = items || {};
        },

        setSettings(currentSettings) {
            settings = currentSettings || {};
        },

        hasRecentSelection() {
            return recentSelectionFlag;
        }
    };

    global.GlossX = global.GlossX || {};
    global.GlossX.SnippetMarker = SnippetMarker;
})(typeof globalThis !== "undefined" ? globalThis : window);
