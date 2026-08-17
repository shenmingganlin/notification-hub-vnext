# 侧边栏通知卡片显示条数实施计划

> **Goal:** 为 Notification Hub 侧边栏增加独立、可持久化的通知卡片显示条数设置，默认 3 条，支持 1、3、5、10 和自定义 1～20 条。

**Architecture:** 侧边栏条数作为独立于 Notification Center 显示上限的领域设置，单独校验、单独持久化。插件通过 Widget API 暴露读取/更新接口，Widget 提供轻量选择控件；通知历史、Notification Center 和 Native Runtime 不受影响。

**Tech Stack:** Node.js ESM、Hono route、Node test runner、JSON 原子替换持久化。

## Global Constraints

- 不修改或删除通知历史。
- 侧边栏仍然是轻量入口，不加入完整设置后台。
- 侧边栏最多显示 20 条，避免无限列表破坏 Widget 高度和窄宽度布局。
- Notification Center 的显示上限保持独立。
- 不改变 Runtime、Native Scene、详情跳转和未读状态语义。
- 不执行 Git commit。

---

### Task 1: 侧边栏条数领域设置

**Files:**
- Create: `plugin/domain/sidebar-display-settings.js`
- Create: `tests/node/sidebar-display-settings.test.mjs`

**Interfaces:**
- `createSidebarDisplaySettings(input = {}) -> frozen { mode, limit }`
- `validateSidebarDisplaySettings(settings) -> true`
- `resolveSidebarDisplayLimit(settings) -> positive integer`
- `SIDEBAR_DISPLAY_LIMIT_DEFAULT = 3`
- `SIDEBAR_DISPLAY_LIMIT_MAX = 20`

- [ ] 支持 preset 值 `1/3/5/10` 和 custom 值 `1..20`。
- [ ] 拒绝未知字段、非整数、越界值和非法 mode。
- [ ] 使用失败测试锁定默认值和校验边界。

### Task 2: 独立持久化

**Files:**
- Create: `plugin/domain/sidebar-display-settings-persistence.js`
- Create: `tests/node/sidebar-display-settings-persistence.test.mjs`

**Interfaces:**
- `createSidebarDisplaySettingsPersistence({ dataDir, config, overrides } = {})`
- `resolveSidebarDisplaySettingsPersistenceConfig(...) -> { filePath }`
- 默认文件名：`sidebar-display-settings.json`

- [ ] 使用临时文件 + rename 原子保存。
- [ ] 缺失文件恢复为 null。
- [ ] 保存和恢复都经过领域校验。
- [ ] 读写失败转换为带稳定 code 的错误。

### Task 3: 插件 API 接入

**Files:**
- Modify: `plugin/index.js`
- Create or modify: `tests/node/sidebar-display-settings-plugin.test.mjs`

**Interfaces:**
- `getSidebarDisplaySettings() -> { settings, limit }`
- `updateSidebarDisplaySettings(patch) -> { settings, limit }`
- `getNotificationWidgetStatus()` 使用 `resolveSidebarDisplayLimit(this.sidebarDisplaySettings)` 生成 `recent`。

- [ ] 构造器允许注入 sidebar 持久化工厂。
- [ ] `onload()` 恢复设置，`onunload()` 释放持久化对象。
- [ ] 变更后下一次 Widget 状态读取立即使用新条数。
- [ ] Notification Center 显示设置字段和历史数据保持不变。

### Task 4: Widget 轻量控制和路由

**Files:**
- Modify: `plugin/routes/widget.js`
- Modify: `tests/node/widget-route.test.mjs`

- [ ] 顶部摘要按实际 `recent.length` 显示，不再硬编码 3。
- [ ] 渲染 `widget.recent` 全部卡片，不再二次 `slice(0, 3)`。
- [ ] 增加“侧边栏卡片”选择控件，支持 1/3/5/10/自定义 1～20。
- [ ] 增加 GET/POST `/sidebar-display-settings` 路由，沿用 Widget API 的结构化错误边界。
- [ ] 保存后刷新卡片列表和设置反馈。
- [ ] 窄宽度下控件换行，不使用 `overflow-x: hidden`。

### Task 5: 验证与交付

**Files:**
- Modify: `package.json` only if syntax check needs the new files.

- [ ] 运行 focused domain、persistence、plugin、widget 测试。
- [ ] 运行 `npm test`、`npm run check`、`git diff --check`。
- [ ] 重新生成 Release ZIP，计算 SHA256，使用 `stage_files` 交付。
- [ ] 说明真实 Hana 验收步骤：选择条数、保存、观察卡片数量、重载 Widget 后确认持久化。
