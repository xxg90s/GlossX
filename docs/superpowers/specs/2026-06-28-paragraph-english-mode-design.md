# 段落英文化模式 — 设计规格

**日期：** 2026-06-28  
**状态：** 已实现（v1.2.0）

## 背景与目标

在现有「词级替换」模式基础上，新增独立的「段落英文化」模式：随机选取网页中若干段落，将其翻译为地道英文，供沉浸式阅读。

两种模式通过**独立开关**控制，用户可单独或同时启用。段落模式支持**占比**与**中英文显示样式**配置。

## 翻译链路（用户确认）

| 优先级 | 方案 | 条件 | 质量 |
|--------|------|------|------|
| 1 | 用户配置的 AI API | 已保存对应服务商 API Key | 高（地道英文） |
| 2 | 免费机器翻译 API（MyMemory） | 无 AI Key 或 AI 调用失败 | 中（可读，不够地道） |
| 3 | 保留原文 | 备选也失败 | 不改动该段落 |

> Safari 扩展无法调用系统「翻译网页」能力，因此备选采用 background 发起的 HTTP 翻译接口，并在 UI 标注「备用翻译」。

## 方案对比

### 方案 A（推荐）：独立模块 `paragraph-translator.js`

- content 侧负责段落采集、抽样、DOM 替换与样式
- background 侧负责 `translateParagraph` 消息、AI 调用、缓存与备选翻译
- 与 `replacer.js` 解耦，通过 `data-glossx-paragraph` 标记避免重复处理

**优点：** 边界清晰、易测、不影响现有词替换逻辑。  
**缺点：** 新增文件与消息类型。

### 方案 B：扩展 `replacer.js`

在同一文件内增加段落分支。

**优点：** 文件少。  
**缺点：** replacer 职责过重，词替换与段落翻译生命周期不同（异步 API vs 同步本地）。

### 方案 C：整页 iframe 覆盖译文

**缺点：** 破坏页面布局与交互，不采用。

**结论：采用方案 A。**

## 开关与权限模型

沿用现有「总开关 + 白名单」作为扩展是否在该站生效的前置条件。在其之上增加两个**功能级**开关：

| 设置项 | 字段 | 默认值 | 说明 |
|--------|------|--------|------|
| 词级替换 | `wordReplaceEnabled` | `true` | 兼容旧用户，默认保持现有行为 |
| 段落英文化 | `paragraphModeEnabled` | `false` | 新功能默认关闭 |

- 总开关关 / 未加白名单：两种模式均不执行
- 仅词替换开：行为与现在一致
- 仅段落模式开：只做段落翻译，不做词替换
- 两者都开：先标记并翻译选中段落，词替换处理其余区域（已翻译段落跳过）

## 新增设置项

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `paragraphRatio` | enum | `low` | 段落抽样占比 |
| `paragraphDisplayMode` | enum | `english_only` | 段落的中英文展示方式 |

### 段落占比档位

| 值 | 标签 | 比例 |
|----|------|------|
| `minimal` | 极低 | 10% |
| `low` | 低 | 20% |
| `medium` | 中 | 30% |
| `high` | 偏高 | 40% |
| `max` | 高 | 50% |

### 段落显示模式

与词替换一致的三档，但使用独立字段 `paragraphDisplayMode`：

| 值 | 展示效果 |
|----|----------|
| `english_only` | 纯英文段落 |
| `en_then_cn` | 英文为主，段落下附中文对照（小字） |
| `cn_then_en` | 保留中文段落，下方附英文译文（小字） |

## 段落识别规则

候选元素标签（与 replacer 块级标签对齐）：

`P`, `LI`, `H1`–`H6`, `BLOCKQUOTE`, `TD`, `TH`, `FIGCAPTION`

过滤条件：

- 含至少 15 个汉字（可配置常量 `MIN_PARAGRAPH_CHARS`）
- 非 `SCRIPT/STYLE/CODE/PRE` 等跳过标签内
- 非 GlossX UI（`.glossx-*`）
- 未被 `data-glossx-paragraph` 标记
- 父级已在段落翻译中的子块不重复选

