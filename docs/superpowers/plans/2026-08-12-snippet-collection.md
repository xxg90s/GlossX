# 句子收集（句库）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 GlossX 扩展中新增句库功能：用户可在翻译句内拖拽选区收藏短语/整句，通过统一「学习」入口在句库 Tab 浏览与复习。

**Architecture:** 独立存储 `snippetItems`（mirror `vocab-storage.js` 模式）；content 侧 `SnippetMarker` 监听选区并弹出 `snippet-save-panel`；新建 `learning.html` 作为 Tab 容器，内嵌现有生词本逻辑与新建 `snippets.js`；popup 统计合并三项来源。

**Tech Stack:** Safari Web Extension (Manifest V3)、Vanilla JS、`browser.storage.local`、Node `vm` 单元测试（与现有 `tests/vocab-marker.test.js` 同模式）

## Global Constraints

- 短语阈值：≤6 词 → `phrase`；≥7 词或覆盖整句 ≥80% → `sentence`
- 存储上限：`snippetItems` 1000 条；`vocabItems` 2000 条不变
- 选区最小长度：2 字符，且含至少 1 个英文字母
- popup tooltip 格式：`词库 N · 生词 M · 句库 K`
- 约束命名使用 leading/trailing，不用 left/right
- 不实现 v2 功能：标签、导出、备注、跨设备同步
- v1.4 MVP 不含：短语 SM-2 学习流、页面片段高亮（属 v1.5）

---

## File Map

| 文件 | 职责 |
|------|------|
| `lib/snippet-utils.js` | 纯函数：类型检测、ID 生成、选区文本规范化 |
| `lib/snippet-storage.js` | `snippetItems` CRUD + stats 增量 |
| `lib/snippet-save-panel.js` | 选区浮层 UI（mirror `word-save-panel.js`） |
| `lib/snippet-marker.js` | 选区监听、保存回调、toast |
| `learning.html` | 统一学习页 Tab 容器 |
| `learning.js` | Tab 切换、URL hash 路由 |
| `learning.css` | Tab 与句库样式 |
| `snippets.js` | 句库列表、整句浏览、短语列表（v1.4 无学习流） |
| `vocabulary.html` | 改为 meta refresh / JS 重定向到 `learning.html#vocab` |
| `popup.html` / `popup.js` | 「学习」入口 + 三项统计 |
| `content.js` | 初始化 SnippetMarker |
| `content.css` | 浮层样式 |
| `manifest.json` | 注册新脚本与 `learning.html` |
| `lib/storage.js` / `popup-storage.js` / `background.js` | stats 默认值扩展 |
| `tests/snippet-utils.test.js` | 工具函数测试 |
| `tests/snippet-storage.test.js` | 存储 CRUD 测试 |
| `tests/snippet-marker.test.js` | 选区仲裁逻辑测试 |
| `tests/learning-page.test.js` | 页面资源路径 smoke test |

---

### Task 1: snippet-utils 纯函数

**Files:**
- Create: `Shared (Extension)/Resources/lib/snippet-utils.js`
- Test: `tests/snippet-utils.test.js`

**Interfaces:**
- Produces:
  - `GlossX.SnippetUtils.normalizeText(text: string): string`
  - `GlossX.SnippetUtils.countWords(text: string): number`
  - `GlossX.SnippetUtils.detectType(text: string, fullEnglish?: string): "phrase" | "sentence"`
  - `GlossX.SnippetUtils.buildSnippetId(text: string, hostname: string): string`
  - `GlossX.SnippetUtils.isValidSelection(text: string): boolean`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/snippet-utils.test.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = { globalThis: {}, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(
        path.resolve(__dirname, "../Shared (Extension)/Resources/lib/snippet-utils.js"),
        "utf8"
    ),
    sandbox,
    { filename: "snippet-utils.js" }
);

const U = sandbox.GlossX.SnippetUtils;

assert.equal(U.detectType("take into account"), "phrase");
assert.equal(U.detectType("The market responded positively to the news yesterday"), "sentence");
assert.equal(
    U.detectType("The government announced new policies yesterday.", "The government announced new policies yesterday."),
    "sentence"
);
assert.equal(U.isValidSelection("a"), false);
assert.equal(U.isValidSelection("ab"), true);
assert.equal(U.buildSnippetId("Hello World", "example.com"), U.buildSnippetId("hello world", "example.com"));

