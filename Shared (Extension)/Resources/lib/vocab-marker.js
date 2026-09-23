(function (global) {
    const MIN_WORD_LENGTH = 2;
    const WORD_PATTERN = /[a-zA-Z][a-zA-Z'-]*/g;

    let vocabItems = {};
    let settings = {};
    let initialized = false;
    let lastClickWord = "";
    let lastClickTime = 0;

    function normalizeWord(word) {
        return String(word || "").toLowerCase();
    }

    function escapeHtml(text) {
        return String(text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function buildWordMarkup(text, savedIds) {
        let result = "";
        let lastIndex = 0;
        let match;

        WORD_PATTERN.lastIndex = 0;
        while ((match = WORD_PATTERN.exec(text)) !== null) {
            const word = match[0];
            result += escapeHtml(text.slice(lastIndex, match.index));

            if (word.length < MIN_WORD_LENGTH) {
                result += escapeHtml(word);
            } else {
                const id = normalizeWord(word);
                const saved = savedIds.has(id);
                const classes = saved
                    ? "glossx-vocab-word glossx-vocab-saved"
                    : "glossx-vocab-word";
                result += `<span class="${classes}" data-vocab-word="${escapeHtml(id)}">${escapeHtml(word)}</span>`;
            }

            lastIndex = match.index + word.length;
        }

        result += escapeHtml(text.slice(lastIndex));
        return result;
    }

    function wrapEnglishWords(enElement, savedIds) {
        if (!enElement || enElement.dataset.vocabWrapped === "1") return;
        const text = enElement.textContent || "";
        if (!text.trim()) return;

        enElement.innerHTML = buildWordMarkup(text, savedIds);
        enElement.dataset.vocabWrapped = "1";
    }

    function updateSavedState(wordId, saved, root = document) {
        if (!wordId || !root?.querySelectorAll) return;
        const escapedId = String(wordId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        root.querySelectorAll(`[data-vocab-word="${escapedId}"]`).forEach((element) => {
            element.classList.toggle("glossx-vocab-saved", !!saved);
        });
    }

    function syncSavedStates(root = document) {
        if (!root?.querySelectorAll) return;
        const savedIds = new Set(Object.keys(vocabItems));
        root.querySelectorAll(".glossx-vocab-word").forEach((element) => {
            const id = normalizeWord(element.dataset.vocabWord);
            element.classList.toggle("glossx-vocab-saved", savedIds.has(id));
        });
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

    async function handleSave(payload) {
        try {
            let result = null;
            if (global.GlossX?.VocabStorage?.saveItem) {
                result = await global.GlossX.VocabStorage.saveItem(payload);
            } else {
                result = await browser.runtime.sendMessage({
                    type: "saveVocabItem",
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
            vocabItems[payload.id] = result.item;
            updateSavedState(payload.id, true);
            showToast("已加入生词本");
            return result;
        } catch (error) {
            showToast(error?.message || "保存失败");
            return { ok: false, error: error?.message || "保存失败" };
        }
    }

    async function handleRemove(vocabId) {
        try {
            let result = null;
            if (global.GlossX?.VocabStorage?.removeItem) {
                result = await global.GlossX.VocabStorage.removeItem(vocabId);
            } else {
                result = await browser.runtime.sendMessage({
                    type: "removeVocabItem",
                    payload: { id: vocabId }
                });
            }
            if (!result?.ok) {
                const TN = global.GlossX?.TextNormalize;
                showToast(TN?.resolveUiError
                    ? TN.resolveUiError(result?.error, "取消失败")
                    : (result?.error || "取消失败"));
                return result || { ok: false, error: "取消失败" };
            }
            delete vocabItems[vocabId];
            updateSavedState(vocabId, false);
            showToast("已移出生词本");
            return result;
        } catch (error) {
            showToast(error?.message || "取消失败");
            return { ok: false, error: error?.message || "取消失败" };
        }
    }

    function handleWordClick(event) {
        if (global.GlossX?.SnippetMarker?.hasRecentSelection?.()) return;

        const target = event.target.closest(".glossx-vocab-word");
        if (!target) return;

        event.preventDefault();
        event.stopPropagation();

        const word = target.dataset.vocabWord || target.textContent || "";
        const id = normalizeWord(word);
        if (!id || id.length < MIN_WORD_LENGTH) return;

        const now = Date.now();
        if (id === lastClickWord && now - lastClickTime < 300) {
            global.GlossX?.WordSavePanel?.hide(true);
            lastClickWord = "";
            return;
        }
        lastClickWord = id;
        lastClickTime = now;

        const savedItem = vocabItems[id];
        const saved = !!savedItem;

        global.GlossX?.WordSavePanel?.show(target, {
            id,
            word: target.textContent || word,
            lemma: savedItem?.lemma || "",
            phonetic: savedItem?.phonetic || "",
            pos: savedItem?.pos || "",
            definitions: savedItem?.definitions || [],
            usageExample: savedItem?.usageExample || savedItem?.extraExample || null,
            saved
        }, settings);
    }

    function handleDocumentClick(event) {
        if (event.target.closest(".glossx-word-save-panel")) return;
        if (event.target.closest(".glossx-snippet-save-panel")) return;
        if (!event.target.closest(".glossx-vocab-word")) {
            global.GlossX?.WordSavePanel?.hide(false);
        }
    }

    const VocabMarker = {
        init(currentSettings, items) {
            settings = currentSettings || {};
            vocabItems = items || {};

            if (!initialized) {
                initialized = true;
                document.addEventListener("click", handleWordClick, true);
                document.addEventListener("click", handleDocumentClick);
                global.GlossX?.WordSavePanel?.init({
                    onSave: handleSave,
                    onRemove: handleRemove
                });
            }
        },

        refresh(root) {
            if (!root?.querySelectorAll) return;

            const savedIds = new Set(Object.keys(vocabItems));
            root.querySelectorAll(".glossx-sentence-en").forEach((enElement) => {
                if (enElement.closest("[data-glossx-sentence-pending]")) return;
                wrapEnglishWords(enElement, savedIds);
            });
            syncSavedStates(root);
        },

        setVocabItems(items) {
            vocabItems = items || {};
        },

        updateSavedState,

        syncSavedStates,

        setSettings(currentSettings) {
            settings = currentSettings || {};
        }
    };

    global.GlossX = global.GlossX || {};
    global.GlossX.VocabMarker = VocabMarker;
})(typeof globalThis !== "undefined" ? globalThis : window);
