# 声音系统深度打磨实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本项目不执行 Git commit；每个任务必须独立完成测试、检查和证据记录。

**Goal:** 在已经通过真实 Hana 验收的分类声音策略基础上，把 notification-hub 的声音做成低打扰、可辨识、可混音、可诊断、可持续扩展的 Windows-first 声音系统。

**Architecture:** 保持通知事实、分类投影和视觉 decision 不变。声音系统单独经过 `PresentationPlan.soundInput → sound resolver → sound policy → scheduler/mixer → audio adapter → Windows backend`，其中策略决定“该不该响”，调度器决定“什么时候响”，音频适配器决定“如何播放”。未来视觉和行为只通过稳定的声音请求接口接入，不把卡片坐标、动画、物理或任意表现参数引入声音配置。

**Tech Stack:** Node.js ESM、原生 JavaScript、Node test runner、现有 NotificationApi、独立 SoundSettingsStore、Windows PowerShell/PCM WAV 保底后端；必要时增加 Windows 原生低延迟播放后端，但必须经过可回退的适配器边界。

## Global Constraints

- 当前基线为 `0.1.0-alpha.11`，必须保护 alpha.8 Native Runtime 交互稳定基线，以及已通过真实 Hana 的 Runtime、Shelf、侧边栏、Notification Center、分类和阶段四视觉验收。
- 当前主线只做声音；视觉策略、卡片样式、弹幕、叠加、物理、动画、粒子、模式和公共 API 本计划不实现。
- 声音和视觉继续读取同一份冻结 `createNotificationPresentationInput()`；声音不得从正文关键词重新猜测分类或事件。
- 一条通知最多产生一个主声音决策和一次播放请求；多标签不得造成多个连续播放。
- 全局声音关闭是绝对边界；critical 不得绕过全局静音。
- 默认声音必须克制：普通通知不能形成持续噪声；critical 可以提高优先级，但不能无限重复或连续打断另一个 critical。
- 内置 cue 只作为默认内容，不构成声音种类上限；所有分类、事件、重要性和用户规则都可以绑定自定义 soundId，不限制自定义声音的数量或名称。
- 自定义声音通过声音资产注册表管理；策略层只引用稳定 soundId，不把绝对路径、PowerShell 脚本或 Runtime 参数写入规则。
- 支持独立 `.nhsound` 声音包导入/导出；包是自包含的 JSON 文件，包含 manifest、profile 和 base64 音频资产，导入时校验版本、文件路径、大小、格式和 soundId 冲突，禁止路径穿越和脚本内容。选择自包含 JSON 是为了不引入额外压缩依赖，并保证 Windows-first 环境下导入导出可审计、可原子回滚。
- 第一版页面不提供任意 JSON/DSL 编辑器，但必须提供结构化声音库、分类/事件/重要性绑定、试听、导入和导出操作。
- 所有决策、抑制、合并、丢弃、失败和回退都必须有稳定的结构化 reason/diagnostic，不能依赖日志文本猜测。
- 源码修改使用结构化 `read` / `edit` / `write`；Shell 只用于测试、检查、构建和打包；不执行 Git commit。
- 每个实现任务先写失败测试，再写最小实现；任务完成前运行 focused 测试。
- 声音系统不能阻塞通知入库、历史持久化、Runtime 启动、Runtime 停止或插件卸载。
- 完成声明前必须运行 focused 测试、全量 `npm test`、`npm run check`、`git diff --check`、Release 构建/打包校验，并重新进行真实 Hana 声音验收。

## 目标声音体验

### 普通通知

- 一耳朵能区分聊天、频道、工具完成、工具失败、警告和 critical。
- 声音短、干净、有起音和收尾，不拖尾，不刺耳，不与连续通知形成机械噪声。
- 同类通知高频到达时会合并或抑制，用户仍能知道“有事发生”，但不会被每条事件逐个轰炸。

### 重要通知

- high 通过响度、音程或节奏层级提高辨识度，不单纯粗暴增大音量。
- critical 有明确的听觉身份，可以打断普通声音，但有冷却、去重和全局静音边界。
- 连续 critical 仍然受到节流，避免异常循环把系统变成警报器。

### 设置与诊断

