# Widget 通知入口 Implementation Plan

> **For agentic workers:** 本计划按小步 TDD 执行；不执行 Git commit，使用 `stage_files` 交付每个已验证切片。

**Goal:** 将现有仅用于 Runtime 验收的 Widget 扩展为共享 NotificationStore 的轻量通知入口，先交付最近通知、未读数量、摘要、打开详情和打开通知中心。

**Architecture:** 新增纯函数 Widget View Model，从 `NotificationApi.listNotifications()` 读取并派生稳定的轻量快照；Widget 路由只负责 HTML 和 HTTP 适配，不复制通知业务规则。通知详情通过 `notification-center?notificationId=...` 深链接回到现有 Notification Center，由页面加载后调用已有只读详情 API；Widget 不直接修改通知状态，也不维护自己的通知副本。

**Tech Stack:** Node.js ESM、Node built-in test runner、Hono-style route handlers、现有 `NotificationStore` / `NotificationApi`、Hana Page/Widget Surface。

## Global Constraints

- 只修改 vNext 工作区，旧版 `legacy-reference/notification-hub-0.2.1` 保持隔离。
- Widget 只承担轻量即时入口，不加入复杂搜索、筛选、历史管理、Profile、声音或诊断日志浏览。
- Widget 和 Notification Center 必须共享同一个 `NotificationApi` / `NotificationStore` 数据源。
- “打开详情”只调用 `getNotification()`，不得调用 `setNotificationStatus()`，不得自动标记已读。
- 所有通知正文和标题进入 HTML 前必须转义；摘要长度在 View Model 层限制，避免把完整长正文塞进 Widget。
- Widget API 失败时显示可理解的错误状态，不伪造通知、不返回静态示例数据。
- 页面深链接必须保留 Hana 的 `token` 与 `pluginSurfaceSession` 查询参数。
- 不提前进入 Phase 9 的视觉系统；沿用当前 Widget 的布局体系，只添加必要的信息层级和操作入口。
- 不执行 Git commit；每个阶段都运行验证命令，并用 `stage_files` 交付修改文件。

---

### Task 1: 建立 Widget 纯 View Model

**Files:**
- Create: `plugin/domain/notification-widget-view-model.js`
- Create: `tests/node/notification-widget-view-model.test.mjs`

**Interfaces:**
- Produces `createNotificationWidgetViewModel(records, options)`。
- `options.limit` 默认 `5`，只接受正整数；`options.summaryLength` 默认 `160`，只接受正整数。
- 返回冻结无副作用的对象：

```js
{
  recent: [
    {
      notificationId: string,
      title: string,
      summary: string,
      type: string,
      source: string,
      importance: string,
      status: string,
      createdAt: string,
      unread: boolean
    }
  ],
  unreadCount: number,
  totalCount: number,
  summary: string
}
```

- `recent` 按 `createdAt` 从新到旧排列，最多返回 `limit` 条；不修改输入数组和记录对象。
- `summary` 使用最近一条记录的 `summary` 或 `content`，超过 `summaryLength` 时截断并追加 `…`。
- `unread` 判定为 `record.status !== 'read'`，与现有 NotificationStore 的未读语义一致。

- [ ] **Step 1: 写失败测试**

覆盖以下行为：

```js
const records = [
  { notificationId: 'old', title: '旧', content: '旧正文', type: 'tool_error', source: 'hana.tool', importance: 'normal', status: 'formatted', createdAt: '2026-08-11T08:00:00.000Z' },
  { notificationId: 'new', title: '新', content: '新正文', type: 'system_notification', source: 'hana.system', importance: 'high', status: 'read', createdAt: '2026-08-11T09:00:00.000Z' }
];
const view = createNotificationWidgetViewModel(records, { limit: 1, summaryLength: 3 });
assert.deepEqual(view.recent.map((item) => item.notificationId), ['new']);
assert.equal(view.unreadCount, 1);
assert.equal(view.totalCount, 2);
assert.equal(view.recent[0].summary, '新正文');
assert.equal(view.summary, '新正…');
```

还要断言：空数组返回 `recent: []`、`unreadCount: 0`、`totalCount: 0`、`summary: '暂无通知'`；输入记录缺失标题或正文时使用稳定中文回退文本；输入数组保持不变。

- [ ] **Step 2: 运行失败测试**

Run:

```powershell
node --test tests/node/notification-widget-view-model.test.mjs
```

Expected: FAIL，因为模块尚未创建。

- [ ] **Step 3: 写最小实现**

实现独立的时间排序、摘要截断、字段归一化和未读数量统计；不得从 `notification-center.js` 复制 DOM 或请求代码。

- [ ] **Step 4: 运行通过测试**

Run:

```powershell
node --test tests/node/notification-widget-view-model.test.mjs
```

Expected: 全部通过。

- [ ] **Step 5: 交付当前切片**

运行 `git diff --check`，然后使用 `stage_files` 交付新增模块和测试；不执行 Git commit。

---

### Task 2: 暴露只读 Widget 状态 API

