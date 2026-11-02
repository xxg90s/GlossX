const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const panelSource = fs.readFileSync(
    path.resolve(
        __dirname,
        "../Shared (Extension)/Resources/lib/snippet-save-panel.js"
    ),
    "utf8"
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createClassList() {
    const values = new Set();
    return {
        add(name) { values.add(name); },
        remove(name) { values.delete(name); },
        contains(name) { return values.has(name); },
        toggle(name, force) {
            if (force) values.add(name);
            else values.delete(name);
        }
    };
}

function createElementStub() {
    const listeners = {};
    const cache = new Map();
    return {
        style: {},
        dataset: {},
        classList: createClassList(),
        textContent: "",
        innerHTML: "",
        disabled: false,
        addEventListener(type, handler) {
            (listeners[type] = listeners[type] || []).push(handler);
        },
        click() {
            return Promise.all(
                (listeners.click || []).map((handler) => handler({ type: "click" }))
            );
        },
        appendChild() {},
        remove() {},
        getBoundingClientRect() {
            return { width: 240, height: 160, top: 40, left: 40, bottom: 60 };
        },
        querySelector(selector) {
            if (!cache.has(selector)) cache.set(selector, createElementStub());
            return cache.get(selector);
        }
    };
}

function createHarness(translateSnippet, onSave, onUpdateTranslation) {
    let panelEl = null;
    const documentListeners = {};
    const sandbox = {
        console,
        innerWidth: 1000,
        innerHeight: 800,
        // Collapse the 20s translation timeout so the timeout path stays testable.
        setTimeout: (fn, ms, ...args) => setTimeout(fn, ms >= 1000 ? 20 : ms, ...args),
        clearTimeout,
        document: {
            createElement() {
                panelEl = createElementStub();
                return panelEl;
            },
            documentElement: { appendChild() {} },
            addEventListener(type, handler) {
                (documentListeners[type] = documentListeners[type] || []).push(handler);
            }
        }
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    sandbox.GlossX = {
        AIClient: {
            translateSnippet: (payload) => translateSnippet(payload)
        }
    };
    sandbox.browser = {
        runtime: {
            sendMessage(message) {
                if (message?.type === "translateSnippet") {
                    return translateSnippet(message.payload || {});
                }
                return Promise.resolve(undefined);
            }
        }
    };

    vm.createContext(sandbox);
    vm.runInContext(panelSource, sandbox, { filename: "snippet-save-panel.js" });

    const SnippetSavePanel = sandbox.GlossX.SnippetSavePanel;
    SnippetSavePanel.init({ onSave, onUpdateTranslation });

    return {
        SnippetSavePanel,
        show(overrides = {}) {
            SnippetSavePanel.show({
                text: "kick the bucket",
                type: "phrase",
                context: {},
                anchorRect: { top: 40, left: 40, bottom: 60, width: 120, height: 20 },
                saved: false,
                ...overrides
            });
        },
        isVisible: () => panelEl.classList.contains("visible"),
        translationEl: () => panelEl.querySelector(".glossx-snippet-save-translation"),
        saveButton: () => panelEl.querySelector("[data-action='save']"),
        fire(type, event) {
            (documentListeners[type] || []).forEach((handler) => handler(event));
        }
    };
}

const neverSettles = () => new Promise(() => {});
const outsideClick = { target: { closest: () => null } };
const insideClick = {
    target: { closest: (sel) => (sel === ".glossx-snippet-save-panel" ? {} : null) }
};

(async () => {
    // A translation that never settles must not trap the panel open.
    {
        const h = createHarness(neverSettles);

        h.show();
        assert.equal(h.isVisible(), true, "panel should open on show");
        assert.equal(h.translationEl().textContent, "正在翻译…");

        h.fire("keydown", { key: "Escape" });
        assert.equal(h.isVisible(), false, "Escape must close the panel during translation");

        h.show();
        h.fire("mousedown", outsideClick);
        assert.equal(h.isVisible(), false, "outside mousedown must close the panel during translation");

        h.show();
        h.fire("mousedown", insideClick);
        assert.equal(h.isVisible(), true, "clicks inside the panel must keep it open");
    }

    // A hung translation must fall back to a retry prompt instead of spinning forever.
    {
        const h = createHarness(neverSettles);

        h.show();
        await wait(120);

        assert.equal(
            h.translationEl().textContent,
            "翻译超时，点击重试",
            "hung translation must surface a retry prompt"
        );
        assert.equal(
            h.translationEl().classList.contains("glossx-snippet-save-translation-retry"),
            true,
            "retry prompt must be marked as retryable"
        );

        h.SnippetSavePanel.hide(false);
        await wait(200);
        assert.equal(h.isVisible(), false, "panel must close after the translation settles");
    }

    // Saving during a hung translation must not start another lookup or hang the button.
    {
        const saves = [];
        const h = createHarness(neverSettles, async (payload) => {
            saves.push(payload);
            return { ok: true, item: { id: "snip_1", translation: "" } };
        });

        h.show();
        await h.saveButton().click();

        assert.equal(saves.length, 1, "save must proceed even while translation is still loading");
        assert.equal(saves[0].skipLookup, true, "in-flight translation must not trigger a second lookup");
        assert.equal(h.saveButton().disabled, false, "save button must re-enable after a loading save");
        assert.equal(h.isVisible(), true);
    }

    // Saving before the translation arrives must backfill it onto the saved record,
    // even if the panel is closed in the meantime.
    {
        let resolveTranslate = null;
        const updates = [];
        const h = createHarness(
            () => new Promise((resolve) => { resolveTranslate = resolve; }),
            async () => ({ ok: true, item: { id: "snip_1" } }),
            async (id, translation) => {
                updates.push({ id, translation });
                return { ok: true };
            }
        );

        h.show();
        await h.saveButton().click();
        h.SnippetSavePanel.hide(true);

        resolveTranslate({ ok: true, translation: "翘辫子" });
        await wait(50);
        assert.deepEqual(
            updates.map((u) => ({ ...u })),
            [{ id: "snip_1", translation: "翘辫子" }],
            "late translation must be written back to the saved snippet"
        );
    }

    // Re-opening a saved snippet that lacks a translation must repair the record.
    {
        const updates = [];
        const h = createHarness(
            async () => ({ ok: true, translation: "翘辫子" }),
            null,
            async (id, translation) => {
                updates.push({ id, translation });
                return { ok: true };
            }
        );

        h.show({ saved: true, snippetId: "snip_1" });
        await wait(50);
        assert.deepEqual(
            updates.map((u) => ({ ...u })),
            [{ id: "snip_1", translation: "翘辫子" }],
            "saved snippet without translation must be backfilled when re-opened"
        );
    }

    // A failed translation must not write anything back.
    {
        const updates = [];
        const h = createHarness(
            async () => ({ ok: false, error: "AI 翻译失败" }),
            async () => ({ ok: true, item: { id: "snip_1" } }),
            async (id, translation) => {
                updates.push({ id, translation });
                return { ok: true };
            }
        );

        h.show();
        await h.saveButton().click();
        await wait(50);
        assert.equal(updates.length, 0, "failed translation must not be backfilled");
    }

    // A late translation response must not revive a panel the user already closed.
    {
        let resolveTranslate = null;
        const h = createHarness(() => new Promise((resolve) => {
            resolveTranslate = resolve;
        }));

        h.show();
        h.SnippetSavePanel.hide(true);
        assert.equal(h.isVisible(), false);

        resolveTranslate({ ok: true, translation: "翘辫子" });
        await wait(50);
        assert.equal(h.isVisible(), false, "a late translation must not reopen a closed panel");
    }

    console.log("snippet-save-panel dismiss tests passed");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
