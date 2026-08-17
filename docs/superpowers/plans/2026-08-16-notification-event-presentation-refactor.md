# Notification Hub 事件与表现系统彻底重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Notification Hub 重构为“唯一事件身份 + 独立声音/视觉/行为绑定 + 行为通道隔离”的通知场景系统，同时同步升级 Notification Center、Widget、设置页面、Runtime 页面和诊断页面，并保护 alpha.8 Native Runtime 交互稳定基线。

**Architecture:** 所有 Hana 原始入口先转换为一个拥有唯一 `categoryId` 和唯一 `eventTypeId` 的 `EventDefinition`/`CanonicalEvent`。重要性默认只有 `normal`，在卡片内容生成后由关键词规则计算为 `normal` 或 `important`。事件随后解析出独立的 `soundProfileId`、`visualProfileId`、`behaviorProfileId` 和 `behaviorChannelId`；声音、视觉和行为分别执行，行为管理器只在相同 channel 内聚合、堆叠或调度，不同 channel 互不干扰。旧 `type`、`labels`、`facets.event`、多标签分类和旧声音/视觉规则通过兼容投影与迁移适配保留读取能力，但不再作为新规则的主事实来源。

**Tech Stack:** Node.js 18+ ESM、HanaAgent 插件 Runtime、现有 Node `node:test` 测试、C++20 Windows Native Runtime、Hana iframe Page/Widget、Windows Named Pipe。

## Global Constraints

- 当前只推进 Windows；跨平台 Runtime 不进入本轮。
- alpha.8 Native Runtime 创建、关闭、重排和点击边界是不可回归的稳定基线。
- 当前版本基线为 `0.1.0-alpha.16`；不在本计划中自动修改版本号。
- 不执行 Git commit、push、reset、clean 或覆盖无关的既有未提交变更。
- 现有 39 个已修改文件和 121 个未跟踪文件均视为用户工作区内容；修改前必须按文件级 diff 识别，不得回滚整个工作树。
- Runtime、Pipe、Scene、Audio、Settings 的自身故障进入诊断链路，不递归生成普通通知。
- 所有规则失败必须有安全回退；未知事件不能伪装成助手回复成功。
- 外部插件公共 API 本轮只建立事件注册和能力边界，正式生态接入在核心事件模型稳定后实施。
- 页面必须使用现有 iframe 内路由/`hana.api.fetch()` 模式，不能通过跨 Page surface 普通链接制造 ticket 失效。
- Widget/侧边栏只显示轻量摘要和快速操作，详细事件绑定、声音、视觉、行为、关键词和诊断配置放在页面。
- 页面和 Widget 不维护第二份通知状态，所有内容来自 Node 领域 API。
- 所有前端布局必须在宽屏、中等宽度、窄屏和极窄宽度下无横向遮挡。
- 重要性只允许 `normal` 和 `important`；重要性不是事件类别、不是行为通道、不是第四层规则。
- 一个事件只能有一个主 `categoryId`、一个主 `eventTypeId`；兼容标签只能用于历史查询和迁移显示，不参与新规则竞争。

## 目标领域模型

### 1. 事件身份

```js
{
  eventId: 'tool.execution.failed',
  categoryId: 'tool',
  eventTypeId: 'execution.failed',
  label: '工具执行失败',
  source: 'hana.tool',
  presentationEligible: true,
  defaultImportance: 'normal',
  semantic: {
    action: 'execution',
    outcome: 'failure',
    reason: 'execution_error'
  }
}
```

内置主类别：

```text
chat
channel
tool
model_service
session
runtime
external_integration
delivery
```

首批内置事件至少包括：

```text
chat.assistant_reply.completed
chat.assistant_reply.cancelled
chat.assistant_reply.interrupted
channel.message.received
channel.message.sent
channel.message.failed
tool.execution.started
tool.execution.succeeded
tool.execution.failed
tool.execution.timed_out
tool.execution.blocked
tool.execution.cancelled
model_service.request.started
model_service.request.succeeded
model_service.request.failed
model_service.request.timed_out
model_service.incident.recovered
session.health.degraded
session.persistence.failed
session.recovered
runtime.transport.disconnected
runtime.transport.reconnected
runtime.scene.failed
runtime.audio.failed
runtime.settings.apply_failed
delivery.notification.stored
delivery.notification.shown
delivery.notification.read
delivery.notification.dismissed
delivery.notification.expired
```

`delivery.*` 可以记录 Delivery Observation，但默认 `presentationEligible: false`，不能再次进入普通声音、视觉或行为链路。

### 2. 事件表现绑定

```js
{
  eventId: 'tool.execution.failed',
  soundProfileId: 'sound.warning',
  visualProfileId: 'visual.error',
  behaviorProfileId: 'behavior.popup.alert',
  behaviorChannelId: 'popup.alert'
}
```

规则默认继承顺序：

```text
Global default
  ↓
Category default
  ↓
Event binding
  ↓
Importance/content adjustment
  ↓
Final SoundDecision + VisualDecision + BehaviorDecision
```

继承只作为默认值来源。最终事件绑定拥有最高优先级；不存在事件绑定时使用类别默认值，再回退到全局默认值。

### 3. 重要性

```js
{ importance: 'normal' }
{ importance: 'important', matchedKeywords: ['验证码'] }
```

处理顺序：

```text
原始事件
  ↓
事件识别
  ↓
内容格式化
  ↓
关键词识别
  ↓
normal / important
  ↓
最终表现策略
```

关键词只改变注意等级和允许的最终行为策略，不改变 `eventId`。

### 4. 行为通道

```js
{
  behaviorProfileId: 'stack',
  behaviorChannelId: 'stack.main'
}
```

- `behaviorProfileId` 表示行为方式，例如 `stack`、`ticker`、`popup`。
- `behaviorChannelId` 表示哪些通知共同作用。
- 相同 `behaviorChannelId` 的事件共享一个行为管理器。
- 不同 `behaviorChannelId` 的事件完全隔离，即使 `behaviorProfileId` 相同也不共享队列、位置、聚合和生命周期。
- 声音和视觉仍以事件为作用对象，不因事件进入同一个行为通道而自动合并。

