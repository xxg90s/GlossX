# iOS 每日连胜与小组件 — 设计规格

**日期：** 2026-11-02  
**状态：** 已确认  
**方案：** `GlossXCore` 纯逻辑连胜引擎 + App Group 共享状态 + iCloud 键值存储备份 + WidgetKit 扩展

---

## 1. 背景与目标

参考多邻国：用户每天完成学习任务，连胜天数 +1，并能在桌面和锁屏的小组件上随时看到连胜与今日进度，借此培养每日复习习惯。

现有的「连续 N 天」（`stats.streak`）不能直接复用：

1. 打卡口径过宽：Mac 上收藏一个词、iOS 上评分一张卡都算当天活跃，并不是“完成任务”。
2. 没有即时反馈：天数只在第二天第一次操作时才结算，当天完成后数字不变。
3. 断签检测有漏洞：`rolloverStats` 比较的是 `lastActiveDate` 与上次记录的 `stats.date`，中间整天缺席时仍可能 +1。
4. 两端日期口径不一致：Mac 扩展用 UTC 日期（`toISOString`），iOS 用本地日期；同步合并又取两端较大值，天数只增不减。

**成功标准：**

- 当天在 iOS 上复习满目标张数的瞬间，App 与小组件的连胜天数同时 +1。
- 过了本地 0 点还没完成前一天任务，即使没打开 App，小组件也会显示连胜归零。
- 删除重装 App、换 iPhone，或在同一 Apple ID 的 iPad 上，连胜都能保留。

---

## 2. 已确认决策

1. **每日任务：** 当天在 iOS 上至少复习 N 张不同的卡片。N 默认 10，设置页可调为 5 到 50。
2. **卡片不足：** 当天到期卡加新卡不足 N 张时，从“未到期但最早到期”的卡中提前补齐；只有可复习的卡片总数不足 N 张时，目标降为“复习完全部可复习卡片”。
3. **计入范围：** 只统计 iOS 上的复习。Mac 扩展的收藏与复习都不计入；扩展弹窗里的旧 `stats.streak` 保持原样，与新连胜脱钩。
4. **存储：** 主存储放在 App Group 的共享 `UserDefaults`，另用 `NSUbiquitousKeyValueStore` 备份。不写入与 Mac 共用的 iCloud 学习库文件。
5. **小组件：** 桌面小号、中号，锁屏圆形、单行。小组件扩展最低 iOS 16；App 本体维持 iOS 15，iOS 15 设备只是看不到小组件。
6. **提醒：** 20:00 的每日提醒改为只在当天未完成时才发送，文案带上连胜天数与剩余张数。
7. **不做：** 连胜冻结、补签、可交互小组件（在组件上直接答题）、Mac 端连胜。

---

## 3. 连胜规则

### 3.1 日期

- 一律以设备**本地时区**的日期字符串 `yyyy-MM-dd` 表示一天（沿用 `DayStamp`）。
- 完成日期在完成那一刻按当时的本地时区固化为字符串，事后不再改写。

### 3.2 当天进度

- `todayReviewedIds`：当天评过分的卡片 ID 集合。同一张卡多次评分只算一次。
- `effectiveGoal = min(goal, reviewableCount)`。`reviewableCount` 沿用 `ReviewQueue` 现有的过滤口径：排除整句，以及状态为 `mastered`、`familiar`、`skipped` 的卡片，剩下的卡片总数（含今天已复习的）。
- `reviewableCount == 0` 时没有可做的任务：当天不算完成，首页提示先去收藏。
- `todayReviewedIds.count >= effectiveGoal` 且 `effectiveGoal > 0` 时，当天记为完成，把当天日期加入 `completedDays`。
- 当天调高目标，不会撤销已经记下的完成。

### 3.3 连胜天数

设 `today` 为今天的日期：

- 如果 `today ∈ completedDays`，从 `today` 开始往前数连续完成的天数。
- 否则从 `today - 1` 开始往前数；如果昨天也未完成，结果为 0。

因此今天还没做时天数保持不变（显示为“待完成”），过了 0 点仍未完成才归零。

### 3.4 旧数据

旧的 `stats.streak` 算法不可靠，新连胜从 0 开始，不做迁移。旧字段继续由原代码维护，供 Mac 扩展弹窗使用，iOS 首页不再读取。

---

## 4. 复习队列补齐

修改 `ReviewQueue.build`，新增目标参数：

新增两个参数：`goal`（当天还差的张数，即 `remaining`）和 `excludedIds`（`todayReviewedIds`）。

1. 先按现有规则取出到期卡与新卡，保留现有上限（新卡最多 10 张，到期卡最多 20 张）。
2. 合计不足 `goal` 张时，从剩余的可复习卡里补齐，直到 `goal` 张或无卡可补：先取未到期的已学卡，按 `nextReviewAt` 升序；不够再取超出新卡上限的新卡，按 `addedAt` 降序。
3. 补齐时跳过 `excludedIds`，避免今天已复习过的卡被反复拉回。
4. 现有规则取出的卡多于 `goal` 时不截断。达标后用户可以继续复习，不影响打卡。

提前复习的卡同样走 SM-2 评分，间隔按实际评分时间计算。

---

## 5. 架构

```
iOS App
 ├─ LibraryStore ──grade──▶ StreakStore.recordReview(id)
 │                              │
 │                              ├─ StreakEngine（GlossXCore）计算状态
 │                              ├─ 写 App Group UserDefaults（StreakRecord + WidgetState）
 │                              ├─ 写 NSUbiquitousKeyValueStore（StreakRecord）
 │                              ├─ WidgetCenter.reloadAllTimelines()
 │                              └─ ReviewReminder.reschedule(state)
 │
 └─ 监听 NSUbiquitousKeyValueStore.didChangeExternallyNotification
        └─ 合并 → 同上写入与刷新

Widget Extension（iOS 16+）
 └─ 只读 App Group 里的 StreakRecord / WidgetState
      └─ StreakEngine 生成“现在”和“下一个本地 0 点”的时间线条目
```