**Files:**
- Modify: `plugin/index.js:199-207` 的 `runtimeTestApi` 注册区域及类方法区域
- Modify: `plugin/routes/widget.js` 的路由注册区域
- Modify: `tests/node/widget-route.test.mjs`
- Modify: `tests/node/plugin-lifecycle.test.mjs` 或现有插件 API 测试文件（以实际测试结构为准）

**Interfaces:**
- Produces `NotificationHubVNextPlugin.getNotificationWidgetStatus()`，返回 Task 1 的 View Model，并且只调用 `this.notificationApi.listNotifications()`。
- 将 API 暴露为 `ctx._notificationHubVNextPlugin.getNotificationWidgetStatus`。
- 新增 `GET /notification-widget-status`，成功返回：

```js
{ ok: true, widget: { recent, unreadCount, totalCount, summary } }
```

- API 不接收筛选参数、不改变 Store、不触发 Runtime scene 操作。
- 当插件 API 不可用时返回 HTTP `503` 和稳定错误码 `NOTIFICATION_WIDGET_API_UNAVAILABLE`；读取异常返回 HTTP `500` 和 `NOTIFICATION_WIDGET_STATUS_FAILED`。

- [ ] **Step 1: 写失败测试**

在 Widget route harness 中增加一个拥有 `getNotificationWidgetStatus()` 的 fake plugin，断言：

```js
const response = await harness.routes.get('GET /notification-widget-status')(harness.contextFor());
assert.equal(response.value.ok, true);
assert.deepEqual(response.value.widget, expectedWidget);
```

另加 unavailable 分支，断言 HTTP 状态为 `503` 且错误码为 `NOTIFICATION_WIDGET_API_UNAVAILABLE`；断言路由只调用一次 `getNotificationWidgetStatus`。

- [ ] **Step 2: 运行 focused 测试确认失败**

```powershell
node --test tests/node/widget-route.test.mjs
```

Expected: FAIL，路由数量和新 endpoint 尚未存在。

- [ ] **Step 3: 最小实现**

在 `plugin/index.js` 引入 Task 1 的 View Model，在类方法中通过 `this.notificationApi.listNotifications()` 派生快照；在 `runtimeTestApi` 注册方法；在 `widget.js` 注册只读 GET 路由。不要把 Store 直接暴露给页面。

- [ ] **Step 4: 运行 focused 测试**

```powershell
node --test tests/node/widget-route.test.mjs tests/node/notification-widget-view-model.test.mjs
```

Expected: 全部通过。

- [ ] **Step 5: 检查并交付**

运行 `node --check plugin/index.js`、`node --check plugin/routes/widget.js`、`git diff --check`，使用 `stage_files` 交付修改文件。

---

### Task 3: 将 Widget 从 Runtime 测试面板扩展为通知入口

**Files:**
- Modify: `plugin/routes/widget.js` 的 `renderWidget()` HTML、CSS 和脚本
- Modify: `tests/node/widget-route.test.mjs`

**Interfaces:**
- Widget 页面新增稳定可定位控件：
  - `notification-widget-summary`
  - `notification-widget-unread-count`
  - `notification-widget-recent`
  - `notification-widget-open-center`
- 最近通知每条显示标题、摘要、类型、来源、重要性、状态和时间。
- 每条通知提供 `notification-widget-detail-<encoded-id>` 入口，目标为带 `notificationId` 的 Notification Center 深链接。
- 页面通过 `GET ./notification-widget-status` 加载真实数据，保留当前 URL 中的 `token` 和 `pluginSurfaceSession`。
- 读取失败显示“通知入口暂时不可用”和错误码，不渲染示例通知。
- 现有 Runtime 状态、Shelf 验收和测试卡片控件继续保留，避免本轮破坏已有 Runtime 验收面板。

- [ ] **Step 1: 写失败测试**

对 `renderWidget()` 增加静态契约断言：

```js
assert.match(html, /notification-widget-summary/);
assert.match(html, /notification-widget-unread-count/);
assert.match(html, /notification-widget-recent/);
assert.match(html, /notification-widget-open-center/);
assert.match(html, /notification-widget-status/);
assert.match(html, /notificationId/);
assert.match(html, /pluginSurfaceSession/);
assert.doesNotMatch(html, /测试通知.*notification-widget-recent/);
```

断言脚本包含 `new URL(path, window.location.href)`，并且不使用硬编码 `/api/plugins/...` 绝对路径。

- [ ] **Step 2: 运行 focused 测试确认失败**

```powershell
node --test tests/node/widget-route.test.mjs
```

Expected: FAIL，因为当前页面只有 Runtime 测试卡片，没有通知入口控件。

- [ ] **Step 3: 最小实现**

增加通知入口区块和轻量样式；使用 `renderNotificationWidget(widget)` 只渲染服务端返回的 View Model；按钮/链接生成时使用 `encodeURIComponent(notificationId)`。打开中心链接统一通过：

```js
function surfaceLink(path) {
  const url = new URL(path, window.location.href);
  const current = new URL(window.location.href);
  ['token', 'pluginSurfaceSession'].forEach((name) => {
    const value = current.searchParams.get(name);
    if (value && !url.searchParams.has(name)) url.searchParams.set(name, value);
  });
  return url.toString();
}
```

