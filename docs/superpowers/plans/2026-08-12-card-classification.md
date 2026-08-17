# 阶段二通知卡片分类与策略基础实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本项目不执行 Git commit；每个任务仍必须独立完成测试、检查和证据记录。

**Goal:** 建立可解释、可冻结、支持多标签的通知卡片分类投影，为后续卡片视觉、分类声音、模式和公共 API 提供共同策略输入。

**Architecture:** 保留通知记录事实层 `type`、`source`、`channel`、`producer`、`importance` 和 `metadata`，新增独立的产品分类投影层。对外提供扁平标签 `chat`、`channel`、`tool`、`error`、`plugin`，内部同时保留 `communication`、`event`、`producer` 三个维度及命中证据。分类不携带声音或视觉配置；后续策略层消费同一份冻结分类结果，按字段分别解决多标签冲突。

**Tech Stack:** Node.js ESM、原生 JavaScript、Node test runner、Notification Center route、现有 NotificationRecord/Notification API/Store、Windows-first Hana Native Runtime。

## Global Constraints

- 当前基线为 `0.1.0-alpha.11`，保护 alpha.8 Native Runtime 交互稳定基线。
- 首批用户分类固定为 `chat`、`channel`、`tool`、`error`、`plugin`。
- 分类是多标签投影，不要求互斥；筛选采用集合命中语义。
- 五个对外标签内部拆分为 `communication`、`event`、`producer` 三个维度。
- 分类结果不覆盖或改写 `type`、`source`、`channel`、`producer` 等原始事实。
- 输入通知和 Store 数据不得被分类过程修改；结果必须稳定、深冻结、标签顺序确定。
- 无法确定时允许返回空标签和 `unknown` 状态，不为了填充分类而猜测。
- 第一版只使用结构化字段和明确规则，不使用 AI 分类、正文关键词猜测或任意规则 DSL。
- `plugin` 表示外部 API 生产者身份，不代表高重要性，不自动压过 `error`。
- 阶段二先实现分类投影、证据、Notification Center 标签与分类筛选；不提前实现声音播放、复杂视觉配置、模式编辑器或公共 API。
- 一条通知未来最多选择一个主声音、一个基础卡片结构；辅助徽标和来源装饰可有限叠加。
- 不修改历史通知 Store 数据，不执行 Git commit。
- 源码修改使用结构化 `read` / `edit` / `write`；Shell 仅用于测试、检查和打包。
- 阶段收口必须运行 focused 测试、全量 Node、`npm run check`、`git diff --check`，并按需要进行真实 Hana 验收。

---

## 文件职责地图

- `plugin/domain/notification-classification.js`：保留原始字段分类和 producer 规范化；新增独立的产品分类投影公共接口，不把声音/视觉策略塞入此文件。
- `tests/node/notification-classification.test.mjs`：验证分类投影公共行为、五类规则、多标签、证据、冻结和输入不变。
- `plugin/domain/notification-category-filter.js`：若 Notification Center 需要独立服务端筛选，负责按分类投影执行集合命中；不修改原始记录。
- `tests/node/notification-category-filter.test.mjs`：验证分类筛选 AND/OR 语义、未知分类、输入不变。
- `plugin/routes/notification-center.js`：在现有列表响应和卡片模板中展示分类标签；保持完整历史、详情和显示上限行为。
- `tests/node/notification-center-route.test.mjs`：增加分类标签渲染、分类筛选参数和历史不变回归。
- `plugin/domain/notification-presentation-plan.js`：阶段二后续切片使用，统一承载分类解释、视觉占位和声音输入；本计划先冻结接口边界，不在第一刀实现渲染。
- `tests/node/notification-presentation-plan.test.mjs`：阶段二后续用于 PresentationPlan 冲突解释与回退。
- `CURRENT-STATUS.md`：记录阶段二切片证据和真实验收状态。
- `notification-hub-vnext-plan.md`：补充阶段二已冻结决策，作为上下文压缩后的长期基准。

---

## Task 1：冻结分类投影接口与基础常量

**Files:**
- Modify: `plugin/domain/notification-classification.js`
- Test: `tests/node/notification-classification.test.mjs`

