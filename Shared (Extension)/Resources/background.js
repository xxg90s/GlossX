const DEFAULT_SETTINGS = {
    globalEnabled: false,
    whitelistMode: true,
    whitelist: [],
    pageDisabledHosts: {},
    wordReplaceEnabled: true,
    replaceDensity: "medium",
    displayMode: "english_only",
    paragraphModeEnabled: false,
    paragraphRatio: "low",
    paragraphDisplayMode: "en_then_cn",
    pronunciation: "us",
    hoverAutoPlay: false,
    activeLexicons: ["cet4"],
    highlightColor: "",
    showPageAssist: true,
    onboardingComplete: false,
    aiEnabled: false,
    aiProvider: "deepseek",
    aiModel: "",
    aiCustomBaseUrl: "",
    aiCustomModel: "",
    learningOpenMode: "tab"
};

const AI_PROVIDERS = {
    openai: {
        id: "openai",
        name: "OpenAI (ChatGPT)",
        baseUrl: "https://api.openai.com/v1/chat/completions",
        defaultModel: "gpt-4o-mini",
        models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
        keyPlaceholder: "sk-..."
    },
    deepseek: {
        id: "deepseek",
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1/chat/completions",
        defaultModel: "deepseek-chat",
        models: ["deepseek-chat", "deepseek-reasoner"],
        keyPlaceholder: "sk-..."
    },
    anthropic: {
        id: "anthropic",
        name: "Anthropic (Claude)",
        baseUrl: "https://api.anthropic.com/v1/messages",
        defaultModel: "claude-3-5-haiku-20241022",
        models: [
            "claude-3-5-haiku-20241022",
            "claude-3-5-sonnet-20241022",
            "claude-3-haiku-20240307"
        ],
        keyPlaceholder: "sk-ant-...",
        apiStyle: "anthropic"
    },
    moonshot: {
        id: "moonshot",
        name: "Moonshot (Kimi)",
        baseUrl: "https://api.moonshot.cn/v1/chat/completions",
        defaultModel: "moonshot-v1-8k",
        models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
        keyPlaceholder: "sk-..."
    },
    custom: {
        id: "custom",
        name: "自定义 OpenAI 兼容",
        baseUrl: "",
        defaultModel: "",
        models: [],
        keyPlaceholder: "输入 API Key",
        apiStyle: "openai"
    }
};

const aiCache = new Map();
const MAX_AI_CACHE = 500;
const paragraphCache = new Map();
const MAX_PARAGRAPH_CACHE = 200;
const PARAGRAPH_AI_TIMEOUT_MS = 15000;
const PARAGRAPH_AI_TEMPERATURE = 0.4;
const AI_TEST_TIMEOUT_MS = 15000;

async function getSettings() {
    const result = await browser.storage.local.get("settings");
    return { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
}

async function saveSettings(settings) {
    await browser.storage.local.set({ settings });
}

async function updateSettings(partial) {
    const current = await getSettings();
    const next = { ...current, ...partial };
    await saveSettings(next);
    return next;
}

function normalizeLearningOpenMode(mode) {
    return mode === "window" ? "window" : "tab";
}

function buildLearningOpenPlan(url, mode, currentTab) {
    if (normalizeLearningOpenMode(mode) === "window") {
        return { method: "window", options: { url } };
    }

    const options = { url, active: true };
    if (currentTab && Number.isInteger(currentTab.index)) {
        options.index = currentTab.index + 1;
        if (Number.isInteger(currentTab.windowId)) {
            options.windowId = currentTab.windowId;
        }
    }
    return { method: "tab", options };
}

async function openLearningPage() {
    const settings = await getSettings();
    const url = browser.runtime.getURL("learning.html");
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0] || null;
    const plan = buildLearningOpenPlan(url, settings.learningOpenMode, currentTab);

    if (plan.method === "window" && browser.windows?.create) {
        await browser.windows.create(plan.options);
        return;
    }

    await browser.tabs.create(plan.options);
}

async function getAiKeys() {
    const result = await browser.storage.local.get("aiKeys");
    return result.aiKeys || {};
}

async function saveAiKey(provider, apiKey) {
    const aiKeys = await getAiKeys();
    if (!apiKey || !apiKey.trim()) {
        delete aiKeys[provider];
    } else {
        aiKeys[provider] = apiKey.trim();
    }
    await browser.storage.local.set({ aiKeys });
    return aiKeys;
}

const MAX_AI_PROFILES = 20;
const AI_PROFILE_NAME_MAX = 32;

async function getAiProviderProfiles() {
    const result = await browser.storage.local.get("aiProviderProfiles");
    return Array.isArray(result.aiProviderProfiles) ? result.aiProviderProfiles : [];
}

async function saveAiProviderProfiles(profiles) {
    await browser.storage.local.set({ aiProviderProfiles: profiles });
    return profiles;
}

function createProfileId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeProfileName(name) {
    return String(name || "").trim().slice(0, AI_PROFILE_NAME_MAX);
}

