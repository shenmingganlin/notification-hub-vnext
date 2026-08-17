# 阶段三分类声音策略与设置中心实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本项目不执行 Git commit；每个任务仍必须独立完成测试、检查和证据记录。

**Goal:** 在已通过真实 Hana 验收的通知分类基础上，建立清爽的设置中心导航、全局/分类/对象规则三层配置模型和可解释的分类声音策略，为后续视觉策略复用同一套匹配条件与规则基础。

**Architecture:** 通知事实和阶段二分类投影保持不变。新增只负责匹配的 `notification-rule-target` 领域模块，声音和未来视觉分别保存自己的策略配置；规则按匹配范围计算确定性优先级，最终只选出一个主声音决策。设置中心保持一个 Page surface，在当前 iframe 内切换声音、视觉、主题等小页面，避免跨 Page surface 导航丢失 `pluginIframeTicket`。

**Tech Stack:** Node.js ESM、原生 JavaScript、Node test runner、Hono 风格插件 routes、现有 SettingsStore/SettingsStorePersistence、NotificationApi、Windows-first Native Runtime、现有 audio-adapter。

## Global Constraints

- 当前基线为 `0.1.0-alpha.11`，必须保护 alpha.8 Native Runtime 交互稳定基线，以及已通过真实 Hana 的 Runtime、Shelf、侧边栏、Notification Center 和分类行为。
- 首批分类固定为 `chat`、`channel`、`tool`、`error`、`plugin`；分类是多标签投影，不修改通知原始事实。
- 声音和未来视觉读取同一份冻结 `createNotificationPresentationInput()` / 分类结果，不各自重新猜测通知类别。
- 一条通知最多产生一个主声音决策和一次播放请求；多标签不能导致多个声音连续播放。
- 第一版规则只支持结构化字段和明确的 AND 匹配：分类、生产者、事件、重要性；不实现任意规则 DSL、NOT、正则和正文关键词匹配。
- 规则对象面向通知对象集合，不为每一条具体桌面卡片或历史通知创建独立配置文件。
- 声音配置与未来视觉配置分别持久化；两者共享 `appliesTo` 结构和规则优先级，不把声音、视觉和 Runtime 坐标揉成一个配置对象。
- 规则优先级遵循“匹配范围越窄越优先”；同优先级冲突必须返回结构化诊断，不能静默依赖对象遍历顺序。
- 全局静音是绝对边界，不能被 critical 绕过；“静音普通通知但保留 critical”属于独立策略。
- 第一版只开放受控内置 cue；底层保留现有自定义 WAV/fallback 能力，但本阶段不在设置页面开放任意文件导入。
- `critical` 可以打断普通声音，但不能打断另一个 critical；同一稳定事件必须受冷却和去重约束，不能无限播放。
- 页面内部导航必须复用当前 iframe，通过 `hana.api.fetch()` 或既有客户端视图切换，不新增跨 Page surface 普通链接。
- 源码修改使用结构化 `read` / `edit` / `write`；Shell 仅用于测试、检查、构建和打包；不执行 Git commit。
- 每个实现任务必须先写失败测试，再写最小实现；任务完成前运行对应 focused 测试。
- 阶段收口必须运行 focused 测试、全量 `npm test`、`npm run check`、`git diff --check`、验收包构建与内容检查，并进行真实 Hana 声音/页面验收。

---

## 产品决定

### 设置中心

设置中心保持一个正式 Page surface，入口使用现有图像化导航卡片；进入后由左侧小分类卡片选择当前 iframe 内页面：

```text
设置中心
├─ 声音
├─ 视觉
├─ 主题
├─ 桌面布局
├─ 通知行为
├─ 历史与隐私
└─ Runtime
```

本阶段首先实现“声音”页面和共用导航模型；“视觉”“主题”可以先展示明确的即将开放状态或页面骨架，但不提前实现复杂视觉策略。

### 三层配置

```text
全局默认
  ↓
分类默认
  ↓
对象规则
  ↓
最终生效预览
```

- 全局默认：总开关、总音量、默认 cue、重复通知策略、critical 行为。
- 分类默认：chat/channel/tool/error/plugin 各自的开关、cue、音量和行为。
- 对象规则：通过 `appliesTo` 匹配分类、producer、event、importance 的通知集合；规则内部保存声音策略，不绑定单个通知实例。