**Interface:**

```js
export const NOTIFICATION_CATEGORY_LABELS = Object.freeze(['chat', 'channel', 'tool', 'error', 'plugin']);
export const NOTIFICATION_CATEGORY_VERSION = 'v1';
export function projectNotificationCategories(record): Readonly<{
  version: 'v1',
  labels: readonly string[],
  facets: Readonly<{ communication: string|null, event: readonly string[], producer: Readonly<object>|null }>,
  status: 'classified'|'unknown',
  evidence: readonly Readonly<{ category: string, rule: string, field: string, value: unknown }>[],
  origin: 'system'
}>;
```

- [x] **Step 1: Write the first failing test**

Add one behavior test using `createNotificationRecord()`:

```js
test('product classification projects a chat notification with stable evidence', () => {
  const record = createNotificationRecord({
    notificationId: 'classification-chat',
    traceId: 'trace-classification-chat',
    type: 'assistant_message',
    source: 'hana.session',
    channel: { kind: 'chat', id: 'desktop' },
    title: '回复',
    content: '正文'
  });

  const result = projectNotificationCategories(record);
  assert.deepEqual(result.labels, ['chat']);
  assert.equal(result.version, 'v1');
  assert.equal(result.status, 'classified');
  assert.equal(result.facets.communication, 'chat');
  assert.deepEqual(result.facets.event, []);
  assert.match(result.evidence[0].rule, /channel\.kind=chat/);
  assert.ok(Object.isFrozen(result));
});
```

