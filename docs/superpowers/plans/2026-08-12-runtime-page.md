# Runtime 页面第一版实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. 本项目不执行 Git commit；每个任务仍必须独立完成测试、检查和证据记录。

**Goal:** 建立一个可在真实 Hana 页面中查看 Native Runtime 当前状态、桌面场景摘要、持久化状态和可恢复操作的 Runtime 页面。

**Architecture:** 保留现有 `RuntimeHostAdapter` 作为生命周期事实来源，插件层提供用户可读的 Runtime 页面状态投影和显式重试启动操作。新增独立 `/runtime` route，复用现有顶部图像化导航与 Hana iframe 内请求模式；页面不展示原始 stdout/stderr 或技术日志，诊断细节继续留给后续诊断中心。

**Tech Stack:** Node.js ESM、原生 JavaScript、Hono route、内嵌 HTML/CSS/JavaScript、Node test runner、Windows-first Hana Native Runtime。

## Global Constraints

- 当前基线为 `0.1.0-alpha.11`，保护 alpha.8 Native Runtime 交互稳定基线。
- Runtime 页面只负责用户可理解的当前状态、桌面场景摘要、恢复与持久化状态和有限操作。
- 原始日志、完整技术 JSON 和诊断时间线不进入 Runtime 页面。
- 页面必须自适应，禁止使用 `overflow-x: hidden` 掩盖布局溢出。
- 页面内 API 请求优先使用 `hana.api.fetch()`，不得创建新的跨 Page surface 导航依赖。
- Runtime 重试必须复用现有 `adapterFactory`、`SettingsRuntimeSync` 和场景队列，不绕过生命周期边界创建第二个 Runtime。
- 失败操作返回结构化错误；重试失败不得让页面 route 抛出未处理异常。
- 源码修改使用结构化 `read` / `edit` / `write`；Shell 仅用于测试、检查和打包。
- 不修改历史 Store 数据，不执行 Git commit。

---

## 文件职责地图

- `plugin/routes/runtime.js`：渲染 `/runtime` 页面，注册 Runtime 状态读取和重试 route。
- `plugin/routes/page-navigation.js`：将 Runtime 导航卡片从 coming-soon 改为正式可进入页面。
- `plugin/index.js`：暴露用户可读 Runtime 状态投影和受保护的重试启动操作。
- `plugin/manifest.json`：保持一个正式 Notification Center Page surface；Runtime 通过当前 iframe 内部页面视图进入，不新增顶层 surface。
- `tests/node/runtime-route.test.mjs`：验证页面 HTML、状态 route、重试 route、结构化错误和 Hana iframe 请求模式。
- `tests/node/plugin-lifecycle.test.mjs`：验证 Runtime 重试复用同一生命周期组件并恢复场景队列/设置同步。
- `CURRENT-STATUS.md`：记录 Runtime 页面第一版完成的自动化证据与真实 Hana 待验收项。

---

### Task 1：冻结 Runtime 页面 API 与导航契约

**Files:**
- Modify: `plugin/routes/page-navigation.js`
- Create: `plugin/routes/runtime.js`
- Create: `tests/node/runtime-route.test.mjs`

**Interfaces:**

```js
GET /runtime
GET /runtime-status
POST /runtime-retry

plugin.runtimeTestApi.getRuntimePageStatus(): Promise<Readonly<object>>
plugin.runtimeTestApi.retryRuntime(): Promise<Readonly<object>>
```

状态响应至少包含：

```js
{
  ok: true,
  status: {
    pluginName,
    pluginVersion,
    enabled,
    state,
    message,
    connected,
    clientState,
    pipeName,
    runtimeVersion: pluginVersion,
    health: {
      cardCount,
      layout,
      workArea,
      sceneStateSnapshot
    } | null,
    sceneStatePersistence: {
      enabled,
      pending
    },
    lastError: { code, message, stage, recoverable, userAction } | null
  }
}
```

