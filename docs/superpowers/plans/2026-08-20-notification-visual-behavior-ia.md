# 通知视觉与通知行为信息架构重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设置中心按用户心智拆分为“通知视觉”和“通知行为”，让视觉页只负责卡片美化，让行为页负责事件绑定、行为通道、重要性和真实事件测试；同时修复声音诊断区域的半宽布局。

**Architecture:** 保留现有 Visual Profile、Event Presentation Settings 和通知测试 API，不重写 Native 协议。通知视觉页保留视觉方案设计、实时预览、保存、导出和素材库入口；通知行为页承接视觉方案应用到事件、行为通道、重要性关键词和六类通知测试。声音高级工具内部继续使用两列，但最近声音状态显式跨列铺满。

**Tech Stack:** Node.js ESM、Hono route handlers、模板字符串 HTML/CSS/vanilla JavaScript、Node `node:test`。

## Global Constraints

- 版本保持 `0.1.4`。
- 不执行 Git commit、push、reset 或 clean。
- 不改变声音、通知记录、Plugin 生命周期和 Native 协议的既有可靠性边界。
- 视觉失败不得阻塞声音、通知记录或 Plugin 生命周期。
- 诊断导出只保存 JSON 元数据和问题信息，不保存二进制素材或原始正文。
- 完成前必须运行 `npm run check`、全量 Node 测试、Native Named Pipe 测试、`git diff --check`。
- 使用结构化文件工具修改源码和文档。

---

### Task 1: 固化页面职责与诊断布局回归

**Files:**
- Modify: `plugin/routes/settings.js`
- Modify: `plugin/routes/settings-sound.js`
- Modify: `tests/node/settings-route.test.mjs`
- Modify: `tests/node/settings-sound-route.test.mjs`

**Interfaces:**
- `SETTINGS_VIEWS.events.title` 输出“通知行为”。
- `SETTINGS_VIEWS.events.description` 明确说明行为模式、通道、重要性和事件绑定。
- 声音高级区域的 `.sound-diagnostics-panel` 跨越 `.advanced-grid` 的全部列。

- [ ] **Step 1: 写失败测试**

补充测试断言设置壳层包含“通知行为”而不再包含“事件表现”，声音页源码包含 `.sound-diagnostics-panel{grid-column:1/-1}` 或等价的跨列规则，并保留“最近声音状态”。

- [ ] **Step 2: 运行 focused 测试确认失败**

Run: `node --test tests/node/settings-route.test.mjs tests/node/settings-sound-route.test.mjs --test-concurrency=1`
Expected: 新增标题和跨列断言失败。

- [ ] **Step 3: 实现最小修改**

在 `SETTINGS_VIEWS` 中把 `events` 改名为“通知行为”，描述改为“卡片行为、行为通道、重要性与事件绑定”。在 `settings-sound.js` 高级区域样式中增加：

```css
.advanced-grid .sound-diagnostics-panel { grid-column: 1 / -1; }
```

并把诊断说明调整为“最近声音状态”，保持诊断按钮和 API 不变。

- [ ] **Step 4: 运行 focused 测试确认通过**

Run: `node --test tests/node/settings-route.test.mjs tests/node/settings-sound-route.test.mjs --test-concurrency=1`
Expected: PASS。

---

### Task 2: 将通知视觉页收敛为纯视觉工作台

**Files:**
- Modify: `plugin/routes/settings-visual.js`
- Modify: `tests/node/settings-visual-route.test.mjs`

**Interfaces:**
- 视觉页面继续使用现有 `/visual-settings-update`、`/visual-profiles/save`、`/visual-package-export` 和素材库导航 API。
- 视觉页面不再渲染 `应用到事件`、`测试事件`、`behavior-channel` 或 `/visual-test-notification` 交互。
- 视觉页面保留卡片种类、尺寸、排列/几何、背景、圆角、透明度、实时预览、方案保存、视觉包导出和素材库入口。

- [ ] **Step 1: 写失败测试**

补充页面测试断言：

```js
assert.match(html, /设计卡片外观/);
assert.doesNotMatch(html, /应用到事件/);
assert.doesNotMatch(html, /测试事件/);
assert.doesNotMatch(html, /visual-test-notification/);
assert.match(html, /保存为视觉方案/);
assert.match(html, /打开素材库/);
```

- [ ] **Step 2: 运行 focused 测试确认失败**

Run: `node --test tests/node/settings-visual-route.test.mjs --test-concurrency=1`
Expected: 旧视觉页面仍包含应用和测试区块，新增断言失败。

- [ ] **Step 3: 删除视觉页中的事件应用与测试 UI/脚本**

从 `renderBody()` 删除 `apply-panel`、`test-panel`、事件选择器、测试事件选项和对应的 `applyProfile()`、`runTests()`、事件监听。保留 `saveProfile()`、`collect()`、`syncPreview()`、视觉包导出和素材库导航。同步删除只服务于已移除区块的 CSS，避免留下无效的事件工作流样式。

将视觉页文案改为：

```text
设计一套卡片外观，保存为视觉方案，再到“通知行为”中决定哪些事件使用它。
```

卡片设计说明改为：

```text
修改后先保存方案，实时预览不会创建桌面通知。
```

- [ ] **Step 4: 运行 focused 测试确认通过**

Run: `node --test tests/node/settings-visual-route.test.mjs --test-concurrency=1`
Expected: PASS。