### 第一版内置 cue

```text
chat-incoming
channel-incoming
tool-complete
tool-failed
plugin-notice
warning
critical-error
```

多标签主声音选择顺序固定为：

```text
critical-error > tool-failed > warning > tool-complete > channel-incoming > chat-incoming > plugin-notice
```

具体事件映射必须优先于单纯分类映射：工具失败不能被工具默认完成音覆盖，错误警告不能被插件普通音覆盖。

---

## 文件职责地图

### 新增

- `plugin/domain/notification-rule-target.js`：定义 `appliesTo` 的字段、AND 匹配、规范化、匹配维度计分和结构化错误；不包含声音或视觉策略。
- `tests/node/notification-rule-target.test.mjs`：覆盖 target 校验、空条件、AND 语义、producer/event/importance/category 匹配、未知字段和输入不变。
- `plugin/domain/sound-profile.js`：定义全局、分类和对象规则的声音配置 schema、内置 cue、默认值、版本化配置和规则冲突检测输入。
- `tests/node/sound-profile.test.mjs`：覆盖声音配置创建、默认值、分类键、规则策略、cue 白名单、音量和未知字段拒绝。
- `plugin/domain/sound-rule-resolver.js`：消费冻结 presentation input、声音配置和运行上下文，选择一个最终声音策略并返回命中规则与解释。
- `tests/node/sound-rule-resolver.test.mjs`：覆盖全局/分类/对象规则优先级、多标签单 cue、事件映射、同优先级冲突、全局静音和回退。
- `plugin/domain/sound-scheduler.js`：在策略决策与 audio-adapter 之间提供串行队列、critical 抢占、冷却和一次请求边界。
- `tests/node/sound-scheduler.test.mjs`：使用注入的 fake player 覆盖队列、普通声音合并、critical 打断普通、critical 冷却和播放失败不阻塞。
- `plugin/domain/sound-settings-persistence-config.js`：解析独立 `sound-settings.json` 路径、启用状态和 debounce 设置，默认路径位于宿主 `dataDir` 下。
- `tests/node/sound-settings-persistence-config.test.mjs`：覆盖默认路径、绝对路径、禁用、非法 dataDir/path/debounce。
- `plugin/domain/sound-settings-store.js`：在现有 SettingsStore 之外管理版本化声音领域设置和独立保存/应用状态；兼容读取旧 `settings.json` 中的全局音量与静音字段，写入新领域快照。
- `plugin/domain/sound-settings-store-persistence.js`：对独立声音快照执行原子保存、恢复、失败诊断和 flush。
- `tests/node/sound-settings-store.test.mjs`、`tests/node/sound-settings-store-persistence.test.mjs`：覆盖 revision、恢复、原子保存、坏快照和失败重试。
- `plugin/routes/settings-sound.js`：渲染声音小页面、全局设置、分类默认、对象规则入口和最终生效预览，不新增 Page surface。
- `tests/node/settings-sound-route.test.mjs`：覆盖页面结构、无横向遮挡 CSS、`hana.api.fetch()` 当前 iframe 请求、结构化错误和页面清理协议。
- `plugin/routes/settings-navigation.js`：抽取或扩展设置中心小页面导航和当前 iframe 内部切换；若现有 `settings.js` 结构适合直接扩展，则保留单文件并只新增明确的局部职责。
- `tests/node/settings-navigation.test.mjs`：覆盖声音/视觉/主题等小分类卡片、active 状态、视图切换和旧定时器清理。

### 修改

