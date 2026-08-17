# 声音测试一致性与模型服务异常类别实施计划

> **给 Agentic Worker：** 上下文压缩后，必须先读取本计划、`notification-hub-vnext-plan.md`、`CURRENT-STATUS.md`；涉及页面或设置时追加读取 `SIDEBAR-PAGE-PRODUCT-PLAN.md` 与 `FRONTEND-DESIGN-GUIDELINES.md`。按任务顺序执行，每个任务完成后运行对应回归。不得执行 Git commit。

**Goal:** 先让声音设置页的“测试当前声音”复用正式通知声音调度策略，再为 Notification Hub 增加独立的“模型服务异常”用户类别，并同步通知分类、声音分组、视觉/设置筛选、诊断和 Hana 事件接缝。

**Architecture:** 声音测试方案采用用户确认的方案二：设置页测试使用正式 notification scheduler 和正式 notification backend，不再强制 `suppressDuplicates: false`，因此测试行为与真实通知一致。模型服务错误在用户层只暴露一个 `model_service` 类别；内部保留有限的 `httpStatus/provider/model/operation/retryable/incidentKey` 字段，用于诊断和连续错误聚合，不把 429、502、503 做成用户可配置类别。Hana 侧只有在确认存在稳定事件契约后才接入生产 EventBus；未确认前不伪造生产事件。

**Tech Stack:** Node.js ESM、`node:test`、HanaAgent PluginContext/EventBus、NotificationApi、sound rule resolver、sound scheduler、Windows PowerShell audio backend、现有 Hono route/iframe 页面。

## Global Constraints

- Windows-first；不得破坏 Native Runtime alpha.8 交互基线。
- 同一实际播放资源仅在播放 Promise active 期间合并；播放结束后立即允许再次播放；不同资源独立播放。
- 声音测试必须与真实通知使用同一套正式声音策略和正式 notification scheduler；全局静音必须绝对生效。
- 试听/测试不阻塞通知入库、Runtime 生命周期或插件卸载。
- 自定义音频只能来自受控 `sound-assets` 目录；诊断不得包含绝对路径、原始正文、PowerShell 脚本或音频数据。
- 模型服务错误用户层只增加一个独立类别 `model_service`，不暴露十几个 HTTP/Provider 子类别。
- 429、502、503 作为技术字段保存，不作为用户分类名称；缺少 Provider 原始错误码时不得猜测具体责任方。
- 连续模型错误必须按 incident 聚合，不能每次重试都新建卡片或重复播放声音。
- 未确认 Hana EventBus 的模型错误事件前，不得伪造“宿主已发送该事件”的验收结论。
- 源码修改只使用 `read`/`edit`/`write`；Shell 只用于测试、检查、构建和打包。
- 不执行 Git commit；文件交付必须使用 `stage_files`。

---

## 当前证据与边界

### 已确认的声音问题

- 真实通知路径已经可以按 active 播放状态抑制。
- 设置页 `testSoundSettings()` 当前显式写入 `suppressDuplicates: false`，因此测试永远绕过重复抑制。
- 设置页测试使用独立 `soundPreviewScheduler`，且 `await` 单次播放完成；即使删除 `false`，串行点击也不能构造“播放中第二次请求”的测试。
- 用户已明确选择方案二：声音测试直接复用正式通知调度策略。
- 当前生产 scheduler 已支持 `keyOf`；Windows 全音量内置 cue 已按实际 media resource 归并，最新 Release SHA256 为 `B7A4902D5A6F860B7BF53F61BEA195A257378969923ED351A5BAFE62D504EDF6`，但本计划执行后必须重新打包。

### 已确认的 Hana 错误证据

- Hana 日志 `2026-08-15_15-03-28.log` 记录了：15:05、15:06、15:08 的 502，以及 15:11、15:12、15:16 的 `Service temporarily unavailable`。
- 失败来源是 `[memory-ticker]` / `[memory]` 的滚动摘要请求；主对话仍能完成部分 turn。
- 目前这些错误没有进入 `notification-store.json`。
- 当前 notification-event-adapter 支持 `message_end`、`tool_execution_end`、频道、DM、两类系统 warning，但没有通用模型服务错误事件接缝。
- Hana 公开 README/PLUGINS 文档能确认 Provider、Model、EventBus 和 Pi extension 架构，但尚未找到稳定公开的 `model_service_error` EventBus payload 契约。

