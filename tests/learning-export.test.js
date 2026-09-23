const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = { console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(
        path.resolve(__dirname, "../Shared (Extension)/Resources/lib/learning-export.js"),
        "utf8"
    ),
    sandbox,
    { filename: "learning-export.js" }
);

const E = sandbox.GlossX.LearningExport;

const vocabWord = {
    id: "account",
    word: "account",
    lemma: "account",
    phonetic: "/əˈkaʊnt/",
    pos: "n",
    definitions: ["账户", "解释"],
    usageExample: { english: "She opened an account.", chinese: "她开了一个账户。" },
    extraExample: { english: "She opened an account.", chinese: "她开了一个账户。" },
    exampleFromContext: { english: "Take this into account.", chinese: "把这一点考虑进去。" },
    status: "learning",
    addedAt: Date.parse("2026-08-13T10:00:00+08:00")
};

const mappedWord = E.fromVocabItem(vocabWord);
assert.equal(mappedWord.kind, "word");
assert.equal(mappedWord.term, "account");
assert.equal(mappedWord.lemma, "");
assert.equal(mappedWord.phonetic, "/əˈkaʊnt/");
assert.equal(mappedWord.definitions.join("；"), "账户；解释");
assert.equal(mappedWord.examples.length, 2);
assert.equal(mappedWord.examples[0].english, "Take this into account.");
assert.equal(mappedWord.examples[1].chinese, "她开了一个账户。");

const mappedLemma = E.fromVocabItem({ ...vocabWord, word: "accounts", lemma: "account" });
assert.equal(mappedLemma.lemma, "account");

const phrase = {
    id: "p1",
    text: "take into account",
    type: "phrase",
    translation: "把……考虑在内",
    context: {
        fullEnglish: "We should take the cost into account.",
        fullChinese: "我们应该把成本考虑在内。"
    },
    status: "new",
    addedAt: Date.parse("2026-08-13T12:00:00+08:00")
};

const mappedPhrase = E.fromSnippetItem(phrase);
assert.equal(mappedPhrase.kind, "phrase");
assert.equal(mappedPhrase.term, "take into account");
assert.equal(mappedPhrase.phonetic, "");
assert.equal(mappedPhrase.definitions.join("；"), phrase.translation);
assert.equal(mappedPhrase.examples[0].english, "We should take the cost into account.");

const sentence = {
    text: "The market responded positively.",
    type: "sentence",
    translation: "",
    context: {
        fullEnglish: "The market responded positively.",
        fullChinese: "市场反应积极。"
    },
    addedAt: 1
};
const mappedSentence = E.fromSnippetItem(sentence);
assert.equal(mappedSentence.kind, "sentence");
assert.equal(mappedSentence.definitions.join("；"), "市场反应积极。");

const today = Date.parse("2026-08-13T18:00:00+08:00");
const vocabItems = {
    a: { ...vocabWord, id: "a", word: "alpha", status: "new", addedAt: today },
    b: {
        ...vocabWord,
        id: "b",
        word: "beta",
        status: "mastered",
        addedAt: Date.parse("2026-08-12T10:00:00+08:00")
    }
};

assert.equal(E.filterVocabItems(vocabItems, "today", today).length, 1);
assert.equal(E.filterVocabItems(vocabItems, "mastered")[0].word, "beta");
assert.equal(E.filterVocabItems(vocabItems, "learning")[0].word, "alpha");
assert.equal(E.filterVocabItems(vocabItems, "all").length, 2);

const snippetItems = {
    p: phrase,
    s: { ...sentence, status: "familiar", addedAt: Date.parse("2026-08-12T10:00:00+08:00") }
};
assert.equal(E.filterSnippetItems(snippetItems, "phrase").length, 1);
assert.equal(E.filterSnippetItems(snippetItems, "sentence")[0].type, "sentence");
assert.equal(E.filterSnippetItems(snippetItems, "familiar")[0].type, "sentence");

const doc = E.buildExportDocument({
    tab: "vocab",
    filter: "all",
    vocabItems,
    now: today
});
assert.equal(doc.tabLabel, "生词本");
assert.equal(doc.filterLabel, "全部");
assert.equal(doc.entries.length, 2);
assert.equal(doc.entries[0].term, "alpha");

const phraseDoc = E.buildExportDocument({
    tab: "snippets",
    filter: "phrase",
    snippetItems,
    now: today
});
assert.equal(phraseDoc.tabLabel, "句库");
assert.equal(phraseDoc.entries.length, 1);
assert.equal(phraseDoc.entries[0].term, "take into account");
const phraseHtml = E.renderExportBody(phraseDoc);
assert.match(phraseHtml, /释义/);
assert.match(phraseHtml, /例句/);
assert.match(phraseHtml, /take into account/);
assert.match(phraseHtml, /把……考虑在内/);

const title = E.buildFileTitle({
    tabLabel: "生词本",
    filterLabel: "全部",
    exportedAt: today
});
assert.match(title, /^GlossX-生词本-全部-/);

const html = E.renderExportBody(doc);
assert.match(html, /发音/);
assert.match(html, /释义/);
assert.match(html, /例句/);
assert.match(html, /\/əˈkaʊnt\//);
assert.match(html, /账户/);
assert.match(html, /She opened an account\./);

const emptyHtml = E.renderExportBody({ entries: [] });
assert.match(emptyHtml, /没有可导出的内容/);

const markdown = E.renderExportMarkdown(doc);
assert.match(markdown, /^# 生词本 · 全部/m);
assert.match(markdown, /共 2 条/);
assert.match(markdown, /## 1\. alpha（单词）/);
assert.match(markdown, /- 发音：/);
assert.match(markdown, /- 释义：账户；解释/);
assert.match(markdown, /- 例句：/);
assert.match(markdown, /She opened an account\./);

const phraseMarkdown = E.renderExportMarkdown(phraseDoc);
assert.match(phraseMarkdown, /## 1\. take into account（短语）/);
assert.match(phraseMarkdown, /把……考虑在内/);
assert.equal(E.renderExportMarkdown({ entries: [] }), "");

const mdName = E.buildDownloadFilename({
    tabLabel: "生词本",
    filterLabel: "全部",
    exportedAt: today
});
assert.match(mdName, /^GlossX-生词本-全部-.*\.md$/);

assert.equal(E.escapeHtml('<script>"x"'), "&lt;script&gt;&quot;x&quot;");

console.log("learning-export tests passed");
