(function (global) {
    let button = null;
    let menu = null;

    function ensureUI() {
        if (button) return;

        button = document.createElement("button");
        button.type = "button";
        button.id = "glossx-floating-control";
        button.className = "glossx-floating-control";
        button.title = "GlossX";
        button.setAttribute("aria-label", "GlossX 控制");

        menu = document.createElement("div");
        menu.id = "glossx-floating-menu";
        menu.className = "glossx-floating-menu";
        menu.innerHTML = [
            '<button type="button" data-action="toggle-page">启用当前页</button>',
            '<button type="button" data-action="add-whitelist">加入白名单</button>',
            '<button type="button" data-action="open-popup">打开完整设置</button>'
        ].join("");

        document.documentElement.appendChild(button);
        document.documentElement.appendChild(menu);
    }

    const FloatingControl = {
        init(handlers) {
            ensureUI();

            button.addEventListener("click", (event) => {
                event.stopPropagation();
                handlers.onTogglePage();
            });

            button.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                menu.classList.toggle("visible");
            });

            menu.querySelectorAll("[data-action]").forEach((item) => {
                item.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    const action = item.dataset.action;
                    menu.classList.remove("visible");
                    if (action === "toggle-page") await handlers.onTogglePage();
                    if (action === "add-whitelist") await handlers.onAddWhitelist();
                    if (action === "open-popup") await handlers.onOpenPopup();
                });
            });

            document.addEventListener("click", () => menu.classList.remove("visible"));
        },

        setActive(active) {
            ensureUI();
            button.classList.toggle("active", active);
            button.title = active
                ? "GlossX 已开启（点击暂停当前页，右键打开菜单）"
                : "GlossX 未启用（点击启用当前网站，右键打开菜单）";
            const toggle = menu.querySelector('[data-action="toggle-page"]');
            if (toggle) {
                toggle.textContent = active ? "暂停当前页" : "启用当前页";
            }
        },

        setVisible(visible) {
            ensureUI();
            const display = visible ? "" : "none";
            button.style.display = display;
            menu.style.display = display;
            if (!visible) {
                menu.classList.remove("visible");
            }
        }
    };

    global.GlossX = global.GlossX || {};
    global.GlossX.FloatingControl = FloatingControl;
})(typeof globalThis !== "undefined" ? globalThis : window);
