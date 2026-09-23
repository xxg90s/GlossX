(function (global) {
    const AI_TIMEOUT_MS = 15000;
    const PARAGRAPH_AI_TEMPERATURE = 0.4;
    const SNIPPET_AI_TIMEOUT_MS = 12000;
    const SNIPPET_FALLBACK_TIMEOUT_MS = 6000;
    const SNIPPET_CONTEXT_MAX_CHARS = 320;
    const SNIPPET_CONTEXT_WINDOW = 160;
    let userRequestCount = 0;
    let aiRunning = false;
    const aiQueue = [];

    function hasUserRequest() {
        return userRequestCount > 0;
    }

    async function runUserRequest(fn) {
        userRequestCount += 1;
        try {
            return await fn();
        } finally {
            userRequestCount = Math.max(0, userRequestCount - 1);
        }
    }

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

    function scheduleAiCall(priority, fn) {
        return new Promise((resolve, reject) => {
            aiQueue.push({ priority, fn, resolve, reject });
            aiQueue.sort((a, b) => {
                if (a.priority === b.priority) return 0;
                return a.priority === "user" ? -1 : 1;
            });
            drainAiQueue();
        });
    }

    async function drainAiQueue() {
        if (aiRunning || !aiQueue.length) return;
        aiRunning = true;
        const task = aiQueue.shift();
        try {
            task.resolve(await task.fn());
        } catch (error) {
            task.reject(error);
        } finally {
            aiRunning = false;
            drainAiQueue();
        }
    }

    function sanitizeText(value) {
        const TN = global.GlossX?.TextNormalize;
        if (TN?.normalizeUiText) return TN.normalizeUiText(value);
        return String(value || "").trim();
    }

    function normalizeParagraphText(text) {
        return String(text || "").trim().replace(/\s+/g, " ");
    }

    function parseAiJson(content) {
        if (!content) return null;
        let trimmed = String(content).trim();
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

    async function getSettingsAndKey() {
        const result = await browser.storage.local.get(["settings", "aiKeys"]);
        const settings = result.settings || {};
        const providerId = settings.aiProvider || "deepseek";
        const apiKey = (result.aiKeys || {})[providerId] || "";
        return { settings, apiKey, providerId };
    }

    async function fetchWithTimeout(url, options = {}, timeoutMs = AI_TIMEOUT_MS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, {
                ...options,
                signal: controller.signal
            });
        } catch (error) {
            if (error?.name === "AbortError") {
                throw new Error("请求超时，请检查网络或 API Key");
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    async function callOpenAiCompatible({ baseUrl, model, apiKey, prompt, timeoutMs, maxTokens, temperature }) {
        const response = await fetchWithTimeout(baseUrl, {
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
                        content: "Reply with valid JSON only. Chinese fields must be readable Simplified Chinese UTF-8 characters (简体中文)."
                    },
                    { role: "user", content: prompt }
                ]
            })
        }, timeoutMs || AI_TIMEOUT_MS);

        if (!response.ok) {
            const text = sanitizeText(await response.text());
            throw new Error(text || `HTTP ${response.status}`);
        }

        const data = await response.json();
        return String(data.choices?.[0]?.message?.content || "");
    }

    async function callAnthropic({ baseUrl, model, apiKey, prompt, maxTokens = 120, timeoutMs, temperature }) {
        const response = await fetchWithTimeout(baseUrl, {
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
        }, timeoutMs || AI_TIMEOUT_MS);

        if (!response.ok) {
            const text = sanitizeText(await response.text());
            throw new Error(text || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const block = data.content?.find((item) => item.type === "text");
        return String(block?.text || "");
    }

    async function callAiDirect({ settings, apiKey, prompt, maxTokens, timeoutMs, temperature }) {
        const endpoint = global.GlossX?.AIProviders?.resolveEndpoint?.(settings);
        if (!endpoint?.baseUrl || !endpoint?.model) {
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

    async function callAi(options) {
        const priority = options?.priority === "user" ? "user" : "page";
        return scheduleAiCall(priority, () => callAiDirect(options));
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

    async function translateWithMyMemory(text) {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=zh-CN|en`;
        const response = await fetchWithTimeout(url, {}, 12000);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const translated = sanitizeText(data?.responseData?.translatedText);
        if (!translated) {
            throw new Error("备用翻译返回为空");
        }
        return translated;
    }

    async function translateSnippetWithMyMemory(text) {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`;
        const response = await fetchWithTimeout(url, {}, SNIPPET_FALLBACK_TIMEOUT_MS);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const translated = sanitizeText(data?.responseData?.translatedText);
        if (!translated) {
            throw new Error("备用翻译返回为空");
        }
        return translated;
    }

    async function enrichSnippetTranslationWithAi(text, context) {
        const { settings, apiKey } = await getSettingsAndKey();
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
            const content = await callAi({
                settings,
                apiKey,
                prompt: lines.join("\n"),
                maxTokens: 160,
                timeoutMs: SNIPPET_AI_TIMEOUT_MS,
                priority: "user"
            });
            const parsed = parseAiJson(content);
            let translation = sanitizeText(parsed?.translation || parsed?.chinese || "");
            if (!translation) {
                const plain = sanitizeText(content);
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

    async function translateSnippet(payload) {
        return runUserRequest(() => translateSnippetBody(payload));
    }

    async function translateSnippetBody(payload) {
        const text = String(payload?.text || "").trim();
        const context = payload?.context || {};
        const type = payload?.type === "sentence" ? "sentence" : "phrase";
        const preference = payload?.preference === "uk" ? "uk" : "us";

        if (!text) return { ok: false, error: "snippet_invalid_text" };

        const utils = global.GlossX?.SnippetUtils;
        const fromContext = utils?.resolveTranslationFromContext
            ? utils.resolveTranslationFromContext(text, context, type)
            : null;
        if (fromContext) {
            return { ok: true, translation: fromContext, source: "context" };
        }

        const wordCount = utils?.countWords ? utils.countWords(text) : text.split(/\s+/).length;
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

    async function translateParagraph(payload) {
        const text = normalizeParagraphText(payload?.text);
        if (!text) {
            return { ok: false, error: "段落内容为空" };
        }

        const { settings, apiKey } = await getSettingsAndKey();
        let english = null;
        let source = "error";

        if (apiKey) {
            try {
                const content = await callAi({
                    settings,
                    apiKey,
                    prompt: buildParagraphPrompt(text),
                    maxTokens: 2048,
                    temperature: PARAGRAPH_AI_TEMPERATURE,
                    priority: "page"
                });
                const parsed = parseAiJson(content);
                if (parsed?.english) {
                    english = String(parsed.english).trim();
                    source = "ai";
                }
            } catch (error) {
                console.warn("[GlossX] AI paragraph translation failed:", error);
            }
        }

        if (!english && !hasUserRequest()) {
            try {
                english = await translateWithMyMemory(text);
                source = "fallback";
            } catch (error) {
                console.warn("[GlossX] Fallback paragraph translation failed:", error);
            }
        }

        if (!english) {
            return { ok: false, error: "翻译失败" };
        }

        return { ok: true, english, source };
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

    async function resolveWord(payload) {
        const { settings, apiKey } = await getSettingsAndKey();
        if (!settings.aiEnabled) {
            return { ok: false, error: "AI 未启用" };
        }
        if (!apiKey) {
            return { ok: false, error: "请先填写 API Key" };
        }

        const { zh, context, candidates } = payload || {};
        if (!zh || !Array.isArray(candidates) || !candidates.length) {
            return { ok: false, error: "候选词为空" };
        }

        try {
            const content = await callAi({
                settings,
                apiKey,
                prompt: buildResolvePrompt(zh, context || "", candidates),
                priority: "user"
            });
            const parsed = parseAiJson(content);
            const entry = pickCandidateFromAi(candidates, parsed);
            if (!entry) {
                return { ok: false, error: "AI 返回结果无法解析" };
            }
            return { ok: true, entry };
        } catch (error) {
            return { ok: false, error: error.message || "AI 请求失败" };
        }
    }

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
        const TN = global.GlossX?.TextNormalize;
        if (TN?.normalizeDefinitionsFromAi) {
            return TN.normalizeDefinitionsFromAi(definitions);
        }
        if (!Array.isArray(definitions)) return [];
        return definitions
            .map((item) => String(item || "").trim())
            .filter(Boolean);
    }

    function sanitizeExample(example) {
        const TN = global.GlossX?.TextNormalize;
        if (TN?.normalizeExample) {
            return TN.normalizeExample(example);
        }
        if (!example?.english) return null;
        return {
            english: String(example.english),
            chinese: String(example.chinese || "")
        };
    }

    const vocabLookupCache = new Map();

    async function enrichVocabWithAi(word, preference = "us") {
        const { settings, apiKey } = await getSettingsAndKey();
        if (!apiKey) return { error: "vocab_no_api_key" };

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
            const content = await callAi({
                settings,
                apiKey,
                prompt,
                maxTokens: 280,
                priority: "user"
            });
            const parsed = parseAiJson(content);
            if (!parsed) {
                return { error: "vocab_ai_invalid_json", source: "ai" };
            }
            return {
                lemma: sanitizeText(parsed.lemma || word),
                phonetic: sanitizeText(parsed.phonetic || ""),
                pos: sanitizeText(parsed.pos || ""),
                definitions: sanitizeAiDefinitions(coerceAiDefinitionList(parsed)),
                example: sanitizeExample(parsed.example),
                source: "ai"
            };
        } catch (error) {
            console.warn("[GlossX] AI vocab lookup failed:", error);
            return { error: "vocab_ai_query_failed", source: "ai" };
        }
    }

    async function enrichVocabDefinitionsWithAi(word) {
        const { settings, apiKey } = await getSettingsAndKey();
        if (!apiKey) return [];

        const prompt = [
            "You are an English teacher for Chinese learners in Mainland China.",
            `Word: ${word}`,
            "Give 1-2 most common meanings as short Simplified Chinese glosses.",
            "Never use Traditional Chinese. Never return English.",
            'Return ONLY JSON: {"definitions":["简体中文释义1","简体中文释义2"]}'
        ].join("\n");

        try {
            const content = await callAi({
                settings,
                apiKey,
                prompt,
                maxTokens: 160,
                priority: "user"
            });
            const parsed = parseAiJson(content);
            if (!parsed) return [];
            return sanitizeAiDefinitions(coerceAiDefinitionList(parsed));
        } catch (error) {
            console.warn("[GlossX] AI vocab definition fallback failed:", error);
            return [];
        }
    }

    async function lookupVocabWord(payload) {
        return runUserRequest(() => lookupVocabWordBody(payload));
    }

    async function lookupVocabWordBody(payload) {
        const word = String(payload?.word || "").trim();
        if (!word) return { ok: false, error: "vocab_invalid_word" };

        const preference = payload?.preference === "uk" ? "uk" : "us";
        const cacheKey = `${word.toLowerCase()}|${preference}`;
        if (vocabLookupCache.has(cacheKey)) {
            const cached = vocabLookupCache.get(cacheKey);
            const cachedDefs = sanitizeAiDefinitions(cached.definitions || []);
            if (cachedDefs.length) {
                return {
                    ok: true,
                    ...cached,
                    definitions: cachedDefs,
                    example: sanitizeExample(cached.example),
                    cached: true
                };
            }
            vocabLookupCache.delete(cacheKey);
        }

        const { apiKey } = await getSettingsAndKey();
        if (!apiKey) {
            return { ok: false, error: "vocab_no_api_key" };
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
            lemma = sanitizeText(ai.lemma || lemma);
            phonetic = sanitizeText(ai.phonetic || "");
            pos = sanitizeText(ai.pos || "");
            definitions = sanitizeAiDefinitions(ai.definitions || []);
            example = sanitizeExample(ai.example);
        }

        if (!definitions.length) {
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
                lemma: sanitizeText(lemma) || lemma,
                phonetic: String(phonetic || "").trim(),
                pos: String(pos || "").trim(),
                definitions: [],
                example
            };
        }

        const result = {
            word: String(word).trim(),
            lemma: sanitizeText(lemma) || lemma,
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

    global.GlossX = global.GlossX || {};
    global.GlossX.AIClient = {
        translateParagraph,
        translateSnippet,
        resolveWord,
        lookupVocabWord,
        hasUserRequest,
        callAi,
        parseAiJson
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
