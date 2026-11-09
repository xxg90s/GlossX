const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const FRAGMENT_NODE = 11;

class MiniNode {
    constructor(nodeType) {
        this.nodeType = nodeType;
        this.parentNode = null;
    }

    get parentElement() {
        return this.parentNode && this.parentNode.nodeType === ELEMENT_NODE ? this.parentNode : null;
    }

    get isConnected() {
        let node = this;
        while (node.parentNode) node = node.parentNode;
        return node.isDocumentRoot === true;
    }
}

class MiniText extends MiniNode {
    constructor(value) {
        super(TEXT_NODE);
        this.nodeValue = value;
    }

    get textContent() {
        return this.nodeValue;
    }
}

class MiniElement extends MiniNode {
    constructor(tag, nodeType = ELEMENT_NODE) {
        super(nodeType);
        this.tagName = String(tag).toUpperCase();
        this.className = "";
        this.id = "";
        this.attrs = new Map();
        this.childNodes = [];
        this.dataset = {};
        this.style = {};
        this.isContentEditable = false;
        const element = this;
        this.classList = {
            contains: (name) => element.className.split(/\s+/).includes(name),
            add: (...names) => {
                const tokens = new Set(element.className.split(/\s+/).filter(Boolean));
                names.forEach((name) => tokens.add(name));
                element.className = [...tokens].join(" ");
            }
        };
    }

    get textContent() {
        return this.childNodes.map((child) => child.textContent).join("");
    }

    appendChild(node) {
        if (node.nodeType === FRAGMENT_NODE) {
            [...node.childNodes].forEach((child) => this.appendChild(child));
            node.childNodes = [];
            return node;
        }
        if (node.parentNode) node.parentNode.removeChild(node);
        node.parentNode = this;
        this.childNodes.push(node);
        return node;
    }

    removeChild(node) {
        const index = this.childNodes.indexOf(node);
        if (index === -1) throw new Error("not a child");
        this.childNodes.splice(index, 1);
        node.parentNode = null;
        return node;
    }

    replaceChild(node, oldNode) {
        const index = this.childNodes.indexOf(oldNode);
        if (index === -1) throw new Error("not a child");
        const incoming = node.nodeType === FRAGMENT_NODE ? [...node.childNodes] : [node];
        if (node.nodeType === FRAGMENT_NODE) node.childNodes = [];
        incoming.forEach((child) => { child.parentNode = this; });
        this.childNodes.splice(index, 1, ...incoming);
        oldNode.parentNode = null;
        return oldNode;
    }

    replaceChildren(...nodes) {
        this.childNodes.forEach((child) => { child.parentNode = null; });
        this.childNodes = [];
        nodes.forEach((node) => this.appendChild(node));
    }

    setAttribute(name, value) {
        this.attrs.set(name, String(value));
    }

    getAttribute(name) {
        return this.attrs.has(name) ? this.attrs.get(name) : null;
    }

    hasAttribute(name) {
        return this.attrs.has(name);
    }

    addEventListener() {}

    closest(selector) {
        let node = this;
        while (node && node.nodeType === ELEMENT_NODE) {
            if (matchesList(node, selector)) return node;
            node = node.parentNode;
        }
        return null;
    }

    querySelectorAll(selector) {
        const found = [];
        const visit = (node) => node.childNodes.forEach((child) => {
            if (child.nodeType !== ELEMENT_NODE) return;
            if (matchesList(child, selector)) found.push(child);
            visit(child);
        });
        visit(this);
        return found;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }
}

function matchesList(element, selector) {
    return selector.split(",").map((part) => part.trim()).some((part) => {
        if (part.startsWith(".")) return element.classList.contains(part.slice(1));
        if (part.startsWith("[")) return element.hasAttribute(part.slice(1, -1));
        if (part.startsWith("#")) return element.id === part.slice(1);
        return element.tagName === part.toUpperCase();
    });
}

function el(tag, children = [], attrs = {}) {
    const element = new MiniElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
        if (key === "class") element.className = value;
        else element.setAttribute(key, value);
    });
    children.forEach((child) => element.appendChild(typeof child === "string" ? new MiniText(child) : child));
    return element;
}

function sentenceCard(original, english) {
    return el("span", [
        el("span", [english], { class: "glossx-sentence-en" }),
        el("span", [original], { class: "glossx-sentence-cn glossx-sentence-secondary" })
    ], {
        class: "glossx-sentence glossx-sentence-block",
        "data-glossx-sentence": "1",
        "data-glossx-original": original
    });
}

