# 阶段四：分类视觉策略实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本项目不执行 Git commit；每个任务仍必须独立完成测试、检查和证据记录。

**Goal:** 将阶段二的冻结通知分类投影接入受控视觉 preset，使新产生的桌面通知卡片获得可解释、可回退、可独立配置的分类视觉策略，并完成真实 Hana 验收。

**Architecture:** 视觉配置继续由独立 `VisualSettingsStore` 管理，通知场景创建时消费同一份 `createNotificationPresentationInput()` 产生的分类事实，不重新从正文猜测。视觉 resolver 只输出受控的 preset/intensity/visual enabled 语义，Native Runtime 仍只接收现有安全的卡片字段；本阶段不引入模式、任意 CSS、HTML、粒子、坐标或动画 DSL。

**Tech Stack:** Node.js ESM、原生 JavaScript、Node test runner、Hono 风格插件 routes、现有 NotificationApi、Windows-first Native Runtime。

## Global Constraints

- 阶段四完成后不开始模式制作；下一阶段先细磨声音与视觉。
- 保护 alpha.8 Native Runtime、阶段一页面稳定、阶段二分类和阶段三声音真实 Hana 验收结果。
- 首批分类固定为 `chat`、`channel`、`tool`、`error`、`plugin`，输入只来自现有 PresentationPlan 和分类投影。
- 视觉配置与声音配置独立持久化；视觉 resolver 不修改声音决策。
- 只允许受控 preset：`minimal`、`soft`、`accent`、`warning`、`critical`；不开放任意 CSS、HTML、文件路径、Runtime 坐标、粒子数量或动画脚本。
- 规则只支持结构化字段和明确的 AND 匹配；不实现任意 DSL、NOT、正文关键词和正则。
- 多标签通知只产生一个最终视觉决策，使用固定分类优先级；critical 重要性覆盖普通分类 preset。
- 全局视觉关闭是绝对边界；视觉策略失败必须回退到默认 preset，通知创建不能因此失败。
- 页面内部导航继续复用当前 iframe，不新增 Page surface，不使用跨 surface 普通链接。
- 源码修改使用结构化 `read` / `edit` / `write`；Shell 仅用于测试、检查、构建和打包；不执行 Git commit。
- 完成前运行 focused、全量 `npm test`、`npm run check`、`git diff --check`、打包验证，并进行真实 Hana 页面与通知卡片验收。

## 文件职责地图

### 新增

- `plugin/domain/visual-rule-resolver.js`：消费冻结 `visualInput`、视觉 profile 和上下文，选择一个最终视觉策略并返回命中分类、preset、intensity、enabled 和回退解释。
- `tests/node/visual-rule-resolver.test.mjs`：覆盖全局/分类、多标签优先级、critical 覆盖、全局关闭、无效 profile 回退、输入不变和深冻结。

### 修改

- `plugin/domain/notification-presentation-plan.js`：确认 `visualInput` 携带 `labels`、`status`、`importance`，并补充必要的 `importance` 回退；不携带任意样式或 Runtime 参数。
- `tests/node/notification-presentation-plan.test.mjs`：补充视觉输入重要性、分类、深冻结和输入不变回归。
- `plugin/index.js`：接入视觉 resolver；新通知进入 `showNotificationScene()` 前生成视觉 decision，并将受控的 `visual` 字段放入 Runtime 卡片请求；视觉决策失败记录 bounded diagnostic 并使用默认回退。
- `tests/node/plugin-lifecycle.test.mjs`：覆盖新通知使用分类视觉 preset、critical 覆盖、全局视觉关闭和 resolver 失败回退。
- `plugin/routes/settings-visual.js`：如果当前预览只返回基础 preset，补充最终命中分类、intensity、回退状态和真实 profile 状态；保持现有页面布局与 iframe 脚本。
- `tests/node/settings-visual-route.test.mjs`：覆盖视觉预览结果字段和页面反馈，不改变已有布局断言。
- `plugin/routes/settings.js`：仅在已有设置 API 边界需要时暴露视觉策略状态，不创建新 Page surface。
- `CURRENT-STATUS.md`：写入每个垂直切片的自动化证据、阶段四真实 Hana 验收结果，以及“模式制作未开始、下一步细磨声音与视觉”的路线结论。
- `notification-hub-vnext-plan.md`：补充阶段四受控 preset、单一最终视觉决策、回退与阶段四后细磨顺序。

---

### Task 1：冻结视觉输入契约

**Files:**
- Modify: `plugin/domain/notification-presentation-plan.js`
- Test: `tests/node/notification-presentation-plan.test.mjs`

**Interface:**

