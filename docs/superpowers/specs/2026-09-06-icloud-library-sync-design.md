# iCloud 学习库同步 — 设计规格

**日期：** 2026-09-06  
**状态：** 已确认  
**方案：** iCloud Drive 整包 JSON 快照（后写入覆盖）

---

## 1. 背景与目标

GlossX 的生词本、句库、设置与大模型配置（含 API Key）全部写在 Safari 扩展的 `browser.storage.local`。删除 App 重装、部分 Xcode/Safari 覆盖安装会清空该沙盒，数据无法恢复。

系统设置里的「iCloud / Safari 同步」不同步第三方扩展存储。需要 App **自己**把学习库写入用户 Apple ID 的 iCloud 私有容器，重装或换机后自动拉回。

**成功标准：** 同一 Apple ID、已登录 iCloud 时，删除 GlossX 再安装，生词本、句库、设置、大模型配置与 API Key 自动恢复。更新 App（Bundle ID 不变）不依赖 iCloud 也能保留本地数据；iCloud 作为保险。

---

## 2. 已确认决策

1. **语义：** 整包快照，按信封 `updatedAt` 后写入覆盖先写入。不做按词条合并。
2. **范围：** 同步 `vocabItems`、`snippetItems`、`settings`、`aiKeys`、`aiProviderProfiles`、`stats`、`wordRecords`。API Key 一并进入私有 iCloud 容器。
3. **介质：** iCloud Drive 容器内单个 JSON 文件，不使用 CloudKit、`NSUbiquitousKeyValueStore`、`browser.storage.sync`。
4. **开关：** 无总开关。已登录 iCloud 则自动同步。设置页显示状态，并提供「立即同步」手动触发推/拉。
5. **平台：** iOS 与 macOS 的含 App + Safari Web Extension，共用容器 `iCloud.com.xxg.Flipword`。

---

## 3. 方案对比（结论）

| 方案 | 结论 |
|------|------|
| A. iCloud Drive 一份 JSON | **采用。** 与整包覆盖语义一致，容量够 2000 词 + 句库，实现量最小。 |
| B. CloudKit 一条记录 + 附件 | 样板多，对整包覆盖无额外收益。 |
| C. `NSUbiquitousKeyValueStore` | 约 1MB 上限，释义/例句易超限。不用。 |
| Safari `storage.sync` | Safari 上基本等同本地存储，不会经 iCloud 同步。不用。 |

---

## 4. 架构

运行时仍以 `browser.storage.local` 为数据源。页面读写路径不变。

```
storage.local  ←→  lib/icloud-sync.js（组快照、比时间戳、防抖、回声抑制）
                         ↓ sendNativeMessage
              SafariWebExtensionHandler（只读写文件 + 登录/下载状态）
                         ↓ NSFileCoordinator
              iCloud 容器 iCloud.com.xxg.Flipword / Flipword/library.json
```

- **JS：** 拥有快照 schema、覆盖规则、何时推/拉。可单测。
- **Swift：** 不解析业务字段。读到字符串就原样交回；写入收到的字符串。
- **含 App：** 启动时预热 ubiquity 容器。扩展进程有时拿不到容器 URL，用户若从未打开过 GlossX App，设置页提示「请先打开一次 GlossX 应用」。

文件放在容器内 `Flipword/library.json`，**不**放在 `Documents/`，Files app 不可见，降低 API Key 被当普通文件打开的风险。容器对其他 Apple ID 不可见。

---

## 5. 快照信封

```ts
type LibrarySnapshot = {
  version: 1;
  updatedAt: number; // 毫秒，等于推送时的 icloudMeta.localUpdatedAt
  payload: {
    vocabItems: Record<string, unknown>;
    snippetItems: Record<string, unknown>;
    settings: Record<string, unknown>;
    aiKeys: Record<string, unknown>;
    aiProviderProfiles: unknown[];
    stats: Record<string, unknown>;
    wordRecords: Record<string, unknown>;
  };
};
```

`browser.storage.local` 另存 **`icloudMeta`**，不同步上云：

```ts
type IcloudMeta = {
  localUpdatedAt?: number;
  lastPushAt?: number;
  lastPullAt?: number;
  lastStatus:
    | "synced"
    | "signedOut"
    | "unavailable"
    | "downloading"
    | "pushing"
    | "error";
  lastError?: string;
};
```

应用云端快照时：只写入信封里**已知**的 payload 键；缺键当空对象/`[]` 补齐；**不得** `clear()` 整个 `storage.local`。未知 `version`（不等于 `1`）不应用，记 `lastStatus: "error"`，文案「云端数据版本过新，请更新 GlossX」。

---

## 6. 覆盖规则

`hasUserData(payload)` 为真当且仅当以下任一成立：

- `vocabItems`、`snippetItems`、`aiKeys`、`wordRecords` 至少有一个自有键
- `aiProviderProfiles.length > 0`

仅改过默认 `settings`、空库，不算「已有用户数据」（避免全新安装把空快照推上去）。

