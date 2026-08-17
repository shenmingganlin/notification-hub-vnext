# 诊断中心首版实施计划

> **For agentic workers:** 本计划用于当前工作区的内联执行。每个任务都必须独立测试；本项目约束禁止执行 Git commit。

**Goal:** 建立一个只读的诊断中心页面，让用户能看到 Runtime、Named Pipe、恢复状态和结构化诊断记录，并能沿着证据判断当前故障与已恢复事件。

**Architecture:** 复用现有 `RuntimeHostAdapter`、`getRuntimeTestStatus()` 和结构化诊断数组，不创建第二套 Runtime 控制链路。插件层新增有限长度的 Runtime 诊断缓冲和一个面向页面的状态投影；页面仅消费 `/diagnostics-status`，不读取原始 stdout/stderr，也不直接展示内部对象引用。诊断页继续复用当前 iframe 内部视图切换，避免新的 Hana Page surface 鉴权问题。

**Tech Stack:** Node.js ESM、现有路由注册机制、Hana iframe HTML/CSS/JavaScript、Node `node:test`。

## Global Constraints

- 使用结构化 `read` / `edit` / `write` 修改源码；Shell 只用于检查、测试和打包。
- 诊断中心首版只读；不加入清空、删除、强制重启或日志导出动作。
- 不展示原始 stdout/stderr、完整技术日志或内部 `sceneCards` 列表。
- 保留结构化错误码、stage、severity、recoverable、traceId（若来源提供）和时间戳。
- 诊断记录只保留有限数量，避免页面和内存无限增长；首版 Runtime 记录上限为 100，已有设置/通知诊断缓冲上限保持不变。
- 页面内部导航必须留在当前 iframe，继续通过 `hana.api.fetch()` 和 `notification-hub-view-before-unload` 工作。
- 不修改通知 Store 历史事实，不执行 Git commit。

---

### Task 1: 固化 Runtime 诊断投影

**Files:**
- Modify: `plugin/index.js`
- Test: `tests/node/plugin-lifecycle.test.mjs` 或新增 `tests/node/diagnostics-api.test.mjs`

**Interfaces:**
- Produces `getDiagnosticsPageStatus()`，返回只读可序列化对象：
  - `pluginName`、`pluginVersion`、`generatedAt`
  - `runtime`：来自 `getRuntimeTestStatus()` 的状态、连接、pipeName、health 摘要、SceneState 持久化摘要和当前错误
  - `diagnostics`：按时间倒序的有限结构化记录数组
  - `summary`：`total`、`errors`、`warnings`、`recoverable`、`currentFailure`

- [ ] **Step 1: Write the failing test**

```js
test('diagnostics page status exposes runtime evidence without raw process streams or scene card list', async () => {
  const plugin = createPluginWithFakeRuntime();
  plugin.runtimeDiagnostics.push({
    code: 'TRANSPORT_RECONNECT_RETRY',
    message: 'Retrying health after transport failure',
    stage: 'transport',
    severity: 'warning',
    recoverable: true,
    traceId: 'trace-1',
    timestamp: '2026-08-12T10:00:00.000Z'
  });
  const result = await plugin.getDiagnosticsPageStatus();
  assert.equal(result.runtime.connected, true);
  assert.equal(result.diagnostics[0].traceId, 'trace-1');
  assert.equal(result.summary.warnings, 1);
  assert.equal('stdout' in result, false);
  assert.equal('stderr' in result, false);
  assert.equal('sceneCards' in result.runtime.health, false);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/node/diagnostics-api.test.mjs`

Expected: FAIL because `runtimeDiagnostics` and `getDiagnosticsPageStatus()` do not yet exist.

- [ ] **Step 3: Implement the smallest projection**

在构造函数中增加 `this.runtimeDiagnostics = []`，在 `runtimeTestApi` 暴露 `getDiagnosticsPageStatus`。增加：

```js
recordRuntimeDiagnostic(diagnostic, source = 'runtime')
```

只复制 `code`、`message`、`stage`、`severity`、`recoverable`、`traceId`、`details`、`timestamp` 和 `source`；不复制 stdout/stderr。默认 `severity` 按 `error` / `warning` / 其他信息归类，缓冲超过 100 条时移除最旧记录。

`getDiagnosticsPageStatus()` 调用现有 `getRuntimeTestStatus()`，只投影 `health.layout`、`health.workArea`、`health.cardCount`、`health.sceneStateSnapshot` 和 `sceneStatePersistence`，明确排除 `health.sceneCards`。把 Runtime 当前错误、设置诊断和通知诊断合并后按 `timestamp` 倒序，计算 summary。

- [ ] **Step 4: Run focused and related tests**

Run: `node --test tests/node/diagnostics-api.test.mjs tests/node/plugin-lifecycle.test.mjs`

Expected: PASS，既有 Runtime 生命周期断言保持不变。

- [ ] **Step 5: Verify event capture**

在 `forwardRuntimeEvents()` 中仅对 `diagnostic` 事件调用 `recordRuntimeDiagnostic(payload, 'runtime')`；`stdout`、`stderr` 继续只交给日志，不进入页面状态。补断言确认 transport retry 可被诊断页读取，且正常 connected 状态仍可保留“已恢复”记录。

---

### Task 2: 建立 Diagnostics route 和页面

**Files:**
- Create: `plugin/routes/diagnostics.js`
- Modify: `plugin/manifest.json`
- Test: `tests/node/diagnostics-route.test.mjs`