function createTreeWalker(root, _whatToShow, filter) {
    const accepted = [];
    const visit = (node) => node.childNodes.forEach((child) => {
        if (child.nodeType === TEXT_NODE) {
            if (filter.acceptNode(child) === NodeFilter.FILTER_ACCEPT) accepted.push(child);
        } else if (child.nodeType === ELEMENT_NODE) {
            visit(child);
        }
    });
    visit(root);
    let cursor = 0;
    return {
        currentNode: root,
        nextNode() {
            if (cursor >= accepted.length) return null;
            this.currentNode = accepted[cursor];
            cursor += 1;
            return this.currentNode;
        }
    };
}

const NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 };

const sandbox = {
    console,
    Node: { TEXT_NODE, ELEMENT_NODE },
    NodeFilter,
    document: {
        createElement: (tag) => new MiniElement(tag),
        createTextNode: (text) => new MiniText(text),
        createDocumentFragment: () => new MiniElement("#fragment", FRAGMENT_NODE),
        createTreeWalker
    }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, "../Shared (Extension)/Resources/lib/replacer.js"), "utf8"),
    sandbox,
    { filename: "replacer.js" }
);
const { Replacer } = sandbox.GlossX;

const WORK = { id: "work_v", en: "work", zh: "上班", pos: "v", phonetic: "" };

function deferredMatcher() {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    return {
        release: () => release(),
        Lexicon: {
            async findMatchesAsync(text) {
                await gate;
                const index = text.indexOf("上班");
                return index === -1 ? [] : [{ index, length: 2, entry: WORK }];
            },
            getDensityRate: () => 1
        }
    };
}

function replacerOptions(Lexicon, replacedWords) {
    return {
        Lexicon,
        SM2: { priorityScore: () => 0, isDue: () => false },
        settings: { aiEnabled: true, replaceDensity: "high", displayMode: "english_only" },
        wordRecords: {},
        onWordHover() {},
        async onWordReplaced(entry) {
            replacedWords.push(entry.id);
        }
    };
}

function page(...children) {
    const body = el("body", children);
    body.isDocumentRoot = true;
    return body;
}

(async () => {
    {
        const heading = el("h2", ["付费上班"]);
        const body = page(heading);
        const matcher = deferredMatcher();
        const replaced = [];
        const running = Replacer.processRoot(body, replacerOptions(matcher.Lexicon, replaced));

        heading.replaceChildren(sentenceCard("付费上班", "Pay to work"));
        matcher.release();
        await running;

        assert.ok(heading.querySelector(".glossx-sentence"), "sentence card added while matching must survive");
        assert.equal(heading.querySelector(".glossx-word"), null);
        assert.equal(heading.textContent, "Pay to work付费上班");
        assert.deepEqual(replaced, [], "words that never reached the page must not be recorded");
    }

    {
        const paragraph = el("p", [sentenceCard("现在回想起来，自己怎么这么傻", "Looking back now"), "我们每天都要去公司上班"]);
        const body = page(paragraph);
        const matcher = deferredMatcher();
        matcher.release();
        await Replacer.processRoot(body, replacerOptions(matcher.Lexicon, []));

        assert.ok(paragraph.querySelector(".glossx-sentence"), "a block holding a sentence card must not be flattened");
        assert.ok(!paragraph.childNodes.some((node) => node.nodeType === TEXT_NODE && /Looking back/.test(node.nodeValue)));
    }

    {
        const text = new MiniText("付费上班");
        const holder = el("div", [text]);
        const body = page(holder);
        const matcher = deferredMatcher();
        const replaced = [];
        const running = Replacer.processRoot(body, replacerOptions(matcher.Lexicon, replaced));

        holder.replaceChild(sentenceCard("付费上班", "Pay to work"), text);
        matcher.release();
        await running;

        assert.ok(holder.querySelector(".glossx-sentence"));
        assert.equal(holder.querySelector(".glossx-word"), null);
        assert.deepEqual(replaced, []);
    }

    {
        const heading = el("h2", ["付费上班"]);
        const body = page(heading);
        const matcher = deferredMatcher();
        const replaced = [];
        matcher.release();
        await Replacer.processRoot(body, replacerOptions(matcher.Lexicon, replaced));

        assert.ok(heading.querySelector(".glossx-word"), "untouched blocks are still replaced");
        assert.deepEqual(replaced, ["work_v"]);
    }

    console.log("replacer-race tests passed");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
