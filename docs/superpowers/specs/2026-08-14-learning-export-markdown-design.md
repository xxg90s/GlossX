# 学习库导出 Markdown（原生另存为）

**日期：** 2026-08-14  
**状态：** 已确认  
**方案：** A — `NSSavePanel` 本机写入

## 背景

浏览器 Blob 下载会给文件打上 `com.apple.quarantine`，macOS 打开 `.md` 时可能弹出 Gatekeeper 警告。剪贴板复制可规避，但用户需要直接得到 `.md` 文件。

## 行为

1. 学习页「导出」→ 预览页
2. 主按钮「下载 Markdown」
3. `browser.runtime.sendNativeMessage` → `SafariWebExtensionHandler`
4. macOS：弹出 `NSSavePanel`，将 UTF-8 Markdown 写入用户所选路径（无 quarantine）
5. 用户取消：静默结束
6. 原生不可用 / iOS / 失败：回退到复制剪贴板，并提示原因

## 前提

`manifest.json` 必须声明 `nativeMessaging` 权限，否则 `sendNativeMessage` 会失败并静默退回剪贴板。

```json
{ "type": "saveMarkdown", "filename": "GlossX-….md", "content": "..." }
```

成功：`{ "ok": true }`  
取消：`{ "ok": false, "cancelled": true }`  
失败：`{ "ok": false, "error": "…" }`
