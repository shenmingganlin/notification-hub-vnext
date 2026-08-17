# Notification Center 批量标记已读实施计划

> **For agentic workers:** 本计划按小步垂直切片执行；每个步骤先写行为测试，再写最小实现。项目约束是不执行 Git commit，改动通过 `stage_files` 交付。

**Goal:** 为 Notification Center 增加安全、幂等、一次性持久化的批量标记已读能力。

**Architecture:** 在 `NotificationStore` 增加一次批量状态变更入口，先完整校验 ID 集合和目标状态，再一次性替换内存记录并发出一次变更事件；`NotificationApi` 只转发该公共能力。HTTP 路由接收 JSON `{ notificationIds, status: "read" }`，页面只提交用户当前选择的 ID，并在成功后刷新当前筛选。

**Tech Stack:** Node.js ESM、Node test runner、现有 NotificationStore/NotificationApi、Hono 风格路由、原生 HTML/CSS/浏览器 JavaScript。

## Global Constraints

- 只实现批量标记已读，不实现批量删除或清空。
- 只允许目标状态 `read`，避免开放未经设计的批量状态机。
- 空选择直接返回成功的 no-op，不写 Store、不请求持久化。
- ID 不存在时整批拒绝，不产生部分更新。
- 重复 ID 去重，已读记录保持幂等。
- 成功批量更新只发出一次 Store change，持久化协调器因此只排队一次快照。
- 页面保持当前筛选条件，未选择的通知不受影响。
- 不执行 Git commit；完成后运行 focused、全量 Node、`npm run check`、`git diff --check` 并用 `stage_files` 交付。

---

### Task 1: Store 批量状态变更契约

**Files:**
- Modify: `plugin/domain/notification-store.js`
- Test: `tests/node/notification-store.test.mjs`

**Produces:** `NotificationStore.setStatuses(notificationIds, status)`，返回 `{ updated, missing }`；当前仅接受非空字符串 ID 数组和 `status === "read"`。空数组返回 `{ updated: [], missing: [] }`，不存在 ID 或非法状态抛出结构化错误且不改变任何记录。

- [x] 写一个测试证明两个现有通知会被一次性变为 `read`，并返回两个更新后的记录。
- [x] 运行 Store focused 测试，确认新接口尚不存在而失败。
- [x] 实现输入校验、去重、全量预检查、单次 Map 替换和单次 change 事件。
- [x] 增加空数组、重复 ID、缺失 ID、非法目标状态和未选通知保持不变的测试。
- [x] 运行 `node --test tests/node/notification-store.test.mjs`，确认通过。

### Task 2: NotificationApi 与 HTTP 批量接口

**Files:**
- Modify: `plugin/api/notification-api.js`
- Modify: `plugin/routes/notification-center.js`
- Test: `tests/node/notification-api.test.mjs`
- Test: `tests/node/notification-center-route.test.mjs`

**Consumes:** Task 1 的 `store.setStatuses(ids, "read")`。

**Produces:** `NotificationApi.setNotificationsStatus(notificationIds, status)`；POST `/notification-status/batch` 接受 JSON `{ notificationIds: string[], status: "read" }`，成功返回 `{ ok: true, updated, missing }`。缺失 ID、非法 body 返回明确错误，不发生部分更新。

- [x] 先补 API 委托和路由成功/失败行为测试。
- [x] 运行两个 focused 测试确认失败。
- [x] 实现 API 薄委托、JSON body 解析、结构化参数校验和错误映射。
- [x] 覆盖空选择 no-op、重复 ID 去重、缺失 ID 原子拒绝、API 不可用、非法状态。
- [x] 运行 API 和路由 focused 测试，确认通过。

### Task 3: Notification Center 选择与批量操作 UI

**Files:**
- Modify: `plugin/routes/notification-center.js`
- Test: `tests/node/notification-center-route.test.mjs`

**Consumes:** POST `/notification-status/batch`。

**Produces:** 页面包含 `select-all`、`selected-count`、`batch-mark-read` 控件；每张未读卡片包含 `notification-select` checkbox。页面只提交选中的 ID，空选择不请求，成功后保留当前筛选并刷新。

- [x] 先补页面源码行为断言：控件、数据属性、批量 POST 路径、空选择分支和成功反馈文本。
- [x] 运行路由 focused 测试确认失败。
- [x] 在页面脚本中维护当前通知列表和选择集合，渲染选择框、当前筛选全选和已选数量。
- [x] 实现批量按钮的禁用/恢复、POST 请求、成功刷新和错误反馈。
- [x] 运行页面 focused 测试，确认通过。

### Task 4: 全量验证与交付

**Files:**
- Modify: `CURRENT-STATUS.md`
- Deliver: 所有变更文件及验证后的安装包（若本刀生成）

- [x] 运行 focused Store/API/route 测试。
- [x] 运行 Node 全量测试。
- [x] 运行 `npm run check` 和 `git diff --check`。
- [x] 更新当前状态，明确代码验证结果和真实 Hana 验收边界。
- [x] 不执行 Git commit，使用 `stage_files` 交付变更。
