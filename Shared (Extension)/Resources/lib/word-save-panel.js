(function (global) {
    let panel = null;
    let hideTimer = null;
    let currentTarget = null;
    let onSave = null;
    let onRemove = null;
    let lookupToken = 0;

    function escapeHtml(text) {
        return String(text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function speak(text, pronunciation) {
        if (!("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = pronunciation === "uk" ? "en-GB" : "en-US";
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    }

    function ensurePanel() {
        if (panel) return panel;

        panel = document.createElement("div");
        panel.id = "glossx-word-save-panel";
        panel.className = "glossx-word-save-panel";
        panel.innerHTML = [
            '<div class="glossx-decode-header">',
            '    <div class="glossx-word-save-word"></div>',
            '    <button type="button" class="glossx-decode-speak" title="发音">🔊</button>',
            '</div>',
            '<div class="glossx-word-save-lemma"></div>',
            '<div class="glossx-word-save-phonetic"></div>',
            '<div class="glossx-word-save-translation">正在查询释义…</div>',
            '<div class="glossx-word-save-context-label">常用例句</div>',
            '<div class="glossx-word-save-context">正在生成例句…</div>',
            '<div class="glossx-word-save-actions">',
            '    <button type="button" class="glossx-word-save-btn" data-action="save">★ 加入生词本</button>',
            '</div>'
        ].join("");
        document.documentElement.appendChild(panel);

        panel.querySelector(".glossx-decode-speak").addEventListener("click", () => {
            const lemma = panel.dataset.lemma;
            const word = lemma || panel.dataset.currentWord;
            const pronunciation = panel.dataset.pronunciation || "us";
            if (word) speak(word, pronunciation);
        });

        panel.querySelector("[data-action='save']").addEventListener("click", async () => {
            const button = panel.querySelector("[data-action='save']");
            const vocabId = panel.dataset.vocabId;
            const isSaved = panel.dataset.saved === "1";

            button.disabled = true;
            try {
                if (isSaved && onRemove) {
                    const removeResult = await onRemove(vocabId);
                    if (!removeResult?.ok) return;
                    panel.dataset.saved = "0";
                    button.textContent = "★ 加入生词本";
                    button.classList.remove("glossx-word-save-btn-saved");
                } else if (!isSaved && onSave) {
                    const saveResult = await onSave({
                        id: vocabId,
                        word: panel.dataset.currentWord,
                        lemma: panel.dataset.lemma || "",
                        phonetic: panel.dataset.phonetic || "",
                        pos: panel.dataset.pos || "",
                        definitions: JSON.parse(panel.dataset.definitions || "[]"),
                        usageExample: JSON.parse(panel.dataset.usageExample || "null"),
                        preference: panel.dataset.pronunciation || "us"
                    });
                    if (!saveResult?.ok) return;
                    panel.dataset.saved = "1";
                    button.textContent = "已收藏";
                    button.classList.add("glossx-word-save-btn-saved");
                }
            } finally {
                button.disabled = false;
            }
        });

        panel.addEventListener("mouseenter", () => clearTimeout(hideTimer));
        panel.addEventListener("mouseleave", () => {
            WordSavePanel.hide(false);
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                WordSavePanel.hide(true);
            }
        });

        return panel;
    }

    function positionPanel(target) {
        const rect = target.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        let top = rect.bottom + window.scrollY + 8;
        let leading = rect.left + window.scrollX;

        if (leading + panelRect.width > window.innerWidth - 12) {
            leading = window.innerWidth - panelRect.width - 12;
        }
        if (top + panelRect.height > window.scrollY + window.innerHeight - 12) {
            top = rect.top + window.scrollY - panelRect.height - 8;
        }

        panel.style.top = `${Math.max(window.scrollY + 8, top)}px`;
        panel.style.insetInlineStart = `${Math.max(8, leading)}px`;
    }

    function renderLemma(surface, lemma) {
        const lemmaEl = panel.querySelector(".glossx-word-save-lemma");
        if (!lemmaEl) return;

        const surfaceNorm = String(surface || "").trim();
        const lemmaNorm = String(lemma || "").trim();
        const same = !lemmaNorm
            || lemmaNorm.toLowerCase() === surfaceNorm.toLowerCase();

        panel.dataset.lemma = same ? "" : lemmaNorm;
        if (same) {
            lemmaEl.textContent = "";
            lemmaEl.classList.add("hidden");
            return;
        }

        lemmaEl.classList.remove("hidden");
        lemmaEl.textContent = "原形：" + lemmaNorm;
    }

    function renderExample(example) {
        const contextEl = panel.querySelector(".glossx-word-save-context");
        if (!example?.english) {
            contextEl.innerHTML = '<div class="glossx-word-save-context-cn">暂无常用例句</div>';
            return;
        }
        contextEl.innerHTML = [
            `<div class="glossx-word-save-context-en">"${escapeHtml(example.english)}"</div>`,
            example.chinese
                ? `<div class="glossx-word-save-context-cn">${escapeHtml(example.chinese)}</div>`
                : ""
        ].join("");
    }

    function applyLookupResult(data, options = {}) {
        const TN = global.GlossX?.TextNormalize;
        // AI path: OpenCC + reject clear mojibake only.
        const definitions = TN?.normalizeDefinitionsFromAi
            ? TN.normalizeDefinitionsFromAi(data.definitions || [])
            : (data.definitions || []).map((item) => String(item || "").trim()).filter(Boolean);
        const example = TN?.normalizeExample
            ? TN.normalizeExample(data.example)
            : (data.example?.english
                ? {
                    english: String(data.example.english || "").trim(),
                    chinese: String(data.example.chinese || "").trim()
                }
                : null);
        const phonetic = String(data.phonetic || "").trim();
        const pos = String(data.pos || "").trim();
        const lemma = String(data.lemma || "").trim();
        const safeError = TN?.resolveUiError
            ? TN.resolveUiError(options.errorText, "暂无释义")
            : (options.errorText || "暂无释义");
        const translation = definitions.length
            ? definitions.join("；")
            : (options.loadingDefs ? "正在查询释义…" : safeError);

        panel.dataset.phonetic = phonetic;
        panel.dataset.pos = pos;
        panel.dataset.definitions = JSON.stringify(definitions);
        panel.dataset.usageExample = JSON.stringify(example || null);

        renderLemma(panel.dataset.currentWord, lemma);
        panel.querySelector(".glossx-word-save-phonetic").textContent = [
            phonetic,
            pos ? `${pos}.` : ""
        ].filter(Boolean).join("  ");
        panel.querySelector(".glossx-word-save-translation").textContent = translation;
        if (example?.english) {
            renderExample(example);
        } else if (options.loadingExample) {
            panel.querySelector(".glossx-word-save-context").textContent = "正在生成例句…";
        } else {
            renderExample(null);
        }
        return { definitions, example, lemma };
    }

    const WordSavePanel = {
        init(handlers) {
            onSave = handlers?.onSave || null;
            onRemove = handlers?.onRemove || null;
            ensurePanel();
        },

        show(target, data, settings) {
            if (!target || !data?.word) return;
            ensurePanel();
            clearTimeout(hideTimer);
            currentTarget = target;
            lookupToken += 1;
            const token = lookupToken;

            panel.dataset.vocabId = data.id;
            panel.dataset.currentWord = data.word;
            panel.dataset.pronunciation = settings?.pronunciation || "us";
            panel.dataset.saved = data.saved ? "1" : "0";

            panel.querySelector(".glossx-word-save-word").textContent = data.word;

            // Always normalize first — never paste raw Traditional / mojibake onto UI.
            const initial = applyLookupResult({
                lemma: data.lemma || "",
                phonetic: data.phonetic || "",
                pos: data.pos || "",
                definitions: data.definitions || [],
                example: data.usageExample || null
            }, {
                loadingDefs: !data.definitions?.length,
                loadingExample: !data.usageExample?.english
            });

            const hasLemma = !!(initial.lemma
                && String(initial.lemma).toLowerCase() !== String(data.word || "").toLowerCase());
            const needsDefs = !initial.definitions.length;
            const needsExample = !initial.example?.english || !initial.example?.chinese;

            const button = panel.querySelector("[data-action='save']");
            button.textContent = data.saved ? "已收藏" : "★ 加入生词本";
            button.classList.toggle("glossx-word-save-btn-saved", !!data.saved);

            panel.classList.add("visible");
            positionPanel(target);

            if (!needsDefs && !needsExample && hasLemma) return;

            const lookupPayload = {
                word: data.word,
                preference: settings?.pronunciation || "us"
            };

            const runLookup = global.GlossX?.AIClient?.lookupVocabWord
                ? () => global.GlossX.AIClient.lookupVocabWord(lookupPayload)
                : () => browser.runtime.sendMessage({
                    type: "lookupVocabWord",
                    payload: lookupPayload
                });

            runLookup().then((result) => {
                if (token !== lookupToken) return;
                if (!result?.ok) {
                    applyLookupResult({
                        lemma: result?.lemma || data.lemma || "",
                        phonetic: result?.phonetic || data.phonetic || "",
                        pos: result?.pos || data.pos || "",
                        definitions: result?.definitions || [],
                        example: result?.example || data.usageExample || null
                    }, {
                        errorText: result?.error || "vocab_ai_gloss_empty"
                    });
                    positionPanel(target);
                    return;
                }
                applyLookupResult({
                    lemma: result.lemma || data.lemma || "",
                    phonetic: result.phonetic || data.phonetic || "",
                    pos: result.pos || data.pos || "",
                    definitions: result.definitions?.length
                        ? result.definitions
                        : (data.definitions || []),
                    example: result.example || data.usageExample || null
                });
                positionPanel(target);
            }).catch((error) => {
                if (token !== lookupToken) return;
                applyLookupResult({
                    lemma: data.lemma || "",
                    phonetic: data.phonetic || "",
                    pos: data.pos || "",
                    definitions: data.definitions || [],
                    example: data.usageExample || null
                }, {
                    errorText: "vocab_lookup_failed"
                });
            });
        },

        hide(force) {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                if (!panel) return;
                panel.classList.remove("visible");
                currentTarget = null;
            }, force ? 0 : 120);
        }
    };

    global.GlossX = global.GlossX || {};
    global.GlossX.WordSavePanel = WordSavePanel;
})(typeof globalThis !== "undefined" ? globalThis : window);
