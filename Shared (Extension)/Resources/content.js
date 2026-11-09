(function () {
    try {
        run();
    } catch (error) {
        console.error("[GlossX] Failed to start content script:", error);
    }

    function run() {
        const {
            Storage,
            Lexicon,
            SM2,
            Replacer,
            DecodePanel,
            FloatingControl,
            ParagraphTranslator,
            VocabMarker,
            SnippetMarker,
            SnippetStorage
        } = window.GlossX;
        if (!Storage || !Lexicon || !Replacer || !ParagraphTranslator) {
            throw new Error("GlossX modules failed to load");
        }

        let settings = null;
        let wordRecords = {};
        let vocabItems = {};
        let snippetItems = {};
        let pageEnabled = false;
        let observer = null;
        let contentWaitObserver = null;
        let refreshTimer = null;
        let pendingAddedNodes = [];
        let flushingAddedNodes = false;
        let hintBanner = null;
        let lastReplaceCount = 0;
        let lastParagraphCount = 0;
        let lastParagraphSettingsKey = "";

        const isWeixinArticle = /(^|\.)mp\.weixin\.qq\.com$/i.test(location.hostname);

        function getParagraphSettingsKey(currentSettings) {
            return [
                currentSettings?.paragraphModeEnabled,
                currentSettings?.paragraphRatio,
                currentSettings?.paragraphDisplayMode,
                currentSettings?.wordReplaceEnabled
            ].join("|");
        }

        function isSentenceModeEnabled(currentSettings) {
            return !!currentSettings?.paragraphModeEnabled;
        }

        function isWordReplaceEnabled(currentSettings) {
            return currentSettings?.wordReplaceEnabled !== false;
        }

        function isAnyReadingModeEnabled(currentSettings) {
            return isSentenceModeEnabled(currentSettings) || isWordReplaceEnabled(currentSettings);
        }

        function ensureHintBanner() {
            if (hintBanner) return hintBanner;
            hintBanner = document.createElement("div");
            hintBanner.id = "glossx-hint-banner";
            hintBanner.className = "glossx-hint-banner";
            document.documentElement.appendChild(hintBanner);
            return hintBanner;
        }

        function updateHintBanner() {
            const banner = ensureHintBanner();

            if (settings?.showPageAssist === false) {
                banner.classList.remove("visible");
                banner.textContent = "";
                return;
            }

            if (pageEnabled && lastReplaceCount === 0 && lastParagraphCount === 0) {
                if (settings?.paragraphModeEnabled && !isWordReplaceEnabled(settings)) {
                    banner.textContent = isWeixinArticle
                        ? "GlossX 语句英文化已启用，正在等待公众号正文并翻译语句…"
                        : "GlossX 语句英文化已启用，正在翻译选中语句…";
                } else if (isWeixinArticle) {
                    banner.textContent = "GlossX 已启用，正在等待公众号正文加载；若仍无效果请刷新页面。";
                } else {
                    banner.textContent = "GlossX 已启用，但未找到可替换内容，请刷新页面或调高替换密度/语句占比。";
                }
                banner.classList.add("visible");
                return;
            }

            if (pageEnabled && (lastReplaceCount > 0 || lastParagraphCount > 0)) {
                banner.classList.remove("visible");
                banner.textContent = "";
                return;
            }

            if (!settings?.globalEnabled) {
                const toolbarName = typeof browser.runtime.sendNativeMessage === "function"
                    ? "Safari 工具栏"
                    : "浏览器工具栏";
                banner.textContent = `GlossX：请在${toolbarName}打开扩展，开启总开关并启用当前网站。`;
            } else {
                banner.textContent = "GlossX：点击右下角圆点，或选择「加入白名单」以启用当前页面。";
            }
            banner.classList.add("visible");
        }

        function getProcessRoot() {
            if (isWeixinArticle) {
                const weixinContent = document.querySelector("#js_content, .rich_media_content");
                if (weixinContent && (weixinContent.textContent || "").trim().length > 0) {
                    return weixinContent;
                }
            }
            return document.body;
        }

        async function waitForContentRoot(maxMs = 30000) {
            if (!isWeixinArticle) return getProcessRoot();

            const started = Date.now();
            while (Date.now() - started < maxMs) {
                const root = getProcessRoot();
                if (root !== document.body || (root.textContent || "").trim().length > 50) {
                    return root;
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            return getProcessRoot();
        }

        async function ensureRecord(entry) {
            if (!wordRecords[entry.id]) {
                const initial = SM2.createInitialRecord(entry);
                wordRecords[entry.id] = await Storage.upsertWordRecord(entry.id, initial);
                await Storage.incrementStat("newWords");
            }
            return wordRecords[entry.id];
        }

        async function handleGrade(wordId, grade) {
            const record = wordRecords[wordId] || { wordId };
            const entry = Lexicon.getAllEntries().find((item) => item.id === wordId);
            const next = SM2.applyReview({
                ...record,
                ...(entry ? {
                    word: entry.en,
                    translation: entry.zh,
                    pos: entry.pos,
                    source: entry.lexicon
                } : {})
            }, grade);
            wordRecords[wordId] = await Storage.upsertWordRecord(wordId, next);
            if (grade === "review") {
                await Storage.incrementStat("reviews");
            }
        }

        async function processParagraphDocument(root, fullReset) {
            if (!pageEnabled || !root) return 0;

            if (!settings?.paragraphModeEnabled) {
                if (fullReset) {
                    ParagraphTranslator.restoreAll(document.body);
                    lastParagraphSettingsKey = "";
                    lastParagraphCount = 0;
                }
                return 0;
            }

            const settingsKey = getParagraphSettingsKey(settings);
            if (fullReset && settingsKey !== lastParagraphSettingsKey) {
                ParagraphTranslator.restoreAll(document.body);
                lastParagraphSettingsKey = settingsKey;
                lastParagraphCount = 0;
            }

            const count = await ParagraphTranslator.processRoot(root, { settings });
            lastParagraphCount = document.querySelectorAll("[data-glossx-sentence]").length;
            if (VocabMarker) {
                VocabMarker.setVocabItems(vocabItems);
                VocabMarker.setSettings(settings);
                VocabMarker.refresh(root);
            }
            if (SnippetMarker) {
                SnippetMarker.setSnippetItems(snippetItems);
                SnippetMarker.setSettings(settings);
                SnippetMarker.refresh(root);
            }
            updateHintBanner();
            return count;
        }

        async function processDocument(root, options = {}) {
            if (!pageEnabled || !root) return 0;

            if (!isAnyReadingModeEnabled(settings)) {
                Replacer.restoreAll(document.body);
                ParagraphTranslator.restoreAll(document.body);
                lastReplaceCount = 0;
                lastParagraphCount = 0;
                updateHintBanner();
                return 0;
            }

            const fullReset = options.fullReset === true;
            let wordCount = 0;

            if (!isWordReplaceEnabled(settings)) {
                Replacer.restoreAll(document.body);
            }

            await processParagraphDocument(root, fullReset);

            if (isWordReplaceEnabled(settings)) {
                wordCount = await Replacer.processRoot(root, {
                    Lexicon,
                    SM2,
                    Storage,
                    settings,
                    wordRecords,
                    onWordHover(target, entry, pin) {
                        DecodePanel.handleHover(target, entry, settings, pin);
                    },
                    async onWordReplaced(entry) {
                        await ensureRecord(entry);
                    }
                });
            }

            lastReplaceCount = wordCount;
            updateHintBanner();
            return wordCount + lastParagraphCount;
        }

        function isGlossXUiNode(node) {
            const element = node && node.nodeType === Node.ELEMENT_NODE
                ? node
                : node?.parentElement;
            if (!element?.closest) return false;
            return !!element.closest(
                ".glossx-snippet-save-panel, .glossx-word-save-panel, .glossx-decode-panel, "
                + ".glossx-hint-banner, .glossx-floating-control, .glossx-sentence, "
                + ".glossx-sentence-block, .glossx-sentence-en, .glossx-sentence-cn, "
                + ".glossx-word, .glossx-vocab-word, .glossx-vocab-toast, .glossx-snippet-saved"
            );
        }

        function enqueueAddedNodes(mutations) {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    pendingAddedNodes.push(node);
                }
            }
            scheduleAddedNodesFlush();
        }

        function scheduleAddedNodesFlush() {
            clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => {
                flushAddedNodes().catch((error) => {
                    console.warn("[GlossX] flushAddedNodes failed:", error);
                });
            }, 250);
        }

        async function flushAddedNodes() {
            if (flushingAddedNodes) return;

            const nodes = pendingAddedNodes;
            pendingAddedNodes = [];
            if (!nodes.length) return;

            flushingAddedNodes = true;
            try {
                const unique = [...new Set(nodes)];
                for (const node of unique) {
                    if (!pageEnabled) return;
                    if (isGlossXUiNode(node)) continue;
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        await processDocument(node);
                    } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
                        await processDocument(node.parentElement);
                    }
                }
            } finally {
                flushingAddedNodes = false;
                if (pendingAddedNodes.length && pageEnabled) {
                    scheduleAddedNodesFlush();
                }
            }
        }

        function startObserver() {
            if (observer) return;
            observer = new MutationObserver((mutations) => {
                enqueueAddedNodes(mutations);
            });

            const observeTarget = getProcessRoot() || document.body || document.documentElement;
            if (observeTarget) {
                observer.observe(observeTarget, { childList: true, subtree: true });
            }
        }

        function startContentWaitObserver() {
            if (!isWeixinArticle || contentWaitObserver) return;
            contentWaitObserver = new MutationObserver(async () => {
                if (!pageEnabled) return;
                const root = getProcessRoot();
                if (root !== document.body && (root.textContent || "").trim().length > 20) {
                    await processDocument(root);
                }
            });
            contentWaitObserver.observe(document.documentElement, { childList: true, subtree: true });
        }

        function stopObserver() {
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            if (contentWaitObserver) {
                contentWaitObserver.disconnect();
                contentWaitObserver = null;
            }
            pendingAddedNodes = [];
            clearTimeout(refreshTimer);
            refreshTimer = null;
        }

        async function refreshState() {
            settings = await Storage.getSettings();
            wordRecords = await Storage.getWordRecords();
            vocabItems = await Storage.getVocabItems();
            if (SnippetStorage?.getItems) {
                snippetItems = await SnippetStorage.getItems();
            } else {
                const snippetResult = await browser.storage.local.get("snippetItems");
                snippetItems = snippetResult.snippetItems || {};
            }

            if (isWordReplaceEnabled(settings)) {
                await Lexicon.load(settings.activeLexicons);
            } else if (isSentenceModeEnabled(settings)) {
                await Lexicon.load(settings.activeLexicons);
            }

            if (VocabMarker) {
                VocabMarker.init(settings, vocabItems);
            }
            if (SnippetMarker) {
                SnippetMarker.init(settings, snippetItems);
            }

            const siteEnabled = await Storage.isSiteEnabled(location.href);
            const hostname = Storage.hostnameFromUrl(location.href);
            pageEnabled = siteEnabled && !settings.pageDisabledHosts[hostname];
            const showAssist = settings.showPageAssist !== false;
            FloatingControl.setVisible(showAssist);
            if (showAssist) {
                FloatingControl.setActive(pageEnabled);
            }

            if (pageEnabled) {
                const root = await waitForContentRoot(isWeixinArticle ? 8000 : 0);
                await processDocument(root, { fullReset: true });
                startObserver();
                startContentWaitObserver();

                const shouldRetrySentence = isSentenceModeEnabled(settings)
                    && lastParagraphCount === 0
                    && (isWeixinArticle || !isWordReplaceEnabled(settings));

                if (shouldRetrySentence) {
                    setTimeout(async () => {
                        if (!pageEnabled) return;
                        await processDocument(getProcessRoot(), { fullReset: false });
                    }, 2000);
                    setTimeout(async () => {
                        if (!pageEnabled) return;
                        await processDocument(getProcessRoot(), { fullReset: false });
                    }, 5000);
                }
            } else {
                lastReplaceCount = 0;
                lastParagraphCount = 0;
                Replacer.restoreAll(document.body);
                ParagraphTranslator.restoreAll(document.body);
                stopObserver();
            }

            updateHintBanner();
        }

        async function addCurrentSiteToWhitelist() {
            const hostname = Storage.hostnameFromUrl(location.href);
            if (!hostname) return;
            const whitelist = new Set(settings.whitelist || []);
            whitelist.add(hostname);
            const disabled = { ...(settings.pageDisabledHosts || {}) };
            delete disabled[hostname];
            settings = await Storage.updateSettings({
                globalEnabled: true,
                whitelistMode: true,
                whitelist: [...whitelist],
                pageDisabledHosts: disabled
            });
            await refreshState();
        }

        async function toggleCurrentPage() {
            const siteEnabled = await Storage.isSiteEnabled(location.href);

            if (!settings.globalEnabled || !siteEnabled) {
                await addCurrentSiteToWhitelist();
                return;
            }

            const hostname = Storage.hostnameFromUrl(location.href);
            const disabled = { ...(settings.pageDisabledHosts || {}) };
            if (pageEnabled) {
                disabled[hostname] = true;
            } else {
                delete disabled[hostname];
            }
            settings = await Storage.updateSettings({ pageDisabledHosts: disabled });
            await refreshState();
        }

        DecodePanel.init(handleGrade);
        FloatingControl.init({
            onTogglePage: toggleCurrentPage,
            onAddWhitelist: addCurrentSiteToWhitelist,
            onOpenPopup: () => {
                if (browser.runtime.openOptionsPage) {
                    browser.runtime.openOptionsPage();
                }
            }
        });

        browser.storage.onChanged.addListener((changes, area) => {
            if (area !== "local") return;

            if (changes.settings || changes.wordRecords) {
                refreshState();
                return;
            }

            if (changes.vocabItems && VocabMarker) {
                vocabItems = changes.vocabItems.newValue || {};
                VocabMarker.setVocabItems(vocabItems);
                VocabMarker.syncSavedStates(document.body);
            }

            if (changes.snippetItems && SnippetMarker) {
                snippetItems = changes.snippetItems.newValue || {};
                SnippetMarker.setSnippetItems(snippetItems);
                SnippetMarker.refresh(document.body);
            }
        });

        browser.runtime.onMessage.addListener((message) => {
            if (message.type === "settingsUpdated" || message.type === "refreshContent") {
                refreshState();
            }
        });

        const boot = () => refreshState().catch((error) => {
            console.error("[GlossX] refreshState failed:", error);
        });

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", boot);
        } else {
            boot();
        }
    }
})();
