(function (global) {
    let panel = null;
    let hideTimer = null;
    let pinned = false;
    let currentTarget = null;

    const GRADE_LABELS = {
        mastered: "已掌握",
        review: "稍后复习",
        skip: "不再出现"
    };

    const GRADE_DONE_LABELS = {
        mastered: "✓ 已掌握",
        review: "✓ 已加入复习",
        skip: "✓ 已还原中文"
    };

    function applyWordGradeVisual(target, grade) {
        if (!target?.classList?.contains("glossx-word")) return;

        target.classList.remove(
            "glossx-word-mastered",
            "glossx-word-review-flash",
            "glossx-grade-flash"
        );

        if (grade === "skip") {
            const zh = target.dataset.zh;
            if (zh && target.parentNode) {
                target.parentNode.replaceChild(document.createTextNode(zh), target);
            }
            return;
        }

        if (grade === "mastered") {
            target.classList.add("glossx-word-mastered", "glossx-grade-flash");
            target.title = "已标记为掌握，后续不再优先出现";
            return;
        }

        if (grade === "review") {
            target.classList.add("glossx-word-review-flash");
            target.title = "已加入复习计划";
            window.setTimeout(() => {
                target.classList.remove("glossx-word-review-flash");
            }, 1000);
        }
    }

    function resetActionButtons() {
        if (!panel) return;
        panel.querySelectorAll("[data-grade]").forEach((button) => {
            const grade = button.dataset.grade;
            button.textContent = GRADE_LABELS[grade] || button.textContent;
            button.classList.remove("glossx-decode-action-done");
            button.disabled = false;
        });
    }

    function ensurePanel() {
        if (panel) return panel;

        panel = document.createElement("div");
        panel.id = "glossx-decode-panel";
        panel.className = "glossx-decode-panel";
        panel.innerHTML = [
            '<div class="glossx-decode-header">',
            '    <div class="glossx-decode-word"></div>',
            '    <button type="button" class="glossx-decode-speak" title="发音">🔊</button>',
            '</div>',
            '<div class="glossx-decode-phonetic"></div>',
            '<div class="glossx-decode-translation"></div>',
            '<div class="glossx-decode-pos"></div>',
            '<div class="glossx-decode-actions">',
            '    <button type="button" data-grade="mastered">已掌握</button>',
            '    <button type="button" data-grade="review">稍后复习</button>',
            '    <button type="button" data-grade="skip">不再出现</button>',
            '</div>'
        ].join("");
        document.documentElement.appendChild(panel);
        return panel;
    }

    function positionPanel(target) {
        const rect = target.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        let top = rect.bottom + window.scrollY + 8;
        let leading = rect.left + window.scrollX;

        if (leading + panelRect.width > window.innerWidth - 12) {
            leading = window.innerWidth - panelRect.width - 12;
        }
        if (top + panelRect.height > window.scrollY + window.innerHeight - 12) {
            top = rect.top + window.scrollY - panelRect.height - 8;
        }

        panel.style.top = `${Math.max(window.scrollY + 8, top)}px`;
        panel.style.insetInlineStart = `${Math.max(8, leading)}px`;
    }

    function speak(text, pronunciation) {
        if (!("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = pronunciation === "uk" ? "en-GB" : "en-US";
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    }

    const DecodePanel = {
        init(onGrade) {
            ensurePanel();
            panel.querySelector(".glossx-decode-speak").addEventListener("click", () => {
                const word = panel.dataset.currentEn;
                const pronunciation = panel.dataset.pronunciation || "us";
                if (word) speak(word, pronunciation);
            });

            panel.querySelectorAll("[data-grade]").forEach((button) => {
                button.addEventListener("click", async () => {
                    const wordId = panel.dataset.currentWordId;
                    const grade = button.dataset.grade;
                    if (!wordId || !onGrade) return;

                    panel.querySelectorAll("[data-grade]").forEach((item) => {
                        item.disabled = true;
                    });
                    button.classList.add("glossx-decode-action-done");
                    button.textContent = GRADE_DONE_LABELS[grade] || "✓ 已记录";

                    applyWordGradeVisual(currentTarget, grade);

                    try {
                        await onGrade(wordId, grade);
                    } finally {
                        window.setTimeout(() => {
                            resetActionButtons();
                            this.hide(true);
                        }, grade === "skip" ? 280 : 520);
                    }
                });
            });

            panel.addEventListener("mouseenter", () => {
                clearTimeout(hideTimer);
            });
            panel.addEventListener("mouseleave", () => {
                if (!pinned) this.hide(false);
            });
        },

        show(target, entry, settings, pin = false) {
            if (!entry || !target) return;
            ensurePanel();
            clearTimeout(hideTimer);
            pinned = pin;
            currentTarget = target;
            resetActionButtons();

            panel.dataset.currentWordId = entry.id;
            panel.dataset.currentEn = entry.en;
            panel.dataset.pronunciation = settings?.pronunciation || "us";
            panel.querySelector(".glossx-decode-word").textContent = entry.en;
            panel.querySelector(".glossx-decode-phonetic").textContent = entry.phonetic || "";
            panel.querySelector(".glossx-decode-translation").textContent = entry.zh || "";
            panel.querySelector(".glossx-decode-pos").textContent = "词性：" + entry.pos;

            panel.classList.add("visible");
            positionPanel(target);

            if (settings?.hoverAutoPlay) {
                speak(entry.en, settings.pronunciation);
            }
        },

        hide(force) {
            if (pinned && !force) return;
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                if (!panel) return;
                panel.classList.remove("visible");
                pinned = false;
                currentTarget = null;
                resetActionButtons();
            }, force ? 0 : 120);
        },

        handleHover(target, entry, settings, pin) {
            if (!entry) {
                this.hide(false);
                return;
            }
            this.show(target, entry, settings, pin);
        }
    };

    global.GlossX = global.GlossX || {};
    global.GlossX.DecodePanel = DecodePanel;
})(typeof globalThis !== "undefined" ? globalThis : window);