```js
visualInput: Readonly<{
  labels: readonly string[],
  status: string,
  importance: 'low'|'normal'|'high'|'critical'
}>;
```

- [ ] **Step 1: 写失败测试**

增加测试：给定 `record.importance = 'critical'`，断言 `visualInput.importance === 'critical'`；缺省重要性断言回退为 `normal`；输出和输入深冻结。

- [ ] **Step 2: 运行 focused 测试确认失败**

```powershell
node --test tests/node/notification-presentation-plan.test.mjs
```

Expected：新增断言失败，现有 visualInput 没有 `importance`。

- [ ] **Step 3: 最小修改实现**

在 `createNotificationPresentationInput()` 的 `visualInput` 中加入：

```js
importance: record.importance ?? 'normal'
```

继续复用已有 `freezeDeep()`，不把完整 record、metadata、CSS 或 Runtime 参数放入 visualInput。

- [ ] **Step 4: 运行 focused 测试**

```powershell
node --test tests/node/notification-presentation-plan.test.mjs
```

Expected：全部通过。

---

### Task 2：实现视觉 resolver

**Files:**
- Create: `plugin/domain/visual-rule-resolver.js`
- Test: `tests/node/visual-rule-resolver.test.mjs`

**Interface:**

```js
export const VISUAL_CATEGORY_PRIORITY = Object.freeze([
  'error', 'tool', 'channel', 'chat', 'plugin'
]);

export function resolveVisualRule({ visualInput, profile, context = {} } = {}): Readonly<{
  enabled: boolean,
  preset: 'minimal'|'soft'|'accent'|'warning'|'critical',
  intensity: 'reduced'|'balanced'|'expressive',
  category: string|null,
  matchedBy: 'global'|'category'|'critical'|'fallback',
  reason: string
}>;
```

Rules:

- `visualInput.labels` 内部按 `VISUAL_CATEGORY_PRIORITY` 只选一个主分类。
- `visualInput.importance === 'critical'` 时强制 `preset: 'critical'`，除非 `context.globalEnabled === false`。
- `context.globalEnabled === false` 返回 `{ enabled:false, preset:'minimal', intensity:'reduced', category:null, matchedBy:'global', reason:'global-disabled' }`。
- profile 非法或 resolver 输入非法时，不让通知流程抛出；由 `resolveVisualRuleSafe()` 返回默认回退结果并带 `reason:'fallback-invalid-profile'`。
- 输出深冻结；不携带任意 CSS、路径、坐标或 Runtime 字段。

- [ ] **Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVisualRule } from '../../plugin/domain/visual-rule-resolver.js';

const profile = {
  global: { enabled: true, preset: 'minimal', intensity: 'balanced' },
  categories: {
    chat: { enabled: true, preset: 'soft', intensity: 'balanced' },
    error: { enabled: true, preset: 'warning', intensity: 'expressive' }
  }
};

test('critical has one deterministic visual decision', () => {
  const result = resolveVisualRule({
    visualInput: { labels: ['error', 'tool'], status: 'failed', importance: 'critical' },
    profile
  });
  assert.deepEqual(result, {
    enabled: true,
    preset: 'critical',
    intensity: 'expressive',
    category: 'error',
    matchedBy: 'critical',
    reason: 'critical-override'
  });
});