- 页面展示最终 cue、音量、优先级、是否合并、是否抑制、是否打断、命中规则和失败原因。
- 试听可以验证真实播放链路，不能只返回“策略允许”。
- 播放器失败不影响通知本身；设备不可用、后端异常和资源回退可被区分。

## 声音系统边界

```text
NotificationRecord
  ↓
createNotificationPresentationInput()
  ↓
resolveSoundRule()
  ↓
resolveNotificationSound()
  ↓
createSoundScheduler()
  ↓
playNotificationSound()
  ↓
WindowsAudioBackend
```

每一层职责必须保持单一：

- `PresentationPlan`：提供冻结的结构化声音事实。
- `sound-rule-resolver`：根据 profile 选择 cue 和策略，不播放。
- `sound-policy`：处理全局开关、重要性阈值、quiet、重复等语义边界。
- `sound-scheduler`：处理队列、合并、抢占、冷却、并发和 Promise 生命周期。
- `audio-adapter`：校验 cue/volume，选择内置 cue、文件和 fallback，返回播放证据。
- Windows backend：执行实际播放，不反向修改通知领域状态。

## 阶段路线

```text
声音深挖 0：建立测量基线与契约
    ↓
声音深挖 1：无限自定义声音模型与资产注册表
    ↓
声音深挖 2：独立 .nhsound 导入/导出与安全校验
    ↓
声音深挖 3：调度器与混音内核
    ↓
声音深挖 4：音色、音程、响度和音量曲线
    ↓
声音深挖 5：Windows 播放后端与设备可靠性
    ↓
声音深挖 6：声音设置前端、试听、诊断与真实验收
    ↓
声音深挖 7：长期稳定性与性能收口
```

---

## Task 1：冻结声音请求、决策和播放证据契约

**目的：** 先把声音系统的输入、最终决策和真实播放结果分开，避免后续改音色时破坏策略或页面。

**Files:**
- Modify: `plugin/domain/notification-presentation-plan.js`
- Modify: `plugin/domain/sound-rule-resolver.js`
- Modify: `plugin/domain/sound-scheduler.js`
- Modify: `plugin/domain/audio-adapter.js`
- Test: `tests/node/notification-presentation-plan.test.mjs`
- Test: `tests/node/sound-rule-resolver.test.mjs`
- Test: `tests/node/sound-scheduler.test.mjs`
- Test: `tests/node/audio-adapter.test.mjs`

**Required contracts:**

```js
soundInput = Object.freeze({
  labels: Object.freeze(['tool', 'error']),
  event: 'tool_error',
  importance: 'high',
  producer: Object.freeze({ kind: 'api', id: 'example' }),
  source: 'plugin',
  channel: null,
  stableKey: 'event:example:123'
});

decision = Object.freeze({
  play: true,
  cue: 'tool-failed',
  volume: 0.72,
  priority: 'high',
  interrupt: false,
  cooldownMs: 0,
  matchedRuleId: null,
  matchedBy: 'category',
  reason: 'allowed',
  bypassed: false
});

playback = Object.freeze({
  attempted: true,
  played: true,
  source: 'cue',
  cue: 'tool-failed',
  volume: 0.72,
  reason: 'played',
  diagnostic: null,
  backend: 'windows-pcm'
});
```

- [ ] Step 1: 为每个契约增加失败测试，断言深冻结、稳定字段和输入不变。
- [ ] Step 2: 运行 focused 测试，确认旧实现至少在缺失新字段时保持兼容。
- [ ] Step 3: 实现最小规范化和兼容默认值，不增加新设置项。
- [ ] Step 4: 运行 focused 测试并记录当前调度延迟、播放结果和失败 reason 的基线。

**验收：** 任何声音请求都能明确区分“策略拒绝”“进入队列”“被合并/抑制”“播放器尝试但失败”“真实播放成功”。

---

## Task 2：重做调度器的队列、合并和优先级语义

**目的：** 先解决声音洪流问题，这是声音系统最重要的体验杠杆。

**Files:**
- Modify: `plugin/domain/sound-scheduler.js`
- Test: `tests/node/sound-scheduler.test.mjs`
- Modify: `plugin/index.js`
- Test: `tests/node/plugin-lifecycle.test.mjs`