- `plugin/domain/notification-presentation-plan.js`：扩展冻结 `soundInput`，携带 `labels`、`event`、`importance`、`producer` 和必要的来源字段；不携带任意 CSS、音频路径、窗口坐标或 Runtime 参数。
- `tests/node/notification-presentation-plan.test.mjs`：增加声音输入字段、深冻结、输入不变和缺失事件回退测试。
- `plugin/domain/sound-settings.js`：从旧的 `typePolicies` / `importancePolicies` 兼容模型迁移到全局、分类和 rules 模型；旧字段可读取并转换，新的持久化结构不再继续扩大旧字段。
- `tests/node/sound-settings.test.mjs`：保留旧 focused 测试并增加迁移、分类配置、规则配置和未知字段拒绝。
- `plugin/domain/sound-policy.js`：保留现有静音、阈值、重复通知和 globalEnabled 语义，改为消费 resolver 输出，避免重复实现规则优先级。
- `tests/node/sound-policy.test.mjs`：增加全局静音绝对边界、critical 不绕过全局静音、普通静音保留 critical 和 resolver 决策接缝测试。
- `plugin/api/notification-api.js`：在通知进入声音准备路径时，先生成 presentation input，再调用 sound-rule-resolver 和 sound-policy；确保一次通知只创建一个声音决策和一个 scheduler 请求。
- `tests/node/notification-api-sound.test.mjs`、`tests/node/notification-api-deduplication-sound.test.mjs`：增加多标签单 cue、规则命中、重复通知和全局静音回归。
- `plugin/index.js`：接入独立声音设置存储、声音状态 API、声音页面 API、测试声音 API；保持既有 Runtime settings sync 和布局状态不被破坏。
- `tests/node/plugin-lifecycle.test.mjs`：增加声音设置恢复、声音状态边界、插件卸载清理和音频失败诊断回归。
- `plugin/routes/settings.js`：将当前长设置页收敛为设置中心入口/客户端视图壳；保留桌面布局与通知显示上限的行为，声音内容迁移到 `settings-sound.js` 或当前 iframe 子视图。
- `tests/node/settings-route.test.mjs`：增加设置中心导航、旧布局/显示上限接口不回归和内部视图切换测试。
- `plugin/routes/page-navigation.js`：只在需要时增加 settings 子视图标识和内部导航样式，不改变已有 Notification Center/Runtime/Diagnostics 导航契约。
- `CURRENT-STATUS.md`：每个垂直切片写入自动化证据；真实 Hana 通过后记录阶段三声音验收和保留的视觉页面骨架状态。
- `notification-hub-vnext-plan.md`：在阶段三章节补充三层设置、共享 target、独立 sound/visual 配置、规则优先级和第一版边界。

---

## Task 1：冻结共享对象匹配 target

**Files:**
- Create: `plugin/domain/notification-rule-target.js`
- Test: `tests/node/notification-rule-target.test.mjs`

**Interface:**

```js
export const RULE_TARGET_FIELDS = Object.freeze([
  'categories', 'producerIds', 'producerKinds', 'events', 'importance', 'sources', 'channels'
]);

export function createNotificationRuleTarget(input = {}): Readonly<{
  categories: readonly string[],
  producerIds: readonly string[],
  producerKinds: readonly ('hana'|'api')[],
  events: readonly string[],
  importance: readonly ('low'|'normal'|'high'|'critical')[],
  sources: readonly string[],
  channels: readonly string[]
}>;

export function matchesNotificationRuleTarget(target, soundInput): boolean;
export function getNotificationRuleSpecificity(target): number;
```

规则：每个 target 字段内部为 OR，不同字段之间为 AND；空 target 表示全局规则；第一版只允许上述字段；`categories` 只接受五个已知分类；数组去重并按固定顺序规范化；返回值深冻结。

- [x] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNotificationRuleTarget,
  matchesNotificationRuleTarget,
  getNotificationRuleSpecificity
} from '../../plugin/domain/notification-rule-target.js';