`decideSyncAction({ localUpdatedAt, hasUserData, cloudExists, cloudUpdatedAt, cloudDownloading })`：

| 条件 | 动作 |
|------|------|
| `cloudDownloading` | `retry`（不当成云端为空） |
| `localUpdatedAt` 空 **且** 云端有文件 | `pull`（重装） |
| `localUpdatedAt` 空 **且** 无云端文件 **且** `hasUserData` | 先把 `localUpdatedAt = Date.now()`，再 `push`（旧用户升级） |
| `localUpdatedAt` 空 **且** 无云端 **且** 无用户数据 | `noop`（全新安装） |
| 有 `localUpdatedAt` **且** 无云端文件 | `push` |
| 云端 `updatedAt` > `localUpdatedAt` | `pull` |
| `localUpdatedAt` > 云端 `updatedAt` | `push` |
| 相等 | `noop` |

**禁止**在「尚无 `localUpdatedAt` 的空库」上先盖时间戳再推：那会在重装后用空包覆盖云端。必须先 `pull`。

拉成功后：`localUpdatedAt` 设为云端信封的 `updatedAt`（不要 `Date.now()`），否则会立刻被当成更新而推回。

---

## 7. 时机

**拉**

- `browser.runtime.onStartup`、`onInstalled`
- 打开设置页
- 打开学习页
- 上次动作为 `retry` 时退避重试 5 次，延迟 1s、3s、8s、8s、8s

**推**

- 同步字段（第 2 节列表，不含 `icloudMeta`）在 `storage.local` 变化后，防抖 **2 秒** 再推
- 应用云端期间设内存标记 `applyingCloud`：该次 `storage.onChanged` 不入推送队列

本地每次用户侧改动同步字段时：`icloudMeta.localUpdatedAt = Date.now()`（`applyingCloud` 期间除外）。

**原生下载超时：** 协调读等待最多 **10 秒**。仍在下载则返回 `downloading`，JS 走 `retry`。

---

## 8. 原生消息

沿用 `browser.runtime.sendNativeMessage`。`SafariWebExtensionHandler` 按 `type` 分支；现有 `saveMarkdown` 行为不变。

### `icloudStatus`

请求：`{ "type": "icloudStatus" }`

成功：`{ "ok": true, "signedIn": true|false, "available": true|false }`

- `signedIn`：`FileManager.default.ubiquityIdentityToken != nil`
- `available`：`url(forUbiquityContainerIdentifier: "iCloud.com.xxg.Flipword") != nil`

### `icloudRead`

请求：`{ "type": "icloudRead" }`

| 结果 | 响应 |
|------|------|
| 未登录 | `{ "ok": false, "status": "signedOut" }` |
| 容器不可用 | `{ "ok": false, "status": "unavailable", "error": "请先打开一次 GlossX 应用" }` |
| 10s 内仍在下载 | `{ "ok": false, "status": "downloading" }` |
| 文件不存在 | `{ "ok": true, "exists": false }` |
| 读到内容 | `{ "ok": true, "exists": true, "content": "<utf8 json>" }` |
| 其它失败 | `{ "ok": false, "error": "<短原因>" }` |

读路径使用 `NSFileCoordinator`。若资源值显示未下载，先触发下载再等，直到超时。

### `icloudWrite`

请求：`{ "type": "icloudWrite", "content": "<utf8 json>" }`

成功：`{ "ok": true }`。未登录 / 容器不可用与 `icloudRead` 相同 `status`。写入用 `NSFileCoordinator` 原子写；必要时先 `createDirectory` 出 `GlossX/`。

Swift **不** `JSONSerialization` 业务对象。`content` 必须是非空字符串，否则 `{ "ok": false, "error": "empty snapshot" }`。

单条 native 消息携带完整 JSON。若 Safari 拒绝过大消息，记 `lastError`，不在本期做分片。

---

## 9. 设置页

位置：`options.html` 中「AI 辅助选词」与隐私说明之间，新增 section「iCloud 同步」。无 checkbox、无按钮。

展示优先级：原生 `signedIn === false` → 未登录文案；否则 `available === false` → 请先打开 App；否则用 `lastStatus`。

| 状态 | 文案 |
|------|------|
| `synced` 且距 `max(lastPushAt, lastPullAt)` < 60s | `已同步 · 刚才` |
| `synced` 且 < 60 分钟 | `已同步 · N 分钟前` |
| `synced` 且 < 24 小时 | `已同步 · N 小时前` |
| `synced` 且更久 | `已同步 · N 天前` |
| `signedOut` | `未登录 iCloud，收藏仅保存在本机` |
| `downloading` | `正在从 iCloud 恢复…` |
| `unavailable` | `请先打开一次 GlossX 应用` |
| `pushing` | `正在上传…` |
| `error` | `上次同步失败：` + `lastError`（无则 `未知错误`） |

固定说明（section 内 `hint-text`）：

> 使用同一 Apple ID 时，删除重装后会自动恢复生词本、句库和大模型配置。