**行为要求：**

1. 普通声音按队列顺序串行播放。
2. 同 cue 在合并窗口内只保留一次播放，并返回每个调用的合并结果。
3. high 不清空普通队列，但可以排在普通队列前面。
4. critical 清除尚未播放的普通/high 队列。
5. 当前正在播放普通声音时，critical 是否打断必须由受控 backend 能力决定；不支持真实打断时返回 `interrupt-unavailable`，不能伪装成已打断。
6. critical 不打断另一个正在播放的 critical。
7. `stableKey + cooldownMs` 在冷却窗口内返回 `suppressed`。
8. 队列超过上限时，最低优先级、最旧的待播放项优先丢弃。
9. `clear()` 必须 settle 所有 Promise、释放 timer、清空冷却和恢复可用状态。

- [ ] Step 1: 写 fake player、fake clock 和 fake timer 的失败测试。
- [ ] Step 2: 分离“队列排序”“同 cue 合并”“冷却抑制”“播放生命周期”四个纯逻辑。
- [ ] Step 3: 实现 critical/high/normal 的确定性队列规则。
- [ ] Step 4: 增加 scheduler status 投影，不暴露音频流或内部对象。
- [ ] Step 5: focused 测试覆盖 100、1000 次连续通知压力，以及播放失败后继续消费队列。

**验收：** 高频普通通知不会无限增长队列；critical 不会悄悄丢失；所有返回 Promise 都能确定结束。

---

## Task 3：建立无限自定义声音模型与资产注册表

**目的：** 取消内置 cue 对声音种类的限制，让任意分类、事件、重要性和对象规则都可以绑定用户自己的声音，同时保持策略、资产和播放后端分层。

**Files:**
- Create: `plugin/domain/custom-sound-asset.js`
- Create: `plugin/domain/sound-asset-registry.js`
- Create: `tests/node/custom-sound-asset.test.mjs`
- Create: `tests/node/sound-asset-registry.test.mjs`
- Modify: `plugin/domain/sound-profile.js`
- Modify: `plugin/domain/sound-settings.js`
- Modify: `plugin/domain/sound-rule-resolver.js`
- Test: `tests/node/sound-profile.test.mjs`
- Test: `tests/node/sound-rule-resolver.test.mjs`
- Modify: `plugin/domain/audio-adapter.js`
- Test: `tests/node/audio-adapter.test.mjs`

**Model:**

```js
soundAsset = Object.freeze({
  soundId: 'ganlin.tool.failed.v1',
  name: '工具失败',
  kind: 'custom',
  format: 'wav',
  relativePath: 'sounds/ganlin.tool.failed.v1.wav',
  durationMs: 180,
  sha256: '...',
  enabled: true
});

strategy = {
  soundId: 'ganlin.tool.failed.v1'
};
```

要求：

- `soundId` 允许用户定义，不能只从固定 `SOUND_CUES` 数组选择。
- 内置 cue 继续可用，并通过 registry 暴露为内置资产。
- 分类默认、事件规则、重要性规则和任意 `appliesTo` 规则都可以绑定 `soundId`。
- 自定义资产只保存相对于声音资产根目录的路径，不保存任意绝对路径。
- 资产格式、文件大小、时长和哈希必须可校验；路径穿越、重复 soundId、空名称、未知字段必须拒绝。
- 策略层只输出 `soundId`，audio adapter 再把它解析成内置 cue或已注册文件。
- 不限制自定义声音数量；限制只来自明确的安全上限，如单文件大小和总资产容量，并通过错误码解释。

- [x] Step 1: 为任意 soundId、分类绑定、对象规则绑定和资产校验写失败测试。
- [x] Step 2: 实现资产对象规范化、深冻结、哈希和相对路径校验。
- [x] Step 3: 扩展 profile strategy 接受 `soundId`，保留旧 `cue` 的迁移兼容。
- [x] Step 4: resolver 返回 `soundId`，旧 cue 输出保持兼容。
- [x] Step 5: audio adapter 支持从 registry 解析内置 cue 或自定义文件，未找到时返回结构化 fallback。

