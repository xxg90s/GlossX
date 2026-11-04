document.addEventListener("DOMContentLoaded", () => {
    const listEl = document.getElementById("vocab-list");
    const emptyEl = document.getElementById("vocab-empty");
    const statNew = document.getElementById("vocab-stat-new");
    const statLearning = document.getElementById("vocab-stat-learning");
    const statDue = document.getElementById("vocab-stat-due");
    const statMastered = document.getElementById("vocab-stat-mastered");
    const startLearnBtn = document.getElementById("vocab-start-learn");
    const overlay = document.getElementById("vocab-learn-overlay");
    const learnBody = document.getElementById("vocab-learn-body");
    const learnProgress = document.getElementById("vocab-learn-progress");
    const learnActions = document.getElementById("vocab-learn-actions");
    const learnGrade = document.getElementById("vocab-learn-grade");
    const learnPrev = document.getElementById("vocab-learn-prev");
    const learnNext = document.getElementById("vocab-learn-next");
    const learnClose = document.getElementById("vocab-learn-close");
    const gradeReview = document.getElementById("vocab-grade-review");
    const gradeMastered = document.getElementById("vocab-grade-mastered");

    let allItems = {};
    let currentFilter = "today";
    let learnQueue = [];
    let learnIndex = 0;
    let learnStep = 1;
    let settings = { pronunciation: "us" };

    function localDayKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function todayKey() {
        return localDayKey();
    }

    function isToday(timestamp) {
        if (!timestamp) return false;
        return localDayKey(new Date(timestamp)) === todayKey();
    }

    function isDue(item) {
        if (!item) return false;
        return (item.nextReviewAt || 0) <= Date.now();
    }

    function isLearnable(item) {
        return item.status !== "mastered" || isDue(item);
    }

    function speak(text) {
        if (!("speechSynthesis" in window) || !text) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = settings.pronunciation === "uk" ? "en-GB" : "en-US";
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    }

    function getItemsArray() {
        return Object.values(allItems).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }

    function filterItems(items) {
        switch (currentFilter) {
            case "today":
                return items.filter((item) => isToday(item.addedAt));
            case "learning":
                return items.filter((item) => item.status === "new" || item.status === "learning" || item.status === "review");
            case "mastered":
                return items.filter((item) => item.status === "mastered");
            default:
                return items;
        }
    }

    function groupByDay(items) {
        const groups = new Map();
        items.forEach((item) => {
            const day = localDayKey(new Date(item.addedAt || Date.now()));
            if (!groups.has(day)) groups.set(day, []);
            groups.get(day).push(item);
        });
        return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    }

    function formatDayLabel(day) {
        const today = todayKey();
        const yesterday = localDayKey(new Date(Date.now() - 86400000));
        if (day === today) return `今天 · ${day.slice(5).replace("-", "月")}日`;
        if (day === yesterday) return `昨天 · ${day.slice(5).replace("-", "月")}日`;
        return `${day.slice(5).replace("-", "月")}日`;
    }

    function statusBadge(item) {
        if (item.status === "mastered") return '<span class="vocab-row-badge mastered">✓ 已掌握</span>';
        if (isDue(item)) return '<span class="vocab-row-badge">↻ 待复习</span>';
        if (item.status === "new") return '<span class="vocab-row-badge">★ 新词</span>';
        return '<span class="vocab-row-badge">学习中</span>';
    }

    function renderList() {
        const items = filterItems(getItemsArray());
        listEl.innerHTML = "";

        if (!items.length) {
            emptyEl.classList.remove("hidden");
            return;
        }

        emptyEl.classList.add("hidden");
        groupByDay(items).forEach(([day, dayItems]) => {
            const group = document.createElement("div");
            group.className = "vocab-day-group";

            const title = document.createElement("div");
            title.className = "vocab-day-title";
            title.textContent = `${formatDayLabel(day)} · ${dayItems.length} 个词`;
            group.appendChild(title);

            dayItems.forEach((item) => {
                const row = document.createElement("button");
                row.type = "button";
                row.className = "vocab-row";
                row.innerHTML = `
                    <div class="vocab-row-main">
                        <div class="vocab-row-word">${escapeHtml(item.word)}</div>
                        ${item.lemma && item.lemma.toLowerCase() !== String(item.word || "").toLowerCase()
                            ? `<div class="vocab-row-lemma">原形 ${escapeHtml(item.lemma)}</div>`
                            : ""}
                    </div>
                    <div class="vocab-row-def">${escapeHtml(item.definitions?.[0] || "暂无释义")}</div>
                    <div class="vocab-row-meta">
                        ${statusBadge(item)}
                    </div>
                `;
                row.addEventListener("click", () => startLearning([item]));
                group.appendChild(row);
            });

            listEl.appendChild(group);
        });
    }

    function escapeHtml(text) {
        return String(text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function updateStats() {
        const items = getItemsArray();
        statNew.textContent = String(items.filter((item) => isToday(item.addedAt)).length);
        statLearning.textContent = String(items.filter((item) => (
            item.status === "new" || item.status === "learning" || item.status === "review"
        )).length);
        statDue.textContent = String(items.filter((item) => isDue(item)).length);
        statMastered.textContent = String(items.filter((item) => item.status === "mastered").length);

        const dueCount = items.filter((item) => isDue(item) || item.status === "new").length;
        startLearnBtn.textContent = dueCount
            ? `开始今日学习 · ${dueCount} 词待复习`
            : "开始今日学习";
        startLearnBtn.disabled = !items.some(isLearnable);
    }

    function buildLearnQueue() {
        const items = getItemsArray();
        const todayNew = items.filter((item) => item.status === "new" && isToday(item.addedAt));
        const due = items.filter((item) => isDue(item) && item.status !== "new");
        const rest = items.filter((item) => (
            item.status !== "mastered"
            && !todayNew.includes(item)
            && !due.includes(item)
        ));

        return [...todayNew, ...due, ...rest];
    }

    function updateStepDots() {
        document.querySelectorAll(".vocab-step-dot").forEach((dot) => {
            const step = Number(dot.dataset.step);
            dot.classList.toggle("active", step <= learnStep);
        });
    }

    function lemmaLine(item) {
        if (!item?.lemma) return "";
        if (String(item.lemma).toLowerCase() === String(item.word || "").toLowerCase()) {
            return "";
        }
        return `<div class="vocab-learn-lemma">原形：${escapeHtml(item.lemma)}</div>`;
    }

    async function renderLearnStep() {
        const item = learnQueue[learnIndex];
        if (!item) {
            closeLearning();
            return;
        }

        learnProgress.textContent = `${learnIndex + 1} / ${learnQueue.length}`;
        updateStepDots();

        learnActions.classList.toggle("hidden", learnStep === 3);
        learnGrade.classList.toggle("hidden", learnStep !== 3);
        learnPrev.disabled = learnStep === 1;
        learnNext.textContent = learnStep === 2 ? "下一步：看例句 →" : "下一步：看释义 →";

        if (learnStep === 1) {
            const speakWord = item.lemma || item.word;
            learnBody.innerHTML = `
                <div class="vocab-learn-word">${escapeHtml(item.word)}</div>
                ${lemmaLine(item)}
                <div class="vocab-learn-phonetic">${escapeHtml(item.phonetic || "")} ${escapeHtml(item.pos ? `${item.pos}.` : "")}</div>
                <button type="button" class="vocab-learn-speak" id="vocab-speak-btn">🔊 听发音</button>
            `;
            document.getElementById("vocab-speak-btn")?.addEventListener("click", () => speak(speakWord));
            return;
        }

        if (learnStep === 2) {
            const defs = item.definitions?.length
                ? item.definitions.join("；")
                : "暂无释义";
            learnBody.innerHTML = `
                <div class="vocab-learn-word">${escapeHtml(item.word)}</div>
                ${lemmaLine(item)}
                <div class="vocab-learn-def">${escapeHtml(defs)}</div>
            `;
            return;
        }

        let example = item.usageExample || item.extraExample || null;
        if (!example?.english) {
            learnBody.innerHTML = `
                <div class="vocab-learn-word">${escapeHtml(item.word)}</div>
                <div class="vocab-learn-extra-hint">正在获取常用例句…</div>
            `;
            const result = await browser.runtime.sendMessage({
                type: "generateVocabExample",
                payload: {
                    word: item.word,
                    preference: settings.pronunciation || "us"
                }
            }).catch(() => null);

            if (result?.ok && result.example) {
                example = result.example;
                item.usageExample = result.example;
                item.extraExample = result.example;
                allItems[item.id] = item;
            }
        }

        if (example?.english) {
            learnBody.innerHTML = `
                <div class="vocab-learn-word">${escapeHtml(item.word)}</div>
                ${lemmaLine(item)}
                <div class="vocab-learn-section-label">💡 常用例句</div>
                <div class="vocab-learn-context-en">${escapeHtml(example.english)}</div>
                <div class="vocab-learn-context-cn">${escapeHtml(example.chinese || "")}</div>
            `;
        } else {
            learnBody.innerHTML = `
                <div class="vocab-learn-word">${escapeHtml(item.word)}</div>
                ${lemmaLine(item)}
                <div class="vocab-learn-extra-hint">暂时无法获取常用例句，可稍后再试</div>
            `;
        }
    }

    function startLearning(queue) {
        learnQueue = queue.length ? queue : buildLearnQueue().filter(isLearnable);
        if (!learnQueue.length) return;

        learnIndex = 0;
        learnStep = 1;
        overlay.classList.remove("hidden");
        renderLearnStep();
    }

    function closeLearning() {
        overlay.classList.add("hidden");
        learnQueue = [];
        learnIndex = 0;
        learnStep = 1;
        loadData();
    }

    async function gradeCurrent(grade) {
        const item = learnQueue[learnIndex];
        if (!item) return;

        await browser.runtime.sendMessage({
            type: "gradeVocabItem",
            payload: { id: item.id, grade }
        });

        learnIndex += 1;
        learnStep = 1;

        if (learnIndex >= learnQueue.length) {
            closeLearning();
            return;
        }

        renderLearnStep();
    }

    async function loadData() {
        // Read storage.local directly. Safari often drops async sendResponse
        // for getVocabItems, which made the page look empty after a successful save.
        const stored = await browser.storage.local.get(["vocabItems", "settings"]);
        allItems = stored.vocabItems || {};
        settings = { pronunciation: "us", ...(stored.settings || {}) };
        updateStats();
        renderList();
    }

    document.querySelectorAll(".vocab-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".vocab-tab").forEach((item) => item.classList.remove("active"));
            tab.classList.add("active");
            currentFilter = tab.dataset.filter || "today";
            renderList();
        });
    });

    document.getElementById("vocab-back").addEventListener("click", () => window.close());
    document.getElementById("vocab-open-options").addEventListener("click", () => {
        if (browser.runtime.openOptionsPage) {
            browser.runtime.openOptionsPage();
        } else {
            window.open(browser.runtime.getURL("options.html"));
        }
    });

    startLearnBtn.addEventListener("click", () => startLearning([]));
    learnClose.addEventListener("click", closeLearning);
    learnPrev.addEventListener("click", () => {
        if (learnStep > 1) {
            learnStep -= 1;
            renderLearnStep();
        }
    });
    learnNext.addEventListener("click", () => {
        if (learnStep < 3) {
            learnStep += 1;
            renderLearnStep();
        }
    });
    gradeReview.addEventListener("click", () => gradeCurrent("review"));
    gradeMastered.addEventListener("click", () => gradeCurrent("mastered"));

    browser.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.vocabItems) {
            loadData();
        }
    });

    loadData().catch((error) => {
        emptyEl.classList.remove("hidden");
        emptyEl.querySelector(".vocab-empty-text").textContent = `加载失败：${error.message || error}`;
    });
});