---

## 计划中的统一模型服务错误契约

用户层统一类别：

```js
{
  type: 'model_service_error',
  title: '模型服务异常',
  content: '模型服务暂时不可用，当前后台任务未完成，系统会稍后继续尝试。',
  importance: 'high',
  source: 'hana.model',
  classification: 'model_service'
}
```

内部安全 metadata 只保留有限字段：

```js
{
  errorDomain: 'model_service',
  httpStatus: 503,
  provider: 'provider-id-or-null',
  model: 'model-id-or-null',
  operation: 'memory_summary',
  retryable: true,
  retryAfterMs: null,
  incidentKey: 'model_service|provider|model|operation',
  attempt: 4
}
```

不保存：API Key、Authorization、完整 prompt、完整 provider response、绝对路径。

内部归因只使用有限的稳定 reason：

```text
configuration
capacity
availability
transport
unknown
```

reason 不是用户设置分类；用户始终看到“模型服务异常”。

---

## Task 1: 冻结声音测试方案并补失败回归 ✅

**Files:**
- Modify: `plugin/index.js:1180-1198`（声音资产测试）
- Modify: `plugin/index.js:1270-1305`（当前声音测试）
- Test: `tests/node/plugin-lifecycle.test.mjs`
- Test: `tests/node/custom-sound-configuration.test.mjs`
- Test: `tests/node/sound-scheduler.test.mjs`

**Interfaces:**
- Consumes: `this.soundScheduler`、`resolveSoundPlaybackKey()`、当前 `soundSettingsStore` snapshot。
- Produces: `testSoundSettings()` 和 `testSoundAsset()` 使用正式 notification scheduler；返回值保留 `decision`、`playback`、`testBypassedPolicy` 兼容字段，但 `decision.suppressDuplicates` 不得被测试路径强制改为 `false`。

- [ ] **Step 1: 写失败测试，证明当前声音测试绕过抑制**

在 `plugin-lifecycle.test.mjs` 中使用 pending backend，连续并发调用两次 `plugin.testSoundSettings({ labels: ['chat'], event: 'arrived', importance: 'normal' })`，断言修复前会出现两次 backend 调用且两个结果都是 `played`。

测试必须使用同一个插件实例和 pending `playCue`，不能 `await` 第一条后再发第二条：

```js
const first = plugin.testSoundSettings(input);
const second = plugin.testSoundSettings(input);
await flush();
assert.equal(calls.length, 2); // red: 当前 preview scheduler + suppressDuplicates:false
```

- [ ] **Step 2: 运行红测试**

Run:

```powershell
node --test tests/node/plugin-lifecycle.test.mjs --test-name-pattern "test.*suppression|声音测试.*抑制"
```

Expected: FAIL，当前两次测试都启动 backend。

- [ ] **Step 3: 改为正式 notification scheduler**

`testSoundSettings()`：

1. 保留 `previewSoundSettings()` 对输入和资产的解析。
2. 保留全局声音关闭的绝对跳过。
3. 删除 `suppressDuplicates: false` 覆盖。
4. 不再调用 `this.soundPreviewScheduler.schedule()`。
5. 使用 `this.soundScheduler.schedule(testDecision, context)`。
6. context 使用 `source: 'settings-test'` 和唯一 `stableKey`，但 stableKey 不参与声音 active merge。
7. 不要在测试入口强制把策略拒绝改成允许播放；方案二要求测试反映正式策略。若保留“测试当前声音”的显式用户动作绕过 `minImportance/quietMode`，必须把它限制在策略输入，不得绕过全局静音和 active 重复抑制。

目标代码形态：

