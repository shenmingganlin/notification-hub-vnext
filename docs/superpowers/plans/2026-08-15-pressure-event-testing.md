# 压力测试与事件语义修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可参数化的命令行压力测试和受控 Hana 真实卡片测试入口，同时修正声音设置中“新消息”与真实事件语义不一致的问题。

**Architecture:** 命令行入口复用现有 Node 测试 seam，只负责可重复的静默压力与结构化结果；Hana 测试入口复用 NotificationApi 和 Runtime 展示链路，使用明确的测试前缀、数量上限、间隔和事件说明。事件语义单独通过标准化测试事件映射处理，保留已有 `message_end` 的助手回复完成兼容语义，不把未知 Hana EventBus 事件伪造成真实事件。

**Tech Stack:** Node.js ESM、Node test runner、现有 NotificationApi、NotificationEventAdapter、Native Runtime、Hana plugin route/tool API、PowerShell。

## Global Constraints

- 保持版本 `0.1.0-alpha.15`，不执行 Git commit。
- 源码修改使用 `read` / `edit` / `write`；Shell 只用于测试、检查和构建。
- 压力测试默认不调用真实音频设备，不启动大量真实 PowerShell 进程。
- Hana 测试入口必须有明确数量上限、间隔下限和测试前缀。
- 测试通知必须在卡片标题或正文中说明事件类型、事件语义、序号和总数。
- 全局静音必须绝对阻断声音，但不阻断通知卡片和历史入库。
- 未确认 Hana EventBus 真实事件契约前，不把 `message_end` 改成“新消息”。
- 诊断不得泄露绝对路径、原始正文、PowerShell 脚本或音频数据。
- 完成前运行 focused 测试、全量 `npm test`、`npm run check`、`git diff --check`；若运行时代码或包内容改变，再运行 CTest、打包校验和真实 Hana 验收准备。

---

### Task 1: 冻结事件语义矩阵

**Files:**
- Create: `docs/superpowers/plans/2026-08-15-event-semantics.md`
- Modify: `CURRENT-STATUS.md`
- Test: `tests/node/notification-event-adapter.test.mjs`
- Test: `tests/node/settings-sound-route.test.mjs`

- [ ] Step 1: 记录当前可证实事件与用户层显示名称的映射：`message_end` = 助手回复完成，`channel_new_message` = 频道新消息，`tool_execution_end + isError=false` = 工具完成，`tool_execution_end + isError=true` = 工具失败，系统 warning = 系统警告。
- [ ] Step 2: 增加失败测试，断言 `message_end` 产生 `assistant_message` / “助手回复完成”，不能被测试为聊天“新消息”。
- [ ] Step 3: 增加事件说明映射的测试，确保声音配置页面的 `arrived` 显示名称不会无证据地宣称是助手回复完成或新一轮用户消息。
- [ ] Step 4: 只有发现真实 EventBus 中存在聊天消息事件后，才增加 `chat_new_message`；否则保留 `arrived` 作为用户配置兼容值，并在页面辅助说明中写清当前真实来源。
- [ ] Step 5: 将已确认语义写入 `CURRENT-STATUS.md`，注明未知事件不得默认为新消息。

**验收：** 用户可以从页面和诊断中区分“助手回复完成”和“聊天新消息”；现有 `message_end` 兼容行为不回归。

---

### Task 2: 参数化命令行压力入口

**Files:**
- Create: `scripts/run-sound-pressure.mjs`
- Modify: `package.json`
- Test: `tests/node/sound-pressure-cli.test.mjs`

**Interface:**

```text
npm run pressure -- --scenario eager --count 1000
npm run pressure -- --scenario duplicate --count 1000
npm run pressure -- --scenario failures --count 300
npm run pressure -- --scenario mute --count 500
npm run pressure -- --scenario all
```

The command prints one JSON result:

```json
{
  "scenario":"eager",
  "count":1000,
  "played":1000,
  "merged":0,
  "failed":0,
  "dropped":0,
  "settled":1000,
  "durationMs":12
}
```

- [ ] Step 1: 写 CLI 参数解析失败测试：未知 scenario、非整数 count、超过 10000、缺少参数必须返回非零退出和稳定错误码。
- [ ] Step 2: 将现有 `sound-pressure.test.mjs` 的受控 player 场景提取到可复用函数，不调用真实设备。
- [ ] Step 3: 实现 `eager`、`duplicate`、`failures`、`mute` 和 `all` 场景，输出单个 JSON 结果，错误输出写 stderr。
- [ ] Step 4: 增加命令执行测试，断言 `eager` 和 `duplicate` 的计数结果准确。
- [ ] Step 5: 将 `npm run pressure` 加入 package scripts。