- [x] **Step 1: Write the failing route and navigation tests**

测试必须覆盖：

```js
test('runtime navigation is an active page link', () => {
  const html = renderPageNavigation({ active: 'runtime', currentUrl: 'http://host/plugin/notification-hub-vnext/notification-center' });
  assert.match(html, /id="page-nav-runtime"/);
  assert.doesNotMatch(html, /page-navigation-card coming-soon[^>]*aria-disabled/);
  assert.doesNotMatch(html, /Runtime（即将开放）/);
});

test('runtime route renders status and retry controls', () => {
  const html = renderRuntimePage('http://host/plugin/notification-hub-vnext/runtime');
  assert.match(html, /桌面 Runtime/);
  assert.match(html, /runtime-status/);
  assert.match(html, /runtime-retry/);
  assert.match(html, /重试启动/);
  assert.match(html, /hana\.api/);
  assert.doesNotMatch(html, /stdout/);
  assert.doesNotMatch(html, /stderr/);
});
```

- [x] **Step 2: Run focused tests and confirm RED**

运行：

```powershell
node --test tests/node/runtime-route.test.mjs tests/node/page-navigation.test.mjs
```

预期：因 `plugin/routes/runtime.js` 尚不存在且 Runtime 导航仍被标记为 coming-soon 而失败。

- [x] **Step 3: 写最小 route 与导航实现**

`runtime.js` 必须导出 `renderRuntimePage(currentUrl = '')` 和默认 route 注册函数；页面使用 `PAGE_NAVIGATION_STYLE`、`renderPageNavigation` 与 `PAGE_NAVIGATION_SCRIPT`，请求只通过 `window.hana.api.fetch()` 或带当前认证参数的相对 fallback URL。

- [x] **Step 4: 运行 focused tests 并确认 GREEN**

运行相同命令，确认 Runtime 页面和导航契约通过。

- [x] **Step 5: 增加 route 错误契约测试**

验证插件 API 不可用时返回 HTTP 503 和稳定错误码 `RUNTIME_PAGE_API_UNAVAILABLE`；重试异常返回 HTTP 503，且错误对象包含 `code`、`message`、`details`。

---

### Task 2：实现插件 Runtime 状态投影与重试启动

**Files:**
- Modify: `plugin/index.js`
- Modify: `tests/node/plugin-lifecycle.test.mjs`

**Interfaces:**

```js
async getRuntimePageStatus()
async retryRuntime()
```

- [x] **Step 1: Write failing lifecycle tests**

增加以下行为：

```js
test('runtime page status exposes user-readable health and persistence summary', async () => {
  const plugin = new NotificationHubVNextPlugin(context(), { adapterFactory: () => new FakeAdapter() });
  await plugin.onload();
  const status = await plugin.getRuntimePageStatus();
  assert.equal(status.state, 'running');
  assert.equal(status.connected, true);
  assert.equal(status.health.cardCount, 2);
  assert.equal(status.sceneStatePersistence.enabled, true);
  assert.equal(typeof status.pipeName, 'string');
  await plugin.onunload();
});

test('retryRuntime starts a failed host through the existing adapter and syncs queued scene state', async () => {
  let created = 0;
  const plugin = new NotificationHubVNextPlugin(context(), {
    adapterFactory: () => { created += 1; return new FakeAdapter(); }
  });
  await plugin.onload();
  await plugin.stopRuntimeAfterFailure();
  const result = await plugin.retryRuntime();
  assert.equal(created, 2);
  assert.equal(result.state, 'running');
  assert.equal(result.connected, true);
  await plugin.onunload();
});
```

- [x] **Step 2: Run focused lifecycle tests and confirm RED**

运行：

```powershell
node --test tests/node/plugin-lifecycle.test.mjs
```

预期：`getRuntimePageStatus` 与 `retryRuntime` 尚未存在而失败。

