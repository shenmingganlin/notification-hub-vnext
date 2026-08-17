# 通知中心筛选重构实施计划

> **For agentic workers:** 本计划在当前会话内逐步执行；每个任务完成后运行对应验证。

**目标：** 让通知中心筛选器按照当前通知事件结构工作，支持快速视图、事件多选，以及来源/通道高级筛选，同时保持现有 API 兼容。

**架构：** 保留现有通知分类与事件投影作为唯一语义来源；页面使用统一 `filterState` 管理筛选，不再维护一组互相覆盖的布尔变量。事件组内采用 OR，不同筛选维度之间采用 AND；查询仍使用现有 `event`、`category`、`producerKind`、`channelKind` 参数。

**技术栈：** Node.js ESM、Hana 插件 HTML fragment、Node test runner。

## 全局约束

- 不修改声音设置页面，本轮只收口通知中心筛选。
- 不删除现有查询参数，保留单值参数兼容。
- 不将 `tool_error`、`model_service_error` 等交叉事件错误地做成互斥分类。
- 同一筛选组内多选为 OR，不同组之间为 AND。
- 使用结构化文件工具修改源码；不执行 Git commit。

---

### Task 1：锁定筛选语义与回归测试

**文件：**
- 修改：`tests/node/notification-center-route.test.mjs`
- 参考：`plugin/domain/notification-classification.js`
- 参考：`plugin/routes/notification-center.js`

- [x] 更新页面契约测试，覆盖事件优先筛选、来源与通道高级筛选、清除筛选。
- [x] 运行通知中心相关测试，确认旧契约断言已迁移到新 UI。

### Task 2：统一通知中心筛选状态

**文件：**
- 修改：`plugin/routes/notification-center.js`

- [x] 将页面脚本中的分散布尔变量替换为 `filterState`，字段包括 `view`、`events`、`producerKind`、`channelKind`。
- [x] 保留 `important`、`unread`、`all` 作为 `view` 快速视图。
- [x] 实现事件组内多选、清除筛选和条件摘要。
- [x] 查询拼接使用逗号连接数组，并保留旧的单值 `category`/`event` URL 读取兼容。
- [x] 删除旧的单值按钮状态互相覆盖逻辑，不改变批量读/删和详情逻辑。

### Task 3：重排通知中心筛选 UI

**文件：**
- 修改：`plugin/routes/notification-center.js`

- [x] 将筛选面板重排为“快速视图”“事件类型”“更多筛选”。
- [x] 主事件按钮使用 `assistant_reply`、`tool_success`、`tool_error`、`timeout`、`model_service_error`、`error`。
- [x] 高级筛选使用现有实际字段 `producerKind` 与 `channelKind`，选项限定为当前模型稳定值。
- [x] 增加已应用条件摘要与清除入口，并补充移动宽度布局。

### Task 4：验证与状态记录

**文件：**
- 修改：`CURRENT-STATUS.md`（仅在实现和测试完成后）

- [x] 运行通知中心、分类和事件筛选相关 Node 测试：24 项通过。
- [x] 运行 `node scripts/check-syntax.mjs`：219 个 JavaScript 文件通过。
- [x] 运行 `git diff --check`：通过（仅有既有换行符提示）。
- [ ] 更新状态文件，记录筛选重构范围和验证结果。
- [x] 不执行 Git commit。