**验收：** 任意规则都能绑定任意有效 soundId；内置声音不再是可用声音种类的上限；通知仍然只产生一个声音请求。

---

## Task 4：独立 `.nhsound` 声音包导入导出

**目的：** 让声音方案可以完整分享和迁移，不依赖本机绝对路径。

**Files:**
- Create: `plugin/domain/sound-package.js`
- Create: `plugin/domain/sound-package-importer.js`
- Create: `plugin/domain/sound-package-exporter.js`
- Create: `tests/node/sound-package.test.mjs`
- Create: `tests/node/sound-package-importer.test.mjs`
- Create: `tests/node/sound-package-exporter.test.mjs`
- Modify: `plugin/index.js`
- Test: `tests/node/plugin-lifecycle.test.mjs`
- Modify: `plugin/routes/settings-sound.js`
- Test: `tests/node/settings-sound-route.test.mjs`

**Package contract:**

```text
.nhsound（自包含 JSON 声音包）
├─ manifest
├─ profile
└─ assets[]
   ├─ asset metadata
   └─ dataBase64
```

`manifest.json` 至少包含：

```json
{
  "format": "notification-hub-sound-package",
  "version": 1,
  "name": "Ganlin notification sounds",
  "sounds": [
    { "soundId": "ganlin.tool.failed.v1", "path": "sounds/ganlin.tool.failed.v1.wav", "sha256": "..." }
  ]
}
```

要求：

- 导出当前选定的声音资产和 profile 绑定；支持导出全部声音配置或单个 sound profile。
- `.nhsound` 内嵌自定义音频数据，导入先写临时目录，完整校验后原子并入声音资产目录和 SoundSettingsStore；失败时不改变现有配置。
- 禁止绝对路径、`..` 路径、重复 soundId、manifest/profile 不一致、未知脚本文件和超出安全上限的文件。
- 导入冲突提供明确策略：`reject`、`replace`、`keep-existing`；默认 `reject`，不静默覆盖用户声音。
- 导入导出结果包含包名、声音数量、绑定规则数量、冲突列表和校验摘要。
- 生成的包必须可在另一台 Windows 机器上通过相对路径恢复；不能依赖原工作区路径。

- [x] Step 1: 写有效包、坏 JSON、路径穿越、哈希不匹配、冲突和导入原子性的失败测试。
- [x] Step 2: 实现 JSON 声音包结构解析、base64 数据校验、哈希校验和相对路径校验，不引入额外压缩依赖。
- [x] Step 3: 实现导出临时文件、manifest/profile 生成、哈希计算和原子 `.nhsound` 输出。
- [x] Step 4: 将 import/export 接入插件 API，并确保 onload/onunload 清理临时文件。
- [x] Step 5: 声音页面增加“导入声音包”“导出当前配置”两个核心操作和结构化进度/失败反馈。

**验收：** 导出的 `.nhsound` 可以复制到另一台机器导入，声音资产和规则绑定完整恢复；任何失败都不会破坏原配置。

---

## Task 5：声音设置前端重构

**目的：** 把当前声音页面从“设置表单 + 测试按钮”升级成真正的声音工作台。

**Files:**
- Modify: `plugin/routes/settings-sound.js`
- Create: `plugin/routes/settings-sound-view-model.js`
- Test: `tests/node/settings-sound-route.test.mjs`
- Test: `tests/node/settings-effective-preview.test.mjs`
- Modify: `plugin/index.js`
- Test: `tests/node/plugin-lifecycle.test.mjs`

**页面结构：**

```text
声音工作台
├─ 总览：全局开关、音量、当前声音包、待保存/已应用状态
├─ 声音库：内置与自定义声音列表、搜索、试听、启用/停用、导入/导出
├─ 绑定策略：分类、事件、重要性和对象规则绑定 soundId
├─ 调度状态：当前播放、队列、最近合并/抑制/失败结果
└─ 诊断：设备、后端、最近失败、回退和校准说明
```

交互要求：