详情链接使用 `surfaceLink('notification-center?notificationId=' + encodeURIComponent(id))`；只读 Widget 不在本任务添加标记已读或清除操作。

- [ ] **Step 4: 运行测试并做静态安全检查**

```powershell
node --test tests/node/widget-route.test.mjs tests/node/notification-widget-view-model.test.mjs
node --check plugin/routes/widget.js
```

Expected: 全部通过，且 HTML 中没有静态伪造通知内容。

- [ ] **Step 5: 交付当前 Widget 页面切片**

运行 `git diff --check`，使用 `stage_files` 交付修改文件。

---

### Task 4: 支持 Notification Center 的 notificationId 深链接自动打开详情

**Files:**
- Modify: `plugin/routes/notification-center.js` 的页面脚本
- Modify: `tests/node/notification-center-route.test.mjs`

**Interfaces:**
- Notification Center 加载时读取 `new URL(window.location.href).searchParams.get('notificationId')`。
- 初次列表加载成功后，如果存在该 ID，调用已有 `showDetail(notificationId)`；只读详情接口仍为 `GET ./notification-detail/<encoded-id>`。
- 深链接找不到记录时显示已有错误反馈，不修改任何 Store 状态。
- 深链接必须保留当前 Hana token/session 参数，不把它们拼接进 notificationId。

- [ ] **Step 1: 写失败测试**

在页面 HTML 契约测试中增加：

```js
assert.match(page.value, /searchParams\.get\("notificationId"\)/);
assert.match(page.value, /showDetail\(notificationId\)/);
assert.match(page.value, /notification-detail\//);
```

同时断言页面仍包含 `close-detail` 和 `view-detail`，防止深链接实现替换现有详情逻辑。

- [ ] **Step 2: 运行 focused 测试确认失败**

```powershell
node --test tests/node/notification-center-route.test.mjs
```

Expected: FAIL，当前页面没有 notificationId 深链接读取逻辑。

- [ ] **Step 3: 最小实现**

在页面初始化脚本中保存 `requestedNotificationId`，在第一次 `refresh()` 的成功分支中先 `render(data.notifications)`，再调用 `showDetail(requestedNotificationId)`；用一次性变量避免每两秒刷新重复打开详情。详情 API 继续只调用 `getNotification()`。

- [ ] **Step 4: 运行 focused 测试**

```powershell
node --test tests/node/notification-center-route.test.mjs tests/node/widget-route.test.mjs
```

Expected: 全部通过。

- [ ] **Step 5: 交付深链接切片**

运行 `node --check plugin/routes/notification-center.js` 和 `git diff --check`，使用 `stage_files` 交付。

---

### Task 5: 全量验证与真实 Hana Widget 验收

**Files:**
- Modify: `CURRENT-STATUS.md`

**Interfaces:**
- 验收对象为当前已安装并激活的 vNext 实例，不使用旧版 Widget 作为证据。
- 真实 UI 证据必须来自 fresh UIA；动态通知控件每次重新获取并 signature-match，不复用旧 lease、snapshot 或坐标。

- [ ] **Step 1: 运行完整自动化验证**

```powershell
npm test
npm run check
git diff --check
```

记录 Node 测试通过/跳过/失败数量；出现失败先诊断，不宣称完成。

- [ ] **Step 2: reload 当前 dev/community vNext 实例**

使用现有插件开发工具重新加载实际工作区，确认 manifest 的 Widget Surface 仍为 `/widget`，页面 Surface 仍为 `/notification-center`；不修改旧版插件。

- [ ] **Step 3: fresh UIA 打开 Widget**

确认 Widget 页面真实显示：

- 最近通知列表来自当前 Store。
- 未读数量与只读 Store 计算一致。
- 最近一条摘要与真实记录正文/摘要一致。
- 每条通知存在打开详情入口。
- 存在打开通知中心入口。

- [ ] **Step 4: 真实验证详情深链接**

对当前可见真实通知使用 fresh UIA 的详情入口，打开 Notification Center，确认详情标题和正文与同一 notificationId 对应；点击前后 Store 的 `status` 与 `updatedAt` 不变。

- [ ] **Step 5: 写入并交付证据**

在 `CURRENT-STATUS.md` 新增带时间戳的小节，记录真实 notificationId、Widget 摘要、未读数量、深链接详情字段、Store 前后状态和自动化测试结果。执行 `stage_files` 交付 `CURRENT-STATUS.md`。不执行 Git commit。

---

## Self-review

- 规格覆盖：最近通知、未读数量、简短摘要、打开详情、打开通知中心均由 Task 1–4 覆盖；共享数据源由 Task 2 强制；Runtime 故障和诊断页面留给下一独立计划，不与 Widget 首刀混合。
- 未覆盖内容：Widget 标记已读、清除单条/可见通知、设置/诊断入口暂不实现，避免把只读入口与状态修改操作混在第一刀。
- 安全边界：没有伪造数据，没有直接暴露 Store，没有把详情读取变成状态变更。
- 版本边界：不进入 Phase 9，不修改 Native Runtime C++。