---

## 阶段门总览

```text
阶段 0：基线冻结与工作区边界
    ↓
阶段 1：唯一事件目录与 canonical 事件
    ↓
阶段 2：内容重要性与通知记录双写
    ↓
阶段 3：表现绑定与统一 selector
    ↓
阶段 4：行为 profile/channel 管理器
    ↓
阶段 5：声音与视觉 resolver 迁移
    ↓
阶段 6：Store、生命周期、Incident、诊断迁移
    ↓
阶段 7：设置中心与事件表现配置页面
    ↓
阶段 8：Notification Center、Widget、侧边栏同步
    ↓
阶段 9：外部事件注册边界与 API schema
    ↓
阶段 10：全量验证、真实 Hana、Runtime 和回滚验收
```

每个阶段结束必须运行相关 focused 测试，再运行全量 Node 测试；阶段 10 之前不能宣称彻底完成。

---

## 阶段 0：基线冻结与工作区边界

### Task 0.1：记录当前 Git 与自动化基线

**Files:**
- Create: `docs/superpowers/plans/2026-08-16-notification-event-presentation-refactor.md`
- Modify: `CURRENT-STATUS.md`，仅在基线命令完成后追加本轮开始记录
- Test: 无源代码测试修改

- [ ] **Step 1: 保存工作区基线证据**

Run:

```powershell
git -C C:\Users\Ganlin\Desktop\OH-WorkSpace\notification-hub-upgrade status --short
npm test
npm run check
```

Expected：记录当前变更文件数量、Node 测试通过/跳过/失败数量、语法检查退出码；不因为既有失败而修改无关代码。

- [ ] **Step 2: 识别 Native Runtime 保护测试**

Run：

```powershell
Get-ChildItem -Recurse tests, runtime -File | Select-String -Pattern 'alpha.8|reorder|close|hit|layout|scene'
```

Expected：整理创建、关闭、重排、点击边界和 CTest 入口，作为后续每个 Runtime 相关阶段的必跑集合。

- [ ] **Step 3: 完成工作区边界记录**

在 `CURRENT-STATUS.md` 中记录：本轮计划文件、基线测试结果、禁止回滚的既有变更范围和当前阶段门；不覆盖已有历史证据。

- [ ] **Step 4: 验证记录内容**

Run：

```powershell
git -C C:\Users\Ganlin\Desktop\OH-WorkSpace\notification-hub-upgrade diff --check
```

Expected：无空白错误；若有错误，只记录并修复本轮新增内容。

---

## 阶段 1：唯一事件目录与 canonical 事件

### Task 1.1：建立事件目录和唯一身份校验

**Files:**
- Create: `plugin/domain/notification-event-catalog.js`
- Create: `tests/node/notification-event-catalog.test.mjs`
- Modify: `plugin/index.js`，导出目录 API
- Modify: `package.json`，将新文件和测试纳入 `check`

**Interfaces:**

```js
export const EVENT_CATEGORIES
export const EVENT_DEFINITIONS
export function getEventDefinition(eventId)
export function listEventDefinitions(options = {})
export function assertEventDefinition(eventId)
export function resolveEventId({ categoryId, eventTypeId })
```

- [ ] **Step 1: 写失败测试**

测试必须覆盖：

```js
assert.equal(resolveEventId({ categoryId: 'tool', eventTypeId: 'execution.failed' }), 'tool.execution.failed');
assert.equal(getEventDefinition('tool.execution.failed').categoryId, 'tool');
assert.throws(() => resolveEventId({ categoryId: 'tool', eventTypeId: 'tool.execution.failed' }));
assert.equal(getEventDefinition('delivery.notification.shown').presentationEligible, false);
assert.throws(() => assertEventDefinition('tool.error.failed'));
```

- [ ] **Step 2: 运行 focused 测试确认失败**

Run：

```powershell
node --test tests/node/notification-event-catalog.test.mjs
```

Expected：因模块或导出不存在而失败。

- [ ] **Step 3: 实现目录**

目录中每个定义必须拥有：

```js
{
  eventId,
  categoryId,
  eventTypeId,
  label,
  source,
  semantic,
  presentationEligible,
  defaultImportance,
  defaultPresentation
}
```

禁止同一事件出现在两个 `categoryId` 下；禁止 eventTypeId 包含另一个类别前缀；目录导出深冻结。

- [ ] **Step 4: 运行 focused 测试确认通过**

Run：

```powershell
node --test tests/node/notification-event-catalog.test.mjs
```

Expected：全部通过。

### Task 1.2：建立 CanonicalEvent 工厂

**Files:**
- Create: `plugin/domain/notification-semantics.js`
- Create: `tests/node/notification-semantics.test.mjs`
- Modify: `plugin/domain/event-classifier.js`，保留 `classifyEvent()`，新增 canonical 适配出口
- Modify: `plugin/index.js`

**Interfaces:**

```js
export const CANONICAL_EVENT_VERSION
export function createCanonicalEvent(input = {})
export function normalizeCanonicalEvent(input = {})
export function validateCanonicalEvent(event)
export function canonicalEventFromLegacy({ event, record, classification } = {})
export function getCanonicalEventId(event)
```

- [ ] **Step 1: 写失败测试**

至少覆盖：

```js
const event = createCanonicalEvent({
  eventId: 'tool.execution.failed',
  categoryId: 'tool',
  eventTypeId: 'execution.failed',
  traceId: 'trace-1',
  occurredAt: '2026-08-16T00:00:00.000Z',
  origin: { source: 'hana.tool' },
  semantic: { action: 'execution', outcome: 'failure', reason: 'execution_error' }
});
assert.equal(event.eventId, 'tool.execution.failed');
assert.equal(event.categoryId, 'tool');
assert.throws(() => createCanonicalEvent({ categoryId: 'tool', eventTypeId: 'error' }));
assert.throws(() => createCanonicalEvent({ eventId: 'tool.execution.failed', categoryId: 'channel', eventTypeId: 'execution.failed' }));
```

- [ ] **Step 2: 运行测试确认失败**

Run：

```powershell
node --test tests/node/notification-semantics.test.mjs
```

Expected：失败。

