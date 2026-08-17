# 声音实验台与规则解释器实施计划

> **For agentic workers:** 本计划按两个垂直切片实施：先建立安全、可复现的声音实验台，再建立基于同一决策结果的规则解释器。每个任务结束后运行对应测试；不执行 Git commit。

**Goal:** 在声音设置页提供可控的正式链路实验入口，并让用户能够查看一次声音决策为何播放、跳过、合并或失败。

**Architecture:** 实验台使用现有 `previewSoundSettings()`、`testSoundSettings()`、`soundScheduler`、Windows backend 和 `soundDiagnostic`，增加一层显式的实验场景 API，不复制播放逻辑。规则解释器读取 resolver 返回的决策、输入、诊断和 profile 层信息，使用独立的纯函数生成安全、可读的解释对象；页面只渲染解释对象，不在浏览器端重复判断规则。

**Tech Stack:** Node.js ESM、Node test runner、Hono route、Hana iframe 页面、现有 SoundSettingsStore / SoundScheduler / Windows audio backend。

## Global Constraints

- Windows-first，保护 Native Runtime alpha.8 稳定基线。
- 全局静音绝对生效；实验台不能绕过全局静音。
- 实验台必须复用正式声音调度路径，不新增测试专用播放器。
- 规则解释器不得重新实现声音匹配逻辑，必须使用正式 resolver 结果。
- 实验事件不得写入 Notification Store 或通知历史；声音诊断可记录为 `sound-workbench` 来源。
- 诊断和解释不得泄露绝对路径、原始正文、API Key、PowerShell 脚本或音频数据。
- 源码修改使用 `read` / `edit` / `write`；Shell 仅用于测试、检查和打包。
- 不执行 Git commit。

---

### Task 1: 声音规则解释纯函数

**Files:**
- Create: `plugin/domain/sound-rule-explanation.js`
- Test: `tests/node/sound-rule-explanation.test.mjs`

**Interfaces:**
- Consumes: `input`, `decision`，可选 `diagnostic`。
- Produces: `createSoundRuleExplanation({ input, decision, diagnostic })`，返回深冻结的安全解释对象。

- [ ] **Step 1: Write the failing test**

覆盖以下结果：

```js
const explanation = createSoundRuleExplanation({
  input: { labels: ['model_service', 'error'], event: 'model_service_error', importance: 'critical' },
  decision: {
    play: true,
    cue: 'warning',
    volume: 0.56,
    volumeLayers: { global: 0.8, category: 0.7, rule: 1, final: 0.56 },
    matchedRuleId: 'model-service-critical',
    matchedBy: 'rule',
    reason: 'allowed',
    suppressDuplicates: true
  }
});
assert.equal(explanation.outcome, 'play');
assert.equal(explanation.reasonCode, 'allowed');
assert.equal(explanation.matchedRuleId, 'model-service-critical');
assert.equal(explanation.volume.final, 0.56);
assert.match(explanation.summary, /播放/);
assert.equal(Object.isFrozen(explanation), true);
```

同时覆盖 `global-disabled`、`policy-disabled`、`duplicate-suppressed`、`merged`、`failed`，并断言输入中的路径、正文和任意未知字段不会进入结果。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/node/sound-rule-explanation.test.mjs`
Expected: FAIL because `plugin/domain/sound-rule-explanation.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

实现以下固定契约：

```js
createSoundRuleExplanation({ input, decision, diagnostic = null })
// => {
//   outcome: 'play' | 'skip' | 'merge' | 'fail' | 'unavailable',
//   reasonCode: string | null,
//   summary: string,
//   labels: string[],
//   event: string | null,
//   importance: string | null,
//   matchedBy: string | null,
//   matchedRuleId: string | null,
//   sound: { soundId: string | null, cue: string | null },
//   volume: { global: number|null, category: number|null, rule: number|null, final: number|null },
//   policy: { suppressDuplicates: boolean, bypassed: boolean },
//   scheduling: { status: string|null, soundKey: string|null } | null,
//   playback: { attempted: boolean, played: boolean, diagnostic: string|null } | null
// }
```

