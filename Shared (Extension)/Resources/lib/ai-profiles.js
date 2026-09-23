(function (global) {
    const MAX_AI_PROFILES = 20;
    const AI_PROFILE_NAME_MAX = 32;

    function maskApiKey(key) {
        if (!key) return "";
        if (key.length <= 8) return "****";
        return `${key.slice(0, 3)}...${key.slice(-4)}`;
    }

    function createProfileId() {
        if (global.crypto?.randomUUID) return global.crypto.randomUUID();
        return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function normalizeProfileName(name) {
        return String(name || "").trim().slice(0, AI_PROFILE_NAME_MAX);
    }

    function knownProviderIds() {
        const catalog = global.GlossX?.AIProviders?.AI_PROVIDERS;
        if (catalog) return Object.keys(catalog);
        return ["openai", "deepseek", "anthropic", "moonshot", "custom"];
    }

    function sanitizePayload(payload = {}) {
        const provider = String(payload.provider || "deepseek");
        const isCustom = provider === "custom";
        return {
            name: normalizeProfileName(payload.name),
            provider,
            model: isCustom ? "" : String(payload.model || "").trim(),
            customBaseUrl: isCustom
                ? String(payload.customBaseUrl || "").trim().replace(/\/$/, "")
                : "",
            customModel: isCustom ? String(payload.customModel || "").trim() : "",
            apiKey: String(payload.apiKey || "").trim()
        };
    }

    function validateProfile(profile) {
        if (!profile.name) return "请输入配置名称";
        if (!knownProviderIds().includes(profile.provider)) return "未知服务商";
        if (!profile.apiKey) return "请先填写或保存 API Key";
        if (profile.provider === "custom") {
            if (!profile.customBaseUrl) return "请填写接口地址";
            if (!profile.customModel) return "请填写模型名称";
        } else if (!profile.model) {
            return "请选择模型";
        }
        return null;
    }

    function listForUi(profiles) {
        return (profiles || []).map((profile) => ({
            id: profile.id,
            name: profile.name,
            provider: profile.provider,
            model: profile.model || "",
            customBaseUrl: profile.customBaseUrl || "",
            customModel: profile.customModel || "",
            keyHint: maskApiKey(profile.apiKey),
            updatedAt: profile.updatedAt || 0
        }));
    }

    async function getProfiles() {
        const result = await browser.storage.local.get("aiProviderProfiles");
        return Array.isArray(result.aiProviderProfiles) ? result.aiProviderProfiles : [];
    }

    async function saveProfiles(profiles) {
        await browser.storage.local.set({ aiProviderProfiles: profiles });
        return profiles;
    }

    async function getAiKeys() {
        const result = await browser.storage.local.get("aiKeys");
        return result.aiKeys || {};
    }

    async function saveApiKey(provider, apiKey) {
        const aiKeys = await getAiKeys();
        if (!apiKey || !String(apiKey).trim()) {
            delete aiKeys[provider];
        } else {
            aiKeys[provider] = String(apiKey).trim();
        }
        await browser.storage.local.set({ aiKeys });
        return aiKeys;
    }

    async function upsert(payload = {}) {
        const next = sanitizePayload(payload);
        if (!next.apiKey && payload.useStoredKey) {
            const aiKeys = await getAiKeys();
            next.apiKey = aiKeys[next.provider] || "";
        }

        const error = validateProfile(next);
        if (error) return { ok: false, error };

        const profiles = await getProfiles();
        const existingIndex = profiles.findIndex((item) => item.name === next.name);
        if (existingIndex < 0 && profiles.length >= MAX_AI_PROFILES) {
            return { ok: false, error: `最多保存 ${MAX_AI_PROFILES} 条常用配置` };
        }

        const now = Date.now();
        if (existingIndex >= 0) {
            profiles[existingIndex] = {
                ...profiles[existingIndex],
                ...next,
                updatedAt: now
            };
        } else {
            profiles.push({
                id: createProfileId(),
                ...next,
                updatedAt: now
            });
        }

        profiles.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        await saveProfiles(profiles);
        return {
            ok: true,
            overwritten: existingIndex >= 0,
            profiles: listForUi(profiles)
        };
    }

    async function remove(id) {
        if (!id) return { ok: false, error: "未选择配置" };
        const profiles = await getProfiles();
        const next = profiles.filter((item) => item.id !== id);
        if (next.length === profiles.length) {
            return { ok: false, error: "未找到该配置" };
        }
        await saveProfiles(next);
        return { ok: true, profiles: listForUi(next) };
    }

    async function apply(id) {
        if (!id) return { ok: false, error: "未选择配置" };
        const profiles = await getProfiles();
        const profile = profiles.find((item) => item.id === id);
        if (!profile) return { ok: false, error: "未找到该配置" };

        const stored = await browser.storage.local.get(["settings", "aiKeys"]);
        const settings = {
            ...(stored.settings || {}),
            aiProvider: profile.provider,
            aiModel: profile.model || "",
            aiCustomBaseUrl: profile.customBaseUrl || "",
            aiCustomModel: profile.customModel || ""
        };
        const aiKeys = { ...(stored.aiKeys || {}) };
        aiKeys[profile.provider] = profile.apiKey;
        await browser.storage.local.set({ settings, aiKeys });

        return {
            ok: true,
            profile: listForUi([profile])[0]
        };
    }

    function buildAiState(aiKeys) {
        const configured = {};
        const hints = {};
        for (const providerId of knownProviderIds()) {
            const key = aiKeys?.[providerId] || "";
            configured[providerId] = !!key;
            hints[providerId] = maskApiKey(key);
        }
        return { configured, hints };
    }

    global.GlossX = global.GlossX || {};
    global.GlossX.AIProfiles = {
        MAX_AI_PROFILES,
        maskApiKey,
        listForUi,
        getProfiles,
        upsert,
        remove,
        apply,
        getAiKeys,
        saveApiKey,
        buildAiState
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
