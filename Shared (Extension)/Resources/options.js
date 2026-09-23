document.addEventListener("DOMContentLoaded", () => {
    const ui = GlossXSettingsUI.bindSettingsUI(document, {});
    Promise.resolve(ui.bootstrap()).catch((error) => {
        console.warn("[GlossX] settings bootstrap failed:", error);
    });
});
