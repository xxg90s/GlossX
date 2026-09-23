(function (global) {
    const TAB_LABELS = {
        vocab: "生词本",
        snippets: "句库"
    };

    const FILTER_LABELS = {
        today: "今日新增",
        all: "全部",
        learning: "学习中",
        mastered: "已掌握",
        phrase: "短语",
        sentence: "整句",
        familiar: "已熟悉"
    };

    function escapeHtml(text) {
        return String(text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function sanitizeText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function localDayKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function formatDayLabel(dayKey) {
        const parts = String(dayKey || "").split("-");
        if (parts.length !== 3) return dayKey || "";
        return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`;
    }

    function isToday(timestamp, now = Date.now()) {
        if (!timestamp) return false;
        return localDayKey(new Date(timestamp)) === localDayKey(new Date(now));
    }

    function uniqueExamples(examples) {
        const list = [];
        const seen = new Set();
        (examples || []).forEach((example) => {
            const english = sanitizeText(example?.english);
            const chinese = sanitizeText(example?.chinese);
            if (!english && !chinese) return;
            const key = `${english.toLowerCase()}|${chinese}`;
            if (seen.has(key)) return;
            seen.add(key);
            list.push({ english, chinese });
        });
        return list;
    }

    function fromVocabItem(item) {
        const term = sanitizeText(item?.word);
        const lemma = sanitizeText(item?.lemma);
        return {
            kind: "word",
            term,
            lemma: lemma && lemma.toLowerCase() !== term.toLowerCase() ? lemma : "",
            phonetic: sanitizeText(item?.phonetic),
            pos: sanitizeText(item?.pos),
            definitions: (item?.definitions || []).map(sanitizeText).filter(Boolean),
            examples: uniqueExamples([
                item?.exampleFromContext,
                item?.usageExample,
                item?.extraExample
            ]),
            addedAt: Number(item?.addedAt) || 0
        };
    }

    function fromSnippetItem(item) {
        const term = sanitizeText(item?.text);
        const translation = sanitizeText(item?.translation);
        const fullEnglish = sanitizeText(item?.context?.fullEnglish);
        const fullChinese = sanitizeText(item?.context?.fullChinese);
        const definitions = translation
            ? [translation]
            : (fullChinese && fullEnglish === term ? [fullChinese] : []);
        const examples = uniqueExamples([
            fullEnglish || fullChinese
                ? { english: fullEnglish || term, chinese: fullChinese }
                : null
        ]);
        return {
            kind: item?.type === "sentence" ? "sentence" : "phrase",
            term,
            lemma: "",
            phonetic: "",
            pos: "",
            definitions,
            examples,
            addedAt: Number(item?.addedAt) || 0
        };
    }

    function filterVocabItems(items, filter, now = Date.now()) {
        const list = Array.isArray(items) ? items : Object.values(items || {});
        switch (filter) {
            case "today":
                return list.filter((item) => isToday(item.addedAt, now));
            case "learning":
                return list.filter((item) => (
                    item.status === "new"
                    || item.status === "learning"
                    || item.status === "review"
                ));
            case "mastered":
                return list.filter((item) => item.status === "mastered");
            default:
                return list.slice();
        }
    }

    function filterSnippetItems(items, filter, now = Date.now()) {
        const list = Array.isArray(items) ? items : Object.values(items || {});
        switch (filter) {
            case "today":
                return list.filter((item) => isToday(item.addedAt, now));
            case "phrase":
                return list.filter((item) => item.type === "phrase");
            case "sentence":
                return list.filter((item) => item.type === "sentence");
            case "familiar":
                return list.filter((item) => item.status === "familiar");
            default:
                return list.slice();
        }
    }

    function sortByAddedAtDesc(items) {
        return items.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }

    function buildExportDocument(options) {
        const tab = options?.tab === "snippets" ? "snippets" : "vocab";
        const filter = FILTER_LABELS[options?.filter] ? options.filter : "all";
        const now = Number(options?.now) || Date.now();
        const raw = tab === "snippets"
            ? sortByAddedAtDesc(filterSnippetItems(options?.snippetItems, filter, now))
            : sortByAddedAtDesc(filterVocabItems(options?.vocabItems, filter, now));
        const entries = raw.map(tab === "snippets" ? fromSnippetItem : fromVocabItem)
            .filter((entry) => entry.term);

        return {
            tab,
            filter,
            tabLabel: TAB_LABELS[tab],
            filterLabel: FILTER_LABELS[filter],
            exportedAt: now,
            entries
        };
    }

    function buildFileTitle(doc) {
        const day = formatDayLabel(localDayKey(new Date(doc?.exportedAt || Date.now())));
        const tabLabel = doc?.tabLabel || TAB_LABELS.vocab;
        const filterLabel = doc?.filterLabel || FILTER_LABELS.all;
        return `GlossX-${tabLabel}-${filterLabel}-${day}`;
    }

    function buildDownloadFilename(doc) {
        return `${buildFileTitle(doc)}.md`;
    }

    function renderMarkdownExamples(entry) {
        if (!entry?.examples?.length) return "- 例句：—";
        const lines = entry.examples.map((example) => {
            const english = example.english || "";
            const chinese = example.chinese || "";
            if (english && chinese) return `  - ${english} — ${chinese}`;
            if (english) return `  - ${english}`;
            return `  - ${chinese}`;
        });
        return ["- 例句：", ...lines].join("\n");
    }

    function renderMarkdownEntry(entry, index) {
        const lines = [
            `## ${index + 1}. ${entry.term}（${kindLabel(entry.kind)}）`,
            ""
        ];
        if (entry.lemma) {
            lines.push(`- 原形：${entry.lemma}`);
        }
        if (entry.kind === "word" || entry.phonetic) {
            const phonetic = entry.phonetic
                ? `${entry.phonetic}${entry.pos ? ` ${entry.pos}` : ""}`.trim()
                : "—";
            lines.push(`- 发音：${phonetic}`);
        }
        lines.push(`- 释义：${entry.definitions?.length ? entry.definitions.join("；") : "—"}`);
        lines.push(renderMarkdownExamples(entry));
        return lines.join("\n");
    }

    function renderExportMarkdown(doc) {
        if (!doc?.entries?.length) return "";
        const day = formatDayLabel(localDayKey(new Date(doc.exportedAt || Date.now())));
        const header = [
            `# ${doc.tabLabel || TAB_LABELS.vocab} · ${doc.filterLabel || FILTER_LABELS.all}`,
            "",
            `导出时间：${day} · 共 ${doc.entries.length} 条`,
            ""
        ];
        const body = doc.entries.map((entry, index) => renderMarkdownEntry(entry, index));
        return `${header.join("\n")}${body.join("\n\n")}\n`;
    }

    function renderDefinitions(entry) {
        if (!entry?.definitions?.length) return "—";
        return escapeHtml(entry.definitions.join("；"));
    }

    function renderExamples(entry) {
        if (!entry?.examples?.length) return "—";
        return entry.examples.map((example) => {
            const english = example.english
                ? `<div class="export-ex-en">${escapeHtml(example.english)}</div>`
                : "";
            const chinese = example.chinese
                ? `<div class="export-ex-cn">${escapeHtml(example.chinese)}</div>`
                : "";
            return `<div class="export-example">${english}${chinese}</div>`;
        }).join("");
    }

    function kindLabel(kind) {
        if (kind === "phrase") return "短语";
        if (kind === "sentence") return "整句";
        return "单词";
    }

    function renderPhonetic(entry) {
        if (!entry?.phonetic) return "—";
        const pos = entry.pos ? ` ${entry.pos}` : "";
        return escapeHtml(`${entry.phonetic}${pos}`.trim());
    }

    function renderEntry(entry, index) {
        const lemma = entry.lemma
            ? `<div class="export-lemma">原形 ${escapeHtml(entry.lemma)}</div>`
            : "";
        const phoneticRow = entry.kind === "word" || entry.phonetic
            ? `<div class="export-row">
        <span class="export-label">发音</span>
        <div class="export-value">${renderPhonetic(entry)}</div>
    </div>`
            : "";
        return `
<article class="export-entry">
    <div class="export-entry-head">
        <span class="export-index">${index + 1}.</span>
        <div class="export-term-block">
            <div class="export-term-line">
                <span class="export-term">${escapeHtml(entry.term)}</span>
                <span class="export-kind">${kindLabel(entry.kind)}</span>
            </div>
            ${lemma}
        </div>
    </div>
    ${phoneticRow}
    <div class="export-row">
        <span class="export-label">释义</span>
        <div class="export-value">${renderDefinitions(entry)}</div>
    </div>
    <div class="export-row">
        <span class="export-label">例句</span>
        <div class="export-value">${renderExamples(entry)}</div>
    </div>
</article>`;
    }

    function renderExportBody(doc) {
        if (!doc?.entries?.length) {
            return `
<div class="export-empty">
    <div class="export-empty-title">没有可导出的内容</div>
    <div class="export-empty-text">请换一个筛选条件，或先收藏单词 / 短语。</div>
</div>`;
        }
        return doc.entries.map((entry, index) => renderEntry(entry, index)).join("");
    }

    global.GlossX = global.GlossX || {};
    global.GlossX.LearningExport = {
        TAB_LABELS,
        FILTER_LABELS,
        escapeHtml,
        localDayKey,
        formatDayLabel,
        fromVocabItem,
        fromSnippetItem,
        filterVocabItems,
        filterSnippetItems,
        buildExportDocument,
        buildFileTitle,
        buildDownloadFilename,
        renderExportBody,
        renderExportMarkdown
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