```js
const testDecision = preview.decision;
const playback = this.soundScheduler.schedule(testDecision, {
  stableKey: `settings-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  source: 'settings-test',
  record: null,
  profile: snapshot.settings.profile,
  presentation: { soundInput: preview.input }
});
```

资产测试 `testSoundAsset()` 同样使用正式 `soundScheduler`，构造临时资产 decision 时只能替换 sound reference，不得设置 `suppressDuplicates:false`。

- [ ] **Step 4: 运行绿测试**

Run:

```powershell
node --test tests/node/plugin-lifecycle.test.mjs tests/node/custom-sound-configuration.test.mjs --test-name-pattern "声音测试|sound asset|suppression|抑制"
```

Expected: 第一条 `played`，第二条 active 期间 `merged`，backend 只有一次调用；全局声音关闭时零调用。

- [ ] **Step 5: 更新页面文案**

Modify `plugin/routes/settings-sound.js`：将“测试只试听当前选择”改为说明“测试当前声音策略，行为与真实通知一致；播放中的同类声音会被合并”。不要再把该入口描述成一定独立播放。

Test:

```powershell
node --test tests/node/settings-sound-route.test.mjs
```

---

## Task 2: 固化声音测试结果和 active 资源证据 ✅

**Files:**
- Modify: `plugin/index.js`（测试返回结构）
- Modify: `plugin/domain/sound-diagnostic.js`（如需增加 source/operation 安全字段）
- Test: `tests/node/sound-diagnostic.test.mjs`
- Test: `tests/node/plugin-lifecycle.test.mjs`

**Interfaces:**
- Consumes: Task 1 的正式 scheduler 结果。
- Produces: 测试返回 `playback.status`、`playback.soundKey`、`decision.suppressDuplicates`，不暴露路径或脚本。

- [ ] **Step 1: 增加失败断言**

要求测试结果可直接区分：

```js
assert.equal(first.playback.status, 'played');
assert.equal(second.playback.status, 'merged');
assert.equal(second.playback.soundKey?.startsWith('windows-media:') || true, true);
assert.equal(second.decision.suppressDuplicates, true);
```

- [ ] **Step 2: 实现安全返回**

仅返回现有 scheduler 结构化字段：`status`、`reason`、`soundKey`、`suppressDuplicates`。禁止返回自定义音频绝对路径、PowerShell 代码、通知正文。

- [ ] **Step 3: 运行 focused 回归**

```powershell
node --test tests/node/sound-diagnostic.test.mjs tests/node/plugin-lifecycle.test.mjs tests/node/custom-sound-configuration.test.mjs
```

---

## Task 3: 定义模型服务异常领域和双标签投影 ✅

**Files:**
- Modify: `plugin/domain/event-classifier.js`
- Modify: `plugin/domain/notification-classification.js`
- Modify: `plugin/domain/notification-presentation-plan.js`
- Modify: `plugin/domain/sound-profile.js`
- Modify: `plugin/domain/sound-rule-resolver.js`
- Test: `tests/node/event-classifier.test.mjs`
- Test: `tests/node/notification-classification.test.mjs`
- Test: `tests/node/notification-presentation-plan.test.mjs`
- Test: `tests/node/sound-profile.test.mjs`
- Test: `tests/node/sound-rule-resolver.test.mjs`

**Interfaces:**
- Consumes: 明确的 `model_service_error` 领域输入。
- Produces: `model_service` 用户类别；在通知筛选/展示层投影为 `system` 与 `error` 两个筛选标签；声音 profile 增加独立 `model_service` 策略，但不复制成两个独立声音类别。

- [ ] **Step 1: 写分类失败测试**

加入：

```js
const result = classifyEvent({
  type: 'model_service_error',
  httpStatus: 503,
  operation: 'memory_summary',
  retryable: true
});
assert.equal(result.action, 'notify');
assert.equal(result.classification, 'model_service');
assert.equal(result.importance, 'high');
```

再断言模型服务通知的 presentation labels 包含：

```js
['system', 'error', 'model_service']
```

其中 `model_service` 是声音/视觉策略身份，`system` 和 `error` 是用户筛选投影。

- [ ] **Step 2: 运行红测试**

```powershell
node --test tests/node/event-classifier.test.mjs tests/node/notification-classification.test.mjs tests/node/notification-presentation-plan.test.mjs tests/node/sound-profile.test.mjs tests/node/sound-rule-resolver.test.mjs --test-name-pattern "model_service|模型服务"
```

Expected: FAIL，当前分类和 profile schema 不认识该类别。

- [ ] **Step 3: 增加最小领域定义**

建议定义：

```js
const MODEL_SERVICE_CATEGORY = 'model_service';
const MODEL_SERVICE_LABELS = ['system', 'error', 'model_service'];
```

默认声音策略：

```js
model_service: {
  enabled: true,
  cue: 'warning',
  suppressDuplicates: true,
  minImportance: 'high'
}
```

不得修改全局静音边界、critical 边界或已有五类策略的默认行为。

- [ ] **Step 4: 实现筛选和展示投影**

模型服务通知必须同时满足：

- Notification Center 的系统筛选能找到它。
- Notification Center 的错误筛选能找到它。
- 声音设置页面能单独选择/查看 `model_service`。
- 视觉规则 resolver 能对 `model_service` 选择独立策略。
- 旧通知和旧 profile 仍能迁移，默认不改变已有五类配置。

- [ ] **Step 5: 运行绿测试**

```powershell
node --test tests/node/event-classifier.test.mjs tests/node/notification-classification.test.mjs tests/node/notification-presentation-plan.test.mjs tests/node/sound-profile.test.mjs tests/node/sound-rule-resolver.test.mjs --test-name-pattern "model_service|模型服务"
```

---

## Task 4: 定义模型服务错误安全规范化与事故聚合 ✅（已补充 active/recovered cycle 生命周期）

**Files:**
- Create: `plugin/domain/model-service-error.js`
- Modify: `plugin/domain/notification-deduplication.js`（仅在现有接口适配所需时）
- Modify: `plugin/api/notification-api.js`
- Test: `tests/node/model-service-error.test.mjs`
- Test: `tests/node/notification-api-deduplication-sound.test.mjs`

**Interfaces:**
- Produces: `normalizeModelServiceError(input)`、`createModelServiceIncidentKey(input)`、`getModelServiceUserCopy(input)`。

- [ ] **Step 1: 写规范化失败测试**

测试 429、502、503 和缺少 status：

```js
const error = normalizeModelServiceError({
  type: 'model_service_error',
  status: 503,
  provider: 'provider-x',
  model: 'model-y',
  operation: 'memory_summary',
  retryable: true,
  retryAfterMs: 1200
});
assert.equal(error.errorDomain, 'model_service');
assert.equal(error.httpStatus, 503);
assert.equal(error.retryable, true);
assert.equal(error.operation, 'memory_summary');
assert.equal(error.apiKey, undefined);
```

- [ ] **Step 2: 运行红测试**

```powershell
node --test tests/node/model-service-error.test.mjs
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现安全规范化**