**Interfaces:**
- `renderDiagnosticsPage(currentUrl = '')`
- `registerDiagnosticsRoute(app, ctx)`
- `GET /diagnostics`：返回 HTML
- `GET /diagnostics-status`：返回 `{ ok: true, status }`，API 不可用时返回稳定 503 错误

- [ ] **Step 1: Write failing route tests**

覆盖以下行为：

```js
assert.match(page.value, /诊断中心/);
assert.match(page.value, /Named Pipe/);
assert.match(page.value, /恢复记录/);
assert.match(page.value, /traceId/);
assert.match(page.value, /diagnostics-status/);
assert.doesNotMatch(page.value, /stdout/);
assert.doesNotMatch(page.value, /stderr/);
assert.doesNotMatch(page.value, /sceneCards/);
```

API 测试使用假的 `getDiagnosticsPageStatus()` 返回值，确认成功响应；没有 API 时确认 503 和 `DIAGNOSTICS_PAGE_API_UNAVAILABLE`。

- [ ] **Step 2: Run the focused route test and verify it fails**

Run: `node --test tests/node/diagnostics-route.test.mjs`

Expected: FAIL because the route module does not exist.

- [ ] **Step 3: Implement the route**

页面采用现有深色视觉变量和 `PAGE_NAVIGATION_STYLE`，顶部导航激活“诊断”。首版分为：

1. “当前状态”指标：Runtime、Named Pipe、当前卡片数量、SceneState。
2. “诊断摘要”：错误、警告、可恢复事件、当前故障。
3. “最近诊断”：每条显示时间、severity、code、message、stage、traceId（有则显示）和可恢复提示。
4. “恢复与证据”：布局、工作区、SceneState 快照摘要；只显示 JSON 的安全摘要，不显示完整 `sceneCards`。

客户端通过 `hana.api.fetch('diagnostics-status')` 优先请求，按现有页面模式刷新；切换视图前清理定时器。页面错误显示结构化 code/message，不打印响应原文。

- [ ] **Step 4: Register and test the route**

把 `./routes/diagnostics.js` 加入 manifest routes。运行 focused route test，预期全部通过。

---

### Task 3: 把诊断入口接入当前 iframe 导航

**Files:**
- Modify: `plugin/routes/page-navigation.js`
- Test: `tests/node/page-navigation.test.mjs`

**Interfaces:**
- 诊断导航卡片从“即将开放”改为可点击的 `#diagnostics`。
- `PAGE_NAVIGATION_SCRIPT.loadView()` 支持 `diagnostics` 并请求当前 iframe 内的 `diagnostics` route。

- [ ] **Step 1: Write failing navigation assertions**

```js
const html = renderPageNavigation({ active: 'diagnostics' });
assert.match(html, /id="page-nav-diagnostics"/);
assert.doesNotMatch(html, /诊断（即将开放）/);
assert.match(PAGE_NAVIGATION_SCRIPT, /view === "diagnostics"/);
```

- [ ] **Step 2: Run focused navigation test and verify it fails**

Run: `node --test tests/node/page-navigation.test.mjs`

Expected: FAIL because diagnostics is currently a disabled span and `loadView()` has no diagnostics branch.

- [ ] **Step 3: Implement navigation changes**

将 diagnostics item 的 path 改为 `#diagnostics` 并移除 `comingSoon`，在 `loadView()` 中将 `diagnostics` 映射到 `diagnostics` route；保留现有 `notification-hub-view-before-unload` 行为和其他三个页面的路径。

- [ ] **Step 4: Run navigation and page tests**

Run: `node --test tests/node/page-navigation.test.mjs tests/node/diagnostics-route.test.mjs tests/node/runtime-route.test.mjs tests/node/settings-route.test.mjs tests/node/notification-center-route.test.mjs`

Expected: PASS，原有三页内部切换契约不变。

---

### Task 4: 文档、全量验证和验收包

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `docs/superpowers/plans/2026-08-12-diagnostics-center.md`
- Output: `dist/notification-hub-vnext-0.1.0-alpha.11.zip`

- [ ] **Step 1: Update current status**

记录诊断中心首版的 API、只读边界、测试结果和仍未实现的开发验收工具/日志导出；不把首版称为完整诊断产品。

- [ ] **Step 2: Run verification**

Run:

```text
npm test
npm run check
git diff --check
```

Expected: 0 failed tests; check and diff check pass.

- [ ] **Step 3: Build package and inspect contents**

Run: `& .\\scripts\\package-release.ps1 -Configuration Release`

确认 ZIP 包含 `routes/diagnostics.js`、更新后的 `manifest.json` 和 `routes/page-navigation.js`，记录 SHA256。

- [ ] **Step 4: Stage deliverables**

使用 `stage_files` 交付 ZIP、诊断 route、相关测试和 `CURRENT-STATUS.md`。不执行 Git commit。

## Self-review

- 覆盖了诊断中心的 Runtime 状态、Named Pipe、错误码、traceId、重连记录、SceneState 摘要和结构化错误记录。
- 首版明确没有实现日志导出、清空记录和开发验收工具；这些能力保留为下一刀，避免把原始日志和不可逆操作过早暴露。
- 页面继续复用当前 iframe 内部路由，不新增 Hana 顶层 Page surface。
- 没有把 `sceneCards` 列表、stdout 或 stderr 放入页面 API。
- 所有任务均有 focused 测试和最终全量验证；按用户约束不执行 Git commit。