- 默认首屏先显示总览和声音库摘要，不把所有高级规则一次塞满。
- 声音库支持任意数量 soundId；列表采用分页/分批渲染，不人为限制声音数量。
- 每个声音条目显示名称、soundId、来源、格式、时长、文件大小、启用状态和试听按钮。
- 绑定策略使用结构化选择器，不显示 JSON 编辑器；每条规则显示最终命中 cue、soundId 和优先级。
- 导入导出显示明确的准备中、校验中、成功、部分冲突、失败状态；页面切换前清理请求和试听任务。
- 页面保持当前 iframe 内切换、响应式布局和无横向遮挡；不得使用 `overflow-x: hidden` 掩盖问题。
- 所有页面反馈都区分“已保存”和“已应用”，试听反馈区分“策略拒绝”和“实际播放失败”。

- [x] Step 1: 写声音工作台 DOM、状态节点、导入导出按钮和响应式静态测试。
- [ ] Step 2: 抽出服务端 view model，避免 route 内嵌过多状态转换。
- [x] Step 3: 实现声音库分批渲染、搜索和单项试听的第一版入口。
- [x] Step 4: 接入导入导出 API、进度反馈、冲突反馈和页面清理协议。
- [ ] Step 5: 在真实 Hana 中验证窄宽度、长名称、自定义声音数量较多时的布局与交互。

**验收：** 用户能在一个清晰页面完成声音查看、绑定、试听、导入、导出和故障判断，不需要接触路径或 JSON。

---

## Task 6：建立声音层级和音色设计参数

**目的：** 让不同事件“听起来不同”，但不通过单纯增大音量解决辨识度。

**Files:**
- Modify: `plugin/domain/audio-adapter.js`
- Create: `plugin/domain/sound-cue-registry.js`
- Test: `tests/node/sound-cue-registry.test.mjs`
- Test: `tests/node/audio-adapter.test.mjs`
- Modify: `plugin/domain/sound-profile.js`
- Test: `tests/node/sound-profile.test.mjs`

**首批音色模型：**

```js
{
  id: 'tool-failed',
  family: 'failure',
  baseFrequency: 220,
  secondaryFrequency: 165,
  durationMs: 150,
  attackMs: 8,
  releaseMs: 36,
  gain: 0.62,
  repeatPolicy: 'merge'
}
```

至少建立以下语义族：

- `incoming`：聊天、频道，轻、短、上行或开放音程；
- `completion`：工具完成，清晰、稳定、较明亮；
- `failure`：工具失败，短促、下降或不和谐但不刺耳；
- `warning`：警告，低频或双脉冲；
- `critical`：关键错误，明确双音程/双脉冲，但受冷却控制。

禁止把任意频率、任意波形、任意脚本直接暴露给页面；参数只能来自受控 registry。

- [ ] Step 1: 为 registry 白名单、字段边界、cue 到音色族映射写失败测试。
- [ ] Step 2: 把当前单一正弦音生成逻辑收敛为受控 cue renderer 输入。
- [ ] Step 3: 为每种语义族增加 attack/release，避免点击声和突兀截断。
- [ ] Step 4: 增加旧 cue 和未知 cue 的稳定回退。
- [ ] Step 5: focused 测试校验生成参数，不在测试中假装完成听感验收。

**验收：** 每个内置 cue 有稳定、可解释的声音身份；未知 cue 不会进入 PowerShell 脚本。

---

## Task 7：建立响度、音量曲线和安全上限

**目的：** 让设置中的音量百分比更接近用户实际听感，避免 50% 与 100% 差异不自然。

**Files:**
- Create: `plugin/domain/sound-loudness.js`
- Test: `tests/node/sound-loudness.test.mjs`
- Modify: `plugin/domain/sound-rule-resolver.js`
- Modify: `plugin/domain/audio-adapter.js`
- Test: `tests/node/sound-rule-resolver.test.mjs`
- Test: `tests/node/audio-adapter.test.mjs`
- Modify: `plugin/routes/settings-sound.js`
- Test: `tests/node/settings-sound-route.test.mjs`

**接口：**

```js
export function normalizeUserVolume(percent): number;
export function applySoundLevel({ volume, priority, cueFamily, globalGain }): number;
export function describeVolumeCalibration(): Readonly<object>;
```

规则：

