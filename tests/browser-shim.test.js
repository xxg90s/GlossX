const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    browser: {
        runtime: {
            lastError: null,
            sendMessage(message, callback) {
                setTimeout(() => callback({ ok: true, value: message.value }), 10);
                return Promise.resolve(undefined);
            }
        }
    }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(
        path.resolve(__dirname, "../Shared (Extension)/Resources/browser-shim.js"),
        "utf8"
    ),
    sandbox,
    { filename: "browser-shim.js" }
);

(async () => {
    const response = await sandbox.browser.runtime.sendMessage({ value: "callback-result" });
    assert.deepEqual(
        response,
        { ok: true, value: "callback-result" },
        "an undefined compatibility Promise must not beat Safari's callback response"
    );
    console.log("browser-shim tests passed");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