console.log("snippet-utils tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/snippet-utils.test.js`  
Expected: FAIL — `Cannot find module` or `GlossX is not defined`

- [ ] **Step 3: Write minimal implementation**

```javascript
// Shared (Extension)/Resources/lib/snippet-utils.js
(function (global) {
    const PHRASE_MAX_WORDS = 6;
    const SENTENCE_COVERAGE_RATIO = 0.8;

    function normalizeText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function countWords(text) {
        const normalized = normalizeText(text);
        if (!normalized) return 0;
        return normalized.split(/\s+/).filter(Boolean).length;
    }

    function detectType(text, fullEnglish) {
        const normalized = normalizeText(text);
        const wordCount = countWords(normalized);
        if (fullEnglish) {
            const full = normalizeText(fullEnglish);
            if (full && normalized.length / full.length >= SENTENCE_COVERAGE_RATIO) {
                return "sentence";
            }
        }
        return wordCount <= PHRASE_MAX_WORDS ? "phrase" : "sentence";
    }

    function buildSnippetId(text, hostname) {
        const key = `${normalizeText(text).toLowerCase()}|${String(hostname || "").toLowerCase()}`;
        let hash = 0;
        for (let i = 0; i < key.length; i += 1) {
            hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
        }
        return `snip_${Math.abs(hash).toString(36)}`;
    }

    function isValidSelection(text) {
        const normalized = normalizeText(text);
        if (normalized.length < 2) return false;
        return /[a-zA-Z]/.test(normalized);
    }

    global.GlossX = global.GlossX || {};
    global.GlossX.SnippetUtils = {
        normalizeText,
        countWords,
        detectType,
        buildSnippetId,
        isValidSelection,
        PHRASE_MAX_WORDS,
        SENTENCE_COVERAGE_RATIO
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/snippet-utils.test.js`  
Expected: `snippet-utils tests passed`

- [ ] **Step 5: Commit**

```bash
git add "Shared (Extension)/Resources/lib/snippet-utils.js" tests/snippet-utils.test.js
git commit -m "feat: add snippet-utils for type detection and id generation"
```

---

### Task 2: snippet-storage CRUD

**Files:**
- Create: `Shared (Extension)/Resources/lib/snippet-storage.js`
- Modify: `Shared (Extension)/Resources/lib/storage.js`（stats 默认值加 `snippetNewToday: 0`, `snippetReviewedToday: 0`）
- Modify: `Shared (Extension)/Resources/popup-storage.js`（同上）
- Modify: `Shared (Extension)/Resources/background.js`（stats 默认值同上）
- Test: `tests/snippet-storage.test.js`

**Interfaces:**
- Consumes: `GlossX.SnippetUtils.buildSnippetId`, `detectType`, `normalizeText`
- Produces:
  - `GlossX.SnippetStorage.getItems(): Promise<Record<string, SnippetItem>>`
  - `GlossX.SnippetStorage.saveItem(payload): Promise<{ok, item?, isNew?, error?}>`
  - `GlossX.SnippetStorage.removeItem(id): Promise<{ok, error?}>`
  - `GlossX.SnippetStorage.markFamiliar(id): Promise<{ok, error?}>`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/snippet-storage.test.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const storageData = {};
const sandbox = {
    console,
    browser: {
        storage: {
            local: {
                async get(key) {
                    if (typeof key === "string") return { [key]: storageData[key] };
                    return { ...storageData };
                },
                async set(obj) {
                    Object.assign(storageData, obj);
                }
            }
        }
    },
    globalThis: {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

for (const file of ["snippet-utils.js", "snippet-storage.js"]) {
    vm.runInContext(
        fs.readFileSync(
            path.resolve(__dirname, `../Shared (Extension)/Resources/lib/${file}`),
            "utf8"
        ),
        sandbox,
        { filename: file }
    );
}

(async () => {
    const S = sandbox.GlossX.SnippetStorage;
    const payload = {
        text: "take into account",
        context: {
            fullEnglish: "We must take into account all factors.",
            fullChinese: "我们必须考虑所有因素。",
            pageUrl: "https://example.com/a",
            hostname: "example.com"
        }
    };
    const saved = await S.saveItem(payload);
    assert.equal(saved.ok, true);
    assert.equal(saved.isNew, true);
    assert.equal(saved.item.type, "phrase");

    const dup = await S.saveItem(payload);
    assert.equal(dup.ok, true);
    assert.equal(dup.isNew, false);

    const items = await S.getItems();
    assert.equal(Object.keys(items).length, 1);

    const removed = await S.removeItem(saved.item.id);
    assert.equal(removed.ok, true);
    assert.equal(Object.keys(await S.getItems()).length, 0);

    console.log("snippet-storage tests passed");
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/snippet-storage.test.js`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

实现 `snippet-storage.js`，结构 mirror `vocab-storage.js`：
- `MAX_SNIPPET_ITEMS = 1000`
- `createInitialSnippetRecord(payload)` 设置 `status: "new"`, `addedAt: Date.now()`
- `phrase` 类型初始化 SM-2 字段；`sentence` 类型不初始化 SM-2
- `saveItem` 用 `buildSnippetId(text, context.hostname)` 作为 id
- 新条目 `stats.snippetNewToday += 1`（mirror vocab 的 stats 逻辑）
- `markFamiliar(id)` → `status: "familiar"`, `familiarAt: Date.now()`

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/snippet-storage.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "Shared (Extension)/Resources/lib/snippet-storage.js" \
  "Shared (Extension)/Resources/lib/storage.js" \
  "Shared (Extension)/Resources/popup-storage.js" \
  "Shared (Extension)/Resources/background.js" \
  tests/snippet-storage.test.js
git commit -m "feat: add snippet-storage CRUD with stats tracking"
```

---

### Task 3: snippet-save-panel 浮层

**Files:**
- Create: `Shared (Extension)/Resources/lib/snippet-save-panel.js`
- Modify: `Shared (Extension)/Resources/content.css`

**Interfaces:**
- Consumes: `GlossX.SnippetUtils.detectType`
- Produces:
  - `GlossX.SnippetSavePanel.init({ onSave, onRemove })`
  - `GlossX.SnippetSavePanel.show({ text, context, anchorRect, saved })`
  - `GlossX.SnippetSavePanel.hide(force?: boolean)`

- [ ] **Step 1: 实现浮层 DOM 结构**

Mirror `word-save-panel.js` 模式，面板 id=`glossx-snippet-save-panel`，包含：
- 选中片段（大字）
- 类型 badge（短语 / 整句）
- 片段中文（`translation`，初始「—」，可选 AI 异步填充 v1.4 可留空）
- 原句英文 + 中文
- 来源 hostname
- 按钮「★ 加入句库」/「已收藏」
- 🔊 TTS 朗读选中片段

- [ ] **Step 2: 添加 CSS**

在 `content.css` 追加：
```css
.glossx-snippet-save-panel { /* mirror .glossx-word-save-panel 宽度/阴影 */ }
.glossx-snippet-type-badge { font-size: 11px; /* phrase=蓝, sentence=紫 */ }
.glossx-snippet-save-text { font-weight: 600; font-size: 15px; }
```

- [ ] **Step 3: 手动验证**

在 Safari 扩展开发环境中暂用 console 调用 `SnippetSavePanel.show(...)` 确认布局（或写 vm smoke test 验证 `ensurePanel` 不抛错）。

- [ ] **Step 4: Commit**

```bash
git add "Shared (Extension)/Resources/lib/snippet-save-panel.js" "Shared (Extension)/Resources/content.css"
git commit -m "feat: add snippet-save-panel for selection save UI"
```

---

### Task 4: snippet-marker 选区监听

**Files:**
- Create: `Shared (Extension)/Resources/lib/snippet-marker.js`
- Modify: `Shared (Extension)/Resources/lib/vocab-marker.js`（点词 handler 开头检查 `SnippetMarker.hasRecentSelection()`）
- Modify: `Shared (Extension)/Resources/content.js`
- Modify: `Shared (Extension)/Resources/manifest.json`（content_scripts 注册顺序：`snippet-utils.js` → `snippet-storage.js` → `snippet-save-panel.js` → `snippet-marker.js`，放在 `vocab-marker.js` 之前）
- Test: `tests/snippet-marker.test.js`

**Interfaces:**
- Consumes: `SnippetSavePanel`, `SnippetStorage`, `SnippetUtils`
- Produces:
  - `GlossX.SnippetMarker.init()`
  - `GlossX.SnippetMarker.setSnippetItems(items)`
  - `GlossX.SnippetMarker.hasRecentSelection(): boolean`
  - `GlossX.SnippetMarker.refresh(root)`（v1.5 高亮，v1.4 可 stub）

- [ ] **Step 1: Write the failing test**

```javascript
// tests/snippet-marker.test.js — 测试 hasRecentSelection 标志位
const assert = require("node:assert/strict");
// ... vm setup loading snippet-marker.js with stubbed deps ...
// simulate mouseup with selection → hasRecentSelection() === true for 300ms
// simulate click without selection → false
```

- [ ] **Step 2: 实现选区逻辑**

`snippet-marker.js` 核心流程：
1. `document.addEventListener("mouseup", onMouseUp)`
2. `onMouseUp`：若 target 不在 `.glossx-sentence-en` 内则 return
3. `const sel = window.getSelection()`；取选区文本，`SnippetUtils.isValidSelection` 过滤
4. 找最近 `.glossx-sentence` 容器，读 `.glossx-sentence-en` / `.glossx-sentence-cn` 文本
5. 构建 `context`（pageUrl, hostname, pageTitle）
6. 查 `snippetItems` 是否已收藏 → `SnippetSavePanel.show`
7. 设置 `recentSelectionFlag = true`，300ms 后清除

`vocab-marker.js` 点击 handler 第一行：
```javascript
if (global.GlossX?.SnippetMarker?.hasRecentSelection?.()) return;
```

`content.js` 初始化：
```javascript
SnippetMarker.init({
    onSave: (payload) => SnippetStorage.saveItem(payload),
    onRemove: (id) => SnippetStorage.removeItem(id)
});
// storage.onChanged → SnippetMarker.setSnippetItems
```

- [ ] **Step 3: Run tests**

Run: `node tests/snippet-marker.test.js`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add "Shared (Extension)/Resources/lib/snippet-marker.js" \
  "Shared (Extension)/Resources/lib/vocab-marker.js" \
  "Shared (Extension)/Resources/content.js" \
  "Shared (Extension)/Resources/manifest.json" \
  tests/snippet-marker.test.js
git commit -m "feat: add snippet-marker selection handling in translated sentences"
```

---

### Task 5: learning.html 统一学习页

**Files:**
- Create: `Shared (Extension)/Resources/learning.html`
- Create: `Shared (Extension)/Resources/learning.js`
- Create: `Shared (Extension)/Resources/learning.css`
- Modify: `Shared (Extension)/Resources/vocabulary.html`（重定向）
- Modify: `Shared (Extension)/Resources/manifest.json`（web_accessible_resources 加 `learning.html`）
- Modify: `GlossX.xcodeproj/project.pbxproj`（注册新资源，mirror vocabulary 条目）
- Test: `tests/learning-page.test.js`

**Interfaces:**
- Produces:
  - URL hash 路由：`#vocab`（默认）、`#snippets`
  - Tab 切换不 reload 页面，只 toggle panel visibility

- [ ] **Step 1: Write smoke test**

```javascript
// tests/learning-page.test.js
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.resolve(__dirname, "../Shared (Extension)/Resources/learning.html"), "utf8");
["learning.css", "learning.js", "vocabulary.js", "snippets.js", "snippet-storage.js"].forEach((f) => {
    if (!html.includes(f)) throw new Error(`learning.html missing script/style: ${f}`);
});
console.log("learning-page smoke test passed");
```

- [ ] **Step 2: 创建 learning.html**

结构：
```html
<header> ← 返回 | 学习 | 设置 </header>
<nav class="learning-tabs">
  <button data-tab="vocab" class="active">生词本</button>
  <button data-tab="snippets">句库</button>
</nav>
<section id="learning-panel-vocab"><!-- 从 vocabulary.html 移入 DOM --></section>
<section id="learning-panel-snippets" class="hidden"><!-- snippets 列表容器 --></section>
```

脚本加载顺序：
`browser-shim.js`, `opencc-t2cn.js`, `text-normalize.js`, `snippet-utils.js`, `snippet-storage.js`, `vocabulary.js`, `snippets.js`, `learning.js`

- [ ] **Step 3: learning.js Tab 路由**

```javascript
function activateTab(name) {
    document.querySelectorAll(".learning-tab").forEach(/* toggle active */);
    document.getElementById("learning-panel-vocab").classList.toggle("hidden", name !== "vocab");
    document.getElementById("learning-panel-snippets").classList.toggle("hidden", name !== "snippets");
    location.hash = name;
}
// DOMContentLoaded: activateTab(location.hash.slice(1) || "vocab")
```

- [ ] **Step 4: vocabulary.html 重定向**

```html
<script>location.replace("learning.html#vocab");</script>
```

- [ ] **Step 5: 调整 vocabulary.js**

将 `vocab-back` 关闭逻辑保持不变；确保 DOM id 与 learning.html 内嵌结构一致（可直接复制 vocabulary.html body 内容到 `#learning-panel-vocab`）。

- [ ] **Step 6: Run test + Commit**

Run: `node tests/learning-page.test.js`  
Expected: PASS

```bash
git add "Shared (Extension)/Resources/learning.html" \
  "Shared (Extension)/Resources/learning.js" \
  "Shared (Extension)/Resources/learning.css" \
  "Shared (Extension)/Resources/vocabulary.html" \
  "Shared (Extension)/Resources/manifest.json" \
  GlossX.xcodeproj/project.pbxproj \
  tests/learning-page.test.js
git commit -m "feat: add learning.html hub with vocab and snippets tabs"
```

---

### Task 6: snippets.js 句库列表（v1.4 MVP）

**Files:**
- Create: `Shared (Extension)/Resources/snippets.js`
- Modify: `Shared (Extension)/Resources/learning.css`

**Interfaces:**
- Consumes: `SnippetStorage.getItems`, `markFamiliar`, `removeItem`
- Produces: 句库 Tab 完整列表 UI

- [ ] **Step 1: 列表渲染**

筛选 Tab：`today` | `all` | `phrase` | `sentence` | `familiar`

每条卡片显示：
- 片段文本（截断 > 80 字符）
- 类型 badge
- hostname + 相对时间
- 状态 badge

- [ ] **Step 2: 整句浏览交互**

点击 `sentence` 类型行 → 展开详情：
- 完整中英文
- 来源链接（`<a href="pageUrl" target="_blank">`）
- 🔊 TTS
- 按钮「标记已熟悉」→ `markFamiliar`

- [ ] **Step 3: 短语行交互（v1.4 简化）**

点击 `phrase` 行 → 展开详情（释义 + 对照 + TTS），暂不打开三步学习流（v1.5 Task 8）。

- [ ] **Step 4: 空状态**

```
还没有收藏
浏览网页时，在翻译句中拖拽选中英文短语或句子即可加入句库。
```

- [ ] **Step 5: Commit**

```bash
git add "Shared (Extension)/Resources/snippets.js" "Shared (Extension)/Resources/learning.css"
git commit -m "feat: add snippets tab list with sentence browse mode"
```

---

### Task 7: popup 改造

**Files:**
- Modify: `Shared (Extension)/Resources/popup.html`
- Modify: `Shared (Extension)/Resources/popup.js`
- Modify: `Shared (Extension)/Resources/popup.css`（如需）

- [ ] **Step 1: 改入口文案**

```html
<button type="button" id="open-learning" class="vocab-entry-btn">
    <span class="vocab-entry-label">📚 学习</span>
    <span class="vocab-entry-meta">
        <span id="learning-meta" class="vocab-entry-sub">生词 0 · 句库 0</span>
        <span aria-hidden="true">→</span>
    </span>
</button>
```

- [ ] **Step 2: 改 popup.js 统计**

```javascript
const totalNew = (stats.newWords || 0) + (stats.vocabNewToday || 0) + (stats.snippetNewToday || 0);
statNewItem.title = `词库 ${stats.newWords || 0} · 生词 ${stats.vocabNewToday || 0} · 句库 ${stats.snippetNewToday || 0}`;
learningMeta.textContent = `生词 ${stats.vocabNewToday || 0} · 句库 ${stats.snippetNewToday || 0}`;
openLearning.addEventListener("click", () => window.open(browser.runtime.getURL("learning.html")));
```

- [ ] **Step 3: Commit**

```bash
git add "Shared (Extension)/Resources/popup.html" "Shared (Extension)/Resources/popup.js"
git commit -m "feat: rename popup entry to 学习 with snippet stats"
```

---

### Task 8: background message handlers（备用路径）

**Files:**
- Modify: `Shared (Extension)/Resources/background.js`

- [ ] **Step 1: 添加 message types**

Mirror vocab handlers：
- `saveSnippetItem`
- `removeSnippetItem`
- `markSnippetFamiliar`
- `getSnippetItems`

Content 侧优先直连 `SnippetStorage`（Safari 兼容，同 vocab 模式），background 作 fallback。

- [ ] **Step 2: Commit**

```bash
git add "Shared (Extension)/Resources/background.js"
git commit -m "feat: add background snippet message handlers"
```

---

### Task 9: 资源路径与回归测试

**Files:**
- Modify: `tests/resource-paths.test.js`

- [ ] **Step 1: 扩展 resource-paths 测试**

```javascript
for (const page of ["options.html", "vocabulary.html", "learning.html"]) {
    // 验证引用的 js/css 文件存在
}
```

- [ ] **Step 2: 运行全部相关测试**

Run:
```bash
node tests/snippet-utils.test.js
node tests/snippet-storage.test.js
node tests/snippet-marker.test.js
node tests/learning-page.test.js
node tests/resource-paths.test.js
node tests/vocab-marker.test.js
node tests/vocab-page-load.test.js
```
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add tests/resource-paths.test.js
git commit -m "test: extend resource-paths for learning.html"
```

---

## v1.5 后续任务（不在 v1.4 MVP 范围）

### Task 10: 短语三步学习流 + SM-2

**Files:**
- Modify: `Shared (Extension)/Resources/snippets.js`
- Modify: `Shared (Extension)/Resources/learning.css`
- Modify: `Shared (Extension)/Resources/background.js`（`gradeSnippetItem`）

复用 `vocabulary.js` 学习 overlay 结构，仅 `phrase` 类型进入；`gradeSnippetItem` mirror `gradeVocabItem`。

### Task 11: 页面片段高亮持久化

**Files:**
- Modify: `Shared (Extension)/Resources/lib/snippet-marker.js`
- Modify: `Shared (Extension)/Resources/content.css`
- Modify: `Shared (Extension)/Resources/content.js`

`refresh(root)` 扫描 `.glossx-sentence-en`，按 `snippetItems` 的 `text` 在句内 wrap `<mark class="glossx-snippet-saved">`。

---

## Spec Coverage Checklist

| 规格要求 | Task |
|----------|------|
| 选区收藏短语/整句 | Task 4 |
| 类型自动判断 | Task 1 |
| 独立 snippetItems 存储 | Task 2 |
| 统一学习入口 | Task 5, 7 |
| 句库 Tab 列表 | Task 6 |
| 整句轻量浏览 | Task 6 |
| 短语引导学习 | Task 10 (v1.5) |
| popup 三项统计 | Task 7 |
| 页面高亮 | Task 11 (v1.5) |
| 与生词本数据独立 | Task 2（独立键） |

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-12-snippet-collection.md`.

**Two execution options:**

1. **Subagent-Driven（推荐）** — 每个 Task 派一个 subagent，Task 间人工 review，迭代快
2. **Inline Execution** — 在本 session 按 Task 顺序直接实现，每 2–3 个 Task 设 checkpoint

**Which approach?**