规则：

- 只允许有限字符串长度。
- `httpStatus` 只接受整数 400～599，否则为 `null`。
- `operation` 默认 `unknown`。
- `retryable` 明确传入时优先；否则 429/502/503/504 默认 true，400/401/403/404 默认 false，其他为 null。
- 不能从任意错误 message 中复制完整响应体。
- `incidentKey` 使用 `model_service|provider|model|operation`，不得包含正文。
- 用户 copy 统一为“模型服务异常”，再根据 status 给简短建议。

- [ ] **Step 4: 接入 NotificationApi 的内部安全输入**

新增一个明确的 API 接缝，例如：

```js
notificationApi.ingestModelServiceError(errorInput)
```

它必须：

1. 规范化错误。
2. 生成 `model_service` 通知。
3. 把安全 metadata 写入 notification record。
4. 使用现有声音 resolver/scheduler。
5. 不把完整 provider response 写入卡片正文或诊断。

- [x] **Step 5: 实现事故聚合边界**

同一个 `incidentKey` 的连续错误不能每次创建独立用户提醒。最小实现可复用现有 notification deduplication，但必须让卡片仍能更新 `attempt`/`lastSeenAt`，而不是静默丢失全部证据。

同一 active incident 现在更新原通知记录并维护 `firstSeenAt`、`lastSeenAt`、`attemptCount`；恢复事件关闭当前 cycle，恢复后再次失败创建新 cycle。完整独立 Incident Manager、跨进程事件总线契约和 Provider 责任归因仍不在本切片内。

- [ ] **Step 6: 运行 focused 回归**