- [ ] **Step 3: 实现工厂与校验**

Canonical Event 至少包含：

```js
{
  version,
  eventId,
  categoryId,
  eventTypeId,
  traceId,
  correlationId,
  occurredAt,
  origin,
  semantic: { action, outcome, reason },
  severity,
  rawType,
  presentationEligible
}
```

`eventId` 必须能由 `categoryId + eventTypeId` 唯一还原；`rawType` 只作为兼容追踪，不参与新规则匹配。

- [ ] **Step 4: 运行 focused 测试确认通过**

Run：

```powershell
node --test tests/node/notification-semantics.test.mjs tests/node/event-classifier.test.mjs
```

Expected：新测试和既有 classifier 测试全部通过。

### Task 1.3：将现有 Adapter 双写 Canonical Event

**Files:**
- Modify: `plugin/events/notification-event-adapter.js`
- Modify: `plugin/api/notification-api.js`
- Modify: `tests/node/notification-event-adapter.test.mjs`
- Modify: `tests/node/notification-api.test.mjs`

- [ ] **Step 1: 增加失败回归测试**

覆盖真实已确认入口：

```text
message_end + assistant + end_turn → chat.assistant_reply.completed
tool_execution_end + isError=false → tool.execution.succeeded
tool_execution_end + isError=true → tool.execution.failed
channel_new_message → channel.message.received
model_service_error → model_service.request.failed
```

断言同一个 session 下没有 eventId 的连续事件仍然拥有不同的 `traceId`/`notificationId`。

- [ ] **Step 2: 运行 focused 测试确认旧链路尚无 canonical 输出**

Run：

```powershell
node --test tests/node/notification-event-adapter.test.mjs tests/node/notification-api.test.mjs
```

Expected：新增 canonical 断言失败。

- [ ] **Step 3: 实现双写**

原始事件继续生成旧字段，额外生成：

```js
metadata.semantic = canonicalEvent
metadata.eventId = canonicalEvent.eventId
```

Runtime/Audio/Settings 诊断不得写入普通通知 metadata，改走诊断出口。

- [ ] **Step 4: 运行 focused 测试**

Run：

```powershell
node --test tests/node/notification-event-adapter.test.mjs tests/node/notification-api.test.mjs tests/node/notification-ingestion.test.mjs
```

Expected：全部通过。

---

## 阶段 2：内容重要性与 NotificationRecord 双写

### Task 2.1：实现二值重要性规则

**Files:**
- Create: `plugin/domain/notification-importance.js`
- Create: `tests/node/notification-importance.test.mjs`
- Modify: `plugin/domain/notification-profile.js`
- Modify: `plugin/domain/profile-resolver.js`
- Modify: `plugin/domain/content-formatter.js`

**Interfaces:**

```js
export const NOTIFICATION_IMPORTANCE_VALUES = ['normal', 'important']
export function createImportanceSettings(input = {})
export function classifyNotificationImportance({ title, content, summary, keywords } = {})
export function resolveNotificationImportance({ content, settings, explicitImportance } = {})
```

- [ ] **Step 1: 写失败测试**

```js
assert.equal(resolveNotificationImportance({ content: '普通消息', settings: { keywords: ['验证码'] } }), 'normal');
assert.equal(resolveNotificationImportance({ content: '验证码是 1234', settings: { keywords: ['验证码'] } }), 'important');
assert.equal(resolveNotificationImportance({ content: '普通消息', explicitImportance: 'critical', settings: { keywords: [] } }), 'normal');
assert.throws(() => createImportanceSettings({ keywords: [''] }));
```

- [ ] **Step 2: 运行测试确认失败**

Run：

```powershell
node --test tests/node/notification-importance.test.mjs
```

Expected：失败。

- [ ] **Step 3: 实现规则**

规则必须：

```text
默认 normal
关键词大小写/空白按配置规范化
命中任一关键词即 important
旧 low/high/critical 在新投影中降级为 normal 或由关键词重新判定
```

记录有限的 `matchedKeywords`，不保存完整敏感正文。

- [ ] **Step 4: 运行 focused 测试**

Run：

```powershell
node --test tests/node/notification-importance.test.mjs tests/node/content-formatter.test.mjs tests/node/notification-profile.test.mjs
```

Expected：全部通过。

### Task 2.2：NotificationRecord 新字段双写与读取优先级

**Files:**
- Modify: `plugin/domain/notification-record.js`
- Modify: `plugin/domain/notification-ingestion.js`
- Modify: `plugin/domain/notification-store.js`
- Modify: `plugin/domain/notification-store-persistence.js`
- Modify: `tests/node/notification-record.test.mjs`
- Modify: `tests/node/notification-ingestion.test.mjs`
- Modify: `tests/node/notification-store-persistence.test.mjs`

- [ ] **Step 1: 写失败测试**

断言新记录包含：

```js
record.eventId
record.categoryId
record.eventTypeId
record.importance in ['normal', 'important']
record.presentation
```

并断言加载旧记录时：

```text
metadata.semantic 存在 → 使用 canonical
metadata.semantic 不存在 → 从 type/classification 推导
旧 importance=high → 新读取投影不产生第三个等级
```

- [ ] **Step 2: 运行 focused 测试确认失败**

Run：

```powershell
node --test tests/node/notification-record.test.mjs tests/node/notification-ingestion.test.mjs tests/node/notification-store-persistence.test.mjs
```

Expected：新字段断言失败。

- [ ] **Step 3: 实现兼容读取和双写**

新字段与旧字段关系：

```text
新字段是主来源
旧 type/status/importance/classification 继续保留
旧字段只用于历史数据和 API 兼容
```

不在本任务删除旧状态字段，避免直接破坏中心未读和 Widget 读取。

- [ ] **Step 4: 运行 focused 测试**

Run：

```powershell
node --test tests/node/notification-record.test.mjs tests/node/notification-ingestion.test.mjs tests/node/notification-store-persistence.test.mjs
```

Expected：全部通过。

---

## 阶段 3：统一 Presentation Selector 与事件表现绑定

### Task 3.1：建立 Presentation Profile 数据模型

