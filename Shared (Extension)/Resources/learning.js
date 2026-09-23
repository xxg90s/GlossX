(function () {
    function activateTab(name) {
        if (name !== "vocab" && name !== "snippets") {
            name = "vocab";
        }

        document.querySelectorAll(".learning-tab").forEach((tab) => {
            tab.classList.toggle("active", tab.dataset.tab === name);
        });

        document.getElementById("learning-panel-vocab").classList.toggle("hidden", name !== "vocab");
        document.getElementById("learning-panel-snippets").classList.toggle("hidden", name !== "snippets");

        if (location.hash !== "#" + name) {
            location.hash = name;
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        const hash = location.hash.slice(1);
        activateTab(hash === "snippets" ? "snippets" : "vocab");

        document.querySelectorAll(".learning-tab").forEach((tab) => {
            tab.addEventListener("click", () => activateTab(tab.dataset.tab));
        });

        window.addEventListener("hashchange", () => {
            const next = location.hash.slice(1);
            activateTab(next === "snippets" ? "snippets" : "vocab");
        });

        document.getElementById("learning-export")?.addEventListener("click", () => {
            const tab = document.querySelector(".learning-tab.active")?.dataset.tab === "snippets"
                ? "snippets"
                : "vocab";
            const filter = tab === "snippets"
                ? (document.querySelector(".snippets-tab.active")?.dataset.filter || "all")
                : (document.querySelector(".vocab-tab.active")?.dataset.filter || "all");
            const url = new URL(browser.runtime.getURL("export.html"));
            url.searchParams.set("tab", tab);
            url.searchParams.set("filter", filter);
            window.open(url.href);
        });

        const epoch = Date.now();
        browser.storage.local.set({
            icloudSyncRequest: { epoch, at: Date.now() }
        }).then(() => {
            return browser.runtime.sendMessage({ type: "icloudSyncNow", epoch });
        }).catch(() => {});
    });
})();