```powershell
node --test tests/node/model-service-error.test.mjs tests/node/notification-api-deduplication-sound.test.mjs
```

---

## Task 5: 接入真实错误接缝并保持契约边界 ✅（结构化错误已接入；宿主字段仍需现场确认）

**Files:**
- Modify: `plugin/events/notification-event-adapter.js`
- Modify: `plugin/index.js`（若需要 subscription filter 或 diagnostics seam）
- Test: `tests/node/notification-event-adapter.test.mjs`
- Test: `tests/node/plugin-lifecycle.test.mjs`
- Docs: `docs/superpowers/plans/2026-08-15-event-semantics.md`

**Interfaces:**
- Consumes: Task 4 的 `normalizeModelServiceError()` / `notificationApi.ingestModelServiceError()`。
- Produces: 对明确 `model_service_error` / `model_service_recovered` payload，以及带结构化 HTTP/Provider 证据的 `message_end` / `error` 失败事件进行安全转换；纯文本未知 `error` 仍不猜测为模型服务异常。

- [x] **Step 1: 先确认 Hana 契约边界**

在实现前检查 Hana 当前公开文档、已安装版本可读源码/日志和 EventBus 订阅能力。只有以下字段契约被证据支持时才接入：

```js
{
  type: 'model_service_error',
  status: 503,
  operation: 'memory_summary',
  provider,
  model
}
```

当前公开/可读 Hana 代码未提供稳定统一的模型错误事件 schema；因此适配器采用结构化证据边界兼容变体，但不监听日志文件、不宣称已确认宿主固定 payload。真实 Hana 触发仍需现场读取 Notification Hub 声音诊断确认。

- [x] **Step 2: 写事件适配失败/成功测试**

覆盖：

- 明确 `model_service_error` → handled true，record.type 为 `model_service_error`。
- `model_service_recovered` → 不创建普通错误卡片，进入恢复接缝或结构化恢复记录。
- 未知 `error` 且无明确模型字段 → ignored-event，不误报。
- 连续相同 incident → 不产生重复声音。

- [x] **Step 3: 实现最小适配**

在 `supported` 判断中只加入有明确契约的事件名。不要把日志文件监听加入插件；不要读取 `.hanako\logs` 作为生产数据源。

- [x] **Step 4: 运行 focused 回归并更新语义文档**

```powershell
node --test tests/node/notification-event-adapter.test.mjs tests/node/plugin-lifecycle.test.mjs
```

在 `2026-08-15-event-semantics.md` 明确：当前已确认/未确认的 Hana 事件，特别注明模型服务错误事件是否已获得宿主证据。

---

## Task 6: 同步设置页面、声音分组、通知筛选和诊断文案 ✅

**Files:**
- Modify: `plugin/routes/settings-sound.js`
- Modify: `plugin/routes/settings-visual.js` 或对应视觉规则页面
- Modify: `plugin/routes/notification-center.js`
- Modify: `plugin/routes/diagnostics.js`
- Modify: `plugin/domain/notification-category-filter.js`
- Test: `tests/node/settings-sound-route.test.mjs`
- Test: `tests/node/settings-visual-route.test.mjs`
- Test: `tests/node/notification-center-route.test.mjs`
- Test: `tests/node/diagnostics-route.test.mjs`

**Interfaces:**
- Consumes: `model_service` category and `system/error` filter projection。
- Produces: 用户可见的“模型服务异常”设置入口、筛选入口、诊断解释和独立声音策略。

- [ ] **Step 1: 写页面失败断言**

断言声音设置包含：

```text
模型服务异常
系统
错误
```

断言通知中心系统筛选和错误筛选都能选择/命中模型服务通知。断言诊断页面不展示绝对路径、API Key、完整响应正文。

- [ ] **Step 2: 更新声音设置分组**

在声音分组中加入“模型服务异常”，默认 cue 使用 `warning`，默认开启 active 重复抑制；页面提示它同时属于系统与错误筛选。

- [ ] **Step 3: 更新视觉和通知筛选**

模型服务异常作为一个策略身份，同时投影到系统和错误筛选；不要复制成两个不同通知记录。

- [ ] **Step 4: 更新诊断文案**

展示：

```text
模型服务异常
操作：后台记忆整理
状态：503
建议：稍后重试
```

