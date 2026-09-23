(function () {
    window.addEventListener("message", (event) => {
        const data = event.data;
        if (!data || data.type !== "glossx-download") return;
        const filename = String(data.filename || "GlossX.md");
        const content = String(data.content || "");
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const uri = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = uri;
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(uri), 1500);
    });
})();
