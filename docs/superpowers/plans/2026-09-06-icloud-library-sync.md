# iCloud 学习库同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把生词本、句库、设置和大模型配置（含 API Key）整包同步到用户私有 iCloud Drive，删除重装后自动恢复。

**Architecture:** JS 以 `browser.storage.local` 为运行时数据源，用纯函数决定推/拉；Swift 原生层只读写 `iCloud.com.xxg.Flipword/Flipword/library.json`。覆盖规则为信封 `updatedAt` 后写入覆盖。

**Tech Stack:** Safari Web Extension MV3、Vanilla JS、`sendNativeMessage`、NSFileCoordinator、iCloud Documents、Node `assert` + `vm` 测试。

## Global Constraints

- 整包快照，不做按词条合并
- 同步键：`vocabItems`、`snippetItems`、`settings`、`aiKeys`、`aiProviderProfiles`、`stats`、`wordRecords`
- API Key 进入私有 iCloud 容器；文件不放 `Documents/`
- 无用户开关、无手动备份按钮
- 重装空库禁止先盖 `localUpdatedAt` 再推
- 约束命名使用 leading/trailing，不用 left/right
- 不改 content script 收藏路径
- 保留工作区里已有的 `background.js` / `ai-client.js` 未提交改动，只追加 iCloud 逻辑

---

## File Map

| 文件 | 职责 |
|------|------|
| `lib/icloud-sync.js` | `hasUserData`、`decideSyncAction`、`buildSnapshot`、`applySnapshot`、`formatSyncLabel`、`resolveDisplayStatus` |
| `background.js` | 启动拉、防抖推、`applyingCloud`、native 封装、`getIcloudStatus` / `icloudSyncNow` |
| `manifest.json` | background 在 `background.js` 前加载 `icloud-sync.js` |
| `SafariWebExtensionHandler.swift` | `icloudStatus` / `icloudRead` / `icloudWrite` |
| `options.html` / `settings-ui.js` | 状态区 + 隐私文案 |
| `learning.js` | 打开时 `icloudSyncNow` |
| AppDelegate ×2 | 预热 ubiquity 容器 |
| 四份 entitlements + `project.pbxproj` | iCloud Documents；pbxproj 把 `lib/icloud-sync.js` 列入 extension 资源例外 |
| `tests/icloud-sync.test.js` | 规格第 13 节 |
| `tests/resource-paths.test.js` | manifest / 磁盘路径 / native type |

---

### Task 1: icloud-sync 纯函数

**Files:**
- Create: `Shared (Extension)/Resources/lib/icloud-sync.js`
- Test: `tests/icloud-sync.test.js`

**Interfaces:**
- Produces:
  - `GlossX.ICloudSync.SYNC_KEYS: string[]`
  - `hasUserData(payload): boolean`
  - `decideSyncAction({ localUpdatedAt, hasUserData, cloudExists, cloudUpdatedAt, cloudDownloading }): "pull"|"push"|"noop"|"retry"`
  - `buildSnapshot(payload, updatedAt): LibrarySnapshot`
  - `applySnapshot(snapshot, existingStorage): { ok, storage?, localUpdatedAt?, error? }`
  - `formatSyncLabel({ lastStatus, lastError, lastPushAt, lastPullAt, now }): string`
  - `resolveDisplayStatus({ signedIn, available, lastStatus }): string`

- [ ] **Step 1: Write the failing test** `tests/icloud-sync.test.js` covering spec §13.

- [ ] **Step 2:** `node tests/icloud-sync.test.js` — FAIL（模块不存在）

- [ ] **Step 3:** Implement `lib/icloud-sync.js` as IIFE on `GlossX.ICloudSync`.

- [ ] **Step 4:** Re-run test — PASS

- [ ] **Step 5:** Commit `feat: add iCloud snapshot sync rules`

---

### Task 2: manifest、Xcode 资源路径、resource-paths 测试

**Files:**
- Modify: `Shared (Extension)/Resources/manifest.json` — background.scripts 在 `background.js` 前加 `icloud-sync.js`
- Modify: `GlossX.xcodeproj/project.pbxproj` — iOS/macOS Extension 的 membershipExceptions 加入 `"Resources/lib/icloud-sync.js"`（按字母插在 `floating-control.js` 与 `learning-export.js` 之间）
- Modify: `tests/resource-paths.test.js`

- [ ] **Step 1:** 在 resource-paths 增加：manifest background 含 `icloud-sync.js`；磁盘存在 `lib/icloud-sync.js`；handler 含 `icloudRead`。