如果 provider/model 不存在，显示“未识别服务商/模型”，不要显示路径或凭证。

- [ ] **Step 5: 运行页面 focused 测试**

```powershell
node --test tests/node/settings-sound-route.test.mjs tests/node/settings-visual-route.test.mjs tests/node/notification-center-route.test.mjs tests/node/diagnostics-route.test.mjs
```

---

## Task 7: 完整回归、真实事件验收准备与 Release ✅（真实 Hana 事件契约仍待确认）

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `README.md`（如需补充模型服务异常契约）
- Modify: `docs/superpowers/plans/2026-08-15-sound-test-and-model-service-category.md`
- Package: `dist\notification-hub-vnext-0.1.0-alpha.15.zip`

- [x] **Step 1: 运行声音 focused 回归**

```powershell
node --test tests/node/sound-scheduler.test.mjs tests/node/audio-adapter.test.mjs tests/node/notification-api-sound.test.mjs tests/node/plugin-lifecycle.test.mjs tests/node/custom-sound-configuration.test.mjs
```

必须证明：

- 设置页声音测试与正式通知共用 scheduler。
- 同物理声音 active 时 `1 played + N merged`。
- 播放结束后下一次可以 played。
- 全局静音包括测试路径在内绝对跳过。
- 不同声音仍然独立。

- [x] **Step 2: 运行模型服务异常 focused 回归**

```powershell
node --test tests/node/model-service-error.test.mjs tests/node/notification-event-adapter.test.mjs tests/node/event-classifier.test.mjs tests/node/notification-classification.test.mjs tests/node/sound-profile.test.mjs tests/node/sound-rule-resolver.test.mjs
```

- [x] **Step 3: 运行全量验证**

```powershell
npm test
npm run check
npm run pressure -- --scenario all --count 1000
git diff --check
```

完成声明必须引用真实输出：通过数、跳过数、失败数、压力场景统计。

- [x] **Step 4: 重新打包并校验 ZIP**

```powershell
& .\scripts\package-release.ps1 -Configuration 'Release'
```

校验：

- ZIP 根目录有 `index.js`、`manifest.json`。
- 有 `runtime/notification-hub-runtime.exe`。
- 包含正式 scheduler 测试路径修改。
- 包含 `model_service` 分类和安全规范化模块。
- 计算 SHA256。

- [x] **Step 5: 更新 CURRENT-STATUS**

记录：

- 声音测试已切换到正式 scheduler。
- 模型服务异常用户类别已实现到哪些层。
- Hana 事件契约是否已确认；若未确认，明确写“仅完成内部接缝，未完成真实 Hana EventBus 验收”。
- 全量测试和 Release SHA256。

- [ ] **Step 6: stage_files 交付**

至少交付：

```text
CURRENT-STATUS.md
README.md（如有修改）
相关源码
相关测试
本计划文件
Release ZIP
```

不得执行 Git commit。

---

## 验收标准

### 声音测试

- 设置页测试不再强制 `suppressDuplicates:false`。
- 设置页测试和真实通知使用同一个正式 notification scheduler 与正式 backend。
- 同一实际播放资源 active 期间，重复测试请求返回 `merged`。
- 播放结束后同一声音再次测试返回 `played`。
- 全局静音对测试路径绝对生效。
- 试听结果和诊断结果包含可解释的 `played/merged/skipped/failed`，不泄露敏感数据。

### 模型服务异常

- 用户层只有一个“模型服务异常”类别。
- 429、502、503 保留为技术字段，不成为三个用户类别。
- 模型服务通知同时可被“系统”和“错误”筛选找到。
- 声音设置有独立“模型服务异常”分组/策略。
- 连续同 incident 不重复制造声音和卡片噪声。
- 配置错误、临时不可用、限流等差异只体现在安全建议/诊断字段，不要求用户理解内部枚举。
- 未确认 Hana 真实事件契约前，不宣称已完成真实 EventBus 接入。

### 交付门禁

```text
focused tests：通过
npm test：通过
npm run check：通过
pressure all --count 1000：通过
 git diff --check：通过
Release ZIP：布局和 SHA256 已校验
stage_files：已交付
```