仅允许固定字段、有限字符串和数值范围；根据 `diagnostic.scheduling.status` 与 `diagnostic.playback` 映射最终 outcome。`summary` 使用固定中文文案，不拼接原始错误正文或路径。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/node/sound-rule-explanation.test.mjs`
Expected: PASS。

---

### Task 2: 将规则解释接入插件 API

**Files:**
- Modify: `plugin/index.js:112-151,1232-1268,400-424`
- Test: `tests/node/settings-effective-preview.test.mjs`

**Interfaces:**
- Consumes: `createSoundRuleExplanation()` 与现有 `previewSoundSettings()`。
- Produces: `plugin.explainSoundSettings(input)`，返回 `{ input, decision, explanation }`，不播放、不写通知历史。

- [ ] **Step 1: Write the failing test**

```js
const result = plugin.explainSoundSettings({ labels: ['plugin'], event: 'arrived', importance: 'normal' });
assert.equal(result.explanation.outcome, 'skip');
assert.equal(result.explanation.reasonCode, 'policy-disabled');
assert.equal(result.explanation.matchedBy, 'category');
assert.equal(Object.isFrozen(result.explanation), true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/node/settings-effective-preview.test.mjs`
Expected: FAIL because `explainSoundSettings` is undefined。

- [ ] **Step 3: Write minimal implementation**

在插件构造的 API 暴露表中加入 `explainSoundSettings`。方法调用 `previewSoundSettings(input)`，再调用纯函数生成解释。不要从页面传入 profile，不要在插件方法内复制 `resolveSoundRule()` 逻辑。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/node/settings-effective-preview.test.mjs tests/node/sound-rule-explanation.test.mjs`
Expected: PASS。

---

### Task 3: 声音实验台正式入口

**Files:**
- Modify: `plugin/index.js:400-424`
- Test: `tests/node/plugin-lifecycle.test.mjs`

**Interfaces:**
- Consumes: `testSoundSettings()`、`explainSoundSettings()`、正式 `soundScheduler`。
- Produces: `plugin.runSoundWorkbench(input)`，返回 `{ scenario, runs, explanation }`，每次运行都进入正式 scheduler；不进入 Notification Store。

- [ ] **Step 1: Write the failing test**

覆盖：

```js
const result = await plugin.runSoundWorkbench({
  input: { labels: ['chat'], event: 'arrived', importance: 'normal' },
  count: 2,
  intervalMs: 0
});
assert.equal(result.scenario, 'single-input');
assert.equal(result.runs.length, 2);
assert.equal(result.runs[0].input.event, 'arrived');
assert.equal(plugin.getNotificationHistory().length, 0);
assert.equal(plugin.getSoundSettingsStatus().soundDiagnostics.at(-1).source, 'sound-workbench');
```

另外覆盖数量上限、`intervalMs` 范围、无效 input、全局静音仍返回两个 `skipped` 结果且 backend 调用数为 0。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/node/plugin-lifecycle.test.mjs`
Expected: FAIL because `runSoundWorkbench` is undefined。

- [ ] **Step 3: Write minimal implementation**

新增安全归一化：`count` 仅允许 1～20，`intervalMs` 仅允许 0～2000，输入复用 `normalizeSoundPreviewInput()`。每次运行：

1. 调用 `previewSoundSettings()`。
2. 若全局静音，返回正式 `skipped`，不能强制放行。
3. 其余情况使用与 `testSoundSettings()` 相同的 scheduler，但传入 `source: 'sound-workbench'`，不绕过策略。
4. 调用 `createSoundRuleExplanation()` 生成每次结果。
5. 通过现有 `recordSoundDiagnosticEvent()` 记录，限制结果数量。

不允许写通知 Store，不允许接受任意原始 event 对象，不允许让实验台绕过全局静音。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/node/plugin-lifecycle.test.mjs tests/node/settings-effective-preview.test.mjs tests/node/sound-rule-explanation.test.mjs`
Expected: PASS。

---

### Task 4: 路由与声音设置页接入

**Files:**
- Modify: `plugin/routes/settings.js:20-42,323-342`
- Modify: `plugin/routes/settings-sound.js:1-10,120-172`
- Test: `tests/node/settings-route.test.mjs`
- Test: `tests/node/settings-sound-route.test.mjs`

**Interfaces:**
- Consumes: `explainSoundSettings()` 与 `runSoundWorkbench()`。
- Produces: `POST /sound-rule-explain`、`POST /sound-workbench-run`；声音页面增加实验台面板、规则解释面板和结果列表。

- [ ] **Step 1: Write the failing test**

路由 harness 增加插件 mock：

```js
explainSoundSettings(input) { calls.push(['sound-explain', input]); return { explanation: { outcome: 'skip' } }; },
async runSoundWorkbench(input) { calls.push(['sound-workbench', input]); return { scenario: 'single-input', runs: [] }; }
```

断言两个 POST 路由返回 `ok: true`，并把 JSON body 原样传给对应插件方法；页面 HTML 包含“声音实验台”“规则解释”和两个按钮/结果容器。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/node/settings-route.test.mjs tests/node/settings-sound-route.test.mjs`
Expected: FAIL because routes and page markers do not exist。

- [ ] **Step 3: Write minimal implementation**

路由仅做 JSON 读取、插件能力检查和安全错误映射；输入校验由插件方法负责。页面使用现有 Hana API 请求模式，实验台只提供有限下拉选项：分类、事件、重要性、次数和间隔。规则解释按钮调用 `/sound-rule-explain`，实验台运行按钮调用 `/sound-workbench-run`。结果使用现有安全转义函数渲染，不展示原始通知正文、路径或音频数据。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/node/settings-route.test.mjs tests/node/settings-sound-route.test.mjs`
Expected: PASS。

---

### Task 5: 文档、全量验证和交付

**Files:**
- Modify: `README.md`
- Modify: `CURRENT-STATUS.md`
- Modify: `notification-hub-vnext-plan.md`（仅在现有声音阶段说明需要补充时修改）

- [ ] **Step 1: Update documentation**

记录：声音实验台是显式模拟入口，不代表真实 Hana EventBus 事件；规则解释器复用正式 resolver 和 diagnostic；实验事件不写通知历史；全局静音不可绕过。

- [ ] **Step 2: Run focused tests**

Run: `node --test tests/node/sound-rule-explanation.test.mjs tests/node/settings-effective-preview.test.mjs tests/node/plugin-lifecycle.test.mjs tests/node/settings-route.test.mjs tests/node/settings-sound-route.test.mjs`
Expected: 全部通过。

- [ ] **Step 3: Run full verification**

Run: `npm test`
Run: `npm run check`
Run: `npm run pressure -- --scenario all --count 1000`
Run: `git diff --check`
Expected: Node 测试无失败，语法检查通过，压力测试四场景通过，diff 无空白错误。

- [ ] **Step 4: Package and stage**

Run: `& .\\scripts\\package-release.ps1 -Configuration Release`
Then stage the changed source files, tests, docs and generated `dist\\notification-hub-vnext-0.1.0-alpha.15.zip` with `stage_files`。

- [ ] **Step 5: Final scope check**

确认未实现分类音色、渐进提醒、工作模式、夜间模式、声音包扩展、空间化声音或复杂混音；不执行 Git commit。