- 页面继续使用 0～100%，内部保持 0～1。
- 采用受控非线性曲线，不把百分比直接当振幅。
- critical 只允许有限的 priority gain，不能突破全局安全上限。
- 0% 必须得到 0；100% 不得超过后端定义的最大振幅。
- 页面明确显示当前后端的校准能力和限制，不宣称系统设备音量已经被精确控制。

- [ ] Step 1: 写曲线单元测试和边界测试。
- [ ] Step 2: 接入 resolver/audio adapter，确保同一 decision 只转换一次。
- [ ] Step 3: 页面显示“用户音量”和“最终渲染增益”，避免概念混淆。
- [ ] Step 4: 真实 Windows 播放低、中、高三档，记录听感差异和是否削波。

**验收：** 0%、25%、50%、75%、100% 有单调、平滑、可解释的听感变化；critical 不会突然刺耳。

---

## Task 8：Windows 播放后端可靠性与低延迟验证

**目的：** 把“策略允许播放”和“Windows 真正发声”之间的证据做完整。

**Files:**
- Modify: `plugin/domain/audio-adapter.js`
- Create: `plugin/domain/windows-audio-backend.js`
- Test: `tests/node/audio-adapter.test.mjs`
- Test: `tests/node/windows-audio-backend.test.mjs`
- Modify: `plugin/index.js`
- Test: `tests/node/plugin-lifecycle.test.mjs`

**设计边界：**

- 先保留当前 PowerShell/PCM WAV 路径作为稳定 fallback。
- 如果引入常驻播放进程或原生 helper，必须通过 `playCue`/`playFile` 接口，不把进程管理泄漏到 resolver。
- 播放后端需要报告：设备是否可用、启动延迟、播放是否完成、失败阶段和 fallback 是否发生。
- 设备切换、PowerShell 启动失败、SoundPlayer 异常和播放退出码非零分别映射为稳定 diagnostic。
- 后端失败不能让 NotificationApi 的 ingestion reject。

- [ ] Step 1: 为当前 PowerShell 后端增加 spawn、退出码、设备不可用和超时测试。
- [ ] Step 2: 测量现有路径从 `playCue` 到进程退出的延迟分布。
- [ ] Step 3: 评估常驻 helper 是否值得引入；若不值得，保留 PowerShell fallback 并记录原因。
- [ ] Step 4: 无论采用哪条路径，都增加超时、清理和一次性回退。
- [ ] Step 5: 在真实 Windows 上切换默认音频设备，验证失败不会卡死 scheduler。

**验收：** 播放后端异常可诊断、可恢复、可回退；通知链路不被音频拖死。

---

## Task 9：声音规则与试听页面做到可解释

**目的：** 让用户能知道声音为什么播放、为什么不播放、最终采用什么音色。

**Files:**
- Modify: `plugin/routes/settings-sound.js`
- Modify: `plugin/index.js`
- Modify: `plugin/domain/sound-rule-resolver.js`
- Test: `tests/node/settings-sound-route.test.mjs`
- Test: `tests/node/settings-effective-preview.test.mjs`
- Test: `tests/node/plugin-lifecycle.test.mjs`

**页面新增只读信息：**

```text
最终 cue
声音族
用户音量
最终增益
优先级
是否进入队列
是否与已有声音合并
是否被冷却/去重/静音
命中分类或规则
播放器结果
诊断码
```

测试声音必须明确区分：

```text
策略拒绝
已进入调度但尚未播放
已合并
实际播放成功
播放器失败
设备不可用
```

- [ ] Step 1: 写 route/API 返回字段测试。
- [ ] Step 2: 接入真实 resolver 和 scheduler 状态，不在页面复制规则。
- [ ] Step 3: 增加页面刷新和 iframe view 切换时的请求清理。
- [ ] Step 4: 验证窄宽度下信息不会横向溢出。

**验收：** 用户可以凭页面反馈判断策略问题和播放器问题，不需要查看 stdout/stderr。

---

## Task 10：真实声音样本和听感校准

**目的：** 用真实耳机/扬声器听感校准参数，避免只在代码里讨论“高级”。

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `docs/superpowers/plans/2026-08-14-sound-deepening.md`
- Optional generated test artifacts: `dist\sound-preview\*`（仅在确有需要时）

**验收矩阵：**