- [x] **Step 3: 实现状态投影**

`getRuntimePageStatus()` 调用现有 `getRuntimeTestStatus()`，将 health 中的 `sceneCards` 转换为 `cardCount`，只保留布局、工作区、SceneState snapshot 和持久化 `enabled/pending` 摘要，不把原始日志塞进返回值。错误对象必须复制，不返回可变 Runtime 内部对象。

- [x] **Step 4: 实现 retryRuntime**

重试流程必须：

1. 若 Runtime 已运行，直接返回当前页面状态，不创建第二个 host。
2. 若旧 host 存在但不是运行态，先调用 `stopRuntimeAfterFailure()`。
3. 创建新的 `adapterFactory(this.ctx)`。
4. 绑定 `SettingsRuntimeSync` host 和 Runtime events。
5. `await runtimeHost.start()`。
6. 重新 queue/apply settings，等待 `settingsRuntimeSync.idle()`。
7. 排空 `notificationSceneQueue`。
8. 失败时记录 `runtimeError`、尝试清理并返回结构化失败状态。

- [x] **Step 5: 运行 focused lifecycle tests 并确认 GREEN**

运行相同命令，确认现有生命周期测试与新增测试全部通过。

- [x] **Step 6: 增加重复重试与失败回归**

验证运行态重复重试不会创建第二个 adapter；adapter start 失败后返回 `state: 'failed'` 和可重试错误，不吞掉错误信息。

---

### Task 3：接入 route、导出与页面交互

**Files:**
- Modify: `plugin/index.js`
- Modify: `plugin/manifest.json` only if route list requires explicit inclusion
- Modify: `tests/node/runtime-route.test.mjs`

- [x] **Step 1: 注册 Runtime route**

在插件 route 加载入口中注册 `./routes/runtime.js`，保持正式 Page surface 仍为 `/notification-center`；Runtime 不新增顶层 Page surface，避免 Hana ticket 跨 surface 失效。

- [x] **Step 2: 添加页面状态渲染**

页面显示：

- 状态：未启用、已停止、启动中、正常运行、重连中、异常退出、失败。
- Pipe：已连接 / 未连接。
- 版本：`pluginVersion`。
- 当前卡片数量。
- 当前布局：Shelf、方向、锚点和间距。
- 工作区：宽度、高度和 DPI。
- SceneState：已启用 / 未启用，是否待保存。
- 最近错误：错误码、用户可读消息、是否可重试。

“重试启动”按钮只调用 `POST runtime-retry`，成功和失败都显示 `role=status` 反馈；按钮在请求期间禁用。

- [x] **Step 3: 验证 iframe 内请求约束**

页面测试必须确认：

```js
assert.match(html, /window\.hana\.api\.fetch/);
assert.doesNotMatch(html, /fetch\("\/(?:runtime-status|runtime-retry)/);
assert.match(html, /pluginSurfaceSession/);
```

- [x] **Step 4: 运行 route focused tests**

运行：

```powershell
node --test tests/node/runtime-route.test.mjs tests/node/page-navigation.test.mjs tests/node/plugin-lifecycle.test.mjs
```

---

### Task 4：完整验证与状态记录

**Files:**
- Modify: `CURRENT-STATUS.md`

- [x] **Step 1: 运行 focused 测试**

```powershell
node --test tests/node/runtime-route.test.mjs tests/node/page-navigation.test.mjs tests/node/plugin-lifecycle.test.mjs
```

- [x] **Step 2: 运行全量测试和检查**

```powershell
npm test
npm run check
git diff --check
```

- [x] **Step 3: 更新状态文档**

记录 Runtime 页面第一版的自动化证据，并明确：真实 Hana 中仍需验证 `/runtime` 页面加载、状态展示和失败重试；诊断中心仍未实现。

- [x] **Step 4: 不执行 Git commit**

保留工作区变更，等待真实 Hana 页面验收。