**Files:**
- Create: `plugin/domain/notification-presentation-profile.js`
- Create: `tests/node/notification-presentation-profile.test.mjs`
- Modify: `plugin/domain/notification-profile.js`
- Modify: `plugin/domain/notification-rule-target.js`

**Interfaces:**

```js
export const BEHAVIOR_PROFILE_IDS
export function createPresentationBinding(input = {})
export function createPresentationProfile(input = {})
export function resolvePresentationBinding({ eventId, categoryId, profile, defaults } = {})
export function validateBehaviorChannelId(value)
```

- [ ] **Step 1: 写失败测试**

覆盖：

```js
Event binding > category default > global default
stack.main 与 stack.tool 是两个 channel
soundProfileId、visualProfileId、behaviorProfileId 非空
behaviorChannelId 缺失时从 behaviorProfileId 生成稳定默认值
```

- [ ] **Step 2: 运行测试确认失败**

Run：

```powershell
node --test tests/node/notification-presentation-profile.test.mjs
```

Expected：失败。

- [ ] **Step 3: 实现 profile 与继承**

分离三种 profile：

```text
SoundProfile：声音资源、音量、重复策略
VisualProfile：卡片视觉、主题、强度
BehaviorProfile：堆叠/弹幕/弹窗、位置、时长、聚合
```

不把三者压成一个 cardType，避免组合爆炸。

- [ ] **Step 4: 运行 focused 测试**

Run：

```powershell
node --test tests/node/notification-presentation-profile.test.mjs tests/node/sound-profile.test.mjs tests/node/visual-settings.test.mjs
```

Expected：全部通过。

### Task 3.2：创建统一 PresentationSelector

**Files:**
- Create: `plugin/domain/notification-presentation-selector.js`
- Create: `tests/node/notification-presentation-selector.test.mjs`
- Modify: `plugin/domain/notification-presentation-plan.js`
- Modify: `plugin/domain/notification-api.js`

**Interfaces:**

```js
export function createPresentationSelector({ record, canonicalEvent, classification, profile } = {})
export function validatePresentationSelector(selector)
export function projectSoundInput(selector)
export function projectVisualInput(selector)
export function projectBehaviorInput(selector)
```

- [ ] **Step 1: 写失败测试**

同一条工具失败事件必须产生：

```js
selector.eventId === 'tool.execution.failed'
selector.categoryId === 'tool'
selector.sound.eventId === selector.eventId
selector.visual.eventId === selector.eventId
selector.behavior.channelId === 'popup.alert' // 使用测试 profile
```

并断言 selector 不从 `classification.labels` 选择主类别。

- [ ] **Step 2: 运行测试确认失败**

Run：

```powershell
node --test tests/node/notification-presentation-selector.test.mjs
```

Expected：失败。

- [ ] **Step 3: 实现 selector**

Selector 只含下游需要的稳定输入：

```js
{
  notificationId,
  eventId,
  categoryId,
  eventTypeId,
  importance,
  semantic,
  sound: { soundProfileId, triggerPolicy, eventId },
  visual: { visualProfileId, eventId },
  behavior: { behaviorProfileId, channelId, eventId }
}
```

- [ ] **Step 4: 运行 focused 测试**

Run：

```powershell
node --test tests/node/notification-presentation-selector.test.mjs tests/node/notification-presentation-plan.test.mjs tests/node/notification-api-sound.test.mjs
```

Expected：全部通过。

---

## 阶段 4：行为 profile/channel 管理器

### Task 4.1：建立 Behavior Manager 核心模型

**Files:**
- Create: `plugin/domain/notification-behavior.js`
- Create: `plugin/domain/notification-behavior-manager.js`
- Create: `tests/node/notification-behavior-manager.test.mjs`
- Modify: `plugin/runtime/host-adapter.js`
- Modify: `plugin/runtime/scene-state.js`
- Modify: `plugin/runtime/scene-state-recovery.js`

**Interfaces:**

```js
export const BEHAVIOR_MODES
export function createBehaviorProfile(input = {})
export function createBehaviorManager({ channelId, profile, adapter })
export function enqueueBehaviorCard(manager, card)
export function removeBehaviorCard(manager, cardId)
export function snapshotBehaviorManager(manager)
export function restoreBehaviorManager(manager, snapshot)
```

- [x] **Step 1: 写失败测试**

必须验证：

```js
A: profile=stack, channel=stack.main
B: profile=ticker, channel=ticker.main
C: profile=stack, channel=stack.main
```

断言 A/C 共用同一 manager 状态，B 的状态独立；`stack.main` 与 `stack.tool` 不互相影响；删除 A 后 C 正确重排。

- [x] **Step 2: 运行测试确认失败**

Run：

```powershell
node --test tests/node/notification-behavior-manager.test.mjs
```

Expected：失败。

- [x] **Step 3: 实现按 channel 隔离的管理器**

Behavior Manager 必须维护：

```text
channelId
profileId
visible cards
pending transitions
aggregation state
layout state
```

不得用全局单例队列承载所有行为。

- [x] **Step 4: 运行 focused 行为测试**

Run：

```powershell
node --test tests/node/notification-behavior-manager.test.mjs tests/node/scene-state.test.mjs tests/node/scene-state-recovery.test.mjs
```

Expected：全部通过。

### Task 4.2：接入 Runtime payload 并保护 alpha.8

**Files:**
- Modify: `plugin/runtime/host-adapter.js`
- Modify: `plugin/runtime/scene-state.js`
- Modify: `plugin/runtime/scene-state-store.js`
- Modify: `tests/node/host-adapter.test.mjs`
- Modify: `tests/node/scene-state-persistence.test.mjs`
- Modify: C++ `runtime/scene/controller.*`、`runtime/scene/layout.cpp` 仅在 Node payload 契约需要时修改

- [x] **Step 1: 写 payload 回归测试**

断言 Runtime 收到：

```js
behaviorProfileId
behaviorChannelId
visualProfileId
notificationId
```

并断言旧 minimal card payload 仍可由适配器转换。

- [x] **Step 2: 运行 Node 和 CTest 基线**

Run：

```powershell
node --test tests/node/host-adapter.test.mjs tests/node/scene-state-persistence.test.mjs
ctest --test-dir runtime/build --output-on-failure
```

