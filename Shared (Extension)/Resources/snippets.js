document.addEventListener("DOMContentLoaded", () => {
    const listEl = document.getElementById("snippets-list");
    const emptyEl = document.getElementById("snippets-empty");
    const statNew = document.getElementById("snippets-stat-new");
    const statPhrase = document.getElementById("snippets-stat-phrase");
    const statSentence = document.getElementById("snippets-stat-sentence");
    const statFamiliar = document.getElementById("snippets-stat-familiar");
    const startLearnBtn = document.getElementById("snippets-start-learn");
    const overlay = document.getElementById("snippets-learn-overlay");
    const learnBody = document.getElementById("snippets-learn-body");
    const learnProgress = document.getElementById("snippets-learn-progress");
    const learnActions = document.getElementById("snippets-learn-actions");
    const learnGrade = document.getElementById("snippets-learn-grade");
    const learnPrev = document.getElementById("snippets-learn-prev");
    const learnNext = document.getElementById("snippets-learn-next");
    const learnClose = document.getElementById("snippets-learn-close");
    const gradeReview = document.getElementById("snippets-grade-review");
    const gradeMastered = document.getElementById("snippets-grade-mastered");

    if (!listEl || !emptyEl) return;

    let allItems = {};
    let currentFilter = "today";
    let expandedId = null;
    let settings = { pronunciation: "us" };
    let learnQueue = [];
    let learnIndex = 0;
    let learnStep = 1;

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
        if (!item || item.type !== "phrase") return false;
        if (item.status === "familiar") return false;
        return (item.nextReviewAt || 0) <= Date.now();
    }

    function formatDayLabel(day) {
        const today = todayKey();
        const yesterday = localDayKey(new Date(Date.now() - 86400000));
        if (day === today) return `今天 · ${day.slice(5).replace("-", "月")}日`;
        if (day === yesterday) return `昨天 · ${day.slice(5).replace("-", "月")}日`;
        return `${day.slice(5).replace("-", "月")}日`;
    }

    function formatRelativeTime(timestamp) {
        if (!timestamp) return "";
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return "刚刚";
        if (minutes < 60) return `${minutes} 分钟前`;
        const hours = Math.floor(minutes / 60);
        if (localDayKey(new Date(timestamp)) === todayKey()) {
            return `${hours} 小时前`;
        }
        return formatDayLabel(localDayKey(new Date(timestamp)));
    }

    function speak(text) {
        if (!("speechSynthesis" in window) || !text) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = settings.pronunciation === "uk" ? "en-GB" : "en-US";
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    }

    function escapeHtml(text) {
        return String(text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function truncateText(text, max = 80) {
        const value = String(text || "");
        if (value.length <= max) return value;
        return `${value.slice(0, max)}…`;
    }

    function getItemsArray() {
        return Object.values(allItems).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }

    function getPhraseItems() {
        return getItemsArray().filter((item) => item.type === "phrase");
    }

    function filterItems(items) {
        switch (currentFilter) {
            case "today":
                return items.filter((item) => isToday(item.addedAt));
            case "phrase":
                return items.filter((item) => item.type === "phrase");
            case "sentence":
                return items.filter((item) => item.type === "sentence");
            case "familiar":
                return items.filter((item) => item.status === "familiar");
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

    function typeBadge(item) {
        if (item.type === "sentence") {
            return '<span class="snippets-row-badge snippets-row-badge-sentence">整句</span>';
        }
        return '<span class="snippets-row-badge snippets-row-badge-phrase">短语</span>';
    }

    function statusBadge(item) {
        if (item.status === "familiar") {
            return '<span class="snippets-row-badge snippets-row-badge-familiar">✓ 已熟悉</span>';
        }
        if (item.status === "mastered") {
            return '<span class="snippets-row-badge snippets-row-badge-familiar">✓ 已掌握</span>';
        }
        if (isDue(item)) {
            return '<span class="snippets-row-badge">↻ 待复习</span>';
        }
        if (item.status === "learning" || item.status === "review") {
            return '<span class="snippets-row-badge">学习中</span>';
        }
        return '<span class="snippets-row-badge">★ 新收藏</span>';
    }

    function buildPhraseLearnQueue() {
        const phrases = getPhraseItems().filter((item) => (
            item.status !== "familiar" && (item.status !== "mastered" || isDue(item))
        ));
        const todayNew = phrases.filter((item) => item.status === "new" && isToday(item.addedAt));
        const due = phrases.filter((item) => isDue(item) && item.status !== "new");
        const rest = phrases.filter((item) => !todayNew.includes(item) && !due.includes(item));
        return [...todayNew, ...due, ...rest];
    }

    function updateStepDots() {
        document.querySelectorAll(".snippets-step-dot").forEach((dot) => {
            const step = Number(dot.dataset.step);
            dot.classList.toggle("active", step <= learnStep);
        });
    }

    function renderLearnStep() {
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
        learnNext.textContent = learnStep === 2 ? "下一步：看语境 →" : "下一步：看释义 →";

        if (learnStep === 1) {
            learnBody.innerHTML = `
                <div class="vocab-learn-word">${escapeHtml(item.text)}</div>
                <button type="button" class="vocab-learn-speak" id="snippets-speak-btn">🔊 听发音</button>
            `;
            document.getElementById("snippets-speak-btn")?.addEventListener("click", () => speak(item.text));
            return;
        }

        if (learnStep === 2) {
            const translation = item.translation ? String(item.translation) : "—";
            learnBody.innerHTML = `
                <div class="vocab-learn-word">${escapeHtml(item.text)}</div>
                <div class="vocab-learn-def">${escapeHtml(translation)}</div>
            `;
            return;
        }

        learnBody.innerHTML = `
            <div class="vocab-learn-word">${escapeHtml(item.text)}</div>
            <div class="vocab-learn-section-label">📍 原句语境</div>
            <div class="vocab-learn-context-en">${escapeHtml(item.context?.fullEnglish || "—")}</div>
            <div class="vocab-learn-context-cn">${escapeHtml(item.context?.fullChinese || "—")}</div>
            <div class="snippets-learn-question">你能理解这个短语在句中的用法吗？</div>
        `;
    }

    function startLearning(queue) {
        learnQueue = (queue && queue.length)
            ? queue.filter((item) => item.type === "phrase" && item.status !== "familiar" && (item.status !== "mastered" || isDue(item)))
            : buildPhraseLearnQueue();
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
            type: "gradeSnippetItem",
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

    function renderSentenceDetail(item) {
        const pageUrl = item.context?.pageUrl || "";
        const canMarkFamiliar = item.status !== "familiar" && item.status !== "mastered";
        return `
            <div class="snippets-detail">
                <div class="snippets-detail-section-label">完整英文</div>
                <div class="snippets-detail-en">${escapeHtml(item.context?.fullEnglish || item.text)}</div>
                <div class="snippets-detail-section-label">完整中文</div>
                <div class="snippets-detail-cn">${escapeHtml(item.context?.fullChinese || "—")}</div>
                ${pageUrl
                    ? `<a class="snippets-detail-link" href="${escapeHtml(pageUrl)}" target="_blank" rel="noopener noreferrer">查看来源页面</a>`
                    : ""}
                <div class="snippets-detail-actions">
                    <button type="button" class="snippets-detail-speak" data-speak="${escapeHtml(item.text)}">🔊 朗读</button>
                    ${canMarkFamiliar
                        ? `<button type="button" class="primary-btn snippets-detail-familiar" data-id="${escapeHtml(item.id)}">标记已熟悉</button>`
                        : ""}
                    <button type="button" class="secondary-btn snippets-detail-remove" data-id="${escapeHtml(item.id)}">移出句库</button>
                </div>
            </div>
        `;
    }

    function renderPhraseDetail(item) {
        const translation = item.translation ? String(item.translation) : "—";
        const canLearn = item.status !== "mastered" && item.status !== "familiar";
        return `
            <div class="snippets-detail">
                <div class="snippets-detail-section-label">释义</div>
                <div class="snippets-detail-cn">${escapeHtml(translation)}</div>
                <div class="snippets-detail-section-label">原句对照</div>
                <div class="snippets-detail-en">${escapeHtml(item.context?.fullEnglish || "—")}</div>
                <div class="snippets-detail-cn">${escapeHtml(item.context?.fullChinese || "—")}</div>
                <div class="snippets-detail-actions">
                    <button type="button" class="snippets-detail-speak" data-speak="${escapeHtml(item.text)}">🔊 朗读</button>
                    ${canLearn
                        ? `<button type="button" class="primary-btn snippets-detail-learn" data-id="${escapeHtml(item.id)}">开始学习</button>`
                        : ""}
                    <button type="button" class="secondary-btn snippets-detail-remove" data-id="${escapeHtml(item.id)}">移出句库</button>
                </div>
            </div>
        `;
    }

    function bindDetailActions(container) {
        container.querySelectorAll(".snippets-detail-speak").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                speak(button.dataset.speak || "");
            });
        });

        container.querySelectorAll(".snippets-detail-familiar").forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.stopPropagation();
                button.disabled = true;
                const result = await window.GlossX?.SnippetStorage?.markFamiliar?.(button.dataset.id);
                if (result?.ok) {
                    await loadData();
                    return;
                }
                button.disabled = false;
            });
        });

        container.querySelectorAll(".snippets-detail-learn").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                const item = allItems[button.dataset.id];
                if (item) startLearning([item]);
            });
        });

        container.querySelectorAll(".snippets-detail-remove").forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.stopPropagation();
                button.disabled = true;
                const result = await window.GlossX?.SnippetStorage?.removeItem?.(button.dataset.id);
                if (result?.ok) {
                    expandedId = null;
                    await loadData();
                    return;
                }
                button.disabled = false;
            });
        });

        container.querySelectorAll(".snippets-detail-link").forEach((link) => {
            link.addEventListener("click", (event) => {
                event.stopPropagation();
            });
        });
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
            group.className = "snippets-day-group";

            const title = document.createElement("div");
            title.className = "snippets-day-title";
            title.textContent = `${formatDayLabel(day)} · ${dayItems.length} 条`;
            group.appendChild(title);

            dayItems.forEach((item) => {
                const card = document.createElement("div");
                card.className = "snippets-card";
                if (expandedId === item.id) {
                    card.classList.add("expanded");
                }

                const hostname = item.context?.hostname || "";
                const metaParts = [
                    hostname ? escapeHtml(hostname) : "",
                    escapeHtml(formatRelativeTime(item.addedAt))
                ].filter(Boolean).join(" · ");

                const row = document.createElement("button");
                row.type = "button";
                row.className = "snippets-row";
                row.innerHTML = `
                    <div class="snippets-row-main">
                        <div class="snippets-row-text">${escapeHtml(truncateText(item.text))}</div>
                        <div class="snippets-row-meta-line">${metaParts}</div>
                    </div>
                    <div class="snippets-row-badges">
                        ${typeBadge(item)}
                        ${statusBadge(item)}
                    </div>
                `;
                row.addEventListener("click", () => {
                    expandedId = expandedId === item.id ? null : item.id;
                    renderList();
                });
                card.appendChild(row);

                if (expandedId === item.id) {
                    const detailWrap = document.createElement("div");
                    detailWrap.innerHTML = item.type === "sentence"
                        ? renderSentenceDetail(item)
                        : renderPhraseDetail(item);
                    bindDetailActions(detailWrap);
                    card.appendChild(detailWrap.firstElementChild);
                }

                group.appendChild(card);
            });

            listEl.appendChild(group);
        });
    }

    function updateStats() {
        const items = getItemsArray();
        const phrases = items.filter((item) => item.type === "phrase");
        statNew.textContent = String(items.filter((item) => isToday(item.addedAt)).length);
        statPhrase.textContent = String(phrases.length);
        statSentence.textContent = String(items.filter((item) => item.type === "sentence").length);
        statFamiliar.textContent = String(items.filter((item) => item.status === "familiar").length);

        if (startLearnBtn) {
            const dueCount = phrases.filter((item) => (
                item.status !== "mastered"
                && item.status !== "familiar"
                && (isDue(item) || item.status === "new")
            )).length;
            startLearnBtn.textContent = dueCount
                ? `开始短语学习 · ${dueCount} 条待复习`
                : "开始短语学习";
            startLearnBtn.disabled = !phrases.some((item) => (
                item.status !== "mastered" && item.status !== "familiar"
            ));
        }
    }

    async function loadData() {
        const stored = await browser.storage.local.get(["snippetItems", "settings"]);
        allItems = stored.snippetItems || {};
        settings = { pronunciation: "us", ...(stored.settings || {}) };
        if (expandedId && !allItems[expandedId]) {
            expandedId = null;
        }
        updateStats();
        renderList();
    }

    document.querySelectorAll(".snippets-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".snippets-tab").forEach((item) => item.classList.remove("active"));
            tab.classList.add("active");
            currentFilter = tab.dataset.filter || "today";
            expandedId = null;
            renderList();
        });
    });

    startLearnBtn?.addEventListener("click", () => startLearning([]));
    learnClose?.addEventListener("click", closeLearning);
    learnPrev?.addEventListener("click", () => {
        if (learnStep > 1) {
            learnStep -= 1;
            renderLearnStep();
        }
    });
    learnNext?.addEventListener("click", () => {
        if (learnStep < 3) {
            learnStep += 1;
            renderLearnStep();
        }
    });
    gradeReview?.addEventListener("click", () => gradeCurrent("review"));
    gradeMastered?.addEventListener("click", () => gradeCurrent("mastered"));

    browser.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.snippetItems) {
            loadData();
        }
    });

    loadData().catch((error) => {
        emptyEl.classList.remove("hidden");
        const textEl = emptyEl.querySelector(".snippets-empty-text");
        if (textEl) {
            textEl.textContent = `加载失败：${error.message || error}`;
        }
    });
});