---

### Task 3: 在通知行为页承接视觉应用与真实事件测试

**Files:**
- Modify: `plugin/index.js`
- Modify: `plugin/routes/settings-events.js`
- Modify: `tests/node/plugin-lifecycle.test.mjs`
- Modify: `tests/node/settings-events-route.test.mjs`

**Interfaces:**
- `getEventPresentationSettings()` 在既有返回值上增加可选的 `visualProfiles` 和 `testEvents` 元数据，不删除 `rows`、`settings`、`revision`、`persistence`。
- 通知行为页继续调用 `/event-presentation-settings`、`/visual-profiles/preview-apply`、`/visual-profiles/apply` 和 `/visual-test-notification`。
- 视觉方案应用仍只改变视觉绑定和行为通道，不覆盖声音设置。

- [ ] **Step 1: 写失败测试**

在事件路由测试中断言页面包含：

```js
assert.match(html, /通知行为/);
assert.match(html, /应用视觉方案/);
assert.match(html, /行为通道/);
assert.match(html, /重要性关键词/);
assert.match(html, /发送选中事件/);
assert.match(html, /visual-profiles\/apply/);
assert.match(html, /visual-test-notification/);
```

在 Plugin 生命周期或状态测试中断言 `getEventPresentationSettings()` 返回 `visualProfiles` 数组和 `testEvents` 数组，且原有 `rows/settings` 仍存在。

- [ ] **Step 2: 运行 focused 测试确认失败**

Run: `node --test tests/node/settings-events-route.test.mjs tests/node/plugin-lifecycle.test.mjs --test-concurrency=1`
Expected: 事件页没有迁移后的应用/测试 UI，Plugin 状态没有新增元数据，新增断言失败。

- [ ] **Step 3: 扩展 Plugin 状态元数据**

在 `getEventPresentationSettings()` 返回：

```js
visualProfiles: this.listVisualProfiles(),
testEvents: [...NOTIFICATION_TEST_EVENTS]
```

不修改现有事件绑定存储格式。

- [ ] **Step 4: 迁移通知行为工作台 UI**

重写 `settings-events.js` 的 fragment，保留现有事件目录和重要性关键词，新增以下结构：

```text
通知行为
  ├─ 视觉方案应用
  │    ├─ 选择视觉方案
  │    ├─ 行为通道
  │    ├─ 选择事件
  │    ├─ 预览影响
  │    └─ 应用到选中事件
  ├─ 事件目录与绑定
  │    ├─ 视觉方案
  │    ├─ 行为模式
  │    ├─ 行为通道
  │    └─ 保存此事件
  ├─ 重要性关键词
  └─ 测试通知事件
```

应用和预览逻辑复用视觉页现有请求格式；测试逻辑复用 `visual-test-notification` 请求格式，但移动到本页面。事件表的视觉方案选项从 `boot.visualProfiles` 动态生成，不再硬编码 `visual.minimal` / `visual.danmaku`。行为模式保持现有 `stack`、`ticker`、`popup` 选项，重要性关键词保存继续走 `/event-presentation-settings`。

- [ ] **Step 5: 运行 focused 测试确认通过**

Run: `node --test tests/node/settings-events-route.test.mjs tests/node/plugin-lifecycle.test.mjs --test-concurrency=1`
Expected: PASS。

---

### Task 4: 更新文档、回归全量验证并生成安装包

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `docs/superpowers/plans/2026-08-20-visual-workbench-acceptance-repair.md`
- Modify: `plugin/manifest.json` only if package metadata needs a user-facing description update; keep version `0.1.4`.

- [ ] **Step 1: 更新状态文档**

记录新的页面职责、诊断跨列修复和当前尚未完成的真实 Hana 页面验收项。

- [ ] **Step 2: 运行语法检查和全量测试**

Run: `npm run check`

Run: `npm test -- --test-concurrency=1`

Expected: JavaScript syntax check passes; full suite has zero failures，Native takeover E2E may remain skipped when runtime path is absent。

- [ ] **Step 3: 运行 Native Named Pipe 回归**

Run:

```powershell
$env:NOTIFICATION_HUB_RUNTIME_PATH=(Resolve-Path '.\\build\\vs2022-debug\\runtime\\Release\\notification-hub-runtime.exe').Path
node --test tests/node/named-pipe-behavior-channel.test.mjs tests/node/named-pipe-scene-event.test.mjs tests/node/named-pipe-smoke.test.mjs --test-concurrency=1
```

Expected: 3 个 Native 测试全部通过。

- [ ] **Step 4: 检查 diff 并重新打包**

Run: `git diff --check`

Run:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\package-release.ps1 -Configuration Release -RuntimePath .\\build\\vs2022-debug\\runtime\\Release\\notification-hub-runtime.exe -AudioEnginePath .\\build\\vs2022-debug\\runtime\\Release\\notification-hub-audio-engine.exe
```

Expected: 输出 `notification-hub-vnext-0.1.4.zip`，manifest 版本仍为 `0.1.4`。

- [ ] **Step 5: 校验 ZIP 内容和 SHA256**

确认 ZIP 包含 `plugin/index.js`、`plugin/routes/settings-events.js`、`plugin/routes/settings-visual.js`、`plugin/routes/settings-sound.js` 和 `node_modules/adm-zip`，然后记录最终 SHA256；不安装、不提交 Git。