function sanitizeAiProfilePayload(payload = {}) {
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

function validateAiProfile(profile) {
    if (!profile.name) return "请输入配置名称";
    if (!AI_PROVIDERS[profile.provider]) return "未知服务商";
    if (!profile.apiKey) return "请先填写或保存 API Key";
    if (profile.provider === "custom") {
        if (!profile.customBaseUrl) return "请填写接口地址";
        if (!profile.customModel) return "请填写模型名称";
    } else if (!profile.model) {
        return "请选择模型";
    }
    return null;
}

function listAiProfilesForUi(profiles) {
    return profiles.map((profile) => ({
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

async function upsertAiProviderProfile(payload = {}) {
    const next = sanitizeAiProfilePayload(payload);
    if (!next.apiKey && payload.useStoredKey) {
        const aiKeys = await getAiKeys();
        next.apiKey = aiKeys[next.provider] || "";
    }

    const error = validateAiProfile(next);
    if (error) return { ok: false, error };

    const profiles = await getAiProviderProfiles();
    const existingIndex = profiles.findIndex((item) => item.name === next.name);
    if (existingIndex < 0 && profiles.length >= MAX_AI_PROFILES) {
        return { ok: false, error: "最多保存 " + MAX_AI_PROFILES + " 条常用配置" };
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
    await saveAiProviderProfiles(profiles);
    return {
        ok: true,
        overwritten: existingIndex >= 0,
        profiles: listAiProfilesForUi(profiles)
    };
}

async function deleteAiProviderProfile(id) {
    if (!id) return { ok: false, error: "未选择配置" };
    const profiles = await getAiProviderProfiles();
    const next = profiles.filter((item) => item.id !== id);
    if (next.length === profiles.length) {
        return { ok: false, error: "未找到该配置" };
    }
    await saveAiProviderProfiles(next);
    return { ok: true, profiles: listAiProfilesForUi(next) };
}

async function applyAiProviderProfile(id) {
    if (!id) return { ok: false, error: "未选择配置" };
    const profiles = await getAiProviderProfiles();
    const profile = profiles.find((item) => item.id === id);
    if (!profile) return { ok: false, error: "未找到该配置" };

    await updateSettings({
        aiProvider: profile.provider,
        aiModel: profile.model || "",
        aiCustomBaseUrl: profile.customBaseUrl || "",
        aiCustomModel: profile.customModel || ""
    });
    await saveAiKey(profile.provider, profile.apiKey);
    return {
        ok: true,
        profile: {
            id: profile.id,
            name: profile.name,
            provider: profile.provider,
            model: profile.model || "",
            customBaseUrl: profile.customBaseUrl || "",
            customModel: profile.customModel || "",
            keyHint: maskApiKey(profile.apiKey)
        }
    };
}

function maskApiKey(key) {
    if (!key) return "";
    if (key.length <= 8) return "****";
    return key.slice(0, 3) + "..." + key.slice(-4);
}

function getProvider(providerId) {
    return AI_PROVIDERS[providerId] || AI_PROVIDERS.deepseek;
}

function resolveEndpoint(settings) {
    const provider = getProvider(settings.aiProvider || "deepseek");
    if (provider.id === "custom") {
        return {
            provider,
            baseUrl: (settings.aiCustomBaseUrl || "").replace(/\/$/, ""),
            model: settings.aiCustomModel || settings.aiModel || "",
            apiStyle: "openai"
        };
    }
    return {
        provider,
        baseUrl: provider.baseUrl,
        model: settings.aiModel || provider.defaultModel,
        apiStyle: provider.apiStyle || "openai"
    };
}

async function getApiKeyForSettings(settings) {
    const aiKeys = await getAiKeys();
    const providerId = settings.aiProvider || "deepseek";
    return aiKeys[providerId] || "";
}

function buildResolvePrompt(zh, context, candidates) {
    const candidateText = candidates
        .map((item) => `${item.en} (${item.pos})`)
        .join(", ");

    return [
        "You are a bilingual lexicon assistant.",
        "Pick the best English replacement for a Chinese word in context.",
        "Prefer the correct part of speech. Verbs must stay verbs, nouns must stay nouns.",
        `Chinese word: ${zh}`,
        `Context: ${context}`,
        `Candidates: ${candidateText}`,
        'Return ONLY JSON: {"english":"word","pos":"v|n|adj"}'
    ].join("\n");
}

function parseAiJson(content) {
    if (!content) return null;
    let trimmed = String(content).trim();
    // Models often wrap JSON in markdown fences.
    trimmed = trimmed
        .replace(/^```(?:json|javascript|js)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        const match = trimmed.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }
}

/** AI models often return definitions as a string or under alternate keys. */
function coerceAiDefinitionList(parsed) {
    if (!parsed || typeof parsed !== "object") return [];

    const candidates = [
        parsed.definitions,
        parsed.definition,
        parsed.meanings,
        parsed.meaning,
        parsed.glosses,
        parsed.gloss,
        parsed.zh,
        parsed.chinese,
        parsed.translation,
        parsed.translations
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            return candidate.flatMap((item) => {
                if (item == null) return [];
                if (typeof item === "string") {
                    return [item.trim()].filter(Boolean);
                }
                if (typeof item === "object") {
                    const nested = item.zh || item.chinese || item.definition
                        || item.meaning || item.gloss || item.text || "";
                    return [String(nested).trim()].filter(Boolean);
                }
                return [String(item).trim()].filter(Boolean);
            });
        }
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate
                .split(/[;；,，\n|/]+/)
                .map((item) => item.trim())
                .filter(Boolean);
        }
    }
    return [];
}

function sanitizeAiDefinitions(definitions) {
    const TN = globalThis.GlossX?.TextNormalize;
    if (TN?.normalizeDefinitionsFromAi) {
        return TN.normalizeDefinitionsFromAi(definitions);
    }
    if (!Array.isArray(definitions)) return [];
    return definitions
        .map((item) => String(item || "").trim())
        .filter((item) => item && TN?.hasCjk?.(item) && !TN?.looksLikeCjkMojibake?.(item))
        .filter((item, index, list) => list.indexOf(item) === index);
}

async function readJsonUtf8(response) {
    const TN = globalThis.GlossX?.TextNormalize;
    if (TN?.readResponseJsonUtf8) {
        return TN.readResponseJsonUtf8(response);
    }
    return response.json();
}

async function readTextUtf8(response) {
    const TN = globalThis.GlossX?.TextNormalize;
    if (TN?.readResponseTextUtf8) {
        return TN.readResponseTextUtf8(response);
    }
    return response.text();
}

function sanitizeUiText(text) {
    const TN = globalThis.GlossX?.TextNormalize;
    if (TN?.normalizeUiText) {
        return TN.normalizeUiText(text);
    }
    return String(text || "").trim();
}

function sanitizeExample(example) {
    const TN = globalThis.GlossX?.TextNormalize;
    if (TN?.normalizeExample) {
        return TN.normalizeExample(example);
    }
    if (!example?.english) return null;
    return {
        english: String(example.english),
        chinese: String(example.chinese || "")
    };
}

async function fetchJson(url, options = {}, timeoutMs = AI_TEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new Error("连接超时，请检查网络或 API Key");
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function callOpenAiCompatible({ baseUrl, model, apiKey, prompt, timeoutMs, maxTokens, temperature }) {
    const response = await fetchJson(baseUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            Accept: "application/json; charset=utf-8",
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            temperature: typeof temperature === "number" ? temperature : 0.1,
            max_tokens: maxTokens || 256,
            messages: [
                {
                    role: "system",
                    content: "Reply with valid JSON only. Chinese fields must be readable Simplified Chinese UTF-8 characters (简体中文), never HTML entities, percent-encoding, Traditional-only forms, or mojibake."
                },
                { role: "user", content: prompt }
            ]
        })
    }, timeoutMs || AI_TEST_TIMEOUT_MS);

    if (!response.ok) {
        const text = await readTextUtf8(response);
        throw new Error(sanitizeUiText(text) || `HTTP ${response.status}`);
    }

    const data = await readJsonUtf8(response);
    return String(data.choices?.[0]?.message?.content || "");
}

async function callAnthropic({ baseUrl, model, apiKey, prompt, maxTokens = 120, timeoutMs, temperature }) {
    const response = await fetchJson(baseUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature: typeof temperature === "number" ? temperature : 0.1,
            messages: [{ role: "user", content: prompt }]
        })
    }, timeoutMs || AI_TEST_TIMEOUT_MS);

    if (!response.ok) {
        const text = await readTextUtf8(response);
        throw new Error(sanitizeUiText(text) || `HTTP ${response.status}`);
    }

    const data = await readJsonUtf8(response);
    const block = data.content?.find((item) => item.type === "text");
    return String(block?.text || "");
}

async function callAi({ settings, apiKey, prompt, maxTokens, timeoutMs, temperature }) {
    const endpoint = resolveEndpoint(settings);
    if (!endpoint.baseUrl || !endpoint.model) {
        throw new Error("请配置模型接口地址和模型名称");
    }
    if (!apiKey) {
        throw new Error("请先填写 API Key");
    }

    if (endpoint.apiStyle === "anthropic") {
        return callAnthropic({
            baseUrl: endpoint.baseUrl,
            model: endpoint.model,
            apiKey,
            prompt,
            maxTokens: maxTokens || 120,
            timeoutMs,
            temperature
        });
    }

    return callOpenAiCompatible({
        baseUrl: endpoint.baseUrl,
        model: endpoint.model,
        apiKey,
        prompt,
        timeoutMs,
        maxTokens: maxTokens || 256,
        temperature
    });
}

function normalizeParagraphText(text) {
    return String(text || "").trim().replace(/\s+/g, " ");
}

function hashParagraphText(text) {
    const normalized = normalizeParagraphText(text);
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
        hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
        hash |= 0;
    }
    return String(Math.abs(hash));
}

function buildParagraphPrompt(text) {
    return [
        "You are a native English writer localizing Chinese for bilingual reading.",
        "Express the SAME meaning in natural, idiomatic English a native speaker would actually say or write.",
        "This is sense-for-sense localization, NOT literal translation.",
        "Rules:",
        "- Do NOT translate word-by-word or keep Chinese word order.",
        "- Do NOT keep 的/了/把/被 calques or Chinese sentence structure.",
        "- Prefer common collocations over literal equivalents.",
        "- Split or merge clauses if that sounds more natural. One Chinese sentence may become 1-2 English sentences.",
        "- Keep names, numbers, quotes, and URLs unchanged.",
        "- Match the original tone. Do not add facts or commentary.",
        "Example:",
        "Chinese: 这个问题值得我们认真思考一下。",
        "Literal (wrong): This problem is worth us seriously thinking about it.",
        "Idiomatic: This is worth thinking through carefully.",
        `Chinese sentence:\n${text}`,
        'Return ONLY JSON: {"english":"..."}'
    ].join("\n");
}

function withTimeout(promise, timeoutMs, timeoutMessage = "请求超时") {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        })
    ]);
}

async function translateWithMyMemory(text) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=zh-CN|en`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const data = await readJsonUtf8(response);
    const translated = sanitizeUiText(data?.responseData?.translatedText);
    if (!translated) {
        throw new Error("备用翻译返回为空");
    }
    return translated;
}

async function aiTranslateParagraph(text) {
    const settings = await getSettings();
    const apiKey = await getApiKeyForSettings(settings);
    if (!apiKey) return null;

    const prompt = buildParagraphPrompt(text);
    const content = await withTimeout(
        callAi({ settings, apiKey, prompt, maxTokens: 2048, temperature: PARAGRAPH_AI_TEMPERATURE }),
        PARAGRAPH_AI_TIMEOUT_MS,
        "翻译请求超时"
    );
    const parsed = parseAiJson(content);
    if (!parsed?.english) return null;
    return String(parsed.english).trim();
}

function rememberParagraphTranslation(cacheKey, result) {
    paragraphCache.set(cacheKey, result);
    if (paragraphCache.size > MAX_PARAGRAPH_CACHE) {
        const firstKey = paragraphCache.keys().next().value;
        paragraphCache.delete(firstKey);
    }
}

async function translateParagraph(payload) {
    const text = normalizeParagraphText(payload?.text);
    if (!text) {
        return { ok: false, error: "段落内容为空" };
    }

    const cacheKey = hashParagraphText(text);
    if (paragraphCache.has(cacheKey)) {
        return { ok: true, ...paragraphCache.get(cacheKey), cached: true };
    }

    let english = null;
    let source = "error";

    try {
        english = await aiTranslateParagraph(text);
        if (english) source = "ai";
    } catch (error) {
        console.warn("[GlossX] AI paragraph translation failed:", error);
    }

    if (!english) {
        try {
            english = await translateWithMyMemory(text);
            if (english) source = "fallback";
        } catch (error) {
            console.warn("[GlossX] Fallback paragraph translation failed:", error);
        }
    }

    if (!english) {
        return { ok: false, error: "翻译失败" };
    }

    const result = { english, source };
    rememberParagraphTranslation(cacheKey, result);
    return { ok: true, ...result };
}

function pickCandidateFromAi(candidates, aiResult) {
    if (!aiResult?.english) return null;
    const english = String(aiResult.english).toLowerCase();
    const pos = aiResult.pos ? String(aiResult.pos).toLowerCase() : null;

    let match = candidates.find((item) => item.en.toLowerCase() === english);
    if (match) return match;

    if (pos) {
        match = candidates.find((item) => item.en.toLowerCase() === english && item.pos === pos);
        if (match) return match;
        match = candidates.find((item) => item.pos === pos);
        if (match) return match;
    }

    return candidates[0] || null;
}

async function aiResolveWord(payload) {
    const settings = await getSettings();
    if (!settings.aiEnabled) {
        return { ok: false, error: "AI 未启用" };
    }

    const { zh, context, candidates } = payload;
    const cacheKey = `${zh}|${context}|${candidates.map((item) => item.en).join(",")}`;
    if (aiCache.has(cacheKey)) {
        return { ok: true, entry: aiCache.get(cacheKey), cached: true };
    }

    const apiKey = await getApiKeyForSettings(settings);
    const prompt = buildResolvePrompt(zh, context, candidates);
    const content = await callAi({ settings, apiKey, prompt });
    const parsed = parseAiJson(content);
    const entry = pickCandidateFromAi(candidates, parsed);

    if (!entry) {
        return { ok: false, error: "AI 返回结果无法解析" };
    }

    aiCache.set(cacheKey, entry);
    if (aiCache.size > MAX_AI_CACHE) {
        const firstKey = aiCache.keys().next().value;
        aiCache.delete(firstKey);
    }

    return { ok: true, entry };
}

async function testAiConnection(override = {}) {
    const settings = await getSettings();
    const mergedSettings = { ...settings, ...(override.settings || {}) };
    const apiKey = override.apiKey || await getApiKeyForSettings(mergedSettings);

    if (!apiKey) {
        return { ok: false, message: "请先填写或保存 API Key" };
    }

    try {
        const content = await withTimeout(
            callAi({
                settings: mergedSettings,
                apiKey,
                prompt: 'Reply ONLY JSON: {"status":"ok"}'
            }),
            AI_TEST_TIMEOUT_MS,
            "连接超时，请检查网络或 API Key"
        );
        const parsed = parseAiJson(content);
        if (parsed?.status === "ok" || content) {
            return { ok: true, message: "连接成功" };
        }
        return { ok: true, message: "连接成功" };
    } catch (error) {
        return { ok: false, message: error.message || "连接失败" };
    }
}

function getAiStateForPopup(settings, aiKeys) {
    const configured = {};
    const hints = {};
    for (const provider of Object.values(AI_PROVIDERS)) {
        const key = aiKeys[provider.id] || "";
        configured[provider.id] = !!key;
        hints[provider.id] = maskApiKey(key);
    }
    return { configured, hints };
}

const vocabExampleCache = new Map();
const MAX_VOCAB_ITEMS = 2000;
const MAX_SNIPPET_ITEMS = 1000;
const SNIPPET_PHRASE_MAX_WORDS = 6;
const SNIPPET_SENTENCE_COVERAGE_RATIO = 0.8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VOCAB_EXAMPLE_VERSION = 2;

async function getVocabItems() {
    const result = await browser.storage.local.get("vocabItems");
    const items = result.vocabItems || {};
    // OpenCC + drop clear mojibake only. If sanitize empties defs, keep stored ones.
    const repaired = {};
    let changed = false;

    for (const [id, item] of Object.entries(items)) {
        const defs = Array.isArray(item.definitions) ? item.definitions : [];
        const nextDefs = sanitizeAiDefinitions(defs);
        const finalDefs = nextDefs.length ? nextDefs : defs;
        const usage = item.usageExample || item.extraExample || null;
        const nextUsage = usage ? sanitizeExample(usage) : usage;

        repaired[id] = {
            ...item,
            definitions: finalDefs,
            usageExample: nextUsage,
            extraExample: nextUsage
        };

        if (JSON.stringify(finalDefs) !== JSON.stringify(defs)
            || JSON.stringify(nextUsage) !== JSON.stringify(usage)) {
            changed = true;
        }
    }

    if (changed) {
        await browser.storage.local.set({ vocabItems: repaired });
    }
    return repaired;
}

async function saveVocabItems(items) {
    await browser.storage.local.set({ vocabItems: items });
}

async function incrementStat(field) {
    const stats = await getStats();
    stats[field] = (stats[field] || 0) + 1;
    stats.lastActiveDate = stats.date;
    await browser.storage.local.set({ stats });
    return stats;
}

function createInitialVocabRecord(payload) {
    return {
        id: payload.id,
        word: payload.word,
        lemma: payload.lemma || "",
        phonetic: payload.phonetic || "",
        pos: payload.pos || "",
        definitions: payload.definitions || [],
        usageExample: payload.usageExample || null,
        extraExample: payload.usageExample || null,
        exampleVersion: VOCAB_EXAMPLE_VERSION,
        exampleFromContext: null,
        status: "new",
        addedAt: Date.now(),
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
        nextReviewAt: Date.now()
    };
}

function applyVocabReview(record, grade) {
    const quality = grade === "mastered" ? 5 : grade === "review" ? 3 : 3;
    const next = { ...record };

    if (grade === "mastered") {
        next.status = "mastered";
        next.learnedAt = Date.now();
        next.repetitions += 1;
        next.interval = Math.max(next.interval, 21);
        next.nextReviewAt = Date.now() + next.interval * MS_PER_DAY;
        return next;
    }

    if (quality < 3) {
        next.repetitions = 0;
        next.interval = 1;
        next.status = "learning";
    } else {
        next.repetitions += 1;
        if (next.repetitions === 1) {
            next.interval = 1;
        } else if (next.repetitions === 2) {
            next.interval = 6;
        } else {
            next.interval = Math.round(next.interval * next.easeFactor);
        }
        next.status = next.repetitions >= 3 ? "review" : "learning";
    }

    next.easeFactor = Math.max(
        1.3,
        next.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );
    next.nextReviewAt = Date.now() + next.interval * MS_PER_DAY;
    return next;
}

const vocabLookupCache = new Map();

async function enrichVocabWithAi(word, preference = "us") {
    const settings = await getSettings();
    const apiKey = await getApiKeyForSettings(settings);
    if (!apiKey) return null;

    const dialect = preference === "uk" ? "British English" : "American English";
    const prompt = [
        "You are an English teacher for Chinese learners in Mainland China.",
        `Word: ${word}`,
        "Return the base lemma, IPA phonetic, part of speech, 1-2 short Chinese glosses,",
        `and ONE everyday example sentence in ${dialect} with its Chinese translation.`,
        "Rules:",
        "- definitions MUST be an array of Simplified Chinese glosses only (简体中文).",
        "- Never use Traditional Chinese. Never put English inside definitions.",
        "- Keep each definition short (2-12 Chinese characters).",
        "- example.chinese MUST be Simplified Chinese and must translate example.english exactly.",
        "- Prefer the most common modern meaning for learners.",
        'Return ONLY JSON: {"lemma":"base form","phonetic":"/.../","pos":"v|n|adj|adv","definitions":["简体中文释义1","简体中文释义2"],"example":{"english":"...","chinese":"简体中文翻译"}}'
    ].join("\n");

    try {
        const content = await withTimeout(
            callAi({ settings, apiKey, prompt, maxTokens: 280 }),
            15000
        );
        const parsed = parseAiJson(content);
        if (!parsed) {
            console.warn("[GlossX] AI vocab JSON parse failed:", String(content || "").slice(0, 240));
            return { error: "vocab_ai_invalid_json", source: "ai" };
        }
        const definitions = sanitizeAiDefinitions(coerceAiDefinitionList(parsed));
        return {
            lemma: sanitizeUiText(parsed.lemma || word),
            phonetic: sanitizeUiText(parsed.phonetic || ""),
            pos: sanitizeUiText(parsed.pos || ""),
            definitions,
            example: sanitizeExample(parsed.example),
            source: "ai"
        };
    } catch (error) {
        console.warn("[GlossX] AI vocab lookup failed:", error);
        return { error: "vocab_ai_query_failed", source: "ai" };
    }
}

/** One light AI retry when the first response lacked usable Chinese glosses. */
async function enrichVocabDefinitionsWithAi(word) {
    const settings = await getSettings();
    const apiKey = await getApiKeyForSettings(settings);
    if (!apiKey) return [];

    const prompt = [
        "You are an English teacher for Chinese learners in Mainland China.",
        `Word: ${word}`,
        "Give 1-2 most common meanings as short Simplified Chinese glosses.",
        "Never use Traditional Chinese. Never return English.",
        'Return ONLY JSON: {"definitions":["简体中文释义1","简体中文释义2"]}'
    ].join("\n");

    try {
        const content = await withTimeout(
            callAi({ settings, apiKey, prompt, maxTokens: 160 }),
            12000
        );
        const parsed = parseAiJson(content);
        if (!parsed) {
            console.warn("[GlossX] AI defs JSON parse failed:", String(content || "").slice(0, 240));
            return [];
        }
        return sanitizeAiDefinitions(coerceAiDefinitionList(parsed));
    } catch (error) {
        console.warn("[GlossX] AI vocab definition fallback failed:", error);
        return [];
    }
}

async function lookupVocabWord(payload) {
    const word = String(payload?.word || "").trim();
    if (!word) return { ok: false, error: "vocab_invalid_word" };

    const preference = payload?.preference === "uk" ? "uk" : "us";
    const cacheKey = `${word.toLowerCase()}|${preference}`;
    if (vocabLookupCache.has(cacheKey)) {
        const cached = vocabLookupCache.get(cacheKey);
        const cachedDefs = sanitizeAiDefinitions(cached.definitions || []);
        const cachedExample = sanitizeExample(cached.example);
        if (cachedDefs.length) {
            return {
                ok: true,
                ...cached,
                definitions: cachedDefs,
                example: cachedExample,
                cached: true
            };
        }
        vocabLookupCache.delete(cacheKey);
    }

    const settings = await getSettings();
    const apiKey = await getApiKeyForSettings(settings);
    if (!apiKey) {
        return {
            ok: false,
            error: "vocab_no_api_key"
        };
    }

    let lemma = word;
    let phonetic = "";
    let pos = "";
    let definitions = [];
    let example = null;
    let lastError = "";

    const ai = await enrichVocabWithAi(word, preference);
    if (ai?.error) {
        lastError = ai.error;
    }
    if (ai && !ai.error) {
        lemma = sanitizeUiText(ai.lemma || lemma);
        phonetic = sanitizeUiText(ai.phonetic || "");
        pos = sanitizeUiText(ai.pos || "");
        definitions = sanitizeAiDefinitions(ai.definitions || []);
        example = sanitizeExample(ai.example);
    }

    if (!definitions.length) {
        console.warn("[GlossX] AI glosses empty/rejected, retrying definitions for:", word);
        const retryDefs = await enrichVocabDefinitionsWithAi(lemma || word);
        if (retryDefs.length) {
            definitions = retryDefs;
        } else if (!lastError) {
            lastError = "vocab_ai_gloss_unrecognized";
        }
    }

    definitions = sanitizeAiDefinitions(definitions);
    example = sanitizeExample(example);

    if (!definitions.length) {
        return {
            ok: false,
            error: lastError || "vocab_ai_gloss_empty",
            lemma: sanitizeUiText(lemma) || lemma,
            phonetic: String(phonetic || "").trim(),
            pos: String(pos || "").trim(),
            definitions: [],
            example
        };
    }

    const result = {
        word: String(word).trim(),
        lemma: sanitizeUiText(lemma) || lemma,
        phonetic: String(phonetic || "").trim(),
        pos: String(pos || "").trim(),
        definitions,
        example,
        source: "ai"
    };

    vocabLookupCache.set(cacheKey, result);
    if (vocabLookupCache.size > 300) {
        const firstKey = vocabLookupCache.keys().next().value;
        vocabLookupCache.delete(firstKey);
    }
    return { ok: true, ...result };
}

async function saveVocabItem(payload) {
    const id = String(payload?.id || "").toLowerCase();
    const word = String(payload?.word || "").trim();
    if (!id || !word) {
        return { ok: false, error: "单词无效" };
    }

    const items = await getVocabItems();
    if (!items[id] && Object.keys(items).length >= MAX_VOCAB_ITEMS) {
        return { ok: false, error: "生词本已满（2000 条），请清理已掌握词" };
    }

    const isNew = !items[id];
    const preference = payload?.preference === "uk" ? "uk" : "us";
    let lemma = sanitizeUiText(payload.lemma || items[id]?.lemma || "");
    let phonetic = sanitizeUiText(payload.phonetic || items[id]?.phonetic || "");
    let pos = sanitizeUiText(payload.pos || items[id]?.pos || "");
    let definitions = sanitizeAiDefinitions(
        payload.definitions?.length
            ? payload.definitions
            : (items[id]?.definitions || [])
    );
    let usageExample = sanitizeExample(
        payload.usageExample
            || items[id]?.usageExample
            || items[id]?.extraExample
            || null
    );

    function looksInflected(value) {
        const w = String(value || "").toLowerCase();
        if (w.length <= 3) return false;
        return /(ied|ing|ies|ves|es|ed|[a-z]s)$/.test(w);
    }

    const needsLemma = looksInflected(word)
        && (!lemma || lemma.toLowerCase() === word.toLowerCase());
    const needsLookup = !definitions.length
        || !usageExample?.english
        || (usageExample?.english && !usageExample.chinese)
        || needsLemma;

    if (needsLookup) {
        const lookedUp = await lookupVocabWord({ word, preference });
        if (lookedUp?.ok) {
            if (lookedUp.lemma
                && lookedUp.lemma.toLowerCase() !== word.toLowerCase()) {
                lemma = sanitizeUiText(lookedUp.lemma);
            }
            phonetic = phonetic || sanitizeUiText(lookedUp.phonetic || "");
            pos = pos || sanitizeUiText(lookedUp.pos || "");
            if (!definitions.length && lookedUp.definitions?.length) {
                definitions = sanitizeAiDefinitions(lookedUp.definitions);
            }
            if (lookedUp.example) {
                const selectPair = globalThis.GlossX?.TextNormalize?.selectBilingualExample;
                usageExample = selectPair
                    ? selectPair(usageExample, lookedUp.example)
                    : (sanitizeExample(usageExample) || sanitizeExample(lookedUp.example));
            }
        }
    }

    if (lemma && lemma.toLowerCase() === word.toLowerCase()) {
        lemma = "";
    }

    const base = items[id] || createInitialVocabRecord({
        id,
        word: sanitizeUiText(word),
        lemma,
        phonetic,
        pos,
        definitions,
        usageExample
    });

    const item = {
        ...base,
        word: sanitizeUiText(word),
        lemma,
        phonetic,
        pos,
        definitions,
        usageExample: usageExample || null,
        extraExample: usageExample || null,
        exampleVersion: VOCAB_EXAMPLE_VERSION,
        exampleFromContext: null,
        status: base.status === "mastered" ? "learning" : (base.status || "new")
    };

    items[id] = item;
    await saveVocabItems(items);

    if (isNew) {
        await incrementStat("vocabNewToday");
    }

    return { ok: true, item, isNew };
}

async function removeVocabItem(payload) {
    const id = String(payload?.id || "").toLowerCase();
    if (!id) return { ok: false, error: "单词无效" };

    const items = await getVocabItems();
    if (!items[id]) return { ok: true };
    delete items[id];
    await saveVocabItems(items);
    return { ok: true };
}

async function gradeVocabItem(payload) {
    const id = String(payload?.id || "").toLowerCase();
    const grade = payload?.grade;
    if (!id || !grade) return { ok: false, error: "参数无效" };

    const items = await getVocabItems();
    const record = items[id];
    if (!record) return { ok: false, error: "生词不存在" };

    items[id] = applyVocabReview(record, grade);
    await saveVocabItems(items);
    await incrementStat("vocabReviewedToday");
    if (grade === "review") {
        await incrementStat("reviews");
    }

    return { ok: true, item: items[id] };
}

async function generateVocabExample(payload) {
    const word = String(payload?.word || "").trim();
    if (!word) return { ok: false, error: "单词无效" };

    const preference = payload?.preference === "uk" ? "uk" : "us";
    const cacheKey = `${word}|${preference}`;
    if (vocabExampleCache.has(cacheKey)) {
        return { ok: true, example: vocabExampleCache.get(cacheKey), cached: true };
    }

    const lookedUp = await lookupVocabWord({ word, preference });
    if (lookedUp?.ok && lookedUp.example?.english) {
        vocabExampleCache.set(cacheKey, lookedUp.example);
        const items = await getVocabItems();
        const id = word.toLowerCase();
        if (items[id]) {
            items[id].usageExample = lookedUp.example;
            items[id].extraExample = lookedUp.example;
            items[id].exampleVersion = VOCAB_EXAMPLE_VERSION;
            await saveVocabItems(items);
        }
        return { ok: true, example: lookedUp.example };
    }

    return { ok: false, error: "未能生成常用例句" };
}

function normalizeSnippetText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function countSnippetWords(text) {
    const normalized = normalizeSnippetText(text);
    if (!normalized) return 0;
    return normalized.split(/\s+/).filter(Boolean).length;
}

function detectSnippetType(text, fullEnglish) {
    const normalized = normalizeSnippetText(text);
    const wordCount = countSnippetWords(normalized);
    if (fullEnglish) {
        const full = normalizeSnippetText(fullEnglish);
        if (full && normalized.length / full.length >= SNIPPET_SENTENCE_COVERAGE_RATIO) {
            return "sentence";
        }
    }
    return wordCount <= SNIPPET_PHRASE_MAX_WORDS ? "phrase" : "sentence";
}

function buildSnippetId(text, hostname) {
    const key = `${normalizeSnippetText(text).toLowerCase()}|${String(hostname || "").toLowerCase()}`;
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
        hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return `snip_${Math.abs(hash).toString(36)}`;
}

function resolveSnippetTranslationFromContext(text, context, type) {
    const selected = normalizeSnippetText(text);
    const fullEn = normalizeSnippetText(context?.fullEnglish);
    const fullZh = normalizeSnippetText(context?.fullChinese);
    if (!selected || !fullZh) return null;

    if (type === "sentence") return fullZh;

    const selectedLower = selected.toLowerCase();
    const fullEnLower = fullEn.toLowerCase();
    if (fullEnLower && selectedLower === fullEnLower) return fullZh;
    if (fullEn && selected.length / fullEn.length >= SNIPPET_SENTENCE_COVERAGE_RATIO) {
        return fullZh;
    }
    return null;
}

async function translateSnippetWithMyMemory(text) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const translated = sanitizeUiText(data?.responseData?.translatedText);
    if (!translated) throw new Error("empty");
    return translated;
}

const SNIPPET_CONTEXT_MAX_CHARS = 320;
const SNIPPET_CONTEXT_WINDOW = 160;

function trimSnippetContext(text, selected) {
    const normalized = String(text || "").trim().replace(/\s+/g, " ");
    if (normalized.length <= SNIPPET_CONTEXT_MAX_CHARS) return normalized;

    const needle = String(selected || "").trim().toLowerCase();
    const idx = needle ? normalized.toLowerCase().indexOf(needle) : -1;
    if (idx >= 0) {
        const start = Math.max(0, idx - SNIPPET_CONTEXT_WINDOW);
        const end = Math.min(
            normalized.length,
            idx + needle.length + SNIPPET_CONTEXT_WINDOW
        );
        return normalized.slice(start, end);
    }
    return normalized.slice(0, SNIPPET_CONTEXT_MAX_CHARS);
}

async function enrichSnippetTranslationWithAi(text, context) {
    const settings = await getSettings();
    const apiKey = await getApiKeyForSettings(settings);
    if (!apiKey) {
        return { ok: false, error: "请先填写当前 AI 服务商的 API Key" };
    }

    const contextEnglish = trimSnippetContext(context?.fullEnglish, text);
    const contextChinese = trimSnippetContext(context?.fullChinese, text);
    const lines = [
        "You are translating English for Chinese learners in Mainland China."
    ];
    if (contextEnglish && contextChinese) {
        lines.push(
            `English sentence: ${contextEnglish}`,
            `Chinese sentence: ${contextChinese}`,
            `Selected phrase from the English sentence: ${text}`,
            "The Chinese sentence is the translation of the English sentence.",
            "Return the Chinese equivalent of ONLY the selected phrase in this context."
        );
    } else {
        lines.push(`Selected text: ${text}`);
        if (contextEnglish) lines.push(`Full English sentence: ${contextEnglish}`);
        if (contextChinese) lines.push(`Full Chinese sentence: ${contextChinese}`);
        lines.push(
            "Return the Simplified Chinese translation of the SELECTED text only.",
            "When the selection is a phrase inside the sentence, use context to pick the correct meaning."
        );
    }
    lines.push(
        "Keep it concise and natural. Use Simplified Chinese only.",
        'Return ONLY JSON: {"translation":"简体中文翻译"}'
    );

    try {
        const content = await withTimeout(
            callAi({
                settings,
                apiKey,
                prompt: lines.join("\n"),
                maxTokens: 160,
                timeoutMs: 12000
            }),
            12000
        );
        const parsed = parseAiJson(content);
        let translation = sanitizeUiText(parsed?.translation || parsed?.chinese || "");
        if (!translation) {
            const plain = sanitizeUiText(content);
            if (plain && !plain.startsWith("{")) {
                translation = plain;
            }
        }
        if (!translation) {
            return { ok: false, error: "AI 返回内容无法解析" };
        }
        return { ok: true, translation };
    } catch (error) {
        console.warn("[GlossX] AI snippet translation failed:", error);
        return { ok: false, error: error?.message || "AI 请求失败" };
    }
}

async function lookupPhraseByWords(text, preference = "us") {
    const words = normalizeSnippetText(text)
        .split(/\s+/)
        .filter((word) => /[a-zA-Z]/.test(word) && word.length >= 2);
    if (words.length < 2) return null;

    const parts = [];
    for (const word of words) {
        const vocab = await lookupVocabWord({ word, preference });
        if (!vocab?.ok || !vocab.definitions?.length) {
            return null;
        }
        parts.push(vocab.definitions[0]);
    }
    return parts.join("");
}

async function translateSnippet(payload) {
    const text = normalizeSnippetText(payload?.text);
    const context = payload?.context || {};
    const type = payload?.type === "sentence" ? "sentence" : "phrase";
    const preference = payload?.preference === "uk" ? "uk" : "us";
    const wordCount = countSnippetWords(text);

    if (!text) return { ok: false, error: "snippet_invalid_text" };

    const fromContext = resolveSnippetTranslationFromContext(text, context, type);
    if (fromContext) {
        return { ok: true, translation: fromContext, source: "context" };
    }

    if (wordCount === 1) {
        const vocab = await lookupVocabWord({ word: text, preference });
        if (vocab?.ok && vocab.definitions?.length) {
            return {
                ok: true,
                translation: vocab.definitions.join("；"),
                source: "vocab"
            };
        }
    }

    const aiResult = await enrichSnippetTranslationWithAi(text, context);
    if (aiResult.ok && aiResult.translation) {
        return { ok: true, translation: aiResult.translation, source: "ai" };
    }
    return { ok: false, error: aiResult.error || "AI 翻译失败" };
}

async function getSnippetItems() {
    const result = await browser.storage.local.get("snippetItems");
    return result.snippetItems || {};
}

async function saveSnippetItems(items) {
    await browser.storage.local.set({ snippetItems: items });
}

function createInitialSnippetRecord(payload) {
    const record = {
        id: payload.id,
        text: payload.text,
        type: payload.type,
        context: payload.context,
        status: "new",
        addedAt: Date.now()
    };
    if (payload.translation) {
        record.translation = payload.translation;
    }
    if (payload.type === "phrase") {
        record.easeFactor = 2.5;
        record.interval = 0;
        record.repetitions = 0;
        record.nextReviewAt = Date.now();
    }
    return record;
}

async function saveSnippetItem(payload) {
    const text = normalizeSnippetText(payload?.text);
    const context = payload?.context;
    const hostname = String(context?.hostname || "").trim();

    if (!text || !context || !hostname) {
        return { ok: false, error: "句子无效" };
    }

    const id = buildSnippetId(text, hostname);
    const type = detectSnippetType(text, context.fullEnglish);

    const items = await getSnippetItems();
    if (!items[id] && Object.keys(items).length >= MAX_SNIPPET_ITEMS) {
        return { ok: false, error: "句库已满（1000 条），请清理已熟悉句子" };
    }

    const isNew = !items[id];
    let translation = payload.translation ? String(payload.translation).trim() : "";

    if (!translation && !payload.skipLookup) {
        try {
            const lookedUp = await withTimeout(
                translateSnippet({
                    text,
                    context,
                    type: payload?.type || type,
                    preference: payload?.preference
                }),
                8000,
                "snippet_translate_timeout"
            );
            if (lookedUp?.ok && lookedUp.translation) {
                translation = String(lookedUp.translation).trim();
            }
        } catch (error) {
            console.warn("[GlossX] Snippet save lookup failed:", error);
        }
    }

    if (isNew) {
        items[id] = createInitialSnippetRecord({
            id,
            text,
            type,
            context: {
                fullEnglish: String(context.fullEnglish || ""),
                fullChinese: String(context.fullChinese || ""),
                pageUrl: String(context.pageUrl || ""),
                pageTitle: context.pageTitle ? String(context.pageTitle) : undefined,
                hostname
            },
            translation: translation || undefined
        });
        await saveSnippetItems(items);
        await incrementStat("snippetNewToday");
    }

    return { ok: true, item: items[id], isNew };
}

async function removeSnippetItem(payload) {
    const id = String(payload?.id || "");
    if (!id) return { ok: false, error: "句子无效" };

    const items = await getSnippetItems();
    if (!items[id]) {
        return { ok: false, error: "未找到该句子" };
    }
    delete items[id];
    await saveSnippetItems(items);
    return { ok: true };
}

async function markSnippetFamiliar(payload) {
    const id = String(payload?.id || "");
    if (!id) return { ok: false, error: "句子无效" };

    const items = await getSnippetItems();
    if (!items[id]) {
        return { ok: false, error: "未找到该句子" };
    }
    items[id] = {
        ...items[id],
        status: "familiar",
        familiarAt: Date.now()
    };
    await saveSnippetItems(items);
    return { ok: true };
}

function applySnippetReview(record, grade) {
    const quality = grade === "mastered" ? 5 : grade === "review" ? 3 : 3;
    const next = { ...record };

    if (grade === "mastered") {
        next.status = "mastered";
        next.learnedAt = Date.now();
        next.repetitions = (next.repetitions || 0) + 1;
        next.interval = Math.max(next.interval || 0, 21);
        next.nextReviewAt = Date.now() + next.interval * MS_PER_DAY;
        return next;
    }

    if (quality < 3) {
        next.repetitions = 0;
        next.interval = 1;
        next.status = "learning";
    } else {
        next.repetitions = (next.repetitions || 0) + 1;
        if (next.repetitions === 1) {
            next.interval = 1;
        } else if (next.repetitions === 2) {
            next.interval = 6;
        } else {
            next.interval = Math.round((next.interval || 1) * (next.easeFactor || 2.5));
        }
        next.status = next.repetitions >= 3 ? "review" : "learning";
    }

    next.easeFactor = Math.max(
        1.3,
        (next.easeFactor || 2.5) + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );
    next.nextReviewAt = Date.now() + (next.interval || 1) * MS_PER_DAY;
    return next;
}

async function gradeSnippetItem(payload) {
    const id = String(payload?.id || "");
    const grade = payload?.grade;
    if (!id || !grade) return { ok: false, error: "参数无效" };

    const items = await getSnippetItems();
    const record = items[id];
    if (!record) return { ok: false, error: "未找到该短语" };
    if (record.type !== "phrase") return { ok: false, error: "仅短语支持复习评分" };

    items[id] = applySnippetReview(record, grade);
    await saveSnippetItems(items);
    await incrementStat("snippetReviewedToday");
    if (grade === "review") {
        await incrementStat("reviews");
    }

    return { ok: true, item: items[id] };
}

async function getStats() {
    const result = await browser.storage.local.get("stats");
    const today = new Date().toISOString().slice(0, 10);
    const stats = result.stats || {
        date: today,
        newWords: 0,
        reviews: 0,
        vocabNewToday: 0,
        vocabReviewedToday: 0,
        snippetNewToday: 0,
        snippetReviewedToday: 0,
        streak: 0,
        lastActiveDate: null
    };

    if (stats.date !== today) {
        const yesterday = stats.date;
        const lastActive = stats.lastActiveDate;
        let streak = stats.streak || 0;
        if (lastActive === yesterday) {
            streak += 1;
        } else if (lastActive !== today) {
            streak = 1;
        }
        return {
            date: today,
            newWords: 0,
            reviews: 0,
            vocabNewToday: 0,
            vocabReviewedToday: 0,
            snippetNewToday: 0,
            snippetReviewedToday: 0,
            streak,
            lastActiveDate: today
        };
    }
    return stats;
}

function hostnameFromUrl(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

async function isSiteEnabled(url) {
    const settings = await getSettings();
    const hostname = hostnameFromUrl(url);

    if (!settings.globalEnabled || !hostname) {
        return false;
    }

    if (settings.pageDisabledHosts[hostname]) {
        return false;
    }

    if (settings.whitelistMode) {
        return settings.whitelist.includes(hostname);
    }

    return true;
}

async function resolveTabContext(sender) {
    if (sender?.tab?.url && /^https?:/i.test(sender.tab.url)) {
        return {
            hostname: hostnameFromUrl(sender.tab.url),
            siteEnabled: await isSiteEnabled(sender.tab.url),
            tabId: sender.tab.id
        };
    }

    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs.find((item) => item.url && /^https?:/i.test(item.url));
    if (!tab) {
        return { hostname: "", siteEnabled: false, tabId: null };
    }

    return {
        hostname: hostnameFromUrl(tab.url),
        siteEnabled: await isSiteEnabled(tab.url),
        tabId: tab.id
    };
}

async function enableSite(hostname, tabId) {
    const settings = await getSettings();
    const whitelist = new Set(settings.whitelist || []);
    whitelist.add(hostname);
    const next = await updateSettings({
        globalEnabled: true,
        whitelistMode: true,
        whitelist: [...whitelist],
        pageDisabledHosts: {
            ...(settings.pageDisabledHosts || {}),
            [hostname]: false
        }
    });
    await broadcastRefresh(tabId);
    return next;
}

async function sendNative(payload, timeoutMs = 120000) {
    if (!browser.runtime.sendNativeMessage) {
        return { ok: false, error: "\u539f\u751f\u901a\u9053\u4e0d\u53ef\u7528" };
    }
    const type = payload?.type || "unknown";
    return await new Promise((resolve) => {
        let settled = false;
        const finish = (response) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const raw = response && typeof response === "object" ? response : null;
            const unwrapped = raw?.message && typeof raw.message === "object"
                ? raw.message
                : raw;
            resolve(unwrapped || { ok: false, error: "\u539f\u751f\u901a\u9053\u65e0\u54cd\u5e94" });
        };
        const timer = setTimeout(() => {
            finish({ ok: false, error: "\u539f\u751f\u8c03\u7528\u8d85\u65f6(" + type + ")" });
        }, timeoutMs);
        try {
            const maybePromise = browser.runtime.sendNativeMessage("application.id", payload, (response) => {
                const err = browser.runtime.lastError;
                if (err) {
                    finish({ ok: false, error: err.message || String(err) });
                    return;
                }
                finish(response);
            });
            if (maybePromise && typeof maybePromise.then === "function") {
                maybePromise.then(
                    (response) => {
                        // Safari may resolve undefined before the callback receives the payload.
                        if (response !== undefined) {
                            finish(response);
                        }
                    },
                    (error) => finish({ ok: false, error: error.message || String(error) })
                );
            }
        } catch (error) {
            finish({ ok: false, error: error.message || String(error) });
        }
    });
}

const ICLOUD_SYNC_DEBOUNCE_MS = 2000;
const ICLOUD_RETRY_DELAYS_MS = [1000, 3000, 8000, 8000, 8000];
const ICLOUD_SYNC_STALE_MS = 35000;
const ICLOUD_NATIVE_TIMEOUT_MS = 10000;
let icloudMetaWriteChain = Promise.resolve();
let applyingCloud = false;
let icloudApplyGeneration = 0;
let icloudPushTimer = null;
let icloudSyncInFlight = null;
let icloudSyncInFlightStartedAt = 0;
let icloudSyncInFlightEpoch = null;
let icloudSyncGeneration = 0;

function getICloudSync() {
    return globalThis.GlossX?.ICloudSync;
}

async function getIcloudMeta() {
    const result = await browser.storage.local.get("icloudMeta");
    return result.icloudMeta || {};
}

async function saveIcloudMeta(patch) {
    const run = async () => {
        const current = await getIcloudMeta();
        const next = { ...current, ...patch };
        const Sync = getICloudSync();
        if (Sync) {
            next.lastLabel = Sync.formatSyncLabel({
                lastStatus: next.lastStatus,
                lastError: next.lastError,
                lastPushAt: next.lastPushAt,
                lastPullAt: next.lastPullAt,
                now: Date.now()
            });
        } else if (next.lastStatus === "error") {
            next.lastLabel = "\u4e0a\u6b21\u540c\u6b65\u5931\u8d25\uff1a" + (next.lastError || "\u672a\u77e5\u9519\u8bef");
        }
        await browser.storage.local.set({ icloudMeta: next });
        return next;
    };
    icloudMetaWriteChain = icloudMetaWriteChain.then(run, run);
    return icloudMetaWriteChain;
}

async function readLocalPayload() {
    const Sync = getICloudSync();
    const keys = Sync?.SYNC_KEYS || [];
    const stored = await browser.storage.local.get(keys);
    const payload = {};
    for (const key of keys) {
        payload[key] = stored[key];
    }
    return payload;
}

async function interpretCloudRead() {
    const response = await sendNative({ type: "icloudRead" }, ICLOUD_NATIVE_TIMEOUT_MS);
    if (response?.status === "signedOut" || response?.status === "unavailable" || response?.status === "downloading") {
        return { status: response.status, error: response.error };
    }
    if (!response?.ok) {
        return { status: "error", error: response?.error || "\u4e91\u7aef\u6570\u636e\u65e0\u6cd5\u8bfb\u53d6" };
    }
    if (!response.exists) {
        return { cloudExists: false };
    }
    try {
        const snapshot = JSON.parse(response.content);
        return { cloudExists: true, snapshot };
    } catch {
        return { status: "error", error: "\u4e91\u7aef\u6570\u636e\u65e0\u6cd5\u8bfb\u53d6" };
    }
}

async function runIcloudSync({
    retryLeft = ICLOUD_RETRY_DELAYS_MS.slice(),
    force = false,
    requestedEpoch = null
} = {}) {
    const syncEpoch = Number(requestedEpoch) || Date.now();
    if (icloudSyncInFlight) {
        const age = Date.now() - icloudSyncInFlightStartedAt;
        const sameEpoch = requestedEpoch != null
            && icloudSyncInFlightEpoch === Number(requestedEpoch);
        // Reuse in-flight work for the same manual request (storage + message double-fire).
        if (age < ICLOUD_SYNC_STALE_MS && (!force || sameEpoch)) {
            return icloudSyncInFlight;
        }
        icloudSyncInFlight = null;
    }
    const generation = ++icloudSyncGeneration;
    icloudSyncInFlightStartedAt = Date.now();
    icloudSyncInFlightEpoch = syncEpoch;
    icloudSyncInFlight = (async () => {
        const stillCurrent = () => generation === icloudSyncGeneration;
        const Sync = getICloudSync();
        if (!Sync) {
            if (!stillCurrent()) return;
            await saveIcloudMeta({
                syncEpoch,
                lastStatus: "error",
                lastError: "\u540c\u6b65\u6a21\u5757\u672a\u52a0\u8f7d\uff0c\u8bf7\u91cd\u65b0\u7f16\u8bd1\u5b89\u88c5\u6269\u5c55"
            });
            return;
        }

        if (!stillCurrent()) return;
        await saveIcloudMeta({
            syncEpoch,
            lastStatus: "pushing",
            lastError: undefined
        });

        const nativeStatus = await sendNative({ type: "icloudStatus" }, ICLOUD_NATIVE_TIMEOUT_MS);
        if (!stillCurrent()) return;
        if (!nativeStatus?.ok) {
            await saveIcloudMeta({
                syncEpoch,
                lastStatus: "error",
                lastError: nativeStatus?.error || nativeStatus?.status || "\u539f\u751f\u901a\u9053\u4e0d\u53ef\u7528"
            });
            return;
        }
        if (nativeStatus.signedIn === false) {
            await saveIcloudMeta({
                syncEpoch,
                lastStatus: "signedOut",
                lastError: undefined
            });
            return;
        }
        if (nativeStatus.available === false) {
            await saveIcloudMeta({
                syncEpoch,
                lastStatus: "unavailable",
                lastError: "\u8bf7\u5148\u6253\u5f00\u4e00\u6b21 GlossX \u5e94\u7528"
            });
            return;
        }

        const cloud = await interpretCloudRead();
        if (!stillCurrent()) return;
        if (cloud.status === "signedOut" || cloud.status === "unavailable" || cloud.status === "error") {
            await saveIcloudMeta({
                syncEpoch,
                lastStatus: cloud.status,
                lastError: cloud.error || (cloud.status === "error" ? "\u4e91\u7aef\u6570\u636e\u65e0\u6cd5\u8bfb\u53d6" : undefined)
            });
            return;
        }

        const payload = await readLocalPayload();
        const meta = await getIcloudMeta();
        if (!stillCurrent()) return;
        const action = Sync.decideSyncAction({
            localUpdatedAt: meta.localUpdatedAt,
            hasUserData: Sync.hasUserData(payload),
            cloudExists: !!cloud.cloudExists,
            cloudUpdatedAt: cloud.snapshot?.updatedAt,
            cloudDownloading: cloud.status === "downloading"
        });

        if (action === "retry") {
            if (!retryLeft.length) {
                await saveIcloudMeta({
                    lastStatus: "error",
                    lastError: "iCloud \u6587\u4ef6\u4ecd\u5728\u4e0b\u8f7d\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5"
                });
                return;
            }
            await saveIcloudMeta({ lastStatus: "downloading", lastError: undefined });
            const delay = retryLeft[0];
            setTimeout(() => {
                runIcloudSync({
                    retryLeft: retryLeft.slice(1),
                    force: true,
                    requestedEpoch: syncEpoch
                });
            }, delay);
            return;
        }

        if (action === "pull") {
            const applied = Sync.applySnapshot(cloud.snapshot, { ...payload, icloudMeta: meta });
            if (!applied.ok) {
                await saveIcloudMeta({ lastStatus: "error", lastError: applied.error });
                return;
            }
            if (!stillCurrent()) return;
            const applyGeneration = ++icloudApplyGeneration;
            applyingCloud = true;
            try {
                const toWrite = {};
                for (const key of Sync.SYNC_KEYS) {
                    toWrite[key] = applied.storage[key];
                }
                toWrite.icloudMeta = {
                    ...meta,
                    syncEpoch,
                    localUpdatedAt: applied.localUpdatedAt,
                    lastPullAt: Date.now(),
                    lastStatus: "synced",
                    lastError: undefined,
                    lastLabel: Sync.formatSyncLabel({
                        lastStatus: "synced",
                        lastPushAt: meta.lastPushAt,
                        lastPullAt: Date.now(),
                        now: Date.now()
                    })
                };
                await browser.storage.local.set(toWrite);
            } finally {
                // Safari may deliver onChanged after set() resolves; keep suppress briefly.
                setTimeout(() => {
                    if (icloudApplyGeneration === applyGeneration) {
                        applyingCloud = false;
                    }
                }, 500);
            }
            return;
        }

        if (action === "push") {
            let localUpdatedAt = meta.localUpdatedAt;
            if (localUpdatedAt == null) {
                localUpdatedAt = Date.now();
            }
            await saveIcloudMeta({ localUpdatedAt, lastStatus: "pushing" });
            const snapshot = Sync.buildSnapshot(payload, localUpdatedAt);
            const written = await sendNative({
                type: "icloudWrite",
                content: JSON.stringify(snapshot)
            }, ICLOUD_NATIVE_TIMEOUT_MS);
            if (!stillCurrent()) return;
            if (written?.status === "signedOut" || written?.status === "unavailable") {
                await saveIcloudMeta({ lastStatus: written.status, lastError: written.error });
                return;
            }
            if (!written?.ok) {
                await saveIcloudMeta({
                    lastStatus: "error",
                    lastError: written?.error || "\u4e0a\u4f20\u5931\u8d25"
                });
                return;
            }
            await saveIcloudMeta({
                lastPushAt: Date.now(),
                lastStatus: "synced",
                lastError: undefined
            });
            return;
        }

        // noop: already in sync — must leave transient "pushing" or UI reports 无响应.
        await saveIcloudMeta({
            syncEpoch,
            lastStatus: "synced",
            lastError: undefined
        });
    })();

    const pending = icloudSyncInFlight;
    try {
        await pending;
    } finally {
        if (icloudSyncInFlight === pending) {
            icloudSyncInFlight = null;
        }
    }
}

function scheduleIcloudPush() {
    if (applyingCloud) return;
    clearTimeout(icloudPushTimer);
    icloudPushTimer = setTimeout(() => {
        runIcloudSync();
    }, ICLOUD_SYNC_DEBOUNCE_MS);
}

async function getIcloudStatusForUi() {
    const Sync = getICloudSync();
    const meta = await getIcloudMeta();
    const nativeStatus = await sendNative({ type: "icloudStatus" }, ICLOUD_NATIVE_TIMEOUT_MS);

    if (!Sync) {
        const lastError = meta.lastError || "\u540c\u6b65\u6a21\u5757\u672a\u52a0\u8f7d\uff0c\u8bf7\u91cd\u65b0\u7f16\u8bd1\u5b89\u88c5\u6269\u5c55";
        return {
            lastStatus: "error",
            lastError,
            label: "\u4e0a\u6b21\u540c\u6b65\u5931\u8d25\uff1a" + lastError
        };
    }

    if (nativeStatus && nativeStatus.ok === false) {
        const lastError = nativeStatus.error || nativeStatus.status || "\u539f\u751f\u901a\u9053\u4e0d\u53ef\u7528";
        return {
            lastStatus: "error",
            lastError,
            label: Sync.formatSyncLabel({ lastStatus: "error", lastError })
        };
    }

    const lastStatus = Sync.resolveDisplayStatus({
        signedIn: nativeStatus?.signedIn,
        available: nativeStatus?.available,
        lastStatus: meta.lastStatus
    });
    const lastError = meta.lastError || (
        lastStatus === "error" ? "\u672a\u77e5\u9519\u8bef" : undefined
    );
    return {
        lastStatus,
        lastError,
        label: Sync.formatSyncLabel({
            lastStatus,
            lastError,
            lastPushAt: meta.lastPushAt,
            lastPullAt: meta.lastPullAt,
            now: Date.now()
        })
    };
}

browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.icloudSyncRequest?.newValue?.epoch) {
        const epoch = Number(changes.icloudSyncRequest.newValue.epoch) || Date.now();
        runIcloudSync({ force: true, requestedEpoch: epoch }).catch((error) => {
            saveIcloudMeta({
                syncEpoch: epoch,
                lastStatus: "error",
                lastError: error.message || String(error)
            });
        });
    }

    if (applyingCloud) return;
    const Sync = getICloudSync();
    const keys = Sync?.SYNC_KEYS || [];
    const touched = keys.some((key) => Object.prototype.hasOwnProperty.call(changes, key));
    if (!touched) return;
    saveIcloudMeta({ localUpdatedAt: Date.now() }).then(() => scheduleIcloudPush());
});

browser.runtime.onStartup.addListener(() => {
    runIcloudSync();
});

async function broadcastRefresh(tabId) {
    const tabs = tabId ? [{ id: tabId }] : await browser.tabs.query({});
    for (const tab of tabs) {
        if (!tab.id) continue;
        try {
            await browser.tabs.sendMessage(tab.id, { type: "refreshContent" });
        } catch {
            // Content script may not exist on this tab.
        }
    }
}

browser.runtime.onInstalled.addListener(async () => {
    const settings = await getSettings();
    if (!settings.onboardingComplete) {
        await saveSettings({
            ...settings,
            globalEnabled: false,
            whitelistMode: true,
            onboardingComplete: true
        });
    }
    runIcloudSync();
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        try {
            if (message.type === "getState") {
                const settings = await getSettings();
                const stats = await getStats();
                const aiKeys = await getAiKeys();
                const tabContext = await resolveTabContext(sender);
                const aiState = getAiStateForPopup(settings, aiKeys);
                sendResponse({
                    settings,
                    stats,
                    hostname: tabContext.hostname,
                    siteEnabled: tabContext.siteEnabled,
                    aiState
                });
                return;
            }

            if (message.type === "getAiProviders") {
                sendResponse({
                    providers: Object.values(AI_PROVIDERS).map((provider) => ({
                        id: provider.id,
                        name: provider.name,
                        defaultModel: provider.defaultModel,
                        models: provider.models,
                        keyPlaceholder: provider.keyPlaceholder
                    }))
                });
                return;
            }

            if (message.type === "saveAiKey") {
                await saveAiKey(message.payload.provider, message.payload.apiKey);
                sendResponse({ ok: true });
                return;
            }

            if (message.type === "getAiProviderProfiles") {
                const profiles = await getAiProviderProfiles();
                sendResponse({ ok: true, profiles: listAiProfilesForUi(profiles) });
                return;
            }

            if (message.type === "saveAiProviderProfile") {
                sendResponse(await upsertAiProviderProfile(message.payload || {}));
                return;
            }

            if (message.type === "applyAiProviderProfile") {
                sendResponse(await applyAiProviderProfile(message.payload?.id));
                return;
            }

            if (message.type === "deleteAiProviderProfile") {
                sendResponse(await deleteAiProviderProfile(message.payload?.id));
                return;
            }

            if (message.type === "testAiConnection") {
                sendResponse(await testAiConnection(message.payload || {}));
                return;
            }

            if (message.type === "aiResolveWord") {
                try {
                    sendResponse(await aiResolveWord(message.payload));
                } catch (error) {
                    sendResponse({ ok: false, error: error.message || "AI \u8bf7\u6c42\u5931\u8d25" });
                }
                return;
            }

            if (message.type === "translateParagraph") {
                try {
                    sendResponse(await translateParagraph(message.payload));
                } catch (error) {
                    sendResponse({ ok: false, error: error.message || "\u6bb5\u843d\u7ffb\u8bd1\u5931\u8d25" });
                }
                return;
            }

            if (message.type === "saveVocabItem") {
                sendResponse(await saveVocabItem(message.payload || {}));
                return;
            }

            if (message.type === "lookupVocabWord") {
                sendResponse(await lookupVocabWord(message.payload || {}));
                return;
            }

            if (message.type === "removeVocabItem") {
                sendResponse(await removeVocabItem(message.payload || {}));
                return;
            }

            if (message.type === "gradeVocabItem") {
                sendResponse(await gradeVocabItem(message.payload || {}));
                return;
            }

            if (message.type === "generateVocabExample") {
                sendResponse(await generateVocabExample(message.payload || {}));
                return;
            }

            if (message.type === "getVocabItems") {
                sendResponse({ ok: true, items: await getVocabItems() });
                return;
            }

            if (message.type === "translateSnippet") {
                sendResponse(await translateSnippet(message.payload || {}));
                return;
            }

            if (message.type === "saveSnippetItem") {
                sendResponse(await saveSnippetItem(message.payload || {}));
                return;
            }

            if (message.type === "removeSnippetItem") {
                sendResponse(await removeSnippetItem(message.payload || {}));
                return;
            }

            if (message.type === "markSnippetFamiliar") {
                sendResponse(await markSnippetFamiliar(message.payload || {}));
                return;
            }

            if (message.type === "gradeSnippetItem") {
                sendResponse(await gradeSnippetItem(message.payload || {}));
                return;
            }

            if (message.type === "getSnippetItems") {
                sendResponse({ ok: true, items: await getSnippetItems() });
                return;
            }

            if (message.type === "saveMarkdownFile") {
                const payload = {
                    type: "saveMarkdown",
                    filename: message.payload?.filename || "GlossX.md",
                    content: message.payload?.content || ""
                };
                sendResponse(await sendNative(payload));
                return;
            }

            if (message.type === "icloudSyncNow") {
                const syncEpoch = Number(message.epoch) || Date.now();
                sendResponse({
                    ok: true,
                    accepted: true,
                    syncEpoch,
                    lastStatus: "pushing",
                    label: "\u6b63\u5728\u540c\u6b65\u2026"
                });
                runIcloudSync({ force: true, requestedEpoch: syncEpoch }).catch((error) => {
                    saveIcloudMeta({
                        syncEpoch,
                        lastStatus: "error",
                        lastError: error.message || String(error)
                    });
                });
                return;
            }

            if (message.type === "getIcloudStatus") {
                sendResponse({ ok: true, ...(await getIcloudStatusForUi()) });
                return;
            }

            if (message.type === "updateSettings") {
                const settings = await updateSettings(message.payload || {});
                const tabContext = await resolveTabContext(sender);
                await broadcastRefresh(tabContext.tabId);
                sendResponse({ settings });
                return;
            }

            if (message.type === "enableCurrentSite") {
                const tabContext = await resolveTabContext(sender);
                const hostname = message.hostname || tabContext.hostname;
                if (!hostname) {
                    sendResponse({ ok: false, error: "\u672a\u68c0\u6d4b\u5230\u5f53\u524d\u7f51\u7ad9" });
                    return;
                }
                const settings = await enableSite(hostname, tabContext.tabId);
                sendResponse({ ok: true, settings });
                return;
            }

            if (message.type === "toggleGlobal") {
                const settings = await getSettings();
                const nextEnabled = !settings.globalEnabled;
                const partial = { globalEnabled: nextEnabled };

                if (nextEnabled && settings.whitelistMode) {
                    const tabContext = await resolveTabContext(sender);
                    if (tabContext.hostname) {
                        const whitelist = new Set(settings.whitelist || []);
                        whitelist.add(tabContext.hostname);
                        partial.whitelist = [...whitelist];
                        partial.pageDisabledHosts = {
                            ...(settings.pageDisabledHosts || {}),
                            [tabContext.hostname]: false
                        };
                    }
                }

                const next = await updateSettings(partial);
                const tabContext = await resolveTabContext(sender);
                await broadcastRefresh(tabContext.tabId);
                sendResponse({ settings: next });
                return;
            }

            if (message.type === "toggleCurrentSite") {
                const settings = await getSettings();
                const tabContext = await resolveTabContext(sender);
                const hostname = message.hostname || tabContext.hostname;
                const whitelist = new Set(settings.whitelist || []);

                if (settings.whitelistMode) {
                    if (whitelist.has(hostname)) {
                        whitelist.delete(hostname);
                    } else {
                        whitelist.add(hostname);
                    }
                    const next = await updateSettings({
                        globalEnabled: true,
                        whitelist: [...whitelist],
                        pageDisabledHosts: {
                            ...(settings.pageDisabledHosts || {}),
                            [hostname]: false
                        }
                    });
                    await broadcastRefresh(tabContext.tabId);
                    sendResponse({ settings: next });
                    return;
                }

                const next = await updateSettings({ globalEnabled: !settings.globalEnabled });
                await broadcastRefresh(tabContext.tabId);
                sendResponse({ settings: next });
                return;
            }

            if (message.type === "openLearningPage") {
                await openLearningPage();
                sendResponse({ ok: true });
                return;
            }

            if (message.type === "openPopupHint") {
                sendResponse({ ok: true });
                return;
            }

            sendResponse(undefined);
        } catch (error) {
            sendResponse({ ok: false, error: error.message || String(error) });
        }
    })();

    return true;
});