| 场景 | 预期 |
|---|---|
| chat 连续 10 条 | 合并/节制，无机械连响 |
| channel + chat 交错 | 能区分来源，不互相遮盖 |
| tool complete | 短、清晰、非刺耳 |
| tool failed | 一耳朵识别为失败，不像普通到达 |
| warning 连续出现 | 有抑制，不形成警报轰炸 |
| critical + 普通播放 | critical 有优先级，普通不会无限堆积 |
| critical + critical | 有冷却，不重复压迫 |
| 全局静音 | 所有 cue 均不播放 |
| 设备切换/设备不可用 | 页面有结构化失败，通知仍正常入库 |

- [ ] Step 1: 在真实 Hana 中试听全部内置 cue。
- [ ] Step 2: 使用真实耳机和扬声器分别听低、中、高音量。
- [ ] Step 3: 记录刺耳、过短、过长、不可辨识、过响、过弱和重复轰炸问题。
- [ ] Step 4: 只调整 registry/曲线参数，不把听感修复散落到页面或通知 API。
- [ ] Step 5: 重新打包并重复完整验收。

**验收：** 每一个声音问题都能归因到音色、增益、调度或后端，而不是模糊地“感觉不对”。

---

## Task 11：稳定性、性能和发布收口

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `notification-hub-vnext-plan.md`
- Build: `dist\notification-hub-vnext-0.1.0-alpha.11.zip`

- [ ] Step 1: 运行声音 focused 回归。

```powershell
node --test tests/node/notification-presentation-plan.test.mjs tests/node/sound-rule-resolver.test.mjs tests/node/sound-policy.test.mjs tests/node/sound-scheduler.test.mjs tests/node/sound-cue-registry.test.mjs tests/node/sound-loudness.test.mjs tests/node/audio-adapter.test.mjs tests/node/windows-audio-backend.test.mjs tests/node/settings-sound-route.test.mjs tests/node/settings-effective-preview.test.mjs tests/node/notification-api-sound.test.mjs tests/node/notification-api-deduplication-sound.test.mjs tests/node/plugin-lifecycle.test.mjs
```

- [ ] Step 2: 运行全量验证。

```powershell
npm test
npm run check
git diff --check
```

- [ ] Step 3: 使用 Release Runtime 重新打包并核对 ZIP 内容和 SHA256。
- [ ] Step 4: 真实 Hana 回归声音页面、试听、全局静音、分类关闭、多标签、重复通知、critical、失败回退和设备异常。
- [ ] Step 5: 确认视觉、行为、Runtime、Shelf、Notification Center、Widget 深链接没有回归。
- [ ] Step 6: 在 `CURRENT-STATUS.md` 记录实际证据；不执行 Git commit。

**阶段门：** 只有自动化、Release 包和真实 Hana 听感/播放验收全部通过，才把本轮声音深挖标记为完成。

---

## 方案取舍

### 方案 A：先完善现有 PowerShell/PCM WAV 后端

优点：改动小、可快速真实验收、失败边界清楚、保留现有稳定 fallback。

代价：进程启动延迟和设备控制能力有限，连续播放的实时性上限较低。

### 方案 B：引入常驻 Windows 播放 helper

优点：可降低启动延迟，未来有更完整的设备和播放控制能力。

代价：新增进程生命周期、崩溃恢复、打包、权限和发布复杂度；未证明延迟问题前不应提前引入。

**当前选择：** 先走方案 A，完成调度、音色、响度和真实听感基线；只有测量证明 PowerShell 路径成为瓶颈，才单独立项评估方案 B。

## 计划自检

- 只覆盖声音，明确排除了视觉、行为、模式和公共 API。
- 声音决策与真实播放结果分层，能区分策略拒绝、调度抑制和后端失败。
- 用户新增的无限自定义声音、独立 `.nhsound` 分享包和声音工作台前端均有独立任务、数据边界和真实验收要求。
- 调度、音色、响度、后端、页面和真实验收有独立任务与验收门。
- 不引入任意音频路径、任意 DSL 或不可审计参数。
- 保留现有通知入库、Runtime、页面和视觉稳定基线。
- 任何完成声明都要求自动化证据、Release 包证据和真实 Hana 证据。