Expected：在实现前新 payload 断言失败，既有 Runtime 测试不因 Node 变化失败。

- [x] **Step 3: 实现向后兼容 payload**

新字段放在受控 `presentation`/`behavior` 对象中；C++ 对未知字段安全忽略，对缺失字段回退 minimal/stack.main。不要在本任务重写渲染器。

- [x] **Step 4: 运行完整 Runtime 回归**

Run：

```powershell
npm test
ctest --test-dir runtime/build --output-on-failure
```

Expected：既有 alpha.8 创建、关闭、重排、点击回归保持通过。

---

## 阶段 5：声音与视觉 resolver 迁移

### Task 5.1：声音 resolver 消费 event binding

**Files:**
- Modify: `plugin/domain/sound-rule-resolver.js`
- Modify: `plugin/domain/sound-policy.js`
- Modify: `plugin/domain/sound-binding.js`
- Modify: `plugin/domain/sound-settings.js`
- Modify: `plugin/domain/sound-rule-explanation.js`
- Modify: `tests/node/sound-rule-resolver.test.mjs`
- Modify: `tests/node/sound-binding.test.mjs`
- Modify: `tests/node/sound-rule-explanation.test.mjs`

- [ ] **Step 1: 写失败测试**

必须验证：

```js
chat.assistant_reply.completed → soundProfile A
 tool.execution.succeeded       → soundProfile B
 tool.execution.failed          → soundProfile C
```

同一事件只有一个 soundProfile；旧 `labels=['tool','error']` 不得导致两个候选规则竞争。

- [ ] **Step 2: 运行 focused 测试确认失败**

Run：

```powershell
node --test tests/node/sound-rule-resolver.test.mjs tests/node/sound-binding.test.mjs
```

Expected：新 event binding 断言失败。

- [ ] **Step 3: 实现新规则路径与旧适配器**

新 resolver 优先顺序：

```text
event binding
→ category default
→ global default
```

旧 `soundOverrides`、旧 type/event policy 在进入 resolver 前通过 `Legacy Rule Adapter` 转换为新 target；不与新规则直接平等竞争。

全局静音、active playback merge、Windows backend、声音诊断语义保持原有行为。

- [ ] **Step 4: 运行声音 focused 和压力回归**

Run：

```powershell
node --test tests/node/sound-rule-resolver.test.mjs tests/node/sound-binding.test.mjs tests/node/sound-scheduler.test.mjs tests/node/sound-diagnostic.test.mjs tests/node/notification-api-sound.test.mjs
npm run pressure -- --scenario all --count 1000
```

Expected：全部通过，且 `played/merged/skipped/failed` 语义不回归。

### Task 5.2：视觉 resolver 消费 event binding

**Files:**
- Modify: `plugin/domain/visual-rule-resolver.js`
- Modify: `plugin/domain/visual-settings.js`
- Modify: `plugin/domain/card-visual-settings.js`
- Modify: `tests/node/visual-rule-resolver.test.mjs`
- Modify: `tests/node/visual-settings.test.mjs`
- Modify: `tests/node/card-visual-settings.test.mjs`

- [x] **Step 1: 写失败测试**

断言：

```text
assistant reply → visual.assistant
successful tool → visual.tool
failed tool → visual.error
```

并断言视觉 resolver 不再通过 `VISUAL_CATEGORY_PRIORITY.find(labels)` 选择主类别。

- [x] **Step 2: 运行测试确认失败**

Run：

```powershell
node --test tests/node/visual-rule-resolver.test.mjs tests/node/visual-settings.test.mjs
```

Expected：失败。

- [x] **Step 3: 实现视觉绑定路径**

视觉配置允许：

```text
visualProfileId
preset
intensity
card appearance
```

`important` 可以触发 profile 内已声明的强调变体，但不能绕过全局禁用或 Runtime 安全边界。

- [x] **Step 4: 运行 focused 测试**

Run：

```powershell
node --test tests/node/visual-rule-resolver.test.mjs tests/node/visual-settings.test.mjs tests/node/card-visual-settings.test.mjs tests/node/notification-presentation-selector.test.mjs
```

Expected：全部通过。

---

## 阶段 6：Store、生命周期、Incident 和诊断迁移

### Task 6.1：拆分业务事件和 Delivery Observation

**Files:**
- Create: `plugin/domain/notification-delivery-observation.js`
- Create: `tests/node/notification-delivery-observation.test.mjs`
- Modify: `plugin/domain/notification-record.js`
- Modify: `plugin/domain/notification-store.js`
- Modify: `plugin/domain/notification-widget-view-model.js`
- Modify: `plugin/routes/notification-center.js`
- Modify: `plugin/routes/widget.js`

- [ ] **Step 1: 写失败测试**

覆盖：

```js
persistence=stored
center=visible
scene=shown
audio=played
reading=unread
```

断言 `record.status` 继续兼容，但新查询优先读取对应 observation。

- [ ] **Step 2: 运行测试确认失败**

Run：

```powershell
node --test tests/node/notification-delivery-observation.test.mjs tests/node/notification-widget-view-model.test.mjs tests/node/notification-center-route.test.mjs
```

Expected：失败。

- [ ] **Step 3: 实现独立投递观察**

Observation 字段：

```js
{
  observationId,
  notificationId,
  eventId,
  channel: 'persistence'|'center'|'scene'|'audio'|'reading',
  state,
  reason,
  occurredAt
}
```

不把 `shown/read/played` 写回 Canonical Event。

- [ ] **Step 4: 运行 focused 测试**

Run：

```powershell
node --test tests/node/notification-delivery-observation.test.mjs tests/node/notification-center-route.test.mjs tests/node/widget-route.test.mjs
```

Expected：全部通过。

### Task 6.2：Incident 和 RuntimeDiagnostic 统一关联

**Files:**
- Create: `plugin/domain/notification-incident.js`
- Create: `plugin/domain/runtime-diagnostic-event.js`
- Create: `tests/node/notification-incident.test.mjs`
- Create: `tests/node/runtime-diagnostic-event.test.mjs`
- Modify: `plugin/domain/model-service-error.js`
- Modify: `plugin/diagnostics/index.js`
- Modify: `plugin/index.js`

