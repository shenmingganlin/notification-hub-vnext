# Alpha16 卡片行为与视觉第一刀实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本项目不执行 Git commit；每个任务仍必须独立完成测试、检查和证据记录。

**Goal:** 在不破坏 alpha.8 Native Runtime 交互基线的前提下，将视觉设置升级为“卡片种类 → 行为与视觉细节”的结构，并完成极简卡片第一套可保存、可恢复、可应用配置。

**Architecture:** 保留现有视觉策略 resolver 的分类 preset 决策，将卡片类型配置作为独立的 `card` 配置层。`activeCardType` 决定当前详情配置，第一刀只实现 `minimal`，其行为保持现有简单排列；尺寸、宽高比、颜色、圆角和透明度先作为受控字段进入最终 Runtime visual payload，由 Native Runtime 解析并绘制。未知或非法配置统一回退 minimal 默认值。

**Tech Stack:** Node.js ESM、原生 JavaScript、Node test runner、Hono 风格插件 routes、C++/Direct2D Windows Native Runtime、CMake。

## Global Constraints

- 版本从本轮起使用 `0.1.0-alpha.16`，源码、manifest、package、VERSION、README、打包文件和状态文档保持一致。
- 保护 alpha.8 Native Runtime 的卡片创建、单击关闭、多卡片重排和恢复行为。
- 页面继续使用当前 iframe 内导航，不新增 Page surface，不使用跨 surface 普通链接。
- 全局视觉关闭优先于卡片类型与卡片细节配置。
- 第一刀只实现 `minimal` 极简卡片；`danmaku`、`popup` 等未来类型只进入受控类型白名单或扩展说明，不伪实现。
- “行为与视觉”是页面产品名称；底层仍分开保存 `behavior` 与 `appearance`，避免概念混成一个对象。
- 不开放任意 CSS、HTML、文件路径、坐标、脚本、粒子 DSL 或动画 DSL。
- 卡片宽度、高度和宽高比不允许互相冲突；第一刀由 `size` 与 `aspectRatio` 生成受控 geometry，禁止用户同时填写独立 width/height。
- 源码修改使用结构化 `read` / `edit` / `write`；Shell 仅用于测试、检查、构建和打包；不执行 Git commit。
- 完成前运行 focused、全量 `npm test`、`npm run check`、`git diff --check`、Runtime 构建/测试和打包验证。

## 文件职责地图

### 新增

- `plugin/domain/card-visual-settings.js`：卡片类型、极简卡片行为/外观字段、默认值、迁移与严格校验。
- `tests/node/card-visual-settings.test.mjs`：卡片类型、默认值、非法字段、旧视觉 profile 迁移和深冻结回归。

### 修改

- `plugin/domain/visual-settings.js`：把 card 配置纳入视觉设置，保持旧 profile 输入兼容并迁移到 minimal。
- `plugin/domain/visual-rule-resolver.js`：在现有 preset 决策外输出受控 cardType、behavior、appearance；全局关闭仍为绝对边界。
- `plugin/index.js`：视觉设置状态、更新、预览和 scene.create 统一带上最终 minimal card visual payload；旧配置恢复后走同一归一化层。
- `plugin/routes/settings-visual.js`：页面改名为“行为与视觉”，只保留一个全局视觉开关，增加卡片种类选择和 minimal 详情表单。
- `tests/node/visual-settings.test.mjs`、`tests/node/visual-rule-resolver.test.mjs`：补充 card 配置和最终 decision 回归。
- `tests/node/settings-visual-route.test.mjs`：补充页面结构、字段、iframe fetch 和脚本语法回归。
- `tests/node/plugin-lifecycle.test.mjs`：补充 scene payload 的卡片类型与 minimal appearance 回归。
- `runtime/scene/visual.hpp`、`runtime/scene/renderer.cpp`：接收受控 minimal card appearance，并在 Windows Direct2D 绘制层应用颜色、圆角、透明度；默认字段保持旧视觉表现。
- `runtime/transport/named_pipe.cpp`：解析 cardType、behavior、appearance 的受控字段，并拒绝未知字段。
- `runtime/scene/window.hpp` / `runtime/scene/window.cpp`（如需要）：将解析后的 minimal appearance 传入 renderer。
- `tests/runtime/*visual*` 或现有 Runtime 协议测试：覆盖旧 visual payload、minimal payload 和非法字段回退/拒绝。
- `package.json`、`package-lock.json`、`plugin/manifest.json`、`VERSION`、`README.md`：版本更新为 alpha16。
- `CURRENT-STATUS.md`、`notification-hub-vnext-plan.md`：记录 alpha16 第一刀范围和证据。