打开设置页：先 `icloudSyncNow`，再 `loadState()` 渲染表单，避免拉取后表单仍是空配置。`getIcloudStatus` 返回 `{ lastStatus, lastError, label }`，设置页只渲染文案，不加载 `icloud-sync.js`。popup 不含该 section。

「立即同步」按钮调用同一路径：禁用按钮 → 状态显示「正在同步…」→ `icloudSyncNow` → 更新 `label` → 再 `loadState()`。

隐私段现为「学习数据保存在本机。」改为：

> 学习数据保存在本机，并在登录 iCloud 时同步到你的私有 iCloud 容器（含大模型配置）。启用 AI 或语句英文化后，会将短句上下文或选中语句文本发送至所选模型服务商或备用翻译服务。

---

## 10. Xcode / 能力

四个 target 均加入 iCloud Documents：

- 容器 ID：`iCloud.com.xxg.Flipword`
- services：`CloudDocuments`
- 新建 entitlements（iOS/macOS 的 App 与 Extension 各一份），`CODE_SIGN_ENTITLEMENTS` 写入 `project.pbxproj`

含 App `applicationDidFinishLaunching` 调用：

`FileManager.default.url(forUbiquityContainerIdentifier: "iCloud.com.xxg.Flipword")`

以创建/预热容器。不向用户展示 iCloud Drive 文件夹。

开发者账号需为 App ID `com.xxg.Flipword` / `com.xxg.Flipword.Extension` 打开 iCloud 能力，否则真机 `available == false`。这是发布前置条件，不是运行时功能开关。

---

## 11. 模块与改动文件

| 文件 | 职责 |
|------|------|
| `Shared (Extension)/Resources/lib/icloud-sync.js` | `hasUserData`、`decideSyncAction`、`buildSnapshot`、`applySnapshot`、`formatSyncLabel` |
| `Shared (Extension)/Resources/background.js` | 启动拉、防抖推、`applyingCloud`、消息 `getIcloudStatus` / `icloudSyncNow`、native 封装 |
| `Shared (Extension)/Resources/manifest.json` | `background.scripts` 在 `background.js` 前加入 `icloud-sync.js`（与现有 lib 扁平到 Resources 根目录一致） |
| `Shared (Extension)/SafariWebExtensionHandler.swift` | `icloudStatus` / `icloudRead` / `icloudWrite` |
| `Shared (Extension)/Resources/settings-ui.js`、`options.html` | `#icloud-sync-status` 状态区 + 隐私文案 |
| `Shared (Extension)/Resources/learning.js` | 打开时发送 `icloudSyncNow` |
| `iOS (App)/AppDelegate.swift`、`macOS (App)/AppDelegate.swift` | 预热容器 |
| `iOS (App)/GlossX.entitlements` 等四份、`GlossX.xcodeproj/project.pbxproj` | iCloud Documents + `CODE_SIGN_ENTITLEMENTS` |
| `tests/icloud-sync.test.js` | 第 13 节规则单测 |
| `tests/resource-paths.test.js` | 断言 `manifest` background 含 `icloud-sync.js`，且磁盘存在 `lib/icloud-sync.js` |

不改 content script 收藏路径。

---

## 12. 失败与边界

- 未登录 / 容器不可用 / 读写失败：本机照常读写 `storage.local`，只更新 `icloudMeta`。不弹模态框。
- `icloudRead` 返回 `downloading`：**禁止**解释为 `exists: false`。
- 拉到的 JSON 非法：不写 payload，`lastStatus: "error"`，`lastError: "云端数据无法读取"`。
- 多设备同时改：整包后写入覆盖，后完成推送的设备赢。本期不合并词条。
- 扩展 background `persistent: false`：`storage.onChanged` 与 alarm/防抖须在 background 顶层注册；Safari 若卸掉 worker，下次启动再拉/推，可接受最多丢失数秒未推出的变更（本地仍在）。

---

## 13. 测试

与现有仓库一样用 `node tests/icloud-sync.test.js`，不连真 iCloud。

必须覆盖：

1. 无 `localUpdatedAt` + 云端有文件 → `pull`，且空库不会 `push`
2. 无 `localUpdatedAt` + 无云端 + `hasUserData` → `push`
3. 无 `localUpdatedAt` + 无云端 + 无用户数据 → `noop`
4. 本地更新、云端更旧 → `push`
5. 云端更新、本地更旧 → `pull`
6. 时间戳相同 → `noop`
7. `cloudDownloading` → `retry`，不等于云端为空
8. `applySnapshot` 缺字段时补空，不删除未列出的 `storage` 键
9. `version !== 1` 拒绝应用
10. 相对时间：59s → `刚才`；3 分钟 → `3 分钟前`

真机验收（实现完成后人工）：登录 iCloud → 收藏一词并保存 API Key → 删 App 重装 → 先打开一次 GlossX App → 再开扩展设置/学习页 → 词与 Key 恢复。