- [ ] **Step 2:** 跑测试，确认新断言失败。

- [ ] **Step 3:** 改 manifest 与 pbxproj。

- [ ] **Step 4:** 测试通过。

- [ ] **Step 5:** Commit `feat: register iCloud sync script in the extension bundle`

---

### Task 3: 原生 iCloud 读写

**Files:**
- Modify: `Shared (Extension)/SafariWebExtensionHandler.swift`

**Interfaces:**
- `icloudStatus` → `{ ok, signedIn, available }`
- `icloudRead` → exists/content 或 `signedOut` / `unavailable` / `downloading`
- `icloudWrite` `{ content }` → `{ ok }`；空字符串 `{ ok:false, error:"empty snapshot" }`
- 容器 `iCloud.com.xxg.Flipword`，路径 `Flipword/library.json`，超时 10s
- `saveMarkdown` 行为不变

- [ ] **Step 1:** resource-paths 已要求 `icloudRead`；补 handler 分支与 `NSFileCoordinator`。

- [ ] **Step 2:** `node tests/resource-paths.test.js` PASS

- [ ] **Step 3:** Commit `feat: add native iCloud library file read/write`

---

### Task 4: entitlements 与含 App 预热

**Files:**
- Create: `iOS (App)/GlossX.entitlements`
- Create: `iOS (Extension)/GlossX.entitlements`
- Create: `macOS (App)/GlossX.entitlements`（保留 sandbox、network.client、user-selected.read-only）
- Create: `macOS (Extension)/GlossX.entitlements`（保留 sandbox、user-selected.read-only）
- Modify: `project.pbxproj` 四个 target Debug/Release 加 `CODE_SIGN_ENTITLEMENTS`
- Modify: iOS/macOS `AppDelegate.swift` 预热容器

容器 ID：`iCloud.com.xxg.Flipword`；services：`CloudDocuments`。

- [ ] **Step 1:** 加 entitlements 与 CODE_SIGN_ENTITLEMENTS。

- [ ] **Step 2:** AppDelegate 调用 `FileManager.default.url(forUbiquityContainerIdentifier: "iCloud.com.xxg.Flipword")`。

- [ ] **Step 3:** Commit `feat: enable iCloud Documents and warm the container`

---

### Task 5: background 调度

**Files:**
- Modify: `Shared (Extension)/Resources/background.js`

**行为：**
- `SYNC_KEYS` 变化 → 若非 `applyingCloud`，更新 `icloudMeta.localUpdatedAt`，防抖 2s 后 `runIcloudSync`
- `onInstalled` / `onStartup` 调用 `runIcloudSync`
- `runIcloudSync`：status → read → `decideSyncAction` → pull 或 push；`retry` 按 1s/3s/8s/8s/8s
- pull：`applySnapshot` 后带 `applyingCloud` 写入 payload + `icloudMeta.localUpdatedAt = cloud.updatedAt`
- push：升级路径先 stamp `localUpdatedAt`；`icloudWrite(JSON.stringify(buildSnapshot(...)))`
- 消息：`icloudSyncNow`、`getIcloudStatus`（返回 `label`）
- 抽出 `sendNative(payload)` 供 markdown 与 iCloud 共用

- [ ] **Step 1:** 在 resource-paths 或新断言中要求 background 含 `icloudSyncNow` 与 `storage.onChanged`。

- [ ] **Step 2:** 实现调度。不要改现有段落翻译 temperature 改动。

- [ ] **Step 3:** `node tests/resource-paths.test.js` 与 `node tests/icloud-sync.test.js` PASS

- [ ] **Step 4:** Commit `feat: sync library snapshots through the native iCloud bridge`

---

### Task 6: 设置页与学习页

**Files:**
- Modify: `options.html` — AI 与隐私之间加 iCloud section；改隐私文案
- Modify: `settings-ui.js` — 若存在 `#icloud-sync-status`，bootstrap 末尾 `icloudSyncNow` + `getIcloudStatus` 写 `label`
- Modify: `learning.js` — DOMContentLoaded 发送 `icloudSyncNow`

文案与规格 §9 一致。

- [ ] **Step 1:** resource-paths 断言 options 含 `icloud-sync-status` 与新隐私句。

- [ ] **Step 2:** 实现 UI。

- [ ] **Step 3:** 跑 `node tests/resource-paths.test.js` 与 `node tests/icloud-sync.test.js`

- [ ] **Step 4:** Commit `feat: show iCloud sync status on the settings page`