test('rule target uses OR inside a field and AND across fields', () => {
  const target = createNotificationRuleTarget({
    categories: ['tool', 'plugin'],
    events: ['failed'],
    importance: ['high', 'critical']
  });
  assert.equal(matchesNotificationRuleTarget(target, {
    labels: ['tool', 'error', 'plugin'], event: 'failed', importance: 'critical'
  }), true);
  assert.equal(matchesNotificationRuleTarget(target, {
    labels: ['tool'], event: 'completed', importance: 'critical'
  }), false);
  assert.equal(getNotificationRuleSpecificity(target), 3);
});
```

- [x] **Step 2: Run RED**

Run:

```powershell
node --test tests/node/notification-rule-target.test.mjs
```

Expected: FAIL because the target module does not exist.

- [x] **Step 3: Implement the minimal normalized target**

Implement field validation, deterministic array normalization, AND matching, and specificity equal to the number of non-empty target dimensions. Do not import sound or visual modules.

- [x] **Step 4: Run GREEN and immutability checks**

Run the focused test again. Add assertions that the target and nested arrays are frozen and caller-owned arrays are unchanged.

---

## Task 2：扩展 PresentationPlan 的声音输入

**Files:**
- Modify: `plugin/domain/notification-presentation-plan.js`
- Test: `tests/node/notification-presentation-plan.test.mjs`

**Interface:**

```js
soundInput: Readonly<{
  labels: readonly string[],
  event: string,
  importance: 'low'|'normal'|'high'|'critical',
  producer: Readonly<{ kind: 'hana'|'api', id?: string }> | null,
  source: string|null,
  channel: string|null
}>;
```

事件读取顺序必须明确：优先使用分类 facets.event；没有事件时从结构化通知字段映射 `tool_completed`、`tool_error`、`timeout`、`rate_limit`、`error`、`failed` 等；无法确定时返回 `event: 'arrived'`，不得从正文关键词猜测。

- [x] **Step 1: Add failing tests**

覆盖工具完成、工具失败、错误超时、插件生产者、普通聊天到达和未知事件回退；断言输入记录未改变，`soundInput` 深冻结。

- [x] **Step 2: Run focused RED**

```powershell
node --test tests/node/notification-presentation-plan.test.mjs
```

- [x] **Step 3: Implement structured event normalization**

只读取 `record.type`、`record.status`、`record.source`、`record.channel`、`record.producer`、`record.importance` 和分类 facets；保留既有 visualInput 兼容结构。

- [x] **Step 4: Run GREEN**

Expected: 既有 PresentationPlan 测试和新增声音输入测试全部通过。

---

## Task 3：建立声音 profile schema 与内置 cue

**Files:**
- Create: `plugin/domain/sound-profile.js`
- Test: `tests/node/sound-profile.test.mjs`
- Modify: `plugin/domain/sound-settings.js`
- Test: `tests/node/sound-settings.test.mjs`

**Interface:**

```js
export const SOUND_PROFILE_VERSION = 1;
export const SOUND_CATEGORIES = Object.freeze(['chat', 'channel', 'tool', 'error', 'plugin']);
export const SOUND_CUES = Object.freeze([
  'chat-incoming', 'channel-incoming', 'tool-complete', 'tool-failed',
  'plugin-notice', 'warning', 'critical-error'
]);

