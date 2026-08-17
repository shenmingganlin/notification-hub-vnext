# 阶段一页面稳定闭环实施计划

> **For agentic workers:** 本计划按阶段一逐项执行；每个小刀都必须有 focused 测试、全量回归和真实 Hana 验收证据。不得用 Node 测试替代宿主验收，不执行 Git commit。

**目标：** 在进入通知卡片分类前，完成侧边栏、Notification Center、设置视图和 Widget 入口的稳定产品闭环。

**架构：** 保持单一 Hana Page surface。页面内部导航通过当前 iframe 的 `hana.api.fetch()` 加载 route 内容，不能跨 Page surface 拼接新文档 URL。Widget 只承担轻量入口，完整通知管理留在 Notification Center；原始通知 Store 数据不因显示上限或页面摘要而修改。

**技术栈：** Node.js ESM、Hana 插件 route、原生 HTML/CSS/JavaScript、Node test runner、`npm run check`、真实 Hana 页面验收。

## 全局约束

- 当前版本基线为 `0.1.0-alpha.11`，Native Runtime 交互基线来自 alpha.8。
- 当前只做侧边栏与页面稳定，不实现卡片分类、声音、视觉、模式或公共 API。
- 修改源码使用结构化 `read` / `edit` / `write`；Shell 仅用于测试、检查和打包。
- 不改写历史通知 Store 数据。
- 页面导航必须遵守 `pluginIframeTicket` 与 `pluginSurfaceSession` 的职责分离。
- 不执行 Git commit。
- 阶段完成必须包含 focused 测试、全量 Node、`npm run check`、`git diff --check`，以及真实 Hana 验收记录。

---

### Task 1：确认并固化页面稳定性基线

**Files:**
- Read: `plugin/routes/widget.js`
- Read: `plugin/routes/notification-center.js`
- Read: `plugin/routes/settings.js`
- Read: `plugin/routes/page-navigation.js`
- Test: `tests/node/widget-route.test.mjs`
- Test: `tests/node/notification-center-route.test.mjs`
- Test: `tests/node/settings-route.test.mjs`
- Test: `tests/node/page-navigation.test.mjs`

**产出：** 明确当前已经存在的页面契约、尚未覆盖的契约和第一项代码修复，不重复实现已有功能。

- [x] 读取相关 route 和测试，列出 Widget 入口、通知详情、显示上限、设置视图加载、导航 fallback 的当前证据。
- [x] 运行 focused 页面测试，25 项通过、0 项失败。
- [x] 没有发现需要追加代码修复的页面契约缺口；进入真实 Hana 验收和自动化总回归。

运行：

```powershell
node --test tests/node/widget-route.test.mjs tests/node/notification-center-route.test.mjs tests/node/settings-route.test.mjs tests/node/page-navigation.test.mjs
```

---

### Task 2：修复一个可独立验收的页面稳定缺口

**Files:**
- Modify: 由 Task 1 根据真实缺口确定，优先限制在一个 route 文件和对应测试文件
- Test: 对应 route focused test

**接口约束：**
- Widget 进入通知中心或详情时，通过宿主导航消息传递目标，不直接发起新的 Page surface 文档导航。
- Notification Center 详情展开不自动改变已读状态。
- 显示上限只限制页面查询/渲染，不限制 Store 和历史持久化。
- 设置视图加载继续使用当前 iframe 内 `hana.api.fetch()`。

- [x] 本轮没有明确页面契约缺口，因此不新增无必要的代码变更。
- [x] 已由用户在真实 Hana 中确认五项页面行为正常。

---

### Task 3：真实 Hana 页面验收

**Files:**
- No source change unless Task 2 exposes a real host incompatibility.
- Update: `CURRENT-STATUS.md`

**验收范围：**

- 侧边栏最小、窄、中等、舒适宽度：检查 `scrollWidth`、核心内容遮挡、按钮换行和长标题/摘要。
- 显示上限：30、500、1000、无限、自定义值，确认页面数量、摘要、重载持久化和历史完整性。
- Notification Center 详情：完整正文、metadata、来源、类型、状态；详情展开不自动标记已读。
- Widget 深链接：点击通知后宿主进入 Notification Center 并打开对应详情。
- 设置导航：从 alpha.11 当前 iframe 内视图切换进入设置，不出现 404。

- [x] 用户确认侧边栏宽度、显示上限、通知详情、Widget 深链接和设置导航均正常。
- [x] 真实证据已同步到 `CURRENT-STATUS.md`。

---

### Task 4：阶段一收口与进入分类前检查

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `notification-hub-vnext-plan.md`
- Modify: `SIDEBAR-PAGE-PRODUCT-PLAN.md`

- [x] 汇总 focused、全量 Node、语法检查、diff 检查、包内容检查和真实 Hana 证据。
- [x] 阶段一页面稳定证据已闭环。
- [ ] 创建并执行阶段二“聊天、频道、工具、错误、插件”分类实现计划。
- [ ] 分类实现必须成为声音和视觉共同依赖的多标签策略投影。