test('global mute disables visual output absolutely', () => {
  const result = resolveVisualRule({
    visualInput: { labels: ['error'], status: 'failed', importance: 'critical' },
    profile,
    context: { globalEnabled: false }
  });
  assert.equal(result.enabled, false);
  assert.equal(result.reason, 'global-disabled');
});
```

- [ ] **Step 2: 运行 RED**

```powershell
node --test tests/node/visual-rule-resolver.test.mjs
```

Expected：FAIL，因为 resolver 文件尚不存在。

- [ ] **Step 3: 写最小实现**

实现输入校验、profile 规范化、固定分类优先级、critical 覆盖、全局关闭和安全回退；复用 `createVisualProfile()`，不复制 preset 白名单。

- [ ] **Step 4: 运行 GREEN**

```powershell
node --test tests/node/visual-rule-resolver.test.mjs
```

Expected：全部通过。

---

### Task 3：把视觉 decision 接入通知桌面卡片

**Files:**
- Modify: `plugin/index.js`
- Test: `tests/node/plugin-lifecycle.test.mjs`

**Interface:**

在 `showNotificationScene(record)` 内部生成：

```js
const visual = resolveVisualRule({
  visualInput: presentation.visualInput,
  profile: this.visualSettingsStore.getSnapshot().settings.profile,
  context: { globalEnabled: this.visualSettingsStore.getSnapshot().settings.profile.global.enabled }
});
```

Runtime 请求中的视觉字段只允许：

```js
visual: {
  enabled: Boolean,
  preset: string,
  intensity: string,
  category: string|null
}
```

- [ ] **Step 1: 写失败测试**

扩展 FakeAdapter 的请求记录，创建 `chat`、`error`、`critical` 通知，断言 Runtime `scene.create` 请求各自只携带一个视觉 decision：

```js
assert.equal(request.payload.card.visual.preset, 'soft');
assert.equal(criticalRequest.payload.card.visual.preset, 'critical');
assert.equal(Object.keys(request.payload.card.visual).sort().join(','), 'category,enabled,intensity,preset');
```

同时增加全局视觉关闭测试，断言 `visual.enabled === false` 且通知创建仍成功。

- [ ] **Step 2: 运行 RED**

```powershell
node --test tests/node/plugin-lifecycle.test.mjs
```

Expected：新增断言失败，因为当前 scene card 没有 visual 字段。

- [ ] **Step 3: 最小接入实现**

在通知场景创建的单一入口调用 `createNotificationPresentationInput()` 和 `resolveVisualRule()`；不要在场景创建处重新从正文或 type 猜分类。视觉 Store 读取失败时记录 `VISUAL_RULE_FALLBACK`，使用默认 decision，继续创建通知卡片。

- [ ] **Step 4: 运行 focused 测试**

```powershell
node --test tests/node/plugin-lifecycle.test.mjs tests/node/visual-rule-resolver.test.mjs tests/node/notification-presentation-plan.test.mjs
```

Expected：全部通过，声音相关测试保持通过。

---

### Task 4：完善视觉预览与设置反馈

**Files:**
- Modify: `plugin/index.js`, `plugin/routes/settings-visual.js`
- Test: `tests/node/settings-visual-route.test.mjs`

- [ ] **Step 1: 写失败测试**

断言 `previewVisualSettings()` 返回：

```js
{ decision: { enabled, preset, intensity, category, matchedBy, reason } }
```

页面静态回归继续确认：当前 iframe fetch、状态节点、保存反馈和无 `document.open()`。

- [ ] **Step 2: 运行 RED**

```powershell
node --test tests/node/settings-visual-route.test.mjs
```

Expected：新增 decision 字段断言失败。

- [ ] **Step 3: 最小实现**

让 `previewVisualSettings()` 复用 `resolveVisualRule()`；页面将后端返回的 `intensity`、命中分类和 reason 写入最终生效预览，不新增独立页面或重复规则。

- [ ] **Step 4: 运行 GREEN**

```powershell
node --test tests/node/settings-visual-route.test.mjs tests/node/visual-rule-resolver.test.mjs
```

Expected：全部通过。

---

### Task 5：阶段四回归、打包与真实 Hana 验收

**Files:**
- Modify: `CURRENT-STATUS.md`, `notification-hub-vnext-plan.md`
- Build: `dist/notification-hub-vnext-0.1.0-alpha.11.zip`

- [ ] **Step 1: focused 验证**

```powershell
node --test tests/node/visual-rule-resolver.test.mjs tests/node/notification-presentation-plan.test.mjs tests/node/plugin-lifecycle.test.mjs tests/node/settings-visual-route.test.mjs tests/node/notification-center-route.test.mjs
```

- [ ] **Step 2: 全量验证**

```powershell
npm test
npm run check
git diff --check
```

Expected：0 failed；Runtime 相关测试的环境跳过保持原状。

- [ ] **Step 3: 打包与 hash**

```powershell
& .\scripts\package-release.ps1 -Configuration Release
Get-FileHash .\dist\notification-hub-vnext-0.1.0-alpha.11.zip -Algorithm SHA256
```

- [ ] **Step 4: 真实 Hana 验收**

重载包后验证：

1. 设置 → 通知视觉无 404；
2. 全局视觉开关保存并恢复；
3. 分类 preset 独立保存；
4. 预览显示命中分类、preset 和 intensity；
5. 创建聊天、工具、错误、critical 通知，桌面卡片只携带一个受控 visual decision；
6. 关闭全局视觉后通知仍创建但 visual.enabled 为 false；
7. 快速切换设置/声音/通知视觉不报错；
8. 已确认的声音试听、通知中心、Widget 深链接和 Runtime/Shelf 不回归。

- [ ] **Step 5: 更新证据**

在 `CURRENT-STATUS.md` 记录：

```text
阶段四分类视觉策略真实 Hana 验收通过/未通过；
模式制作未开始；
下一步为细磨声音与视觉；
```

不要把“阶段四完成”写成复杂动画、粒子或主题系统已完成。