**验收：** 用户可以用一条命令重复执行压力测试，并得到机器可读统计；默认测试不会产生真实声音。

---

### Task 3: 受控 Hana 卡片压力测试 API

**Files:**
- Modify: `plugin/index.js`
- Create: `plugin/domain/notification-test-generator.js`
- Create: `tests/node/notification-test-generator.test.mjs`
- Modify: `tests/node/plugin-lifecycle.test.mjs`
- Modify: `CURRENT-STATUS.md`

**Interface:**

```js
await plugin.runNotificationTest({
  count: 10,
  intervalMs: 100,
  events: ['chat_message', 'channel_message', 'tool_completed', 'tool_error', 'timeout', 'system_warning'],
  createCards: true,
  playSound: true,
  label: '声音并发测试'
});
```

Rules:

- `count` range: 1..100; default 5。
- `intervalMs` range: 0..5000; default 100。
- `events` only from the supported test-event matrix。
- Every generated notification has `source: 'notification-hub.test'`, a stable test prefix, sequence metadata and a human-readable semantic note.
- `createCards:false` stores and optionally plays without Runtime cards.
- `playSound:false` creates cards and stores notifications without scheduling sound.
- The method returns aggregate counts and per-event counts; it never throws because one sound playback failed.

- [ ] Step 1: 写 generator 的失败测试：非法 count、非法 interval、未知 event、超过 100 条均拒绝。
- [ ] Step 2: 写生成结果测试：每条 title/content/metadata 都有 `[压力测试]`、事件说明、序号和总数。
- [ ] Step 3: 实现 generator 的标准事件映射和通知构造，不直接伪造 Hana EventBus。
- [ ] Step 4: 在 plugin 中接入 NotificationApi、可选 Runtime scene.create 和可选声音调度，保证间隔等待不阻塞 onload/onunload。
- [ ] Step 5: 增加生命周期测试，验证测试结束后没有留下未 settle 的测试 Promise 或重复订阅。

**验收：** Hana 可以调用受控测试入口生成真实卡片，卡片明确说明自己是什么事件测试，不会伪装成普通业务通知。

---

### Task 4: Hana 工具/测试入口注册

**Files:**
- Modify: `plugin/manifest.json`
- Modify: `plugin/index.js` 或现有插件工具注册文件
- Create/Modify: `tests/node/plugin-tool-registration.test.mjs`
- Modify: `README.md`

- [ ] Step 1: 根据当前 Hana SDK 实际能力确认工具注册接口，不凭 manifest 猜测字段。
- [ ] Step 2: 写工具 schema 测试，限制 count、intervalMs、events、createCards、playSound 和 label。
- [ ] Step 3: 注册一个明确名称的工具，例如 `notification_hub_run_test`，工具描述中说明它会生成桌面卡片和声音，不是普通通知发送 API。
- [ ] Step 4: 让工具调用 `plugin.runNotificationTest()`，返回 JSON 汇总而不返回内部路径、脚本或原始音频数据。
- [ ] Step 5: 在 README 中补充 Hana 调用样例和安全限制。

**验收：** Hana 能发现并调用测试工具；工具参数错误会被拒绝，不会生成部分不可追踪的无限通知。

---

### Task 5: 多事件测试矩阵与真实验收

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `README.md`
- Test: `tests/node/notification-test-generator.test.mjs`

- [ ] Step 1: 先运行 CLI 静默压力：`eager 1000`、`duplicate 1000`、`failures 300`、`mute 500`。
- [ ] Step 2: 在 Hana 中调用 6 条事件各 1 条，确认卡片语义和声音诊断：聊天新消息、频道新消息、工具完成、工具失败、超时、系统警告。
- [ ] Step 3: 运行 10 条 mixed 测试，间隔 100ms，观察不同 `soundKey` 是否独立启动。
- [ ] Step 4: 运行 3 轮生命周期测试，每轮 5 条，停用和重新启用插件后检查 Runtime、声音和诊断状态。
- [ ] Step 5: 把真实 Hana 结果、未证实的聊天新消息 EventBus 契约和下一步决定写回 `CURRENT-STATUS.md`。

**验收：** 压力测试、卡片测试和事件语义都有可复现实证；“新消息”不再与“助手回复完成”混淆。
