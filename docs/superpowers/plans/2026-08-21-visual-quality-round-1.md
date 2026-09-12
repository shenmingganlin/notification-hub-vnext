# Visual Quality Round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把通知视觉页从“配置表单”升级为可验证的真实视觉实验台，并修复入口、保存、刷新、删除和诊断缺口。

**Architecture:** 保持视觉设置、视觉配置包、视觉素材库和 Native Runtime 的现有边界。页面层只负责收集配置与展示状态；Plugin API 负责校验、持久化、注册表变更和测试任务；真实实验台使用现有 `scene.create` / `scene.update` / `scene.dismiss` 通道，实验卡片使用独立前缀与测试元数据，不写入通知历史、不播放声音、不改变事件绑定。

**Tech Stack:** Node.js ESM、Hono-style Plugin routes、原生 Windows Runtime、Node test runner、现有 Visual Profile/Asset Registry。

## Global Constraints

- 版本保持 `0.1.4`。
- 不 Git commit、push、reset。
- 只改视觉方向；不改变声音行为、通知记录、Plugin lifecycle 和 Native protocol 边界。
- 每个任务完成后运行 focused tests、`npm run check`；最后运行全量测试并记录已有失败。
- 默认视觉配置和仍被引用的自定义配置包不可删除。
- 真实实验台测试卡片不进入通知历史、不播放声音、不触发正式事件绑定副作用。

---

### Task 1: 修复视觉入口与视觉设置保存

**Files:**
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/routes/settings-visual-assets-page.js`
- Modify: `tests/node/settings-visual-route.test.mjs`
- Modify: `tests/node/visual-asset-page.test.mjs`

**Interfaces:**
- `renderVisualSettingsPage(currentUrl, initialData)` 必须输出可到达的素材库按钮链接。
- 视觉页新增 `POST /visual-settings-update` 的明确保存动作，提交 `collect()` 结果。
- 保存成功后更新页面状态、revision、persistence 状态。

- [x] 写测试：断言“管理视觉素材”是按钮式控件，目标链接在 `/api/plugins/<id>/...` 挂载路径下指向 `/visual-assets-page`。
- [x] 写测试：断言视觉页包含全局保存按钮，并且脚本提交 `global.defaultMode`。
- [x] 运行 focused tests，先确认新增断言失败。
- [x] 修复素材入口，使用页面内 Router 加载 `visual-assets-page`，避免普通相对路径落到宿主 404。
- [x] 将全局开关和默认模式纳入 `collect()`，增加“保存视觉设置”按钮及成功/失败反馈。
- [x] 运行 focused tests 和 `npm run check`。

---

### Task 2: 折叠式视觉配置骨架与统一底部卡片

**Files:**
- Modify: `plugin/routes/settings-visual.js`
- Modify: `tests/node/settings-visual-route.test.mjs`

**Interfaces:**
- `pipelineLevel()` 输出可折叠的 `<details>` / `<summary>` 结构。
- “卡片属性”“皮肤”“特效”默认折叠，用户点击对应标题后才展开。
- 配置包、预览测试、应用于事件、视觉诊断都使用统一的 section card 视觉结构。

- [x] 写测试：断言三个长面板使用折叠语义，且顶部配置层仍保留行为、类型和预览。
- [x] 运行 focused test，确认当前输出不满足折叠结构。
- [x] 改造 `pipelineLevel()`，保留 nested 层级语义，给 summary 提供展开箭头。
- [x] 将底部 section 从无背景的连续文本改为统一 panel/card，统一标题、说明、操作区、反馈区和间距。
- [x] 运行 focused tests 和 `npm run check`。

---

### Task 3: 配置包实时刷新与安全删除

**Files:**
- Modify: `plugin/domain/visual-profile-registry.js`
- Modify: `plugin/index.js`
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/routes/settings.js`
- Create or modify: `tests/node/visual-profile-binding-registry.test.mjs`
- Modify: `tests/node/settings-visual-route.test.mjs`

**Interfaces:**
- 新增 Plugin API：`removeVisualProfile(profileId)`。
- 删除返回 `{ removed, visualRevision }`；默认 `visual.default` 返回受保护错误；仍有事件引用时返回 `VISUAL_PROFILE_REGISTRY_IN_USE`。
- 视觉页保存成功后调用 `refreshProfiles()` 重绘配置包列表、下拉框和删除按钮。

- [x] 写 registry/API 测试：默认配置受保护、被引用配置拒绝删除、未引用本地配置可删除。
- [x] 写 route/API 测试：删除成功、404、409 错误映射正确。
- [x] 运行测试，确认 API 尚不存在或页面不刷新。
- [x] 在 registry/API 层实现受保护删除。
- [x] 在视觉页配置包列表加入“删除”按钮与二次点击确认，保存成功后重新加载列表。
- [x] 运行 focused tests 和 `npm run check`。

---

### Task 4: 独立视觉诊断卡片

