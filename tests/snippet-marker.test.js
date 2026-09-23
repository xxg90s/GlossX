const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const resources = path.resolve(__dirname, "../Shared (Extension)/Resources/lib");

function loadScript(filename, sandbox) {
    vm.runInContext(
        fs.readFileSync(path.join(resources, filename), "utf8"),
        sandbox,
        { filename }
    );
}

function createClassList() {
    const values = new Set();
    return {
        add(name) { values.add(name); },
        remove(name) { values.delete(name); },
        toggle(name, force) {
            if (force) values.add(name);
            else values.delete(name);
        },
        contains(name) { return values.has(name); }
    };
}

function createElement(tagName, className) {
    const classList = createClassList();
    if (className) className.split(/\s+/).forEach((c) => classList.add(c));
    return {
        tagName,
        className: className || "",
        classList,
        textContent: "",
        dataset: {},
        innerHTML: "",
        style: {},
        closest(selector) {
            if (selector === ".glossx-sentence-en" && classList.contains("glossx-sentence-en")) {
                return this;
            }
            if (selector === ".glossx-sentence" && classList.contains("glossx-sentence")) {
                return this;
            }
            if (selector === "[data-glossx-sentence-pending]" && this.dataset.glossxSentencePending) {
                return this;
            }
            return null;
        },
        querySelector(selector) {
            if (selector === ".glossx-sentence-en" && this.enEl) return this.enEl;
            if (selector === ".glossx-sentence-cn" && this.cnEl) return this.cnEl;
            return null;
        }
    };
}

const sentence = createElement("span", "glossx-sentence");
sentence.enEl = createElement("span", "glossx-sentence-en");
sentence.enEl.textContent = "The quick brown fox jumps over the lazy dog.";
sentence.enEl.closest = (selector) => {
    if (selector === ".glossx-sentence-en") return sentence.enEl;
    if (selector === ".glossx-sentence") return sentence;
    if (selector === "[data-glossx-sentence-pending]") return null;
    return null;
};
sentence.cnEl = createElement("span", "glossx-sentence-cn");
sentence.cnEl.textContent = "敏捷的棕色狐狸跳过了懒狗。";
sentence.enEl.querySelector = (selector) => sentence.querySelector(selector);

let panelShown = false;
let panelOptions = null;

const sandbox = {
    console,
    browser: {
        runtime: {
            sendMessage: async () => ({ ok: true, item: { id: "snip_test" } })
        }
    },
    document: {
        addEventListener(type, handler) {
            sandbox._mouseupHandler = handler;
        },
        documentElement: {
            appendChild() {}
        },
        getElementById() { return null; },
        createElement(tag) {
            return createElement(tag);
        }
    },
    location: {
        href: "https://example.com/article",
        hostname: "example.com"
    },
    window: {
        getSelection() {
            return sandbox._selection;
        },
        setTimeout(fn, ms) {
            return setTimeout(fn, ms);
        },
        clearTimeout(id) {
            clearTimeout(id);
        }
    },
    getSelection() {
        return sandbox._selection;
    },
    setTimeout(fn, ms) {
        return setTimeout(fn, ms);
    },
    clearTimeout(id) {
        clearTimeout(id);
    },
    GlossX: {
        SnippetUtils: {
            isValidSelection(text) {
                return String(text || "").trim().length >= 2 && /[a-zA-Z]/.test(text);
            },
            detectType(text, fullEnglish) {
                return text === fullEnglish ? "sentence" : "phrase";
            },
            buildSnippetId(text, hostname) {
                return `snip_${text}_${hostname}`;
            }
        },
        SnippetStorage: {
            saveItem: async (payload) => ({ ok: true, item: { id: "snip_saved", ...payload } }),
            removeItem: async () => ({ ok: true })
        },
        SnippetSavePanel: {
            init() {},
            show(options) {
                panelShown = true;
                panelOptions = options;
            },
            hide() {}
        },
        WordSavePanel: {
            hide() {}
        }
    }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

loadScript("snippet-marker.js", sandbox);

const marker = sandbox.GlossX.SnippetMarker;
marker.init({}, {});

assert.equal(marker.hasRecentSelection(), false);

sandbox._selection = {
    isCollapsed: false,
    rangeCount: 1,
    toString() { return "quick brown"; },
    getRangeAt() {
        return {
            getBoundingClientRect() {
                return { top: 10, bottom: 20, left: 5, width: 40, height: 12 };
            }
        };
    },
    removeAllRanges() {
        sandbox._selectionCleared = true;
    }
};

sandbox._mouseupHandler({
    target: sentence.enEl
});

assert.equal(panelShown, true);
assert.equal(panelOptions.text, "quick brown");
assert.equal(panelOptions.type, "phrase");
assert.equal(panelOptions.context.fullEnglish, sentence.enEl.textContent);
assert.equal(panelOptions.context.fullChinese, sentence.cnEl.textContent);
assert.equal(sandbox._selectionCleared, true);
assert.equal(marker.hasRecentSelection(), true);

(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(marker.hasRecentSelection(), false);

    panelShown = false;
    sandbox._selection = {
        isCollapsed: true,
        rangeCount: 0,
        toString() { return ""; },
        removeAllRanges() {}
    };
    sandbox._mouseupHandler({
        target: sentence.enEl
    });
    assert.equal(panelShown, false);

    const markerJs = fs.readFileSync(path.join(resources, "snippet-marker.js"), "utf8");
    assert.match(markerJs, /global\.GlossX\.SnippetMarker\s*=\s*SnippetMarker/);
    assert.match(markerJs, /hasRecentSelection/);
    assert.match(markerJs, /已加入句库/);
    assert.match(markerJs, /已移出句库/);

    console.log("snippet-marker tests passed");
})();
