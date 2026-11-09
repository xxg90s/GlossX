const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function decode(text) {
    return text
        .replace(/&quot;/g, "\"")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

function classTokens(element) {
    return String(element.className || "").split(/\s+/).filter(Boolean);
}

class MiniText {
    constructor(value) {
        this.nodeType = TEXT_NODE;
        this.nodeValue = value;
        this.parentNode = null;
    }

    get parentElement() {
        return this.parentNode && this.parentNode.nodeType === ELEMENT_NODE
            ? this.parentNode
            : null;
    }

    get previousSibling() {
        if (!this.parentNode) return null;
        const index = this.parentNode.childNodes.indexOf(this);
        return index > 0 ? this.parentNode.childNodes[index - 1] : null;
    }

    get nextSibling() {
        if (!this.parentNode) return null;
        const index = this.parentNode.childNodes.indexOf(this);
        return index >= 0 ? this.parentNode.childNodes[index + 1] || null : null;
    }

    get textContent() {
        return this.nodeValue;
    }
}

class MiniElement {
    constructor(tag) {
        this.nodeType = ELEMENT_NODE;
        this.tagName = String(tag || "div").toUpperCase();
        this.className = "";
        this.attrs = new Map();
        this.childNodes = [];
        this.parentNode = null;
        this.dataset = {};
        this.isContentEditable = false;
        const element = this;
        this.classList = {
            contains(name) {
                return classTokens(element).includes(name);
            },
            add(...names) {
                const tokens = new Set(classTokens(element));
                names.forEach((name) => tokens.add(name));
                element.className = [...tokens].join(" ");
            },
            remove(...names) {
                const drop = new Set(names);
                element.className = classTokens(element).filter((name) => !drop.has(name)).join(" ");
            },
            toggle(name, force) {
                const has = this.contains(name);
                const next = force === undefined ? !has : !!force;
                if (next) this.add(name);
                else this.remove(name);
                return next;
            }
        };
    }

    get parentElement() {
        return this.parentNode && this.parentNode.nodeType === ELEMENT_NODE
            ? this.parentNode
            : null;
    }

    get previousSibling() {
        if (!this.parentNode) return null;
        const index = this.parentNode.childNodes.indexOf(this);
        return index > 0 ? this.parentNode.childNodes[index - 1] : null;
    }

    get nextSibling() {
        if (!this.parentNode) return null;
        const index = this.parentNode.childNodes.indexOf(this);
        return index >= 0 ? this.parentNode.childNodes[index + 1] || null : null;
    }

    get textContent() {
        return this.childNodes.map((child) => child.textContent || "").join("");
    }

    set textContent(value) {
        this.childNodes = [];
        if (value) this.appendChild(new MiniText(String(value)));
    }

    set innerHTML(html) {
        this.childNodes = [];
        parseFragment(String(html || "")).forEach((node) => this.appendChild(node));
    }

    get innerHTML() {
        return this.childNodes.map((child) => {
            if (child.nodeType === TEXT_NODE) return child.nodeValue;
            const attrs = [`class="${child.className}"`];
            child.attrs.forEach((value, key) => attrs.push(`${key}="${value}"`));
            return `<span ${attrs.join(" ")}>${child.innerHTML}</span>`;
        }).join("");
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

    removeAttribute(name) {
        this.attrs.delete(name);
    }

    appendChild(node) {
        node.parentNode = this;
        this.childNodes.push(node);
        return node;
    }

    insertBefore(node, reference) {
        node.parentNode = this;
        const index = reference ? this.childNodes.indexOf(reference) : -1;
        if (index === -1) this.childNodes.push(node);
        else this.childNodes.splice(index, 0, node);
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
        node.parentNode = this;
        oldNode.parentNode = null;
        this.childNodes.splice(index, 1, node);
        return oldNode;
    }

    closest(selector) {
        const parts = String(selector || "").split(",").map((part) => part.trim()).filter(Boolean);
        let node = this;
        while (node) {
            if (node.nodeType === ELEMENT_NODE && parts.some((part) => matches(node, part))) {
                return node;
            }
            node = node.parentElement;
        }
        return null;
    }

    querySelectorAll(selector) {
        const found = [];
        const visit = (node) => {
            node.childNodes.forEach((child) => {
                if (child.nodeType !== ELEMENT_NODE) return;
                if (selectorMatches(child, selector)) found.push(child);
                visit(child);
            });
        };
        visit(this);
        return found;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }
}

function matches(element, selector) {
    if (selector.startsWith(".")) return element.classList.contains(selector.slice(1));
    if (selector.startsWith("[")) {
        const name = selector.slice(1, -1);
        return element.hasAttribute(name);
    }
    return false;
}

function selectorMatches(element, selector) {
    const alternatives = String(selector || "").split(",").map((part) => part.trim());
    return alternatives.some((alternative) => {
        const steps = alternative.split(/\s+/).filter(Boolean);
        if (steps.length === 1) return matches(element, steps[0]);
        if (!matches(element, steps[steps.length - 1])) return false;
        let ancestor = element.parentElement;
        for (let i = steps.length - 2; i >= 0; i -= 1) {
            while (ancestor && !matches(ancestor, steps[i])) ancestor = ancestor.parentElement;
            if (!ancestor) return false;
            ancestor = ancestor.parentElement;
        }
        return true;
    });
}

function parseFragment(html) {
    const nodes = [];
    let index = 0;
    while (index < html.length) {
        if (html.startsWith("<span", index)) {
            const tagEnd = html.indexOf(">", index);
            const open = html.slice(index, tagEnd + 1);
            const element = new MiniElement("span");
            const classMatch = open.match(/class="([^"]*)"/);
            element.className = classMatch ? decode(classMatch[1]) : "";
            const innerStart = tagEnd + 1;
            const innerEnd = findSpanClose(html, innerStart);
            parseFragment(html.slice(innerStart, innerEnd)).forEach((child) => element.appendChild(child));
            nodes.push(element);
            index = innerEnd + "</span>".length;
            continue;
        }
        const next = html.indexOf("<span", index);
        const raw = html.slice(index, next === -1 ? html.length : next);
        if (raw) nodes.push(new MiniText(decode(raw)));
        index = next === -1 ? html.length : next;
    }
    return nodes;
}

function findSpanClose(html, from) {
    let depth = 1;
    let index = from;
    while (index < html.length) {
        const nextOpen = html.indexOf("<span", index);
        const nextClose = html.indexOf("</span>", index);
        if (nextClose === -1) return html.length;
        if (nextOpen !== -1 && nextOpen < nextClose) {
            depth += 1;
            index = html.indexOf(">", nextOpen) + 1;
            continue;
        }
        depth -= 1;
        if (depth === 0) return nextClose;
        index = nextClose + "</span>".length;
    }
    return html.length;
}

function createTreeWalker(root, _whatToShow, filter) {
    const accepted = [];
    const visit = (node) => {
        node.childNodes.forEach((child) => {
            if (child.nodeType === TEXT_NODE) {
                const result = filter.acceptNode(child);
                if (result === NodeFilter.FILTER_ACCEPT) accepted.push(child);
                return;
            }
            if (child.nodeType === ELEMENT_NODE) visit(child);
        });
    };
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

const NodeFilter = {
    SHOW_TEXT: 4,
    FILTER_ACCEPT: 1,
    FILTER_REJECT: 2,
    FILTER_SKIP: 3
};

const sandbox = {
    console,
    location: { href: "https://example.com/article" },
    Node: { TEXT_NODE, ELEMENT_NODE },
    NodeFilter,
    document: {
        createElement: (tag) => new MiniElement(tag),
        createTextNode: (text) => new MiniText(text),
        createTreeWalker
    }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(
        path.resolve(__dirname, "../Shared (Extension)/Resources/lib/paragraph-translator.js"),
        "utf8"
    ),
    sandbox,
    { filename: "paragraph-translator.js" }
);

sandbox.GlossX.AIService = {
    async translateParagraph() {
        return {
            ok: true,
            english: "Looking back now, how could I have been so foolish?",
            source: "ai"
        };
    }
};

const Translator = sandbox.GlossX.ParagraphTranslator;
const settings = { paragraphRatio: "max", paragraphDisplayMode: "en_then_cn" };

function paragraph(text) {
    const root = new MiniElement("p");
    root.appendChild(new MiniText(text));
    return root;
}

function sentenceNodes(root) {
    return root.querySelectorAll(".glossx-sentence, .glossx-sentence-block");
}

(async () => {
    {
        const root = paragraph("Looking back now, how could I have been so foolish 现在回想起来，自己怎么这么傻");
        await Translator.processRoot(root, { settings });
        const cn = root.querySelector(".glossx-sentence-cn");
        assert.ok(cn, "mixed sentence should render a Chinese column");
        assert.equal(cn.textContent.trim(), "现在回想起来，自己怎么这么傻");
        assert.equal(root.querySelectorAll(".glossx-sentence-en").length, 1);
    }

    {
        const root = paragraph("Looking back now, how could I have been so foolish? 现在回想起来，自己怎么这么傻");
        await Translator.processRoot(root, { settings });
        const englishColumns = root.querySelectorAll(".glossx-sentence-en");
        assert.equal(englishColumns.length, 1);
        const outside = root.childNodes
            .filter((node) => node.nodeType === TEXT_NODE)
            .map((node) => node.nodeValue)
            .join("");
        assert.equal(outside.trim(), "");
        assert.equal(root.querySelector(".glossx-sentence-cn").textContent.trim(), "现在回想起来，自己怎么这么傻");
    }

    {
        const root = paragraph("现在回想起来，自己怎么这么傻");
        await Translator.processRoot(root, { settings });
        const outer = root.querySelector(".glossx-sentence-block");
        outer.classList.remove("glossx-sentence");
        outer.removeAttribute("data-glossx-sentence");
        outer.removeAttribute("data-glossx-sentence-pending");
        await Translator.processRoot(root, { settings });
        assert.equal(
            root.querySelectorAll(".glossx-sentence-en").length,
            1,
            "reprocessing the Chinese column must not nest another English column"
        );
        assert.equal(root.querySelectorAll(".glossx-sentence-cn .glossx-sentence-en").length, 0);
        assert.equal(root.querySelector(".glossx-sentence-cn").textContent.trim(), "现在回想起来，自己怎么这么傻");
    }

    {
        const root = paragraph("I agree. 但是我还是觉得这个说法不妥。");
        await Translator.processRoot(root, { settings });
        const outside = root.childNodes
            .filter((node) => node.nodeType === TEXT_NODE)
            .map((node) => node.nodeValue)
            .join("");
        assert.match(outside, /I agree/);
        assert.equal(root.querySelector(".glossx-sentence-cn").textContent.trim(), "但是我还是觉得这个说法不妥。");
    }

    {
        const root = paragraph("他说 hello 然后就离开了。");
        await Translator.processRoot(root, { settings });
        assert.equal(root.querySelector(".glossx-sentence-cn").textContent.trim(), "他说 hello 然后就离开了。");
    }

    {
        const root = new MiniElement("p");
        root.innerHTML = [
            '<span class="glossx-sentence glossx-sentence-block">',
            '<span class="glossx-sentence-en">Looking back now, how could I have been so foolish?</span>',
            '<span class="glossx-sentence-cn glossx-sentence-secondary">',
            '<span class="glossx-sentence glossx-sentence-block">',
            '<span class="glossx-sentence-en">Looking back now, how could I have been so foolish?</span>',
            '<span class="glossx-sentence-cn">现在回想起来，自己怎么这么傻</span>',
            "</span></span></span>"
        ].join("");
        await Translator.processRoot(root, { settings });
        assert.equal(root.querySelectorAll(".glossx-sentence-en").length, 1);
        assert.equal(root.querySelectorAll(".glossx-sentence-cn .glossx-sentence-en").length, 0);
        assert.equal(root.querySelector(".glossx-sentence-cn").textContent.trim(), "现在回想起来，自己怎么这么傻");
    }

    {
        const root = new MiniElement("h2");
        root.innerHTML = [
            '<span class="glossx-sentence glossx-sentence-block">',
            '<span class="glossx-sentence-en">Pay to work</span>',
            '<span class="glossx-sentence-cn glossx-sentence-secondary">',
            '<span class="glossx-sentence glossx-sentence-block">',
            '<span class="glossx-sentence-en">Pay to work</span>',
            '<span class="glossx-sentence-cn glossx-sentence-secondary">付费上班</span>',
            "</span></span></span>"
        ].join("");
        Translator.unwrapNested(root);
        assert.equal(sentenceNodes(root).length, 1, "a card nested after translation must be unwrapped");
        assert.equal(root.querySelector(".glossx-sentence-cn").textContent, "付费上班");
    }

    console.log("paragraph-layout tests passed");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