### 随机抽样

- 对候选列表按**稳定种子**抽样：`hash(pageUrl + elementIndex)`，使同页刷新结果一致，避免滚动时闪烁
- 抽样比例由 `paragraphRatio` 决定
- 单页最多翻译 **20 段**（防止 API 滥用与页面卡顿）

## 架构与数据流

```
content.js
  └─ refreshState()
       ├─ paragraphModeEnabled → ParagraphTranslator.processRoot()
       └─ wordReplaceEnabled   → Replacer.processRoot()

ParagraphTranslator (content)
  ├─ collectParagraphs(root)
  ├─ sampleByRatio(candidates, ratio, seed)
  ├─ for each: mark loading → sendMessage(translateParagraph)
  └─ applyTranslation(element, result, displayMode)

background.js
  └─ translateParagraph { text, context? }
       ├─ 1. cache hit → return
       ├─ 2. AI (if apiKey) → parse JSON { english }
       ├─ 3. MyMemory fallback
       └─ return { ok, english, source: "ai"|"fallback"|"error" }
```

### AI Prompt 要点

- 角色：将中文段落译为自然、地道的英文
- 保留语气与段落结构，不添加解释
- 仅返回 JSON：`{"english":"..."}`

### 缓存

- background 内存缓存：`hash(normalizedText)` → 译文，上限 200 条
- 同一段落重复进入视口不重复请求

### 并发与性能

- 同时最多 **3** 个翻译请求
- 翻译中段落显示浅色 loading 样式（`glossx-paragraph-loading`）
- MutationObserver 新增节点时仅处理未标记段落

## DOM 与样式

翻译完成后包裹为：

```html
<div class="glossx-paragraph" data-glossx-paragraph="1" data-source="ai">
  <div class="glossx-paragraph-en">English text...</div>
  <!-- en_then_cn / cn_then_en 时附加对照层 -->
</div>
```

- 原文存入 `data-glossx-original`（便于设置变更后还原）
- 关闭段落模式或刷新页面时由 content 还原或整页重载自然恢复
- `content.css` 增加段落样式：左侧细线标识、对照文小字灰色

## UI 变更

### popup.html（快捷入口）

新增区块「段落英文化」：

- 开关：`paragraphModeEnabled`
- 占比下拉：5 档
- 显示模式下拉：3 档
- 无 AI Key 时显示提示：「将使用备用翻译；配置 AI 可获得更地道译文」

词替换区块补充独立开关 `wordReplaceEnabled`（与密度并列）。

### options.html（完整设置）

新增独立 section「段落英文化」，字段与 popup 同步；隐私说明补充：启用段落模式会将选中段落文本发送至 AI 或备用翻译服务。

### settings 同步

以下文件统一 `DEFAULT_SETTINGS`：

- `lib/storage.js`
- `popup-storage.js`
- `background.js`

## 错误处理

| 场景 | 行为 |
|------|------|
| 无网络 | 保留原文，段落角标短暂显示「翻译失败」 |
| AI 超时（15s） | 自动降级 MyMemory |
| MyMemory 失败 | 保留原文 |
| 用户关闭段落模式 | `refreshState` 还原带 `data-glossx-original` 的节点 |

## 与现有功能的关系

- **不依赖** `aiEnabled`（词消歧开关）；段落模式只要有 Key 即用 AI，否则走备选
- 词库、密度、SM-2 与段落模式无关
- 微信公众号 `#js_content` 同样适用，复用 `getProcessRoot()` 逻辑

## 测试计划

1. 仅词替换 / 仅段落 / 双开 — 三种组合在普通文章页验证
2. 无 API Key — 验证 MyMemory 备选与来源标记
3. 有 API Key — 验证 AI 译文与缓存
4. 调整占比 — 刷新后抽样数量符合预期
5. 三种 displayMode 渲染正确
6. 关闭段落开关后页面可恢复（或提示刷新）

## 版本

实现完成后 manifest 版本升至 **1.2.0**。
