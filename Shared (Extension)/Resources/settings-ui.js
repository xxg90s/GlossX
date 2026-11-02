(function (global) {
    const LEXICON_LEVELS = [
        { id: "daily", name: "日常高频", desc: "基础常用词" },
        { id: "cet4", name: "大学英语四级", desc: "四级核心词汇" },
        { id: "cet6", name: "大学英语六级", desc: "六级进阶词汇" },
        { id: "kaoyan", name: "考研", desc: "学术与论述词汇" },
        { id: "ielts", name: "雅思", desc: "雅思常见主题词" },
        { id: "toefl", name: "托福", desc: "托福校园与学术词" }
    ];

    function bindSettingsUI(root, handlers) {
        const refs = {
            globalEnabled: root.querySelector("#global-enabled"),
            siteEnabled: root.querySelector("#site-enabled"),
            siteName: root.querySelector("#site-name"),
            siteToggleLabel: root.querySelector("#site-toggle-label"),
            lexiconLevels: root.querySelector("#lexicon-levels"),
            wordReplaceEnabled: root.querySelector("#word-replace-enabled"),
            density: root.querySelector("#density"),
            displayMode: root.querySelector("#display-mode"),
            paragraphModeEnabled: root.querySelector("#paragraph-mode-enabled"),
            paragraphRatio: root.querySelector("#paragraph-ratio"),
            paragraphDisplayMode: root.querySelector("#paragraph-display-mode"),
            paragraphAiHint: root.querySelector("#paragraph-ai-hint"),
            highlightColor: root.querySelector("#highlight-color"),
            highlightColorText: root.querySelector("#highlight-color-text"),
            highlightReset: root.querySelector("#highlight-reset"),
            pronunciation: root.querySelector("#pronunciation"),
            hoverAutoPlay: root.querySelector("#hover-auto-play"),
            showPageAssist: root.querySelector("#show-page-assist"),
            learningOpenMode: root.querySelector("#learning-open-mode"),
            aiEnabled: root.querySelector("#ai-enabled"),
            aiProvider: root.querySelector("#ai-provider"),
            aiModel: root.querySelector("#ai-model"),
            aiApiKey: root.querySelector("#ai-api-key"),
            aiSaveKey: root.querySelector("#ai-save-key"),
            aiKeyHint: root.querySelector("#ai-key-hint"),
            aiCustomFields: root.querySelector("#ai-custom-fields"),
            aiCustomBaseUrl: root.querySelector("#ai-custom-base-url"),
            aiCustomModel: root.querySelector("#ai-custom-model"),
            aiProfileName: root.querySelector("#ai-profile-name"),
            aiProfileSave: root.querySelector("#ai-profile-save"),
            aiProfileSelect: root.querySelector("#ai-profile-select"),
            aiProfileApply: root.querySelector("#ai-profile-apply"),
            aiProfileDelete: root.querySelector("#ai-profile-delete"),
            aiProfileHint: root.querySelector("#ai-profile-hint"),
            aiTest: root.querySelector("#ai-test"),
            aiTestResult: root.querySelector("#ai-test-result"),
            icloudSyncStatus: root.querySelector("#icloud-sync-status"),
            icloudSyncNow: root.querySelector("#icloud-sync-now"),
            icloudSectionHeading: root.querySelector("#icloud-section-heading"),
            icloudSyncHint: root.querySelector("#icloud-sync-hint"),
            learningOpenHint: root.querySelector("#learning-open-hint"),
            pageAssistHint: root.querySelector("#page-assist-hint"),
            optionsPrivacy: root.querySelector("#options-privacy"),
            libraryExport: root.querySelector("#library-export"),
            libraryImport: root.querySelector("#library-import"),
            libraryImportFile: root.querySelector("#library-import-file"),
            libraryTransferStatus: root.querySelector("#library-transfer-status")
        };

        let currentHostname = "";
        let providerCatalog = [];
        let aiState = null;
        let lastSettings = null;
        let aiProfiles = [];

        function renderLexiconLevels() {
            refs.lexiconLevels.innerHTML = LEXICON_LEVELS.map((level) => `
                <label class="lexicon-level-item">
                    <input type="checkbox" value="${level.id}">
                    <span class="lexicon-level-name">${level.name}</span>
                    <span class="lexicon-level-desc">${level.desc}</span>
                </label>
            `).join("");
        }

        function getSelectedLexicons() {
            return [...refs.lexiconLevels.querySelectorAll("input:checked")].map((item) => item.value);
        }

        function setSelectedLexicons(activeLexicons) {
            const active = new Set(activeLexicons || ["cet4"]);
            refs.lexiconLevels.querySelectorAll("input").forEach((item) => {
                item.checked = active.has(item.value);
            });
        }

        function normalizeDisplayMode(mode) {
            if (mode === "english_with_cn") return "en_then_cn";
            return mode || "english_only";
        }

        function getSelectedProvider() {
            return providerCatalog.find((item) => item.id === refs.aiProvider.value) || providerCatalog[0];
        }

        function getLocalProviderCatalog() {
            const list = global.GlossX?.AIProviders?.listProviders?.() || [];
            return list.map((provider) => ({
                id: provider.id,
                name: provider.name,
                defaultModel: provider.defaultModel,
                models: Array.isArray(provider.models) ? provider.models : [],
                keyPlaceholder: provider.keyPlaceholder || "输入 API Key"
            }));
        }

        function renderProviderOptions() {
            if (!refs.aiProvider) return;
            refs.aiProvider.innerHTML = providerCatalog
                .map((provider) => `<option value="${provider.id}">${provider.name}</option>`)
                .join("");
        }

        function renderModelOptions(providerId, selectedModel) {
            const provider = providerCatalog.find((item) => item.id === providerId);
            if (!provider || provider.id === "custom") {
                refs.aiModel.innerHTML = `<option value="">自定义模型</option>`;
                refs.aiModel.value = "";
                return;
            }

            refs.aiModel.innerHTML = provider.models
                .map((model) => `<option value="${model}">${model}</option>`)
                .join("");

            refs.aiModel.value = selectedModel || provider.defaultModel || provider.models[0] || "";
        }

        function updateCustomFieldsVisibility() {
            const isCustom = refs.aiProvider.value === "custom";
            refs.aiCustomFields.classList.toggle("hidden", !isCustom);
            refs.aiModel.disabled = isCustom;
        }

        function updateKeyHint() {
            const providerId = refs.aiProvider.value;
            const provider = getSelectedProvider();
            const configured = aiState?.configured?.[providerId];
            const hint = aiState?.hints?.[providerId];

            refs.aiApiKey.placeholder = provider?.keyPlaceholder || "输入 API Key";
            refs.aiKeyHint.textContent = configured
                ? `已保存：${hint}`
                : "未配置 API Key";
            refs.aiApiKey.value = "";
            updateParagraphAiHint();
        }

        function syncHighlightInputs(color) {
            const value = color || "";
            refs.highlightColorText.value = value;
            if (/^#[0-9a-fA-F]{6}$/.test(value)) {
                refs.highlightColor.value = value;
            }
        }

        function updateParagraphAiHint() {
            if (!refs.paragraphAiHint || !lastSettings) return;
            const providerId = lastSettings.aiProvider || "deepseek";
            const configured = !!aiState?.configured?.[providerId];
            refs.paragraphAiHint.textContent = configured
                ? "已配置 AI，语句将优先使用 AI 翻译为地道英文。"
                : "未配置 AI Key，将使用备用翻译；配置 AI 可获得更地道译文。";
        }

        function setProfileHint(message, kind) {
            if (!refs.aiProfileHint) return;
            refs.aiProfileHint.textContent = message || "";
            refs.aiProfileHint.classList.toggle("success", kind === "success");
            refs.aiProfileHint.classList.toggle("error", kind === "error");
        }

        function providerLabel(providerId) {
            const provider = providerCatalog.find((item) => item.id === providerId);
            return provider?.name || providerId || "未知服务商";
        }

        function escapeHtml(value) {
            return String(value || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;");
        }

        function profileOptionLabel(profile) {
            const model = profile.provider === "custom"
                ? (profile.customModel || "自定义模型")
                : (profile.model || "未选模型");
            return `${profile.name} · ${providerLabel(profile.provider)} · ${model}`;
        }

        function renderProfileOptions(selectedId) {
            if (!refs.aiProfileSelect) return;
            const options = ['<option value="">选择已保存配置…</option>']
                .concat(
                    aiProfiles.map((profile) =>
                        `<option value="${escapeHtml(profile.id)}">${escapeHtml(profileOptionLabel(profile))}</option>`
                    )
                );
            refs.aiProfileSelect.innerHTML = options.join("");
            if (selectedId && aiProfiles.some((item) => item.id === selectedId)) {
                refs.aiProfileSelect.value = selectedId;
            }
        }

        async function loadAiProfiles(selectedId) {
            if (!refs.aiProfileSelect) return;
            try {
                const api = global.GlossX?.AIProfiles;
                if (api?.getProfiles && api?.listForUi) {
                    const profiles = await api.getProfiles();
                    aiProfiles = api.listForUi(profiles);
                } else {
                    const response = await browser.runtime.sendMessage({ type: "getAiProviderProfiles" });
                    aiProfiles = response?.profiles || [];
                }
            } catch (error) {
                console.warn("[GlossX] loadAiProfiles failed:", error);
                aiProfiles = [];
            }
            renderProfileOptions(selectedId);
        }

        async function loadStateFromStorage() {
            const local = await browser.storage.local.get(["settings", "aiKeys"]);
            const settings = local.settings || {};
            const aiKeys = local.aiKeys || {};
            const api = global.GlossX?.AIProfiles;
            return {
                settings,
                hostname: "",
                siteEnabled: false,
                aiState: api?.buildAiState?.(aiKeys) || { configured: {}, hints: {} },
                stats: {}
            };
        }

        function collectCurrentAiConfig() {
            const providerId = refs.aiProvider.value;
            return {
                provider: providerId,
                model: refs.aiModel.value,
                customBaseUrl: refs.aiCustomBaseUrl.value.trim(),
                customModel: refs.aiCustomModel.value.trim(),
                apiKey: refs.aiApiKey.value.trim()
            };
        }

        async function resolveApiKeyForTest(providerId, inlineKey) {
            if (inlineKey) return inlineKey;
            try {
                const stored = await browser.storage.local.get("aiKeys");
                return stored?.aiKeys?.[providerId] || "";
            } catch (error) {
                console.warn("[GlossX] read aiKeys failed:", error);
                return "";
            }
        }

        async function testAiConnectionInPage(payload) {
            const settings = {
                aiProvider: payload.settings?.aiProvider || "deepseek",
                aiModel: payload.settings?.aiModel || "",
                aiCustomBaseUrl: payload.settings?.aiCustomBaseUrl || "",
                aiCustomModel: payload.settings?.aiCustomModel || ""
            };
            const apiKey = await resolveApiKeyForTest(settings.aiProvider, payload.apiKey || "");
            if (!apiKey) {
                return { ok: false, message: "请先填写或保存 API Key" };
            }

            const endpoint = global.GlossX?.AIProviders?.resolveEndpoint?.(settings);
            if (!endpoint?.baseUrl || !endpoint?.model) {
                return { ok: false, message: "请配置模型接口地址和模型名称" };
            }

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            const isAnthropic = endpoint.apiStyle === "anthropic";
            const prompt = 'Reply ONLY JSON: {"status":"ok"}';

            try {
                const response = await fetch(endpoint.baseUrl, {
                    method: "POST",
                    signal: controller.signal,
                    headers: isAnthropic
                        ? {
                            "Content-Type": "application/json; charset=utf-8",
                            "x-api-key": apiKey,
                            "anthropic-version": "2023-06-01"
                        }
                        : {
                            "Content-Type": "application/json; charset=utf-8",
                            Accept: "application/json; charset=utf-8",
                            Authorization: `Bearer ${apiKey}`
                        },
                    body: JSON.stringify(
                        isAnthropic
                            ? {
                                model: endpoint.model,
                                max_tokens: 64,
                                temperature: 0.1,
                                messages: [{ role: "user", content: prompt }]
                            }
                            : {
                                model: endpoint.model,
                                temperature: 0.1,
                                messages: [
                                    { role: "system", content: "Reply with valid JSON only." },
                                    { role: "user", content: prompt }
                                ]
                            }
                    )
                });

                if (!response.ok) {
                    let detail = "";
                    try {
                        detail = (await response.text()).trim().slice(0, 180);
                    } catch {
                        detail = "";
                    }
                    return {
                        ok: false,
                        message: detail || `HTTP ${response.status}`
                    };
                }

                return { ok: true, message: "连接成功" };
            } catch (error) {
                if (error?.name === "AbortError") {
                    return { ok: false, message: "连接超时，请检查网络或 API Key" };
                }
                return { ok: false, message: error?.message || "连接失败" };
            } finally {
                clearTimeout(timer);
            }
        }

        async function loadState() {
            let state = null;
            try {
                state = await browser.runtime.sendMessage({ type: "getState" });
            } catch (error) {
                console.warn("[GlossX] getState failed, fallback to storage:", error);
            }
            if (!state?.settings) {
                state = await loadStateFromStorage();
            }

            currentHostname = state.hostname || "";
            lastSettings = state.settings;
            if (state.aiState) {
                aiState = state.aiState;
            } else if (global.GlossX?.AIProfiles?.getAiKeys) {
                const aiKeys = await global.GlossX.AIProfiles.getAiKeys();
                aiState = global.GlossX.AIProfiles.buildAiState(aiKeys);
            } else {
                aiState = { configured: {}, hints: {} };
            }

            refs.globalEnabled.checked = !!state.settings.globalEnabled;
            refs.siteEnabled.checked = !!state.siteEnabled;
            refs.siteEnabled.disabled = !currentHostname;
            refs.siteName.textContent = currentHostname
                ? `当前站点：${currentHostname}`
                : "未检测到网页标签，请先打开一个网站后再回到此页";
            refs.siteToggleLabel.textContent = currentHostname
                ? `白名单：${currentHostname}`
                : "当前站点白名单";

            setSelectedLexicons(state.settings.activeLexicons);
            if (refs.wordReplaceEnabled) {
                refs.wordReplaceEnabled.checked = state.settings.wordReplaceEnabled !== false;
            }
            refs.density.value = state.settings.replaceDensity || "medium";
            refs.displayMode.value = normalizeDisplayMode(state.settings.displayMode);
            if (refs.paragraphModeEnabled) {
                refs.paragraphModeEnabled.checked = !!state.settings.paragraphModeEnabled;
            }
            if (refs.paragraphRatio) {
                refs.paragraphRatio.value = state.settings.paragraphRatio || "low";
            }
            if (refs.paragraphDisplayMode) {
                refs.paragraphDisplayMode.value = normalizeDisplayMode(
                    state.settings.paragraphDisplayMode || "en_then_cn"
                );
            }
            updateParagraphAiHint();
            syncHighlightInputs(state.settings.highlightColor || "");
            refs.pronunciation.value = state.settings.pronunciation || "us";
            refs.hoverAutoPlay.checked = !!state.settings.hoverAutoPlay;
            refs.showPageAssist.checked = state.settings.showPageAssist !== false;
            if (refs.learningOpenMode) {
                refs.learningOpenMode.value = state.settings.learningOpenMode === "window"
                    ? "window"
                    : "tab";
            }

            refs.aiEnabled.checked = !!state.settings.aiEnabled;
            refs.aiProvider.value = state.settings.aiProvider || "deepseek";
            renderModelOptions(refs.aiProvider.value, state.settings.aiModel);
            refs.aiCustomBaseUrl.value = state.settings.aiCustomBaseUrl || "";
            refs.aiCustomModel.value = state.settings.aiCustomModel || "";
            updateCustomFieldsVisibility();
            updateKeyHint();
            refs.aiTestResult.textContent = "";
            await loadAiProfiles(refs.aiProfileSelect?.value || "");
        }

        async function updateSettings(payload) {
            const local = await browser.storage.local.get("settings");
            const next = { ...(local.settings || {}), ...(lastSettings || {}), ...payload };
            await browser.storage.local.set({ settings: next });
            lastSettings = next;

            // Best-effort notify background/tabs; storage.onChanged already refreshes pages.
            try {
                await browser.runtime.sendMessage({ type: "updateSettings", payload });
            } catch (error) {
                console.warn("[GlossX] updateSettings notify failed:", error);
            }

            updateParagraphAiHint();
            if (handlers.onSettingsChanged) await handlers.onSettingsChanged();
        }

        refs.globalEnabled.addEventListener("change", async () => {
            await browser.runtime.sendMessage({ type: "toggleGlobal" });
            await loadState();
        });

        refs.siteEnabled.addEventListener("change", async () => {
            if (!currentHostname) return;
            await browser.runtime.sendMessage({
                type: "toggleCurrentSite",
                hostname: currentHostname
            });
            await loadState();
        });

        refs.lexiconLevels.addEventListener("change", async () => {
            const selected = getSelectedLexicons();
            if (!selected.length) {
                setSelectedLexicons(["cet4"]);
                return;
            }
            await updateSettings({ activeLexicons: selected });
        });

        refs.density.addEventListener("change", async () => {
            await updateSettings({ replaceDensity: refs.density.value });
        });

        if (refs.wordReplaceEnabled) {
            refs.wordReplaceEnabled.addEventListener("change", async () => {
                await updateSettings({ wordReplaceEnabled: refs.wordReplaceEnabled.checked });
            });
        }

        refs.displayMode.addEventListener("change", async () => {
            await updateSettings({ displayMode: refs.displayMode.value });
        });

        if (refs.paragraphModeEnabled) {
            refs.paragraphModeEnabled.addEventListener("change", async () => {
                await updateSettings({ paragraphModeEnabled: refs.paragraphModeEnabled.checked });
            });
        }

        if (refs.paragraphRatio) {
            refs.paragraphRatio.addEventListener("change", async () => {
                await updateSettings({ paragraphRatio: refs.paragraphRatio.value });
            });
        }

        if (refs.paragraphDisplayMode) {
            refs.paragraphDisplayMode.addEventListener("change", async () => {
                await updateSettings({ paragraphDisplayMode: refs.paragraphDisplayMode.value });
            });
        }

        refs.highlightColor.addEventListener("input", async () => {
            const color = refs.highlightColor.value;
            syncHighlightInputs(color);
            await updateSettings({ highlightColor: color });
        });

        refs.highlightColorText.addEventListener("change", async () => {
            const raw = refs.highlightColorText.value.trim();
            if (!raw) {
                await updateSettings({ highlightColor: "" });
                return;
            }
            const color = raw.startsWith("#") ? raw : `#${raw}`;
            if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
            syncHighlightInputs(color);
            await updateSettings({ highlightColor: color });
        });

        refs.highlightReset.addEventListener("click", async () => {
            syncHighlightInputs("");
            await updateSettings({ highlightColor: "" });
        });

        refs.pronunciation.addEventListener("change", async () => {
            await updateSettings({ pronunciation: refs.pronunciation.value });
        });

        refs.hoverAutoPlay.addEventListener("change", async () => {
            await updateSettings({ hoverAutoPlay: refs.hoverAutoPlay.checked });
        });

        refs.showPageAssist.addEventListener("change", async () => {
            await updateSettings({ showPageAssist: refs.showPageAssist.checked });
        });

        if (refs.learningOpenMode) {
            refs.learningOpenMode.addEventListener("change", async () => {
                await updateSettings({
                    learningOpenMode: refs.learningOpenMode.value === "window" ? "window" : "tab"
                });
            });
        }

        refs.aiEnabled.addEventListener("change", async () => {
            await updateSettings({ aiEnabled: refs.aiEnabled.checked });
        });

        refs.aiProvider.addEventListener("change", async () => {
            const provider = getSelectedProvider();
            renderModelOptions(provider.id, provider.defaultModel);
            updateCustomFieldsVisibility();
            updateKeyHint();
            await updateSettings({
                aiProvider: provider.id,
                aiModel: provider.id === "custom" ? "" : (refs.aiModel.value || provider.defaultModel)
            });
        });

        refs.aiModel.addEventListener("change", async () => {
            await updateSettings({ aiModel: refs.aiModel.value });
        });

        refs.aiCustomBaseUrl.addEventListener("change", async () => {
            await updateSettings({ aiCustomBaseUrl: refs.aiCustomBaseUrl.value.trim() });
        });

        refs.aiCustomModel.addEventListener("change", async () => {
            await updateSettings({ aiCustomModel: refs.aiCustomModel.value.trim() });
        });

        refs.aiSaveKey.addEventListener("click", async () => {
            const providerId = refs.aiProvider.value;
            const apiKey = refs.aiApiKey.value.trim();
            if (!apiKey) {
                refs.aiKeyHint.textContent = "请输入 API Key 后再保存";
                return;
            }

            try {
                if (global.GlossX?.AIProfiles?.saveApiKey) {
                    await global.GlossX.AIProfiles.saveApiKey(providerId, apiKey);
                } else {
                    await browser.runtime.sendMessage({
                        type: "saveAiKey",
                        payload: { provider: providerId, apiKey }
                    });
                }
                refs.aiApiKey.value = "";
                await loadState();
                refs.aiKeyHint.textContent = "API Key 已保存";
            } catch (error) {
                refs.aiKeyHint.textContent = error?.message || "保存 API Key 失败";
            }
        });

        if (refs.aiProfileSave) {
            refs.aiProfileSave.addEventListener("click", async () => {
                const name = (refs.aiProfileName?.value || "").trim();
                if (!name) {
                    setProfileHint("请输入配置名称", "error");
                    return;
                }

                const existing = aiProfiles.find((item) => item.name === name);
                if (existing && !window.confirm(`已有同名配置「${name}」，是否覆盖？`)) {
                    setProfileHint("已取消保存", "");
                    return;
                }

                const config = collectCurrentAiConfig();
                try {
                    const payload = {
                        name,
                        ...config,
                        useStoredKey: !config.apiKey
                    };
                    const api = global.GlossX?.AIProfiles;
                    const result = api?.upsert
                        ? await api.upsert(payload)
                        : await browser.runtime.sendMessage({
                            type: "saveAiProviderProfile",
                            payload
                        });

                    if (!result?.ok) {
                        setProfileHint(result?.error || "保存失败", "error");
                        return;
                    }

                    if (config.apiKey && api?.saveApiKey) {
                        await api.saveApiKey(config.provider, config.apiKey);
                    } else if (config.apiKey) {
                        await browser.runtime.sendMessage({
                            type: "saveAiKey",
                            payload: { provider: config.provider, apiKey: config.apiKey }
                        });
                    }

                    const savedId = (result.profiles || []).find((item) => item.name === name)?.id || "";
                    if (refs.aiProfileName) refs.aiProfileName.value = "";
                    try {
                        await loadState();
                    } catch (error) {
                        console.warn("[GlossX] reload after profile save failed:", error);
                        aiProfiles = result.profiles || [];
                    }
                    renderProfileOptions(savedId);
                    setProfileHint(
                        result.overwritten ? `已覆盖「${name}」` : `已保存「${name}」`,
                        "success"
                    );
                } catch (error) {
                    setProfileHint(error?.message || "保存失败", "error");
                }
            });
        }

        if (refs.aiProfileApply) {
            refs.aiProfileApply.addEventListener("click", async () => {
                const id = refs.aiProfileSelect?.value || "";
                if (!id) {
                    setProfileHint("请先选择一条常用配置", "error");
                    return;
                }

                try {
                    const api = global.GlossX?.AIProfiles;
                    const result = api?.apply
                        ? await api.apply(id)
                        : await browser.runtime.sendMessage({
                            type: "applyAiProviderProfile",
                            payload: { id }
                        });
                    if (!result?.ok) {
                        setProfileHint(result?.error || "应用失败", "error");
                        return;
                    }

                    try {
                        await loadState();
                    } catch (error) {
                        console.warn("[GlossX] reload after profile apply failed:", error);
                    }
                    renderProfileOptions(id);
                    setProfileHint(`已应用「${result.profile?.name || ""}」`, "success");
                    if (handlers.onSettingsChanged) await handlers.onSettingsChanged();
                } catch (error) {
                    setProfileHint(error?.message || "应用失败", "error");
                }
            });
        }

        if (refs.aiProfileDelete) {
            refs.aiProfileDelete.addEventListener("click", async () => {
                const id = refs.aiProfileSelect?.value || "";
                if (!id) {
                    setProfileHint("请先选择一条常用配置", "error");
                    return;
                }

                const profile = aiProfiles.find((item) => item.id === id);
                const label = profile?.name || "该配置";
                if (!window.confirm(`确定删除常用配置「${label}」？`)) {
                    return;
                }

                try {
                    const api = global.GlossX?.AIProfiles;
                    const result = api?.remove
                        ? await api.remove(id)
                        : await browser.runtime.sendMessage({
                            type: "deleteAiProviderProfile",
                            payload: { id }
                        });
                    if (!result?.ok) {
                        setProfileHint(result?.error || "删除失败", "error");
                        return;
                    }

                    aiProfiles = result.profiles || [];
                    renderProfileOptions("");
                    setProfileHint(`已删除「${label}」`, "success");
                } catch (error) {
                    setProfileHint(error?.message || "删除失败", "error");
                }
            });
        }

        refs.aiTest.addEventListener("click", async () => {
            refs.aiTestResult.textContent = "测试中…";
            refs.aiTestResult.classList.remove("success", "error");
            refs.aiTest.disabled = true;

            const providerId = refs.aiProvider.value;
            const inlineKey = refs.aiApiKey.value.trim();
            const payload = {
                apiKey: inlineKey || undefined,
                settings: {
                    aiProvider: providerId,
                    aiModel: refs.aiModel.value,
                    aiCustomBaseUrl: refs.aiCustomBaseUrl.value.trim(),
                    aiCustomModel: refs.aiCustomModel.value.trim()
                }
            };

            try {
                // Run in-page to avoid Safari background async reply dropping to undefined.
                let result = await testAiConnectionInPage(payload);

                if (!result || typeof result !== "object") {
                    try {
                        result = await browser.runtime.sendMessage({
                            type: "testAiConnection",
                            payload
                        });
                    } catch (error) {
                        result = { ok: false, message: error?.message || "测试失败" };
                    }
                }

                if (!result || typeof result !== "object") {
                    refs.aiTestResult.textContent = "✗ 测试无响应，请检查网络后重试";
                    refs.aiTestResult.classList.add("error");
                    return;
                }

                const message = window.GlossX?.TextNormalize?.normalizeUiText?.(result.message)
                    || result.message
                    || (result.ok ? "连接成功" : "未知错误");
                refs.aiTestResult.textContent = result.ok
                    ? `✓ ${message}`
                    : `✗ ${message}`;
                refs.aiTestResult.classList.toggle("success", !!result.ok);
                refs.aiTestResult.classList.toggle("error", !result.ok);
            } catch (error) {
                refs.aiTestResult.textContent = `✗ ${error?.message || "测试失败"}`;
                refs.aiTestResult.classList.add("error");
            } finally {
                refs.aiTest.disabled = false;
            }
        });

        function applyLocalOnlyLibrary(status) {
            if (refs.icloudSectionHeading) refs.icloudSectionHeading.textContent = "学习库";
            if (refs.icloudSyncStatus) {
                refs.icloudSyncStatus.textContent = status?.label || "仅保存在本机";
            }
            if (refs.icloudSyncNow) refs.icloudSyncNow.classList.add("hidden");
            if (refs.icloudSyncHint) {
                refs.icloudSyncHint.textContent = "学习库保存在本机。可用下方的导出和导入，在浏览器之间搬运。";
            }
            if (refs.learningOpenHint) {
                refs.learningOpenHint.textContent = "从浏览器工具栏点击「学习」展开收藏内容时生效。默认为插入标签页。";
            }
            if (refs.pageAssistHint) {
                refs.pageAssistHint.textContent = "关闭后隐藏页面右下角的圆点按钮和操作提示条，仍可通过浏览器工具栏管理开关。";
            }
            if (refs.optionsPrivacy) {
                refs.optionsPrivacy.textContent = "学习数据保存在本机。启用 AI 或语句英文化后，会将短句上下文或选中语句文本发送至所选模型服务商或备用翻译服务。";
            }
        }

        function downloadViaFrame(filename, content) {
            return new Promise((resolve, reject) => {
                const frameUrl = browser.runtime.getURL("download-frame.html");
                const iframe = document.createElement("iframe");
                iframe.style.display = "none";
                iframe.src = frameUrl;
                let settled = false;
                const finish = (fn, value) => {
                    if (settled) return;
                    settled = true;
                    iframe.remove();
                    fn(value);
                };
                iframe.onload = () => {
                    try {
                        iframe.contentWindow.postMessage({
                            type: "glossx-download",
                            filename,
                            content
                        }, "*");
                        setTimeout(() => finish(resolve, { mode: "download" }), 600);
                    } catch (error) {
                        finish(reject, error);
                    }
                };
                iframe.onerror = () => finish(reject, new Error("下载框架加载失败"));
                document.body.appendChild(iframe);
            });
        }

        async function exportLibrary() {
            const Sync = global.GlossX?.ICloudSync;
            const Transfer = global.GlossX?.LibraryTransfer;
            if (!Sync || !Transfer) throw new Error("学习库模块未加载");
            const stored = await browser.storage.local.get(Sync.SYNC_KEYS);
            const snapshot = Transfer.planExport(stored, Date.now());
            await downloadViaFrame("GlossX-library.json", JSON.stringify(snapshot, null, 2));
            if (refs.libraryTransferStatus) {
                refs.libraryTransferStatus.textContent = "已导出 GlossX-library.json";
            }
        }

        async function importLibraryText(text) {
            const Sync = global.GlossX?.ICloudSync;
            const Transfer = global.GlossX?.LibraryTransfer;
            if (!Sync || !Transfer) throw new Error("学习库模块未加载");
            const stored = await browser.storage.local.get([...Sync.SYNC_KEYS, "icloudMeta"]);
            const plan = Transfer.planImport(text, stored);
            if (!plan.ok) throw new Error(plan.error || "无法导入");
            const meta = {
                ...(stored.icloudMeta || {}),
                localUpdatedAt: plan.localUpdatedAt
            };
            await browser.storage.local.set({
                ...plan.storage,
                icloudMeta: meta
            });
            if (refs.libraryTransferStatus) refs.libraryTransferStatus.textContent = "已导入学习库";
            await loadState();
        }

        async function refreshIcloudStatus(syncFirst) {
            if (!refs.icloudSyncStatus && !syncFirst) return null;
            const Sync = global.GlossX?.ICloudSync;
            if (Sync?.shouldRunNativeSync && !Sync.shouldRunNativeSync(browser.runtime)) {
                const status = Sync.localOnlyStatus();
                applyLocalOnlyLibrary(status);
                return status;
            }
            if (refs.icloudSyncStatus) {
                refs.icloudSyncStatus.textContent = syncFirst ? "正在同步…" : "正在检查同步状态…";
            }

            if (syncFirst && Sync?.beginSyncRequest && Sync?.waitForSyncResult) {
                const started = await Sync.beginSyncRequest(browser.storage.local);
                browser.runtime.sendMessage({
                    type: "icloudSyncNow",
                    epoch: started.epoch
                }).catch(() => {});
                const meta = await Sync.waitForSyncResult(browser.storage.local, {
                    beforeEpoch: started.beforeEpoch
                });
                if (refs.icloudSyncStatus) {
                    refs.icloudSyncStatus.textContent = Sync.labelFromMeta(meta);
                }
                return meta;
            }

            try {
                const response = await browser.runtime.sendMessage({ type: "getIcloudStatus" });
                if (refs.icloudSyncStatus) {
                    // Format in this page (charset=utf-8); do not trust background-produced Chinese labels.
                    refs.icloudSyncStatus.textContent = Sync?.labelFromMeta?.(response)
                        || response?.label
                        || "正在检查同步状态…";
                }
                return response;
            } catch (error) {
                const stored = await browser.storage.local.get("icloudMeta");
                const meta = stored.icloudMeta || {};
                if (refs.icloudSyncStatus) {
                    refs.icloudSyncStatus.textContent = Sync?.labelFromMeta?.(meta)
                        || `上次同步失败：${error?.message || "未知错误"}`;
                }
                return meta;
            }
        }

        async function syncIcloudAndReload() {
            if (refs.icloudSyncNow) refs.icloudSyncNow.disabled = true;
            try {
                await refreshIcloudStatus(true);
                try {
                    await loadState();
                } catch (error) {
                    console.warn("[GlossX] settings reload after iCloud sync failed:", error);
                }
            } finally {
                if (refs.icloudSyncNow) refs.icloudSyncNow.disabled = false;
            }
        }

        if (refs.icloudSyncNow) {
            refs.icloudSyncNow.addEventListener("click", () => {
                Promise.resolve(syncIcloudAndReload()).catch((error) => {
                    console.warn("[GlossX] manual iCloud sync failed:", error);
                    if (refs.icloudSyncNow) refs.icloudSyncNow.disabled = false;
                });
            });
        }

        if (refs.libraryExport) {
            refs.libraryExport.addEventListener("click", () => {
                Promise.resolve(exportLibrary()).catch((error) => {
                    if (refs.libraryTransferStatus) {
                        refs.libraryTransferStatus.textContent = `导出失败：${error?.message || "未知错误"}`;
                    }
                });
            });
        }

        if (refs.libraryImport && refs.libraryImportFile) {
            refs.libraryImport.addEventListener("click", () => {
                refs.libraryImportFile.value = "";
                refs.libraryImportFile.click();
            });
            refs.libraryImportFile.addEventListener("change", () => {
                const file = refs.libraryImportFile.files?.[0];
                if (!file) return;
                if (!window.confirm("导入会用文件中的生词本、句库和设置覆盖本机学习库。继续？")) {
                    return;
                }
                Promise.resolve(file.text().then((text) => importLibraryText(text))).catch((error) => {
                    if (refs.libraryTransferStatus) {
                        refs.libraryTransferStatus.textContent = `导入失败：${error?.message || "未知错误"}`;
                    }
                });
            });
        }

        async function bootstrap() {
            renderLexiconLevels();
            // Paint local catalog first so provider/model never start empty.
            providerCatalog = getLocalProviderCatalog();
            renderProviderOptions();
            if (providerCatalog.length) {
                renderModelOptions(
                    providerCatalog[0].id,
                    providerCatalog[0].defaultModel
                );
            }

            try {
                const response = await browser.runtime.sendMessage({ type: "getAiProviders" });
                if (Array.isArray(response?.providers) && response.providers.length) {
                    providerCatalog = response.providers;
                    renderProviderOptions();
                }
            } catch (error) {
                console.warn("[GlossX] getAiProviders failed, using local catalog:", error);
            }

            // Sync first so a cloud restore is applied before painting settings.
            await refreshIcloudStatus(true);

            try {
                await loadState();
            } catch (error) {
                console.warn("[GlossX] settings loadState failed:", error);
                updateCustomFieldsVisibility();
                updateKeyHint();
            }
        }

        return { bootstrap, loadState };
    }

    global.GlossXSettingsUI = { bindSettingsUI, LEXICON_LEVELS };
})(typeof globalThis !== "undefined" ? globalThis : window);
