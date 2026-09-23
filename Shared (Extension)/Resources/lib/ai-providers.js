(function (global) {
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

    function listProviders() {
        return Object.values(AI_PROVIDERS);
    }

    global.GlossX = global.GlossX || {};
    global.GlossX.AIProviders = {
        AI_PROVIDERS,
        getProvider,
        resolveEndpoint,
        listProviders
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