## Task 1：卡片类型配置模型与旧配置迁移

- [ ] 新增 `card-visual-settings.js`，定义 `minimal`、`danmaku`、`popup` 类型白名单；本轮仅允许 active type 为 `minimal`，未来类型返回“未实现”而不生成运行时 payload。
- [ ] 定义 minimal 行为：`layout: 'simple'`、`boundary: 'work-area'`。
- [ ] 定义 minimal 外观：`size: 'medium'`、`aspectRatio: 'default'`、`backgroundColor: '#0e1916'`、`borderRadius: 16`、`opacity: 0.96`。
- [ ] 由 `createCardVisualSettings()` 统一校验、迁移旧 visual profile，并深冻结结果。
- [ ] 在 `visual-settings.js` 纳入 `card`，旧 profile 没有 card 时自动生成 minimal 默认配置。
- [ ] 补 focused 测试：默认值、旧配置迁移、非法颜色/圆角/透明度/未知字段、对象不可变。

## Task 2：视觉 resolver 输出最终卡片决策

- [ ] 保留现有全局/分类/critical preset 决策。
- [ ] 将归一化 card 配置附加到最终 decision：`cardType`、`behavior`、`appearance`。
- [ ] 全局关闭返回 `enabled:false`，但仍返回规范化 minimal card 配置，方便 Runtime 接收稳定 schema。
- [ ] active type 非 minimal 时返回安全 fallback minimal，并设置 `reason: 'card-type-fallback'`。
- [ ] 补 focused 测试：minimal decision、全局关闭、critical、非法 card 配置 fallback、输出深冻结。

## Task 3：设置页改造成行为与视觉

- [ ] 标题和上下文改为“行为与视觉”。
- [ ] 全局视觉只保留一个开关，默认预设移入 minimal 详情中的策略区域，避免重复全局展示。
- [ ] 增加卡片种类 select，目前显示并启用“极简卡片”，未来类型显示为“即将推出”或保持禁用。
- [ ] 增加 minimal 行为设置：简单排列、当前边界。
- [ ] 增加 minimal 外观设置：尺寸、宽高比、背景颜色、圆角、透明度。
- [ ] 只有选择 minimal 时显示 minimal 详情；页面不显示未实现类型的伪设置。
- [ ] 保留最终策略预览，但将卡片类型、尺寸、圆角和透明度纳入页面预览。
- [ ] 补 HTML 静态测试和脚本语法测试。

## Task 4：把 minimal visual payload 接入 Runtime

- [ ] Node scene payload 仅发送受控字段：`cardType`、`behavior.layout`、`behavior.boundary`、`appearance.size`、`appearance.aspectRatio`、`appearance.backgroundColor`、`appearance.borderRadius`、`appearance.opacity`，以及既有 preset/intensity/category/enabled。
- [ ] C++ Named Pipe 严格解析这些字段，未知字段拒绝该 payload，不影响既有旧 payload。
- [ ] Native renderer 对 minimal 使用背景颜色、圆角和透明度；缺省时保持 alpha.8 默认视觉。
- [ ] size/aspectRatio 在 Node 侧解析成既有 window geometry，保持简单排列位置和 spacing 逻辑不变；不让 Runtime 自己改变 Shelf 排列算法。
- [ ] 补协议/Renderer 回归，至少确认旧 payload 和 minimal payload 都可处理。

## Task 5：alpha16 版本、验证与文档

- [ ] 统一更新版本为 `0.1.0-alpha.16`。
- [ ] 运行 focused Node tests。
- [ ] 运行全量 `npm test`、`npm run check`、`git diff --check`。
- [ ] 运行 Runtime CMake build 与现有 CTest/协议 smoke。
- [ ] 重新打包 alpha16，计算 SHA256，校验 ZIP 内容。
- [ ] 更新 `CURRENT-STATUS.md`：记录第一刀范围、自动化证据、真实 Hana 待验收项。
- [ ] 真实 Hana 验收：行为与视觉页面、类型切换、minimal 设置保存/恢复、卡片尺寸/圆角/透明度、全局关闭、旧声音链路和 alpha.8 排列关闭行为。

## 明确不在本刀

- 弹幕卡片和突脸卡片的真实 Runtime 行为。
- 任意动画、粒子、主题编辑器、CSS 编辑器。
- 模式制作和公共 Notification API。
- 多套独立 Page surface。
- 修改声音策略和 Native Runtime 交互基线。