export function createSoundProfile(input = {}): Readonly<{
  version: 1,
  global: Readonly<{
    enabled: boolean,
    volume: number,
    cue: string,
    suppressDuplicates: boolean,
    quietMode: boolean,
    criticalBypass: boolean,
    criticalInterrupts: boolean,
    criticalCooldownMs: number
  }>,
  categories: Readonly<Record<string, Readonly<object>>>,
  rules: readonly Readonly<{
    id: string,
    name: string,
    enabled: boolean,
    appliesTo: Readonly<object>,
    strategy: Readonly<object>
  }>[]
}>;
```

默认值必须明确：`global.enabled=false` 保持当前默认静音兼容；`globalSoundEnabled` 的全局宿主开关仍然是绝对边界；第一版 criticalBypass 只针对普通静音，不得绕过 globalSoundEnabled；`criticalInterrupts=true`、`criticalCooldownMs` 使用一个经过校验的有限默认值；分类默认 cue 如下：chat→chat-incoming、channel→channel-incoming、tool→tool-complete、error→warning、plugin→plugin-notice。

- [x] **Step 1: Write schema tests first**

覆盖默认 profile、完整分类配置、规则 ID/name/appliesTo/strategy、cue 白名单、音量 0..1、冷却非负整数、未知字段、重复规则 ID 和输入不变。

- [x] **Step 2: Run RED**

```powershell
node --test tests/node/sound-profile.test.mjs tests/node/sound-settings.test.mjs
```

- [x] **Step 3: Implement profile normalization and legacy migration**

将旧 `defaultPolicy`、`typePolicies`、`importancePolicies` 映射为新的 `global` / `categories` / `rules`；保留旧快照读取能力，不在新规则中继续接受任意字段。

- [x] **Step 4: Run GREEN**

既有声音设置测试和新增 profile 测试全部通过；确认旧 SettingsStore 快照仍可读取。

---

## Task 4：实现声音规则解析器

**Files:**
- Create: `plugin/domain/sound-rule-resolver.js`
- Test: `tests/node/sound-rule-resolver.test.mjs`
- Modify: `plugin/domain/sound-policy.js`
- Test: `tests/node/sound-policy.test.mjs`

**Interface:**

```js
export function resolveSoundRule({ presentation, profile, context = {} }): Readonly<{
  play: boolean,
  cue: string,
  volume: number,
  priority: 'normal'|'high'|'critical',
  interrupt: boolean,
  suppressDuplicates: boolean,
  cooldownMs: number,
  matchedRuleId: string|null,
  matchedBy: 'global'|'category'|'rule'|'none',
  reason: string,
  bypassed: boolean
}>;
```

算法顺序：先校验全局宿主开关；再应用普通静音、重复通知和重要性阈值；再按 specificity、声明顺序和规则 ID 选择一个策略；多标签只通过固定主 cue 优先级产生一个结果；同 specificity 且条件交集冲突时返回 `SOUND_RULE_CONFLICT` 结构化错误或安全静音结果，不随机选择。

- [x] **Step 1: Write failing resolver tests**

至少覆盖：

```js
全局默认 → chat 分类 → tool+failed 对象规则 → api producer+failed+critical 精确规则
```

并断言最终只返回一个 cue；覆盖 `plugin + tool + error` 只选择 `tool-failed`，全局静音拒绝 critical，普通 quietMode 可由 critical 保留，重复通知默认被抑制。

- [x] **Step 2: Run RED**

```powershell
node --test tests/node/sound-rule-resolver.test.mjs tests/node/sound-policy.test.mjs
```

- [x] **Step 3: Implement pure resolver**

解析器不得调用 audio backend、不得修改 profile/presentation、不得读取正文；返回的 `matchedRuleId` 和 `matchedBy` 用于页面最终生效预览。

- [x] **Step 4: Run GREEN and conflict tests**

确认所有决策深冻结，冲突、未知 cue、非法 target 均有稳定错误码。

---

## Task 5：接入 NotificationApi，保证一次通知一次声音请求

**Files:**
- Modify: `plugin/api/notification-api.js`
- Test: `tests/node/notification-api-sound.test.mjs`
- Test: `tests/node/notification-api-deduplication-sound.test.mjs`

**Interface change:**

```js
new NotificationApi({
  soundProfile,
  soundPlayer,
  soundScheduler
});
```

`ingestEvent()` 返回的 `sound` 必须继续包含兼容的 `decision`、`scheduled`、`playback`、`global` 字段，同时增加 `matchedRuleId`、`cue` 和调度结果；没有 scheduler 时保持当前无阻塞 Promise 行为。

- [x] **Step 1: Add failing API tests**

构造一个同时含 `tool`、`error`、`plugin` 的记录，注入 fake player，断言 player 只调用一次且 cue 为 `tool-failed`；重复通知断言没有第二次播放；全局声音关闭断言 player 零调用。

- [x] **Step 2: Run RED**

```powershell
node --test tests/node/notification-api-sound.test.mjs tests/node/notification-api-deduplication-sound.test.mjs
```

- [x] **Step 3: Implement presentation → resolver → policy seam**

在已有 `ingestNotification()` 成功产生 record 后创建分类和 PresentationPlan；把 resolver 输出交给 sound-policy 的通用静音边界；不在 API 中重复实现规则优先级。

- [x] **Step 4: Run GREEN and legacy regression**

同一命令通过后，再运行现有所有 API sound tests，确认旧 profile 注入方式仍可用或得到明确迁移错误。

---

## Task 6：实现播放调度器

**Files:**
- Create: `plugin/domain/sound-scheduler.js`
- Test: `tests/node/sound-scheduler.test.mjs`

**Interface:**

```js
export function createSoundScheduler({ play, now = () => Date.now(), setTimer, clearTimer, maxQueue = 8 }): {
  schedule(decision, context): Promise<Readonly<object>>,
  clear(): void,
  getStatus(): Readonly<{ queued: number, playing: boolean, lastCriticalAt: number|null }>
};
```

规则：普通/高优先级声音串行；短时间同 cue 合并为一次；critical 取消尚未播放的普通队列并立即进入播放；critical 不打断正在播放的 critical；相同稳定 key 在 cooldown 内返回 `suppressed`；队列有上限，超出时丢弃最低优先级并给出结构化结果；player 失败返回诊断但 scheduler 继续工作。

- [x] **Step 1: Write fake-player tests**

覆盖普通队列顺序、连续聊天 cue 合并、critical 清除普通队列、critical 冷却、播放失败后下一项仍执行和 `clear()` 释放 timer。

- [x] **Step 2: Run RED**

```powershell
node --test tests/node/sound-scheduler.test.mjs
```

- [x] **Step 3: Implement scheduler without Windows dependency**

仅依赖注入的 `play`、clock 和 timer；不在 scheduler 中读文件、调用 PowerShell 或操作 Runtime。

- [x] **Step 4: Run GREEN**

确认 Promise 始终 settle，队列不会因单次播放异常卡死。

---

## Task 7：拆出独立声音领域持久化

**Files:**
- Create: `plugin/domain/sound-settings-persistence-config.js`
- Create: `plugin/domain/sound-settings-store.js`
- Create: `plugin/domain/sound-settings-store-persistence.js`
- Create: `tests/node/sound-settings-persistence-config.test.mjs`
- Create: `tests/node/sound-settings-store.test.mjs`
- Create: `tests/node/sound-settings-store-persistence.test.mjs`
- Modify: `plugin/index.js`
- Modify: `tests/node/plugin-lifecycle.test.mjs`

**Interface:**

```js
export function resolveSoundSettingsPersistenceConfig({ dataDir, config, overrides = {} }): Readonly<{
  enabled: boolean,
  filePath: string|null,
  debounceMs: number|null
}>;

