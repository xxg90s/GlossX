(function (global) {
    const PANEL_VERSION = "2";
    const TRANSLATE_TIMEOUT_MS = 24000;
    const TRANSLATE_LOADING_TEXT = "正在翻译…";
    const TRANSLATE_RETRY_TEXT = "翻译超时，点击重试";
    let panel = null;
    let hideTimer = null;
    let onSave = null;
    let onRemove = null;
    let onUpdateTranslation = null;
    let lookupToken = 0;
    let isTranslating = false;
    let listenersBound = false;
    let pendingHide = false;
    let lastRequest = null;
    let pendingTranslation = null;

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

    function destroyPanel() {
        if (panel) {
            panel.remove();
            panel = null;
        }
    }

    function ensurePanel() {
        if (panel && panel.dataset.panelVersion !== PANEL_VERSION) {
            destroyPanel();
        }
        if (panel) return panel;

        panel = document.createElement("div");
        panel.id = "glossx-snippet-save-panel";
        panel.className = "glossx-snippet-save-panel";
        panel.dataset.panelVersion = PANEL_VERSION;
        panel.innerHTML = [
            '<div class="glossx-decode-header">',
            '    <div class="glossx-snippet-save-text"></div>',
            '    <button type="button" class="glossx-decode-speak" title="发音">🔊</button>',
            '</div>',
            '<div class="glossx-snippet-type-badge"></div>',
            '<div class="glossx-snippet-save-context-label">释义</div>',
            '<div class="glossx-snippet-save-translation"></div>',
            '<div class="glossx-snippet-save-context-label">原句</div>',
            '<div class="glossx-snippet-save-context"></div>',
            '<div class="glossx-snippet-save-source"></div>',
            '<div class="glossx-snippet-save-actions">',
            '    <button type="button" class="glossx-snippet-save-btn" data-action="save">★ 加入句库</button>',
            '</div>'
        ].join("");
        document.documentElement.appendChild(panel);

        panel.querySelector(".glossx-decode-speak").addEventListener("click", () => {
            const text = panel.dataset.currentText;
            const pronunciation = panel.dataset.pronunciation || "us";
            if (text) speak(text, pronunciation);
        });

        panel.querySelector("[data-action='save']").addEventListener("click", async () => {
            const button = panel.querySelector("[data-action='save']");
            const snippetId = panel.dataset.snippetId;
            const isSaved = panel.dataset.saved === "1";

            button.disabled = true;
            try {
                if (isSaved && onRemove) {
                    const removeResult = await onRemove(snippetId);
                    if (!removeResult?.ok) return;
                    panel.dataset.saved = "0";
                    panel.dataset.snippetId = "";
                    button.textContent = "★ 加入句库";
                    button.classList.remove("glossx-snippet-save-btn-saved");
                } else if (!isSaved && onSave) {
                    const text = panel.dataset.currentText;
                    const translation = panel.dataset.translation || "";
                    const hasTranslation = isRealTranslation(translation);
                    const inflight = !hasTranslation && pendingTranslation?.text === text
                        ? pendingTranslation.promise
                        : null;
                    const saveResult = await onSave({
                        text,
                        context: JSON.parse(panel.dataset.context || "{}"),
                        translation: hasTranslation ? translation : undefined,
                        type: panel.dataset.snippetType || "phrase",
                        preference: panel.dataset.pronunciation || "us",
                        skipLookup: hasTranslation || !!inflight
                    });
                    if (!saveResult?.ok) return;
                    panel.dataset.saved = "1";
                    if (saveResult.item?.id) {
                        panel.dataset.snippetId = saveResult.item.id;
                        if (inflight && !saveResult.item.translation) {
                            backfillTranslation(saveResult.item.id, inflight);
                        }
                    }
                    if (saveResult.item?.translation) {
                        renderTranslation(String(saveResult.item.translation), true);
                    }
                    button.textContent = "已收藏";
                    button.classList.add("glossx-snippet-save-btn-saved");
                }
            } finally {
                button.disabled = false;
            }
        });

        const translationEl = panel.querySelector(".glossx-snippet-save-translation");
        translationEl.addEventListener("click", () => {
            if (!translationEl.classList.contains("glossx-snippet-save-translation-retry")) return;
            retryTranslation();
        });

        panel.addEventListener("mouseenter", () => clearTimeout(hideTimer));
        panel.addEventListener("mouseleave", () => SnippetSavePanel.hide(false));

        return panel;
    }

    function isVisible() {
        return !!panel && panel.classList.contains("visible");
    }

    function bindGlobalListeners() {
        if (listenersBound) return;
        listenersBound = true;
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                SnippetSavePanel.hide(true);
            }
        });
        // Capture phase so page scripts that stop propagation cannot trap the panel open.
        document.addEventListener("mousedown", (event) => {
            if (!isVisible()) return;
            if (event.target?.closest?.(".glossx-snippet-save-panel")) return;
            SnippetSavePanel.hide(true);
        }, true);
    }

    function isRealTranslation(value) {
        const text = String(value || "").trim();
        return !!text
            && text !== "—"
            && text !== "暂无释义"
            && text !== TRANSLATE_LOADING_TEXT
            && text !== TRANSLATE_RETRY_TEXT;
    }

    function positionPanel(anchorRect) {
        if (!panel || !anchorRect) return;

        const panelRect = panel.getBoundingClientRect();
        let top = anchorRect.bottom + 8;
        let leading = anchorRect.left;

        if (leading + panelRect.width > window.innerWidth - 12) {
            leading = window.innerWidth - panelRect.width - 12;
        }
        if (top + panelRect.height > window.innerHeight - 12) {
            top = anchorRect.top - panelRect.height - 8;
        }

        panel.style.top = `${Math.max(8, top)}px`;
        panel.style.insetInlineStart = `${Math.max(8, leading)}px`;
    }

    function renderTypeBadge(type) {
        const badgeEl = panel.querySelector(".glossx-snippet-type-badge");
        if (!badgeEl) return;

        const isPhrase = type === "phrase";
        badgeEl.textContent = isPhrase ? "短语" : "整句";
        badgeEl.classList.toggle("glossx-snippet-type-phrase", isPhrase);
        badgeEl.classList.toggle("glossx-snippet-type-sentence", !isPhrase);
    }

    function renderContext(context) {
        const contextEl = panel.querySelector(".glossx-snippet-save-context");
        if (!contextEl) return;

        const english = String(context?.fullEnglish || "").trim();
        const chinese = String(context?.fullChinese || "").trim();

        if (!english && !chinese) {
            contextEl.innerHTML = `<div class="glossx-snippet-save-context-cn">—</div>`;
            return;
        }

        contextEl.innerHTML = [
            english
                ? `<div class="glossx-snippet-save-context-en">"${escapeHtml(english)}"</div>`
                : "",
            chinese
                ? `<div class="glossx-snippet-save-context-cn">${escapeHtml(chinese)}</div>`
                : ""
        ].join("");
    }

    function renderTranslation(text, persist, retryable) {
        const translationEl = panel?.querySelector(".glossx-snippet-save-translation");
        if (!translationEl) return;
        translationEl.textContent = text;
        translationEl.classList.toggle("glossx-snippet-save-translation-retry", !!retryable);
        if (persist) {
            panel.dataset.translation = text;
        }
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

    function fetchTranslation({ text, context, type, preference, token }) {
        isTranslating = true;
        lastRequest = { text, context, type, preference };
        const payload = { text, context, type, preference };
        const runTranslate = () => {
            if (global.GlossX?.AIClient?.translateSnippet) {
                return global.GlossX.AIClient.translateSnippet(payload);
            }
            return browser.runtime.sendMessage({
                type: "translateSnippet",
                payload
            });
        };

        // Resolves to the translation text, or "" on failure, regardless of whether
        // the panel has moved on — a saved snippet may still be waiting for it.
        const promise = withTimeout(runTranslate(), TRANSLATE_TIMEOUT_MS)
            .then((result) => {
                const translation = result?.ok && result.translation
                    ? String(result.translation).trim()
                    : "";
                if (token !== lookupToken) return translation;
                if (translation) {
                    renderTranslation(translation, true);
                } else {
                    const errorText = String(result?.error || "AI 翻译失败").trim();
                    renderTranslation(errorText, false, true);
                }
                return translation;
            })
            .catch((error) => {
                console.warn("[GlossX] Snippet translation failed:", error);
                if (token !== lookupToken) return "";
                const timedOut = error?.message === "snippet_translate_timeout";
                renderTranslation(timedOut ? TRANSLATE_RETRY_TEXT : "暂无释义", false, timedOut);
                return "";
            })
            .finally(() => {
                if (token !== lookupToken) return;
                isTranslating = false;
                positionPanel(panel?._anchorRect);
                if (pendingHide) {
                    pendingHide = false;
                    SnippetSavePanel.hide(true);
                }
            });
        pendingTranslation = { text, promise };
        return promise;
    }

    function backfillTranslation(snippetId, translationPromise) {
        if (!snippetId || !onUpdateTranslation) return;
        Promise.resolve(translationPromise).then((translation) => {
            if (!isRealTranslation(translation)) return;
            return onUpdateTranslation(snippetId, translation);
        }).catch((error) => {
            console.warn("[GlossX] Snippet translation backfill failed:", error);
        });
    }

    function retryTranslation() {
        if (!lastRequest || isTranslating) return;
        lookupToken += 1;
        renderTranslation(TRANSLATE_LOADING_TEXT, false);
        const promise = fetchTranslation({ ...lastRequest, token: lookupToken });
        if (panel?.dataset.saved === "1") {
            backfillTranslation(panel.dataset.snippetId, promise);
        }
    }

    const SnippetSavePanel = {
        init(handlers) {
            onSave = handlers?.onSave || null;
            onRemove = handlers?.onRemove || null;
            onUpdateTranslation = handlers?.onUpdateTranslation || null;
            bindGlobalListeners();
            ensurePanel();
        },

        show(options) {
            const {
                text,
                type,
                context,
                anchorRect,
                saved,
                snippetId,
                pronunciation
            } = options || {};

            if (!text || !anchorRect) return;
            ensurePanel();
            clearTimeout(hideTimer);
            pendingHide = false;
            lookupToken += 1;
            const token = lookupToken;
            panel._anchorRect = anchorRect;

            const rawTranslation = String(options?.translation || "").trim();
            const savedTranslation = rawTranslation && rawTranslation !== "—" ? rawTranslation : "";
            const snippetType = type || "phrase";
            const utils = global.GlossX?.SnippetUtils;
            const contextTranslation = utils?.resolveTranslationFromContext
                ? utils.resolveTranslationFromContext(text, context, snippetType)
                : null;
            const needsTranslation = !savedTranslation && !contextTranslation;

            panel.dataset.currentText = text;
            panel.dataset.context = JSON.stringify(context || {});
            panel.dataset.translation = savedTranslation || "";
            panel.dataset.snippetId = snippetId || "";
            panel.dataset.pronunciation = pronunciation || "us";
            panel.dataset.snippetType = snippetType;
            panel.dataset.saved = saved ? "1" : "0";

            panel.querySelector(".glossx-snippet-save-text").textContent = text;
            renderTypeBadge(snippetType);

            if (savedTranslation) {
                renderTranslation(savedTranslation, true);
            } else if (contextTranslation) {
                renderTranslation(contextTranslation, true);
            } else {
                renderTranslation(TRANSLATE_LOADING_TEXT, false);
            }

            renderContext(context);

            const hostname = String(context?.hostname || "").trim();
            panel.querySelector(".glossx-snippet-save-source").textContent = hostname
                ? "来源：" + hostname
                : "";

            const button = panel.querySelector("[data-action='save']");
            button.textContent = saved ? "已收藏" : "★ 加入句库";
            button.classList.toggle("glossx-snippet-save-btn-saved", !!saved);

            panel.classList.add("visible");
            positionPanel(anchorRect);

            if (needsTranslation) {
                const promise = fetchTranslation({
                    text,
                    context,
                    type: snippetType,
                    preference: pronunciation || "us",
                    token
                });
                if (saved) backfillTranslation(snippetId, promise);
            } else {
                isTranslating = false;
                if (saved && !savedTranslation) {
                    backfillTranslation(snippetId, contextTranslation);
                }
            }
        },

        hide(force) {
            clearTimeout(hideTimer);

            if (force) {
                pendingHide = false;
                // Invalidate the in-flight translation so its callbacks cannot revive the panel.
                lookupToken += 1;
                isTranslating = false;
                if (panel) panel.classList.remove("visible");
                return;
            }

            hideTimer = setTimeout(() => {
                if (!panel) return;
                if (isTranslating) {
                    pendingHide = true;
                    return;
                }
                panel.classList.remove("visible");
            }, 120);
        }
    };

    global.GlossX = global.GlossX || {};
    global.GlossX.SnippetSavePanel = SnippetSavePanel;
})(typeof globalThis !== "undefined" ? globalThis : window);
