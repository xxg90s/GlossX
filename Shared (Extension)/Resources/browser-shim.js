(function (global) {
    if (typeof global.browser === "undefined" && typeof global.chrome !== "undefined") {
        global.browser = global.chrome;
    }

    const api = global.browser;
    if (!api?.runtime?.sendMessage || api.runtime.__glossxSendMessagePatched) {
        return;
    }

    const originalSendMessage = api.runtime.sendMessage.bind(api.runtime);

    api.runtime.sendMessage = function sendMessage(...args) {
        if (typeof args[args.length - 1] === "function") {
            return originalSendMessage(...args);
        }

        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, value) => {
                if (settled) return;
                settled = true;
                fn(value);
            };

            let maybePromise;
            try {
                maybePromise = originalSendMessage(...args, (response) => {
                    const err = api.runtime.lastError;
                    if (err) {
                        finish(reject, new Error(err.message || String(err)));
                        return;
                    }
                    finish(resolve, response);
                });
            } catch (error) {
                finish(reject, error);
                return;
            }

            if (maybePromise && typeof maybePromise.then === "function") {
                maybePromise.then(
                    (response) => {
                        // Safari can return an immediately-resolved undefined Promise
                        // even though the callback receives the real response later.
                        if (response !== undefined) {
                            finish(resolve, response);
                        }
                    },
                    (error) => finish(reject, error)
                );
            }
        });
    };

    api.runtime.__glossxSendMessagePatched = true;
})(typeof globalThis !== "undefined" ? globalThis : window);
