function show(platform, enabled, useSettingsInsteadOfPreferences) {
    document.body.classList.add(`platform-${platform}`);

    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('platform-mac state-on')[0].innerText = "GlossX 扩展已启用。可在 Safari 设置的「扩展」部分关闭。";
        document.getElementsByClassName('platform-mac state-off')[0].innerText = "GlossX 扩展未启用。请在 Safari 设置的「扩展」部分打开。";
        document.getElementsByClassName('platform-mac state-unknown')[0].innerText = "请在 Safari 设置的「扩展」部分启用 GlossX。";
        document.getElementsByClassName('platform-mac open-preferences')[0].innerText = "退出并打开 Safari 设置…";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
