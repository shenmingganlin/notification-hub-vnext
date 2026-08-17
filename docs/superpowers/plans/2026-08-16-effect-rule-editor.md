# Notification Hub 效果规则编辑器实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 将声音与视觉设置统一为“先选择效果，再选择作用事件”的规则编辑器，并保持旧分类/事件配置可读取、可回退。

**Architecture:** 以现有 `event-presentation-settings` 作为规则事实源，新增独立的 `soundRules` 与 `visualRules` 规则集合；每条规则包含稳定 id、启用状态、目标事件集合和对应效果配置。规则解析按精确事件优先，未命中时继续使用现有 global/category/event 兼容绑定。声音与视觉页面复用同一套事件目录和规则交互语义，声音音量保存在声音规则内，视觉预设和强度保存在视觉规则内。

**Tech Stack:** Node.js ESM、现有 Notification Hub 设置 Store、Hana iframe 页面、Node `node:test`。

## Global Constraints

- 只修改声音、视觉、事件表现设置相关文件，不修改已验收的通知中心筛选页面。
- 保持 `0.1.0-alpha.16`，不执行 Git commit。
- 旧 `global`、`categories`、`events` 和 `soundOverrides` 配置继续可读取；新规则未命中时必须安全回退。
- 规则目标只能引用 `presentationEligible: true` 的事件。
- 同一规则内多个事件为 OR；规则之间按优先级顺序选择首个命中规则。
- 第一版不引入规则 DSL，不支持任意表达式；只允许事件 ID 列表。
- 规则删除必须是可逆前端操作前的明确二次确认，后端删除只操作对应规则。

---

### Task 1：建立统一规则模型和解析函数

**Files:**
- Create: `plugin/domain/effect-rules.js`
- Create: `tests/node/effect-rules.test.mjs`
- Modify: `plugin/domain/event-presentation-settings.js`

**Interfaces:**

```js
createEffectRule(input, kind)
createEffectRules(input, kind)
upsertEffectRule(rules, rule, kind)
removeEffectRule(rules, ruleId, kind)
resolveEffectRule(rules, eventId, kind)
listEffectRuleTargets()
```

规则形状：

```js
{
  id: 'sound-rule-1',
  name: '工具失败提示',
  enabled: true,
  eventIds: ['tool.execution.failed', 'tool.execution.timed_out'],
  effect: { soundId: 'sound.tool.failed', volume: 0.72 }
}
```

视觉效果形状：

```js
{ preset: 'warning', intensity: 'balanced' }
```

- [x] 写失败测试：校验事件目标、声音音量、视觉预设、重复 id、删除和首个命中规则。
- [x] 运行 `node --test tests/node/effect-rules.test.mjs` 并确认模型实现通过。
- [x] 实现纯函数规则模型，使用事件目录校验目标，只允许可表现事件。
- [x] 在 `createEventPresentationSettings` 中读取并规范化 `soundRules`、`visualRules`。
- [x] 在 `updateEventPresentationSettings` 中支持两类规则的整体更新。
- [x] 运行 focused 测试确认通过：16/16。

### Task 2：增加规则级读写 API

**当前进度：** 已接入 Runtime Test API 和 `/effect-rules/:kind` GET/POST/DELETE 路由，focused route 测试通过。

**Files:**
- Modify: `plugin/index.js`
- Modify: `plugin/routes/settings.js`
- Modify: `tests/node/settings-events-route.test.mjs`
- Modify: `tests/node/settings-route.test.mjs`（仅必要契约）

**Interfaces:**

```js
getEffectRules(kind)
upsertEffectRule(kind, rule)
removeEffectRule(kind, ruleId)
```

- [ ] 先增加 API 测试，覆盖声音规则和视觉规则新增、更新、删除、未知事件拒绝。
- [ ] 实现 API，所有写入复用 event presentation Store 的持久化和 apply 流程。
- [ ] 增加 `GET/POST/DELETE /effect-rules/:kind` 路由，返回现有错误信封。
- [ ] 运行 focused route/API 测试。

### Task 3：声音页面改为“声音 → 音量 → 事件”编辑器

**Files:**
- Modify: `plugin/routes/settings-sound.js`
- Modify: `tests/node/settings-sound-route.test.mjs`

- [x] 增加事件目录分组和规则编辑器契约测试。
- [x] 页面提供声音选择、音量滑块、事件多选、保存规则。
- [x] 已有规则以卡片展示，并提供删除二次确认。
- [x] 音频资产导入、试听、删除和旧配置兼容区域保持可用。
- [x] 保存后只写入 `soundRules`，不破坏旧 `soundOverrides`。
- [x] 运行声音路由测试和语法检查。

### Task 4：视觉页面改为“视觉预设 → 强度 → 事件”编辑器

**Files:**
- Modify: `plugin/routes/settings-visual.js`
- Modify: `tests/node/settings-visual-route.test.mjs`

- [x] 增加视觉规则编辑器契约测试。
- [x] 页面提供预设、强度、事件多选、预览、保存规则。
- [x] 已有规则以卡片展示；规则删除有页面内二次确认。
- [x] 现有卡片行为与视觉细项保留在兼容/高级区域，不修改通知中心页面。
- [x] 运行视觉路由测试和语法检查。

### Task 5：接入最终表现解析与验证

**Files:**
- Modify: `plugin/domain/notification-presentation-selector.js`
- Modify: `plugin/domain/sound-rule-resolver.js`
- Modify: `plugin/domain/visual-rule-resolver.js`
- Create/Modify: focused resolver tests

- [x] 为声音和视觉 resolver 增加规则优先级测试。
- [x] 让 event presentation 规则在精确事件选择时覆盖旧分类规则；未命中保持旧回退链。
- [x] 保持重要性只作为策略输入，不新增第四层规则。
- [x] 运行全部 Node 测试：695 项，682 通过，13 跳过；`npm run check` 和 `git diff --check` 通过。

### Task 6：重新打包并交付真实验收包

**Files:**
- Modify: `CURRENT-STATUS.md`
- Generated: `dist/notification-hub-vnext-0.1.0-alpha.16.zip`

- [ ] 记录验证结果，不执行 Git commit。
- [ ] 运行 `scripts/package-release.ps1 -Configuration Release`。
- [ ] 校验 ZIP 根 manifest、Runtime 和 SHA256。
- [ ] 使用 `stage_files` 交付 ZIP。