export class SoundSettingsStore { /* getSnapshot, update, restoreSnapshot, markApplied, markApplyFailed */ }
export class SoundSettingsPersistenceCoordinator { /* restore, requestSave, flush, dispose */ }
```

默认文件为：

```text
<dataDir>/sound-settings.json
```

配置快照必须有独立 version/revision/updatedAt/settings，写入采用已有原子保存模式；旧 `settings.json` 仅作为兼容读取源，迁移成功后不删除旧文件。声音设置持久化失败不能阻止通知保存、Runtime 启动或插件卸载。

- [x] **Step 1: Write failing persistence and lifecycle tests**

覆盖默认路径、禁用、坏 JSON、revision 恢复、并发 save、失败后 pending snapshot 保留、插件 onload/onunload 清理和旧 settings 迁移。

- [x] **Step 2: Run RED**

```powershell
node --test tests/node/sound-settings-persistence-config.test.mjs tests/node/sound-settings-store.test.mjs tests/node/sound-settings-store-persistence.test.mjs tests/node/plugin-lifecycle.test.mjs
```

- [x] **Step 3: Implement isolated store and coordinator**

复用既有 `SettingsStoreSnapshot` 的原子持久化思想，但使用独立文件和声音 profile validator；不要把新规则写进 Runtime `config.update`，Runtime 只接收必要的 audio enabled/volume 投影。

- [x] **Step 4: Run GREEN and full lifecycle focused tests**

确认声音领域 restore/save/apply 状态与 Runtime layout、SceneState、notification persistence 相互独立。

---

## Task 8：扩展音频适配与 Windows 内置 cue

**Files:**
- Modify: `plugin/domain/audio-adapter.js`
- Test: `tests/node/audio-adapter.test.mjs`
- Modify: `plugin/domain/sound-rule-resolver.js`
- Test: `tests/node/sound-rule-resolver.test.mjs`

第一版仍只允许 `SOUND_CUES` 中的内置 cue。Windows 后端可以继续以现有 PowerShell/SystemSounds 作为保底，但 cue 映射必须覆盖 7 个产品语义，未知 cue 必须拒绝并回退到 `default`；适配器不得阻塞通知写入。`volume` 仍需在决策层保留，即使当前 SystemSounds 后端无法精确控制单次系统音量；页面必须明确显示“当前系统音效后端不提供独立音量校准”，不能假装已经实现精确音量。

- [x] **Step 1: Add failing adapter tests**

覆盖 7 个 cue 映射、未知 cue、设备不可用、backend reject、policy deny 不调用 backend、custom WAV 仍然保留现有 fallback 行为。

- [x] **Step 2: Run RED**

```powershell
node --test tests/node/audio-adapter.test.mjs
```

- [x] **Step 3: Implement cue registry and fallback**

保持 `playNotificationSound()` 返回结构兼容；将产品 cue 转换为 adapter cue 或明确 fallback，不把 Windows API 细节泄漏到策略层。

- [x] **Step 4: Run GREEN**

确认音频失败只产生结构化诊断，不删除通知、不阻塞 ingestion。

---

## Task 9：建立设置中心小页面和声音页面

**Files:**
- Create: `plugin/routes/settings-navigation.js` 或 Modify: `plugin/routes/settings.js`（按现有职责最小化选择）
- Create: `plugin/routes/settings-sound.js`
- Create: `tests/node/settings-navigation.test.mjs`
- Create: `tests/node/settings-sound-route.test.mjs`
- Modify: `plugin/routes/settings.js`
- Modify: `tests/node/settings-route.test.mjs`

页面必须保持当前 iframe 内切换。左侧卡片至少包含：

```text
声音、视觉、主题、桌面布局、通知行为、历史与隐私、Runtime
```

本阶段声音页面包含：

```text
全局设置
分类声音
详细规则
测试与预览
```

规则编辑器第一版只提供分类、生产者、事件、重要性四类结构化选择器，支持多选 OR 和字段间 AND；不显示任意 JSON 编辑器，不允许输入 CSS、路径、坐标或 DSL。声音页面显示命中规则、最终 cue、音量、是否打断、是否被静音/去重，并提供测试声音按钮。

- [x] **Step 1: Write route and shell tests first**

测试断言页面包含小分类卡片、声音页面标题、分类默认、规则入口、预览区域、`hana.api.fetch()` fallback、`notification-hub-view-before-unload` 清理协议，以及不存在 `overflow-x: hidden` 掩盖横向溢出。

- [x] **Step 2: Run RED**

```powershell
node --test tests/node/settings-navigation.test.mjs tests/node/settings-sound-route.test.mjs tests/node/settings-route.test.mjs
```

- [x] **Step 3: Implement client-side view switching**

保留正式 settings Page surface；内部视图通过当前 iframe API 请求 route 数据或局部页面模板切换。不要使用普通跨 surface href。每个 view 注册的刷新 timer 必须在切换前清理。

- [x] **Step 4: Add API endpoints**

已接入四个接口：状态、更新、结构化规则试算和测试声音。

```text
GET  /sound-settings-status
POST /sound-settings-update
POST /sound-settings-rule-test
POST /sound-settings-test
```

错误统一返回 `{ ok: false, error: { code, message, details } }`；原 settings/layout/display-limit endpoints 保持兼容。

- [x] **Step 5: Run GREEN and responsive static checks**

已完成声音页面骨架、当前 iframe 内切换、四个声音接口和静态响应式检查；真实 Hana 音频验收仍留给 Task 11。

---

## Task 10：完成最终生效预览和视觉/主题页面骨架

**Files:**
- Modify: `plugin/routes/settings-sound.js`
- Create: `plugin/routes/settings-visual.js` 或共享页面模板模块
- Create: `tests/node/settings-effective-preview.test.mjs`
- Modify: `CURRENT-STATUS.md`
- Modify: `notification-hub-vnext-plan.md`

声音页面增加一个只读测试输入：

```js
{
  labels: ['plugin', 'tool', 'error'],
  producer: { kind: 'api', id: 'download-plugin' },
  event: 'failed',
  importance: 'high'
}
```

页面必须显示：

```text
最终 cue
音量
优先级
是否打断
是否被全局静音/分类关闭/重复抑制
命中规则名称与 specificity
```

视觉、主题页面本阶段只提供小页面结构、当前状态和“视觉策略将在下一阶段开放”的明确状态；不要伪造视觉策略已经生效。共享 `appliesTo` schema 的接缝必须通过测试，但不创建视觉任意 CSS 配置。

- [x] **Step 1: Write preview tests**

覆盖对象输入、最终 resolver 输出、命中规则解释、静音原因和未知对象安全回退。

- [x] **Step 2: Run RED**

```powershell
node --test tests/node/settings-effective-preview.test.mjs
```

- [x] **Step 3: Implement preview endpoint/view**

复用真实 resolver，不在页面 JavaScript 中复制规则优先级；测试输入只经过结构化校验。

- [x] **Step 4: Run GREEN**

确认预览结果与 NotificationApi 实际声音决策共享 resolver；`/sound-settings-test` 已接入 scheduler，但尚未进行真实 Hana 音频验收。

---

## Task 11：全量验证、打包和真实 Hana 阶段门

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `notification-hub-vnext-plan.md`
- Build: `dist\notification-hub-vnext-0.1.0-alpha.11.zip`（不直接修改源码）

- [ ] **Step 1: Run focused sound/settings tests**

```powershell
node --test tests/node/notification-rule-target.test.mjs tests/node/notification-presentation-plan.test.mjs tests/node/sound-profile.test.mjs tests/node/sound-settings.test.mjs tests/node/sound-rule-resolver.test.mjs tests/node/sound-policy.test.mjs tests/node/sound-scheduler.test.mjs tests/node/sound-settings-persistence-config.test.mjs tests/node/sound-settings-store.test.mjs tests/node/sound-settings-store-persistence.test.mjs tests/node/settings-navigation.test.mjs tests/node/settings-sound-route.test.mjs tests/node/settings-effective-preview.test.mjs tests/node/audio-adapter.test.mjs tests/node/notification-api-sound.test.mjs tests/node/notification-api-deduplication-sound.test.mjs
```

Expected: all pass, no skipped new tests.

- [ ] **Step 2: Run full verification**

```powershell
npm test
npm run check
git diff --check
```

Expected: zero failures; skipped项只能是已有 Runtime executable 条件测试；语法检查和 diff 检查通过。

- [ ] **Step 3: Build and inspect release ZIP**

```powershell
& .\scripts\package-release.ps1 -Configuration Release
Get-FileHash .\dist\notification-hub-vnext-0.1.0-alpha.11.zip -Algorithm SHA256
tar -tf .\dist\notification-hub-vnext-0.1.0-alpha.11.zip
```

确认包内包含新的 sound domain、settings routes、manifest 和既有 Runtime/route 文件；记录真实 SHA256。修改源码后必须重新打包，不能复用旧 ZIP。

- [ ] **Step 4: Real Hana acceptance**

安装新包并重载插件，按以下顺序验收：

```text
1. 设置中心左侧声音、视觉、主题等小分类卡片可见。
2. 点击声音后仍在当前 iframe 内切换，没有 404。
3. 全局声音关闭时，聊天、工具、错误和 critical 全部静音。
4. 只关闭聊天分类时，工具完成和错误声音仍可用。
5. 工具失败 + 插件 + 错误多标签通知只播放一次主声音。
6. 重复通知在抑制窗口内不重复播放。
7. critical 可以打断普通声音，但不能绕过全局静音。
8. 声音页面的测试按钮可用；音频设备不可用时页面显示结构化失败，不影响通知卡片和历史。
9. 窄屏页面没有横向遮挡；Runtime、Shelf、分类标签、详情、Widget 深链接和设置导航回归正常。
```

- [ ] **Step 5: Record evidence**

在 `CURRENT-STATUS.md` 写入 focused/full/build/真实 Hana 证据；只有真实声音和设置验收通过后，才关闭阶段三声音阻塞。视觉策略保持“下一阶段”状态，不能提前标记完成。

---

## 计划自检

- 产品需求覆盖：独立小页面、全局设置、分类设置、对象规则、组合选择器、声音与视觉共用匹配条件、分别保存、最终生效预览，均有对应任务。
- 第一版边界覆盖：只支持分类/producer/event/importance 的结构化 AND 规则；不支持任意 DSL、NOT、正文关键词、自定义声音导入和复杂视觉策略。
- 类型一致性：`createNotificationRuleTarget()` → `matchesNotificationRuleTarget()` → `resolveSoundRule()` → `NotificationApi` 的输入输出契约已在任务中定义。
- 兼容性覆盖：旧 `sound-settings.js`、SettingsStore、SettingsRuntimeSync、NotificationApi、audio-adapter、现有 settings/layout/display-limit route 均有迁移或回归任务。
- 验收覆盖：Node focused、全量测试、语法检查、diff 检查、重新打包和真实 Hana 逐项验收均有任务。
- 未执行 Git commit；所有完成状态以测试输出和真实 Hana 证据为准。