- [ ] **Step 1: 写失败测试**

覆盖：

```text
连续 503 → 同一 active incident + attemptCount 增加
recovered → 关闭当前 incident，不新建普通恢复通知
runtime/audio/settings failure → diagnostic，不进入普通 Notification Store
```

- [ ] **Step 2: 运行测试确认失败**

Run：

```powershell
node --test tests/node/notification-incident.test.mjs tests/node/runtime-diagnostic-event.test.mjs tests/node/model-service-error.test.mjs
```

Expected：失败。

- [ ] **Step 3: 实现诊断与 Incident**

所有对象共享：

```text
eventId
traceId
correlationId
occurredAt
```

但存储边界独立：

```text
NotificationRecord
IncidentRecord
RuntimeDiagnostic
DeliveryObservation
```

- [ ] **Step 4: 运行 focused 测试**

Run：

```powershell
node --test tests/node/notification-incident.test.mjs tests/node/runtime-diagnostic-event.test.mjs tests/node/diagnostics-route.test.mjs tests/node/model-service-error.test.mjs
```

Expected：全部通过。

---

## 阶段 7：设置中心与事件表现配置页面

### Task 7.1：扩展设置存储为事件表现设置

**Files:**
- Create: `plugin/domain/event-presentation-settings.js`
- Create: `plugin/domain/event-presentation-settings-store.js`
- Create: `plugin/domain/event-presentation-settings-persistence.js`
- Create: `tests/node/event-presentation-settings.test.mjs`
- Create: `tests/node/event-presentation-settings-store.test.mjs`
- Modify: `plugin/index.js`
- Modify: `plugin/domain/settings-store.js`

- [ ] **Step 1: 写失败测试**

覆盖：

```js
updateEventPresentation('chat.assistant_reply.completed', { soundProfileId: 'sound.a' })
updateEventPresentation('tool.execution.succeeded', { behaviorChannelId: 'ticker.tool' })
未知 eventId 被拒绝
未知 profileId 被拒绝
保存 revision 增加
```

- [ ] **Step 2: 运行测试确认失败**

Run：

```powershell
node --test tests/node/event-presentation-settings.test.mjs tests/node/event-presentation-settings-store.test.mjs
```

Expected：失败。

- [ ] **Step 3: 实现设置存储**

配置必须支持：

```text
global defaults
category defaults
event bindings
importance keywords
behavior channel settings
```

默认设置文件使用受控 JSON schema，拒绝任意脚本、HTML、坐标和未注册 Runtime 行为。

- [ ] **Step 4: 运行 focused 测试**

Run：

```powershell
node --test tests/node/event-presentation-settings.test.mjs tests/node/event-presentation-settings-store.test.mjs tests/node/settings-store.test.mjs tests/node/settings-store-persistence.test.mjs
```

Expected：全部通过。

### Task 7.2：新增“事件表现”设置页面

**Files:**
- Create: `plugin/routes/settings-events.js`
- Modify: `plugin/routes/settings.js`
- Modify: `plugin/routes/page-navigation.js`
- Create: `tests/node/settings-events-route.test.mjs`
- Modify: `tests/node/settings-route.test.mjs`
- Modify: `tests/node/page-navigation.test.mjs`

- [ ] **Step 1: 写页面 API 失败测试**

覆盖：

```text
GET /settings-content?view=events
GET /event-presentation-settings
POST /event-presentation-settings
POST /event-presentation-preview
```

断言页面只通过 iframe 内 fetch 载入，不能创建新的跨文档 surface 链接。

- [ ] **Step 2: 运行 focused 测试确认失败**

Run：

```powershell
node --test tests/node/settings-events-route.test.mjs tests/node/settings-route.test.mjs
```

Expected：失败。

- [ ] **Step 3: 实现页面结构**

页面分区：

```text
事件目录
事件搜索与筛选
全局默认
分类默认
具体事件绑定
重要性关键词
行为通道摘要
保存/已应用/失败状态
```

每个事件显示：

```text
大类
事件名称
声音
视觉
行为
行为通道
重要性规则
```

不把所有事件折叠成多标签编辑器。

- [ ] **Step 4: 运行页面 focused 测试**

Run：

```powershell
node --test tests/node/settings-events-route.test.mjs tests/node/settings-route.test.mjs tests/node/page-navigation.test.mjs
```

Expected：全部通过。

### Task 7.3：同步声音、视觉和行为页面

