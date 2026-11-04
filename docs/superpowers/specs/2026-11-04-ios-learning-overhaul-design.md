# iOS 学习体验整体优化 — 设计规格

**日期：** 2026-11-04  
**状态：** 已确认（范围：全部；同步：两端统一；直接提交 main）

---

## 1. 背景

上一轮产品与技术评审的结论：iOS App 的定位（语境收词 + 原句复习）有差异化，但存在三类问题：

1. **数据可靠性：** iOS 按条目合并、Mac 按整包时间戳覆盖，删除没有墓碑，可能丢词或删掉的词复活。
2. **学习效果：** “已掌握”后永不复习；忘掉的卡当轮不再出现；不能撤销；题型只有自评挖空；整句不进复习。
3. **获客与留存：** 只有 iPhone 的用户打开即空；没有统计、提醒时间固定、词库只读；不支持深色模式与动态字号。

每一项单独提交，提交信息使用 conventional commits。

---

## 2. 同步协议 v1.1（两端统一）

快照仍是 `version: 1`，只增加字段，旧字段语义不变。

### 2.1 新增字段

- `payload.deletedItems`：`{ "vocab:<id>": deletedAtMs, "snippet:<id>": deletedAtMs }`。
- 顶层 `metaUpdatedAt`：`settings`、`aiKeys`、`aiProviderProfiles`、`wordRecords` 最后一次被修改的时间。

### 2.2 合并规则（Swift `SnapshotMerge` 与 JS `ICloudSync.mergePayloads` 完全一致）

- **条目：** 两边取并集。同一条目：
  - 复习字段（`status`、`easeFactor`、`interval`、`repetitions`、`nextReviewAt`、`reviewedAt`、`learnedAt`、`familiarAt`）取 `reviewTimestamp` 较新的一方，相同时取本地。
  - 其余内容字段取 `updatedAt`（缺省用 `addedAt`）较新的一方，相同时 iOS 取云端、Mac 取本地。
- **删除：** 墓碑时间 `>=` 条目 `addedAt` 时删除该条目；删除后重新收藏会产生新的 `addedAt`，因此能恢复。墓碑取两边最大值，保留 180 天。
- **非条目键：** 取 `metaUpdatedAt` 较新的一方；被选中一方为空而另一方非空时用非空的一方。缺少 `metaUpdatedAt` 的旧快照用 `updatedAt` 代替。
- **stats：** 两边 `date` 不同取较新日期一方；相同则各计数取最大值。

### 2.3 Mac 扩展

- `storage.onChanged` 里对比 `vocabItems`/`snippetItems` 的新旧值，被移除的 id 写入 `deletedItems`；非条目键变化时记录 `icloudMeta.localMetaUpdatedAt`。这样所有删除入口（背景页、内容脚本、学习页）都被覆盖。
- 云端存在时不再整包 pull/push，而是：合并 → 与本地不同则写本地（期间抑制 onChanged）→ 与云端不同则推送。

### 2.4 iOS

- 本地删除条目（词库滑动删除）写墓碑。
- 合并时保留云端 `metaUpdatedAt`，iOS 不修改非条目键。

---

## 3. 复习

### 3.1 已掌握回到长期复习

`mastered` 只是标签。到期（`nextReviewAt <= now`）的已掌握卡重新进入队列；再次记住时间隔继续按 EF 增长（不低于 21 天），忘记则回到 `learning`。Mac 学习页的到期判断与 `applyVocabReview` 同步修改。`familiar`（整句标记熟悉）与 `skipped` 仍不复习。

### 3.2 当轮重学与撤销

- 评为“忘了”或“模糊”的卡，在当前位置之后第 3 张（不足则末尾）再出现一次，直到评为“记住了”。只有每张卡**本轮第一次**评分写入 SM-2 与连胜。
- 撤销：保存上一步前的条目 JSON、连胜记录与会话状态，复习页顶部提供“撤销”，只能撤销最近一步，退出复习后清空。

### 3.3 多题型

`CardMode` 新增 `choice`（看英文选中文释义）、`listen`（听音选中文释义）、`spell`（看释义和挖空句拼写）。按熟练度选择：

| 条件 | 题型 |
|---|---|
| 新卡 | `intro`（认识） |
| `repetitions` 0–1 | `choice` |
| `repetitions` 2 | `listen` |
| `repetitions` ≥ 3 | `cloze` 与 `spell` 按 id 哈希交替 |

- 干扰项从其他条目的释义中按确定性种子选取，需要至少 3 个不同释义，否则回退 `cloze`。短语不出 `listen`/`spell`。
- 客观题自动评分：答对“记住了”，拼写只差一个字母为“模糊”，其余为“忘了”。作答后展示答案与“继续”。

### 3.4 整句复习

整句进入复习，题型 `recall`：展示中文，回想英文，点按看原句后自评。每天新整句最多 3 句，计入每日目标。

---

## 4. iOS 功能

- **词库：** 左滑删除（写墓碑）、“太简单，跳过”（`skipped`）、恢复跳过；右上角“添加单词”（单词、释义、例句可选，id 与 Mac 一致为小写单词）；有 `pageUrl` 时可打开原文。
- **提醒：** 设置页可选提醒时间（默认 20:00）；达标与评分时触感反馈。
- **统计页：** 新增“统计”Tab：总数/学习中/已掌握、当前与最长连胜、近 12 周打卡热力图、未来 7 天到期预测。计算逻辑放 `GlossXCore.LibraryStats`。
- **外观：** 调色板改为浅色/深色自适应；字号全部使用文字样式以支持动态字号；图标按钮补无障碍标签。
- **发音：** 音频会话设为 `.playback` + `.duckOthers`（静音键下也能发音）；优先选择增强/高级英语语音；设置可选美式/英式。
- **新手引导：** 首次启动展示三步：产品说明、开启 Safari 扩展（设置 → Safari → 扩展 → GlossX → 允许所有网站）、选择入门词包（读取扩展包内 `lexicon-*.json`，导入 20 个词）。空状态改为可操作入口，文案不再说“手机不提供网页翻译”。
- **大模型例句：** 读取同步来的当前大模型配置（OpenAI 兼容接口与 Anthropic），在词条详情生成 2 个新例句，可设为复习例句（写入 `extraExample` 并更新条目 `updatedAt`）。
- **分享扩展：** 新增 Share Extension，把选中文本写入 App Group 收件箱，App 激活时导入为单词或短语。
- **性能：** `LibraryStore` 在快照变化时缓存条目列表与按 id 索引，视图不再重复映射。

---

## 5. 不做

FSRS 算法替换（需要两端同时改调度与数据迁移，另起规格）、交互式小组件（需要 iOS 17 小组件目标）、API Key 迁移到钥匙串（Mac 扩展无法访问钥匙串，需原生桥接，另起规格）。

---

## 6. 测试

- Swift：`SnapshotMerge`（墓碑、重新收藏、内容/复习字段分别取新、meta 选择、stats）、`ReviewQueue`（到期的已掌握卡）、`ReviewSession`（重学、仅首评计分、撤销）、`QuizBuilder`（题型选择、干扰项、回退）、拼写判定、`LibraryStats`、`StarterPack` 解析、`LibraryMutator`（删除、跳过、添加、例句）。
- JS：`mergePayloads` 与 Swift 同构用例、`collectTombstones`、`applyVocabReview` 已掌握间隔增长、到期判断。
- 每次提交前：`swift test`、全部 `tests/*.test.js`、iOS 模拟器构建。
