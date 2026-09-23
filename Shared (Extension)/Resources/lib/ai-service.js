(function (global) {
    const AIService = {
        async resolveWord(payload) {
            try {
                if (global.GlossX?.AIClient?.resolveWord) {
                    const local = await global.GlossX.AIClient.resolveWord(payload);
                    if (local?.ok) return local.entry || null;
                    // Fall through to background only when local explicitly unavailable.
                    if (local && local.error && local.error !== "AI 未启用") {
                        console.warn("[GlossX] Local AI resolve:", local.error);
                    }
                    if (local?.error === "AI 未启用" || local?.error === "请先填写 API Key") {
                        return null;
                    }
                }

                const result = await browser.runtime.sendMessage({
                    type: "aiResolveWord",
                    payload
                });
                if (!result?.ok) return null;
                return result.entry || null;
            } catch (error) {
                console.warn("[GlossX] AI resolve failed:", error);
                return null;
            }
        },

        async testConnection(payload) {
            return browser.runtime.sendMessage({
                type: "testAiConnection",
                payload
            });
        },

        async saveApiKey(provider, apiKey) {
            if (global.GlossX?.AIProfiles?.saveApiKey) {
                await global.GlossX.AIProfiles.saveApiKey(provider, apiKey);
                return { ok: true };
            }
            return browser.runtime.sendMessage({
                type: "saveAiKey",
                payload: { provider, apiKey }
            });
        },

        async getProviders() {
            const local = global.GlossX?.AIProviders?.listProviders?.();
            if (local?.length) {
                return {
                    providers: local.map((provider) => ({
                        id: provider.id,
                        name: provider.name,
                        defaultModel: provider.defaultModel,
                        models: provider.models,
                        keyPlaceholder: provider.keyPlaceholder
                    }))
                };
            }
            return browser.runtime.sendMessage({ type: "getAiProviders" });
        },

        async translateParagraph(payload) {
            try {
                if (global.GlossX?.AIClient?.translateParagraph) {
                    return await global.GlossX.AIClient.translateParagraph(payload);
                }
                return await browser.runtime.sendMessage({
                    type: "translateParagraph",
                    payload
                });
            } catch (error) {
                console.warn("[GlossX] Paragraph translation failed:", error);
                return { ok: false, error: error.message || "段落翻译失败" };
            }
        }
    };

    global.GlossX = global.GlossX || {};
    global.GlossX.AIService = AIService;
})(typeof globalThis !== "undefined" ? globalThis : window);