**Files:**
- Modify: `plugin/routes/settings-sound.js`
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/domain/sound-rule-explanation.js`
- Modify: `tests/node/settings-sound-route.test.mjs`
- Modify: `tests/node/settings-visual-route.test.mjs`

- [ ] **Step 1: 增加事件绑定页面回归**

断言声音和视觉页面读取同一个事件目录 API，不各自维护类别/事件数组。

- [ ] **Step 2: 运行现有页面测试确认迁移缺口**

Run：

```powershell
node --test tests/node/settings-sound-route.test.mjs tests/node/settings-visual-route.test.mjs
```

Expected：先记录失败点，再实现。

- [ ] **Step 3: 实现同步**

声音页面保留：

```text
音频库、全局静音、音量、声音预览、规则解释、诊断状态
```

新增：

```text
事件表现绑定入口
事件级声音 profile
```

视觉页面保留：

```text
全局视觉、极简卡片、预览、Runtime 应用状态
```

新增：

```text
事件级视觉 profile
行为 profile/channel 入口
```

- [ ] **Step 4: 运行 focused 页面回归**

Run：

```powershell
node --test tests/node/settings-sound-route.test.mjs tests/node/settings-visual-route.test.mjs tests/node/event-presentation-settings.test.mjs
```

Expected：全部通过。

---

## 阶段 8：Notification Center、Widget 与侧边栏同步

### Task 8.1：Notification Center 迁移到唯一事件筛选

**Files:**
- Modify: `plugin/domain/notification-event-filter.js`
- Modify: `plugin/domain/notification-category-filter.js`
- Modify: `plugin/routes/notification-center.js`
- Modify: `tests/node/notification-category-filter.test.mjs`
- Modify: `tests/node/notification-center-route.test.mjs`

- [ ] **Step 1: 写失败测试**

筛选必须支持：

```text
eventId=tool.execution.failed
categoryId=tool
importance=important
presentationEligible=true/false
```

旧 `labels` 筛选只作为兼容查询，不再参与主事件身份判断。

- [ ] **Step 2: 运行测试确认失败**

Run：

```powershell
node --test tests/node/notification-category-filter.test.mjs tests/node/notification-center-route.test.mjs
```

Expected：失败。

- [ ] **Step 3: 实现页面筛选和详情**

通知列表默认显示：

```text
事件名称
类别
重要性
摘要
投递状态摘要
```

详情显示：

```text
完整正文
eventId/categoryId/eventTypeId
soundProfileId/visualProfileId/behaviorProfileId/behaviorChannelId
lifecycle/diagnostic references
```

- [ ] **Step 4: 运行 focused 测试**

Run：

```powershell
node --test tests/node/notification-category-filter.test.mjs tests/node/notification-center-route.test.mjs tests/node/notification-widget-view-model.test.mjs
```

Expected：全部通过。

### Task 8.2：Widget/侧边栏只保留轻量摘要

**Files:**
- Modify: `plugin/domain/notification-widget-view-model.js`
- Modify: `plugin/routes/widget.js`
- Modify: `plugin/domain/sidebar-display-settings.js`
- Modify: `tests/node/widget-route.test.mjs`
- Modify: `tests/node/notification-widget-view-model.test.mjs`
- Modify: `tests/node/sidebar-display-settings.test.mjs`

- [ ] **Step 1: 写侧边栏边界测试**

断言 Widget 显示：

```text
未读数
最近通知摘要
Runtime 健康摘要
简单音量/视觉快速设置
```

不显示：

```text
完整事件绑定编辑器
诊断原始 JSON
声音库路径
行为 profile 全量表单
```

- [ ] **Step 2: 运行测试确认失败**

Run：

```powershell
node --test tests/node/widget-route.test.mjs tests/node/notification-widget-view-model.test.mjs tests/node/sidebar-display-settings.test.mjs
```

Expected：新增边界断言失败。

- [ ] **Step 3: 实现轻量 Widget**

Widget 每个通知显示：

```text
标题一行
摘要两行
事件类别/重要性短标签
```

点击详情跳转 Notification Center；不在 Widget 复制事件规则逻辑。

- [ ] **Step 4: 运行 focused 测试**

Run：

```powershell
node --test tests/node/widget-route.test.mjs tests/node/notification-widget-view-model.test.mjs tests/node/sidebar-display-settings.test.mjs
```

Expected：全部通过。

### Task 8.3：页面响应式与 iframe 导航验收

**Files:**
- Modify: `plugin/routes/page-navigation.js`
- Modify: `plugin/routes/settings.js`
- Modify: `plugin/routes/settings-events.js`
- Modify: `tests/node/page-navigation.test.mjs`
- Modify: `tests/node/settings-route.test.mjs`

- [ ] **Step 1: 写静态结构回归**

断言页面包含：

```text
图像化导航卡片
focus-visible
responsive grid
无 overflow-x hidden 伪装
iframe 内 view fetch
```

- [ ] **Step 2: 运行测试确认失败**

Run：

```powershell
node --test tests/node/page-navigation.test.mjs tests/node/settings-route.test.mjs
```

Expected：新增断言失败。

- [ ] **Step 3: 实现最小结构修复**

不得改变已验收的 Page surface 数量和 ticket 传递模式；所有内部设置视图保持当前 iframe 文档内切换。

- [ ] **Step 4: 运行页面回归**

Run：

```powershell
node --test tests/node/page-navigation.test.mjs tests/node/settings-route.test.mjs tests/node/settings-events-route.test.mjs tests/node/widget-route.test.mjs tests/node/notification-center-route.test.mjs
```

Expected：全部通过。

---

## 阶段 9：外部事件注册边界与 API schema

### Task 9.1：建立外部事件注册 schema

**Files:**
- Create: `plugin/api/notification-event-registry.js`
- Create: `plugin/domain/external-event-definition.js`
- Create: `tests/node/notification-event-registry.test.mjs`
- Modify: `plugin/api/notification-api.js`
- Modify: `plugin/manifest.json`

**Interfaces:**

```js
export function registerExternalEvent(definition, context = {})
export function unregisterExternalEvent(eventId, context = {})
export function listExternalEvents(context = {})
export function validateExternalEventDefinition(definition)
```

- [ ] **Step 1: 写失败测试**

覆盖：

```text
plugin.<pluginId>.<eventName> 命名空间有效
未授权 pluginId 被拒绝
重复 eventId 被拒绝
自定义 behaviorProfileId 需要能力声明
任意 HTML/script/坐标字段被拒绝
```

- [ ] **Step 2: 运行测试确认失败**

Run：

```powershell
node --test tests/node/notification-event-registry.test.mjs
```

Expected：失败。

- [ ] **Step 3: 实现注册边界**

外部事件必须声明：

```js
{
  eventId,
  categoryId: 'external_integration',
  label,
  contentSchema,
  presentation: {
    soundProfileId,
    visualProfileId,
    behaviorProfileId,
    behaviorChannelId
  },
  capabilities
}
```

平台负责 schema 校验、能力发现、默认回退和诊断；插件不能直接注入 Native Runtime 任意 payload。

- [ ] **Step 4: 运行 focused API 测试**

Run：

```powershell
node --test tests/node/notification-event-registry.test.mjs tests/node/notification-api.test.mjs
```

Expected：全部通过。

---

## 阶段 10：验证、现场验收、文档与发布边界

### Task 10.1：统一导出、语法检查和全量测试

**Files:**
- Modify: `package.json`
- Modify: `plugin/index.js`
- Modify: `README.md`
- Modify: `CURRENT-STATUS.md`
- Modify: `notification-hub-vnext-plan.md`
- Modify: `SIDEBAR-PAGE-PRODUCT-PLAN.md`
- Modify: `FRONTEND-DESIGN-GUIDELINES.md`

- [ ] **Step 1: 更新项目文档决策**

把旧的“分类必须多标签投影、声音视觉共同读取多标签”表述改为：

```text
主事件身份唯一：categoryId + eventTypeId
兼容 facets/labels 仅作历史投影和筛选别名
声音、视觉、行为共同读取 PresentationSelector
行为按 behaviorChannelId 隔离
```

保留基础 `type/source/channel/producer` 的正交字段，不把它们删掉。

- [x] **Step 2: 更新 check 脚本并运行**

Run：

```powershell
npm run check
```

Expected：退出码 0。

- [x] **Step 3: 运行全量 Node 测试**

Run：

```powershell
npm test
```

Expected：0 failed；记录通过数和跳过数，不把 skipped 伪装成 passed。

- [ ] **Step 4: 运行声音压力测试**

Run：

```powershell
npm run pressure -- --scenario all --count 1000
```

Expected：无 dropped，active duplicate 合并契约保持，mute 契约保持。

- [x] **Step 5: 运行 Runtime 构建和 CTest**

Run：

```powershell
cmake --build runtime/build --config Release
ctest --test-dir runtime/build -C Release --output-on-failure
```

Expected：Native Runtime 构建成功，CTest 全部通过。

### Task 10.2：真实 Hana 验收矩阵

**Files:**
- Create: `docs/verification/2026-08-16-event-presentation-field-verification.md`
- Modify: `CURRENT-STATUS.md`

- [ ] **Step 1: 安装/重载本轮插件包**

必须由用户或真实 Hana 环境执行；自动化测试不能替代。

- [ ] **Step 2: 验证事件身份**

真实触发并记录：

```text
助手回复完成
工具成功
工具失败
频道消息
模型服务错误
Runtime 状态变化
```

每条记录确认只有一个主 `eventId/categoryId/eventTypeId`。

- [ ] **Step 3: 验证表现独立性**

配置：

```text
助手回复 → 声音 A + 视觉 A + stack.main
工具成功 → 声音 B + 视觉 B + ticker.main
工具失败 → 声音 C + 视觉 C + popup.alert
```

确认三条链路互不覆盖。

- [ ] **Step 4: 验证行为通道共同作用**

让事件 A、C 都使用 `stack.main`，事件 B 使用 `ticker.main`；确认 A/C 共同堆叠，B 不改变 A/C 的排列，A/C 不改变 B 的弹幕逻辑。

- [ ] **Step 5: 验证重要性关键词**

分别触发未命中关键词和命中关键词的通知，确认只有：

```text
normal
important
```

且命中结果不改变事件身份。

- [ ] **Step 6: 验证异常边界**

确认声音失败、Scene 失败、Pipe 断开、设置应用失败只进入诊断，不递归生成普通错误通知。

- [ ] **Step 7: 记录真实证据**

记录 Hana 版本、插件包 hash、触发步骤、结果、截图/诊断摘要和未验证项；没有证据的部分标记为待现场验证。

### Task 10.3：发布前回滚与恢复验收

**Files:**
- Modify: `README.md`
- Modify: `CURRENT-STATUS.md`
- Create: `docs/verification/2026-08-16-event-presentation-rollback.md`

- [ ] **Step 1: 验证旧配置读取**

使用旧声音、旧视觉、旧通知记录样本，确认 Legacy Adapter 能产生新 selector。

- [ ] **Step 2: 验证新配置降级**

删除一个 event binding，确认回退到 category；删除 category，确认回退到 global；删除 profile，确认使用安全默认。

- [ ] **Step 3: 验证 Runtime 重启恢复**

Runtime 重启后确认通知记录不丢失、行为通道不会产生幽灵卡片、SceneState 与实际窗口一致。

- [ ] **Step 4: 验证回滚说明**

文档明确：不执行破坏性 Git 回滚；配置文件备份、旧字段读取和插件包回退均有步骤。

---

## 文件职责总表

| 文件 | 职责 |
|---|---|
| `notification-event-catalog.js` | 内置和注册事件定义、唯一身份校验 |
| `notification-semantics.js` | Canonical Event 创建、校验、旧事件转换 |
| `notification-importance.js` | 二值重要性和关键词识别 |
| `notification-presentation-profile.js` | 声音/视觉/行为 profile 与默认继承 |
| `notification-presentation-selector.js` | 给下游统一、稳定、唯一的表现输入 |
| `notification-behavior.js` | Behavior profile schema |
| `notification-behavior-manager.js` | 按 channel 隔离行为、聚合、布局和生命周期 |
| `notification-delivery-observation.js` | 投递阶段观察，不污染业务事件 |
| `notification-incident.js` | 连续故障、attempt、cycle、恢复 |
| `runtime-diagnostic-event.js` | Runtime/Audio/Settings/Transport 诊断语义 |
| `event-presentation-settings*.js` | 事件级表现绑定和持久化 |
| `settings-events.js` | 页面化事件绑定配置 |
| `notification-event-registry.js` | 外部事件注册和能力边界 |
| `sound-rule-resolver.js` | 只消费 selector.sound |
| `visual-rule-resolver.js` | 只消费 selector.visual |
| `host-adapter.js` | 只把行为决策转换成受控 Runtime payload |
| `widget.js` / `notification-center.js` | 只展示领域 API，不复制规则 |

## 计划自审清单

- [x] 覆盖唯一事件身份、类别、事件、重要性和内容关键词。
- [x] 覆盖声音、视觉、行为 profile 的独立绑定。
- [x] 覆盖行为通道的共同作用和隔离。
- [x] 覆盖 Runtime、Audio、Settings 诊断边界。
- [x] 覆盖 Notification Center、Widget、侧边栏和设置页面同步。
- [x] 覆盖外部事件注册命名空间和安全 schema。
- [x] 覆盖旧字段、旧配置和旧记录迁移。
- [x] 覆盖 Node 测试、压力测试、Native Runtime 构建/CTest、真实 Hana 和回滚。
- [x] 所有任务写出具体文件、接口、测试命令和预期结果。
- [x] 未使用“以后再补”“适当处理”“写测试即可”等无执行内容的占位语句。

**计划状态：** 已完成设计，等待按阶段执行；当前不代表源码已经完成重构。
