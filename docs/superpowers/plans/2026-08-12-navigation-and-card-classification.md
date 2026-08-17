# 页面骨架与卡片分类 Implementation Plan

> **For agentic workers:** This plan is executed inline in the current session. Each task ends with an independently testable verification gate.

**Goal:** 建立 Notification Hub 的统一页面导航骨架，并冻结一版可支撑未来声音、视觉和公共 API 的卡片分类契约。

**Architecture:** 页面导航采用共享的自包含 HTML 片段，在 Notification Center、设置页和后续 Runtime/诊断页面保持同一层级与查询参数传递规则。卡片分类保持领域字段分离：`type` 表示业务类型，`source` 表示进入路径，`channel` 表示通信渠道，新增受约束的 `producer` 表示未来 API/插件生产者身份；不把这些字段混成一个自由文本标签。第一阶段只实现分类校验、筛选入口和展示摘要，不提前实现声音或视觉策略。

**Tech Stack:** Node.js ESM、Hono-style route handlers、内嵌 HTML/CSS/JS、Node built-in test runner。

## Global Constraints

- 保持 alpha.8 Runtime 行为和通知深链接/详情切换行为不变。
- 不删除或改写历史通知 Store 数据。
- 页面只做展示投影和筛选，不用关键词误删公开正文。
- 侧边栏继续保持轻量，不迁入复杂分类配置。
- 真实 Hana 窄宽度不得通过 `overflow-x: hidden` 掩盖溢出。
- 不执行 Git commit。

---

### Task 1: 冻结卡片分类领域契约

**Files:**
- Create: `plugin/domain/notification-classification.js`
- Modify: `plugin/domain/notification-record.js`
- Test: `tests/node/notification-classification.test.mjs`
- Test: `tests/node/notification-record.test.mjs`

**Interfaces:**
- `NOTIFICATION_CLASSIFICATION_TYPES`
- `NOTIFICATION_PRODUCER_KINDS`
- `normalizeNotificationProducer(value)`
- `getNotificationClassification(record)`
- `isApiProducedNotification(record)`

**Classification contract:**
- `type`: existing business type, unchanged.
- `source`: existing ingestion path, unchanged.
- `channel`: existing communication channel, unchanged.
- `producer`: optional plain object `{ kind, id, label }`.
- `producer.kind` initially supports `hana` and `api`; `api` requires a non-empty `id`.
- Missing producer remains `null` for all current Hana core notifications.
- Unknown producer kinds are rejected at the record boundary instead of silently entering history.

**Verification:**
- Classification normalization trims strings, clones input, and rejects malformed producer values.
- Existing records without `producer` remain valid and unchanged in serialized shape except for the normalized optional field.
- API-produced records can be identified without treating ordinary text containing “api” as an API notification.

---

### Task 2: 建立共享页面导航骨架

**Files:**
- Create: `plugin/routes/page-navigation.js`
- Modify: `plugin/routes/notification-center.js`
- Modify: `plugin/routes/settings.js`
- Test: `tests/node/page-navigation.test.mjs`
- Test: `tests/node/notification-center-route.test.mjs`
- Test: `tests/node/settings-route.test.mjs`

**Interfaces:**
- `renderPageNavigation({ active, currentUrl, includeDiagnostics })`
- `navigationSurfaceLink(path, currentUrl)`

**Behavior:**
- Four navigation cards: 通知中心、设置、Runtime、诊断。
- Notification Center and settings cards point to currently registered routes.
- Runtime and diagnostics cards use stable future route paths but render as “即将开放” disabled-style cards until routes exist; they must not create fake working links.
- All links preserve `token` and `pluginSurfaceSession` query parameters.
- Inline SVG icons are used instead of emoji.
- Responsive grid: wide four columns, medium two columns, narrow one column; no horizontal overflow suppression.

**Verification:**
- Shared navigation preserves auth/session query parameters.
- Notification Center and settings pages contain the same navigation card IDs and active state.
- Existing page-specific controls and deep-link query parameters remain functional.

---

### Task 3: 增加分类筛选的第一版页面入口

**Files:**
- Modify: `plugin/routes/notification-center.js`
- Modify: `plugin/api/notification-api.js` only if classification filtering cannot be projected from existing query fields
- Test: `tests/node/notification-center-route.test.mjs`

**Behavior:**
- Preserve current type/source/channel filters.
- Add a compact “分类” section below the navigation, with explicit groups: 聊天、工具、系统、错误、API 卡片。
- API 卡片 filter matches `producer.kind === 'api'`; no keyword matching.
- Do not add empty plugin-specific buttons before external API data exists.
- Current list/detail/deep-link behavior remains unchanged.

**Verification:**
- API classification filter is structural and does not match ordinary content.
- Existing filters retain AND semantics.
- Detail switching and scroll-to-card assertions remain present.

---

### Task 4: 文档与验证

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `notification-hub-vnext-plan.md` only where the classification contract needs a durable architectural decision
- Test: full Node suite

**Verification commands:**
- `node --test tests/node/page-navigation.test.mjs tests/node/notification-classification.test.mjs tests/node/notification-center-route.test.mjs tests/node/settings-route.test.mjs`
- `npm test`
- `npm run check`
- `git diff --check`

**Acceptance:**
- No Git commit.
- Package only after automated verification passes.
- Real Hana acceptance follows packaging: navigation cards, responsive layout, current-page active state, and API filter with real data or an explicit empty result.
