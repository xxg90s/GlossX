document.addEventListener("DOMContentLoaded", () => {
    const Export = globalThis.GlossX?.LearningExport;
    const headingEl = document.getElementById("export-heading");
    const hintEl = document.getElementById("export-hint");
    const titleEl = document.getElementById("export-doc-title");
    const metaEl = document.getElementById("export-doc-meta");
    const bodyEl = document.getElementById("export-body");
    const downloadBtn = document.getElementById("export-download");
    const backBtn = document.getElementById("export-back");

    let currentDoc = null;

    function queryParam(name) {
        return new URLSearchParams(location.search).get(name) || "";
    }

    function currentTab() {
        return queryParam("tab") === "snippets" ? "snippets" : "vocab";
    }

    function currentFilter() {
        const filter = queryParam("filter");
        return Export?.FILTER_LABELS?.[filter] ? filter : "all";
    }

    async function loadDocument() {
        if (!Export) {
            throw new Error("导出模块未加载");
        }

        const stored = await browser.storage.local.get(["vocabItems", "snippetItems"]);
        return Export.buildExportDocument({
            tab: currentTab(),
            filter: currentFilter(),
            vocabItems: stored.vocabItems || {},
            snippetItems: stored.snippetItems || {}
        });
    }

    function downloadViaFrame(filename, content) {
        return new Promise((resolve, reject) => {
            const frameUrl = browser.runtime.getURL("download-frame.html");
            const iframe = document.createElement("iframe");
            iframe.style.display = "none";
            iframe.src = frameUrl;
            let settled = false;

            const finish = (fn, value) => {
                if (settled) return;
                settled = true;
                iframe.remove();
                fn(value);
            };

            iframe.onload = () => {
                try {
                    iframe.contentWindow.postMessage({
                        type: "glossx-download",
                        filename,
                        content
                    }, "*");
                    setTimeout(() => finish(resolve, { mode: "download" }), 600);
                } catch (error) {
                    finish(reject, error);
                }
            };
            iframe.onerror = () => finish(reject, new Error("下载框架加载失败"));
            document.body.appendChild(iframe);
        });
    }

    async function downloadMarkdown(doc) {
        const markdown = Export.renderExportMarkdown(doc);
        const filename = Export.buildDownloadFilename(doc);
        // Safari 扩展页直接 <a download> 常常无效；经隐藏 iframe 才能真正下载到本地。
        await downloadViaFrame(filename, markdown);
        return { mode: "download" };
    }

    function render(doc) {
        currentDoc = doc;
        const fileTitle = Export.buildFileTitle(doc);
        document.title = fileTitle;
        headingEl.textContent = `${doc.tabLabel} · ${doc.filterLabel}`;
        titleEl.textContent = doc.tabLabel;
        const day = Export.formatDayLabel(Export.localDayKey(new Date(doc.exportedAt)));
        metaEl.textContent = `${doc.filterLabel} · ${doc.entries.length} 条 · ${day}`;
        bodyEl.innerHTML = Export.renderExportBody(doc);

        const canDownload = doc.entries.length > 0;
        downloadBtn.disabled = !canDownload;
        hintEl.textContent = canDownload
            ? "点击后保存 Markdown 到本地。"
            : "当前筛选没有内容，换一个条件后再导出。";
    }

    backBtn.addEventListener("click", () => {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        window.close();
    });

    downloadBtn.addEventListener("click", async () => {
        if (downloadBtn.disabled || !currentDoc) return;
        const original = downloadBtn.textContent;
        downloadBtn.disabled = true;
        try {
            const result = await downloadMarkdown(currentDoc);
            if (result.mode === "file") {
                downloadBtn.textContent = "已保存";
                hintEl.textContent = "已保存 Markdown 文件。";
            } else {
                downloadBtn.textContent = "已下载";
                hintEl.textContent = "已开始下载，请到「下载」文件夹查看 .md 文件。";
            }
            setTimeout(() => {
                downloadBtn.textContent = original;
            }, 1600);
        } catch (error) {
            hintEl.textContent = `导出失败：${error.message || error}`;
        } finally {
            downloadBtn.disabled = !currentDoc?.entries?.length;
        }
    });

    loadDocument()
        .then(render)
        .catch((error) => {
            currentDoc = null;
            headingEl.textContent = "导出失败";
            titleEl.textContent = "无法读取学习库";
            metaEl.textContent = "";
            bodyEl.innerHTML = `
                <div class="export-empty">
                    <div class="export-empty-title">导出失败</div>
                    <div class="export-empty-text">${Export ? Export.escapeHtml(error.message || error) : String(error)}</div>
                </div>`;
            downloadBtn.disabled = true;
        });
});