- [x] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
node --test tests/node/notification-classification.test.mjs
```

Expected: FAIL because `projectNotificationCategories` is not exported.

- [x] **Step 3: Implement the minimal projection**

Add the public constant and a projection that recognizes only `channel.kind === 'chat'`, returns deterministic evidence, clones input-derived objects, and deep-freezes the result. Do not change `getNotificationClassification()` or producer normalization.

- [x] **Step 4: Run focused test and confirm GREEN**

Run the same command. Expected: PASS, including all existing classification tests.

- [x] **Step 5: Check input immutability**

Extend the same behavior test to mutate the caller-owned channel after projection and assert both the record and result remain unchanged.

---

## Task 2：实现五类确定性规则与多标签投影

**Files:**
- Modify: `plugin/domain/notification-classification.js`
- Test: `tests/node/notification-classification.test.mjs`

**Rules:**

- `chat`: `channel.kind === 'chat'` or explicitly recognized assistant message type when no external channel is present.
- `channel`: `channel.kind` is a non-chat external channel such as `telegram`, `feishu`, `qq`, `wechat`; arbitrary non-empty channel kinds are treated as channel identity, not guessed as chat.
- `tool`: `type` or known classification semantics indicate tool execution/result/error, including `tool_use`, `tool_result`, `tool_error`, `tool_execution`, `tool_completed`.
- `error`: `type` is an explicit error/failed/timeout/rate-limit/provider-error family, status is `failed`, or importance is `critical` only when paired with an explicit error field; critical alone must not become error.
- `plugin`: `producer.kind === 'api'` with a valid id.
- Labels follow fixed order: `chat`, `channel`, `tool`, `error`, `plugin`.
- Evidence is emitted for every label; no body keyword matching.
- If no rule matches, return `labels: []`, `status: 'unknown'`, `evidence: []`.

- [x] **Step 1: Add one failing test for each next behavior, one at a time**

Use `createNotificationRecord()` and add vertical tests for:

```js
test('classification projects channel, tool, error, and plugin together', () => {
  const record = createNotificationRecord({
    notificationId: 'classification-combo',
    traceId: 'trace-classification-combo',
    type: 'tool_error',
    source: 'plugin.event',
    channel: { kind: 'feishu', id: 'group-1' },
    producer: { kind: 'api', id: 'download-plugin' },
    importance: 'high',
    title: '下载失败',
    content: '工具执行失败'
  });
  const result = projectNotificationCategories(record);
  assert.deepEqual(result.labels, ['channel', 'tool', 'error', 'plugin']);
  assert.equal(result.facets.communication, 'channel');
  assert.deepEqual(result.facets.event, ['tool', 'error']);
  assert.deepEqual(result.facets.producer, { kind: 'api', id: 'download-plugin' });
  assert.equal(result.evidence.length, 4);
});
```

Also add separate behavior tests for assistant chat fallback, arbitrary external channel, explicit error status, no keyword guessing, and unknown record.

- [x] **Step 2: Run each new focused test in RED before implementation**

Run:

```powershell
node --test tests/node/notification-classification.test.mjs
```

Expected: the newly added projection cases fail while the pre-existing producer tests remain green.

- [x] **Step 3: Implement only the rules required by the failing test**

Use private pure helpers for `readType`, `readChannelKind`, `readProducer`, `classifyCommunication`, `classifyEvent`, and `classifyProducer`. Do not mutate `record`, do not inspect `content`, and do not derive error from `importance` alone.

- [x] **Step 4: Run focused tests GREEN**

Run the same command. Expected: all classification tests pass.

- [x] **Step 5: Verify deterministic frozen output**

Assert two calls with the same record deep-equal, labels use the fixed order regardless of input object key order, and nested `facets`, `evidence`, and producer snapshots are frozen.

---

## Task 3：定义分类筛选公共语义

**Files:**
- Create: `plugin/domain/notification-category-filter.js`
- Create: `tests/node/notification-category-filter.test.mjs`

**Interface:**

```js
export function filterNotificationsByCategories(records, categories, options = {}): readonly NotificationRecord[];
```

- `categories` must be a non-empty array of known category labels.
- Default `match` is `'any'`: a record matches when at least one requested category is present.
- `match: 'all'`: a record must contain every requested category.
- Empty requested categories are a no-op only when `options.allowEmpty === true`; otherwise return a structured validation error.
- Returned records preserve original order and object identity; classification never writes to Store.

- [x] **Step 1: Write the failing `any` filter test**

```js
test('category filter selects records matching any requested label', () => {
  const records = [chatRecord, errorRecord, comboRecord];
  assert.deepEqual(
    filterNotificationsByCategories(records, ['error']).map((record) => record.notificationId),
    ['error-record', 'combo-record']
  );
});
```

- [x] **Step 2: Run RED**

```powershell
node --test tests/node/notification-category-filter.test.mjs
```

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement the smallest pure filter**

Call `projectNotificationCategories()` for each record, build a Set from `labels`, and return `records.filter(...)`; validate requested labels before traversing records.

- [x] **Step 4: Add `all`, unknown-category, empty-input, invalid-record, and immutability tests one at a time**

Each new test must be run RED then implemented minimally. Unknown labels must produce `NOTIFICATION_CATEGORY_FILTER_INVALID` with `details.field === 'categories'`.

- [x] **Step 5: Run focused filter tests GREEN**

```powershell
node --test tests/node/notification-category-filter.test.mjs tests/node/notification-classification.test.mjs
```

---

## Task 4：接入 Notification Center 分类展示与筛选

**Files:**
- Modify: `plugin/routes/notification-center.js`
- Modify: `tests/node/notification-center-route.test.mjs`
- Modify only if route API requires it: `plugin/api/notification-api.js`

**Interface:**

- Existing list response remains backward-compatible.
- Each list item may add:

```js
classification: {
  version: 'v1',
  labels: readonly string[],
  status: 'classified'|'unknown'
}
```

- Existing `type`, `source`, `channel`, `producer`, detail, display-limit and read-status behavior remain unchanged.
- New query parameter `category` accepts one or repeated comma-separated labels; it uses `any` semantics by default and never mutates Store records.

- [x] **Step 1: Write a route test for labels in a rendered card**

Mock a combo notification and assert the page output contains stable label text and machine-readable `data-category` attributes, while the original response record remains unchanged.

- [x] **Step 2: Run route focused tests RED**

```powershell
node --test tests/node/notification-center-route.test.mjs
```

- [x] **Step 3: Implement label view-model mapping**

Keep category labels in a route-local display mapping (`chat → 聊天`, `channel → 频道`, `tool → 工具`, `error → 错误`, `plugin → 插件`) and escape all rendered values. Do not expose raw arbitrary category strings as HTML.

- [x] **Step 4: Add category query parsing and filtering**

Validate category labels at the route boundary, return structured 400 errors for unknown labels, and preserve current filters’ AND semantics. Do not pass a reduced limit to Store before classification filtering unless existing API contracts explicitly require it.

- [x] **Step 5: Run all page focused tests GREEN**

```powershell
node --test tests/node/notification-center-route.test.mjs tests/node/notification-classification.test.mjs tests/node/notification-category-filter.test.mjs
```

- [x] **Step 6: Verify no behavior regression**

Assert details do not auto-mark read, full history remains available, display limit still affects rendering only, and category filtering does not mutate stored records.

---

## Task 5：冻结 PresentationPlan 接缝（不接入声音与视觉执行）

**Files:**
- Create: `plugin/domain/notification-presentation-plan.js`
- Create: `tests/node/notification-presentation-plan.test.mjs`
- Modify: `notification-hub-vnext-plan.md`

**Interface:**

```js
export function createNotificationPresentationInput(record, classification): Readonly<{
  notificationId: string,
  classification: Readonly<object>,
  visualInput: Readonly<{ labels: readonly string[], status: string }>,
  soundInput: Readonly<{ labels: readonly string[], importance: string }>,
  explanation: Readonly<{ matchedCategories: readonly string[], evidence: readonly object[] }>
}>;
```

- [x] **Step 1: Add a failing contract test**

Verify the input contains the same frozen classification object, exposes labels to both future consumers, includes importance for sound policy, and does not contain arbitrary CSS, local audio paths, or Runtime coordinates.

- [x] **Step 2: Implement the frozen boundary object**

Validate notification ID and classification version, clone only safe data, deep-freeze result, and preserve original record.

- [x] **Step 3: Add invalid-input, stale-version, and immutability tests**

Use stable error codes and assert no record mutation.

- [x] **Step 4: Run focused plan tests and existing classification tests**

```powershell
node --test tests/node/notification-presentation-plan.test.mjs tests/node/notification-classification.test.mjs
```

---

## Task 6：阶段二真实验收与收口

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `notification-hub-vnext-plan.md`
- Modify: `SIDEBAR-PAGE-PRODUCT-PLAN.md` only if category display affects sidebar responsibilities

- [x] Run classification focused tests.
- [x] Run Notification Center focused tests.
- [x] Run full Node tests.
- [x] Run `npm run check`.
- [x] Run `git diff --check`.
- [ ] Use a real Hana installation to verify category labels, category filtering, long content, details, display limits, deep links, and settings navigation remain stable.
- [x] Record automated preflight evidence and known limits in `CURRENT-STATUS.md`.
- [ ] Do not claim card visual or sound completion; those are later phases.
- [ ] Only after category projection and presentation boundary pass, create the separate phase-three sound plan.

Suggested commands:

```powershell
node --test tests/node/notification-classification.test.mjs tests/node/notification-category-filter.test.mjs tests/node/notification-center-route.test.mjs tests/node/notification-presentation-plan.test.mjs
npm test
npm run check
git diff --check
```

---

## Decisions preserved for future context compression

1. The five user-facing categories are `chat`, `channel`, `tool`, `error`, `plugin`; internally they map to communication, event, and producer dimensions.
2. Categories are a multi-label semantic projection. They do not overwrite notification facts.
3. Filtering uses set membership; strategy resolution later resolves each field independently.
4. A notification gets one base card structure and at most one main sound; source badges and bounded decorations may layer.
5. `error` outranks ordinary presentation semantics for attention, while `plugin` remains source identity and never gains priority merely by being a plugin.
6. Classification is deterministic, structured-field-first, explainable with evidence, and allows `unknown`.
7. User overrides later belong to a separate strategy/override layer, not the immutable notification record.
8. Phase two first ships classification projection, labels, filter semantics, and the PresentationPlan seam; phase three handles category sound, phase four handles category visual, phase five handles modes, and phase six handles public API.