### 5.1 `StreakEngine`（GlossXCore，新增）

纯逻辑，不依赖 UIKit、WidgetKit 或存储。

- 输入：`StreakRecord`、`goal`、`reviewableCount`、当前时间、时区。
- 输出：`StreakStatus`，包含：
  - `streak`：连胜天数
  - `todayCompleted`：今天是否完成
  - `todayReviewed`：今天已复习张数
  - `effectiveGoal`：今天的有效目标
  - `remaining`：还差几张
  - `week`：本周一到周日每天的状态（已完成 / 未完成 / 今天待完成 / 未来）
- 另提供 `recordReview(id:)` 与 `merge(_:_:)` 两个纯函数。

### 5.2 `StreakRecord`（持久化结构，版本 1）

```json
{
  "version": 1,
  "goal": 10,
  "completedDays": ["2026-10-31", "2026-11-01"],
  "today": { "date": "2026-11-02", "reviewedIds": ["v_abc", "snip_xyz"] },
  "updatedAt": 1793520000000
}
```

- `completedDays` 只保留最近 400 天，避免键值存储膨胀（单个键上限 1MB，实际不到 10KB）。
- `today.date` 不等于今天时，视为 `reviewedIds` 为空。

### 5.3 合并规则

`merge(a, b)`：

- `completedDays` 取并集。
- `today`：两边日期相同则合并 `reviewedIds`；否则取较新的日期。
- `goal` 取 `updatedAt` 较新一方的值。

合并结果对两端都安全，多设备不会互相覆盖已完成的日子。

### 5.4 `StreakStore`（App 内，新增）

- 启动时读取 App Group 与键值存储，合并后写回两处。
- `recordReview(id:)`：由 `LibraryStore.grade` 调用，更新记录并触发刷新。
- `setGoal(_:)`：由设置页调用。
- 每次变更后都会：
  - 写入 App Group，包括 `StreakRecord` 和供小组件直接展示的 `WidgetState`（同时带上 `reviewableCount` 与 `goal`）。
  - 写入键值存储，并调用 `synchronize()`。
  - 刷新所有小组件时间线。
  - 重新安排提醒。

### 5.5 小组件时间线

- 当前条目：由 `StreakEngine` 基于当前时间计算。
- 下一个本地 0 点条目：用同一份记录按新的日期重新计算，得出“今天待完成、还差 `effectiveGoal` 张”，或者断签归零。
- 刷新策略：在下一个 0 点之后刷新，即 `.after(nextMidnight)`。App 内每次变更也会主动刷新。

---

## 6. 界面

### 6.1 小组件

| 规格 | 内容 |
|------|------|
| 桌面小号 | 火苗图标、天数、“今日已完成”或“还差 N 张” |
| 桌面中号 | 小号内容，加本周一到周日 7 个打卡点 |
| 锁屏圆形 | 火苗加天数 |
| 锁屏单行 | `🔥 12 天 · 还差 7 张`；完成后为 `🔥 12 天 · 今日已完成` |

- 今天已完成时火苗为橙色，待完成时为灰色，天数为 0 时显示“开始连胜”。
- 点击小组件通过深链接 `glossx://review` 打开 App，并直接进入复习。

### 6.2 App 内

- 首页 `TodayView` 的“连续 N 天”改读 `StreakStatus`，并显示今日进度（例如 `3 / 10`）。
- 达到目标的那一刻，复习页弹出“连续 N 天”的庆祝提示，之后可以继续复习。
- 设置页新增“每日目标”，可选 5 到 50 张。

### 6.3 提醒

- 不再使用每天重复的通知，改为提前安排未来 7 天每天 20:00 的单次通知。
- 当天完成后，取消当天那条通知。
- 文案：有连胜时为“连续 12 天，今天还差 7 张，别断了”；无连胜时为“今天还差 10 张，开始你的连胜”。
- 每次 App 启动或连胜状态变化时都重新安排。

---

## 7. 工程配置

- 新增 target：`GlossX Widget (iOS)`，类型为 Widget Extension，最低 iOS 16，依赖 `GlossXCore`。
- 新增 App Group `group.com.xxg.Flipword`，App 与小组件扩展都要启用。
- App 启用 iCloud 键值存储权限：`com.apple.developer.ubiquity-kvstore-identifier`。
- 在 App 的 `Info.plist` 中注册 URL Scheme `glossx`。
- 上述 App Group 与权限需要在 Apple 开发者后台为 Team `4CEAMHPC5F` 开通。

---

## 8. 测试

- **`StreakEngine` 单元测试：**
  - 当天达标后立即 +1。
  - 今天未完成时天数保持；隔一整天未完成则归零。
  - 跨 0 点切换。
  - 重复评分同一张卡不重复计数。
  - 可复习卡片不足目标时，目标下调。
  - 收藏库为空时当天不算完成。
  - 当天调高目标不撤销已完成。
  - `merge` 的并集语义。
  - `completedDays` 只保留 400 天。
- **`ReviewQueue` 单元测试：** 不足目标时先按 `nextReviewAt` 补已学卡、再补新卡；补齐时跳过今天已复习的卡；现有规则取出的卡多于目标时不截断。
- **小组件：** 用 Xcode 预览检查三种状态：已完成、待完成、天数为 0。
- **真机验证：**
  - 跨 0 点后小组件自动变化。
  - 两台设备分别复习后，连胜正确合并。
  - 删除重装后，连胜从 iCloud 恢复。