**Files:**
- Modify: `plugin/index.js`
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/routes/settings.js`
- Modify: `tests/node/settings-visual-route.test.mjs`
- Modify: `tests/node/plugin-visual-api.test.mjs`

**Interfaces:**
- `getVisualSettingsStatus()` 返回有限的 `visualDiagnostics`：最近配置保存、配置包保存/删除、视觉测试、真实卡片创建/更新/消失的结构化结果。
- 新增 `clearVisualDiagnostics()` 与 `exportVisualDiagnostics()`，格式与声音诊断保持一致但只包含视觉信息。
- 诊断不包含原始通知正文、文件绝对路径和敏感运行时数据。

- [x] 写测试：视觉状态包含有限诊断列表和清理/导出 API。
- [x] 运行 focused tests，确认接口缺失。
- [x] 增加视觉诊断记录器和页面卡片，显示状态、阶段、事件、Profile、Native 操作结果与失败原因。
- [x] 增加刷新、清空、导出操作。
- [x] 运行 focused tests 和 `npm run check`。

---

### Task 5: 真实预览卡片与视觉实验台

**Files:**
- Modify: `plugin/index.js`
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/domain/notification-test-generator.js`（仅在需要独立实验事件定义时）
- Modify: `tests/node/plugin-visual-api.test.mjs`
- Modify: `tests/node/settings-visual-route.test.mjs`
- Add focused runtime/API tests for `scene.create`, `scene.update`, `scene.dismiss`

**Interfaces:**
- 新增 Plugin API：`openVisualWorkbenchCard(input)`、`updateVisualWorkbenchCard(input)`、`closeVisualWorkbenchCard(input)`。
- 实验台卡片 ID 使用独立前缀，例如 `nh-visual-workbench-...`，不进入 `notificationStore`。
- 支持 `phase: enter | hold | exit`；`enter` 创建真实卡片，`hold` 更新真实卡片，`exit` 关闭真实卡片。
- 修改配置时，优先调用 `scene.update` 更新同一张真实卡片；若卡片不存在才重新创建并记录诊断。

- [x] 写 API 测试：Runtime 可用时依次发出 create/update/dismiss；不会写通知记录。
- [x] 写页面测试：出现“打开卡片实验台”入口、三个阶段按钮和独立状态反馈。
- [x] 运行测试，确认接口和控件缺失。
- [x] 使用现有 `notificationCardPayload` / `projectNativeVisualPayload` 生成真实卡片 payload，复用现有 Native 通道，不引入新协议。
- [x] 将页面配置变化后同步到实验台卡片；离开视觉页时主动 dismiss。
- [x] 运行 focused tests 和 `npm run check`。

---

### Task 6: 预览测试改为声音实验台式真实链路

**Files:**
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/index.js`
- Modify: `tests/node/settings-visual-route.test.mjs`
- Modify: `tests/node/plugin-visual-api.test.mjs`

**Interfaces:**
- 预览测试提供事件多选、生成数量、间隔和“生成真实卡片”按钮。
- 默认事件来自 `NOTIFICATION_TEST_EVENTS`，结果显示生成数、卡片创建数、失败事件和视觉诊断。
- 请求强制 `playSound: false`，测试元数据强制 `test: true`、`testCreateCards: true`，不修改视觉绑定。

- [x] 写页面/API 测试：事件选择和数量参数传递到 `runNotificationTest`，不再固定全量事件。
- [x] 运行 focused tests，确认当前页面只有数量输入。
- [x] 增加事件多选与测试结果卡片，复用声音实验台的结构密度和反馈方式。
- [x] 运行 focused tests 和 `npm run check`。

---

### Task 7: 全量验收、打包与人工验证清单

**Files:**
- Modify: `docs/superpowers/plans/2026-08-21-visual-quality-round-1.md`
- Modify: `docs/superpowers/plans/2026-08-21-visual-page-redesign.md`（仅同步入口状态，不重写历史）

- [x] 运行全部视觉 focused tests。
- [x] 运行 `npm run check`。
- [x] 运行全量 `npm test`，记录已有 `plugin-lifecycle` 失败，不将其误报为本轮回归。
- [x] 重新生成 `dist/notification-hub-vnext-0.1.4.zip`。
  - 180 条目
  - SHA256: `7CA71FF2305BFCE0F0525A93A03BD69D0AC04B106ACACCFF64A8ED8682CC958C`
- [x] 校验 ZIP 包含视觉页、视觉素材页、视觉 API 和 Runtime 文件。
- [x] 输出人工验证清单：素材入口、折叠、全局保存、配置包刷新/删除、诊断卡片、实验台三阶段、事件测试。

---

## Design Skeleton

```text
通知视觉
├── 顶部状态
│   ├── 全局视觉开关
│   ├── 默认视觉效果
│   └── 保存视觉设置
├── 卡片实验台
│   ├── 打开卡片实验台
│   ├── 入场
│   ├── 持续 / 更新
│   └── 消失
├── 视觉管道
│   ├── 卡片行为
│   ├── 卡片种类
│   ├── 卡片属性 [折叠]
│   ├── 皮肤 [折叠]
│   │   └── 管理视觉素材
│   ├── 特效 [折叠]
│   └── 预览摘要
├── 保存为配置包
│   ├── 保存 / 冲突处理
│   ├── 已自定义配置包
│   └── 删除未引用配置包
├── 预览测试
│   ├── 选择事件
│   ├── 生成数量
│   ├── 间隔
│   └── 真实链路测试
├── 应用于事件
│   ├── 配置包
│   ├── 事件
│   └── 预览影响 / 应用
└── 视觉诊断
    ├── 最近结果
    ├── 刷新 / 清空 / 导出
    └── 结构化错误详情
```
