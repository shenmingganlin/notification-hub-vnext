# Visual Card Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可承载极简卡片、通知风暴、弹幕和未来自定义卡片的高性能视觉运行时底座。

**Architecture:** 事件接收、Presentation Selector、行为路由、channel policy、卡片生命周期和具体 Renderer 分层。第一阶段复用现有 Runtime 极简卡片完成可运行样板，只增加事件级 channel 路由、受控尺寸、独立并行 channel 和可选显示抑制；后续弹幕、特效和角色卡片作为 Renderer/Skin 扩展，不改变通知语义、声音链路或持久化模型。

**Tech Stack:** Node.js ESM、Hana Plugin Runtime API、C++ Runtime、Named Pipe、CTest、Node test runner。

## Global Constraints

- 不改变 `soundId`、`eventId`、`.nhsound`、`.nhcombo`、声音设置和试听语义。
- 视觉抑制与声音抑制必须独立；视觉抑制不得删除通知记录。
- 默认允许通知风暴；抑制必须是显式可配置策略。
- 不把 IPC accepted 延迟当作设备回采延迟，也不把渲染完成作为事件接收前提。
- 每个通知实例必须保留独立的 `eventId`、`visualProfileId`、`behaviorProfileId` 和 `channelId`。
- 视觉失败、窗口失败和布局失败不能阻塞通知入库、声音播放或插件生命周期。
- 不执行 Git `reset`、`clean`、`push`。

---

### Task 1: 清理旧 Audio Service 残留引用并冻结 A 基线

**Files:**
- Modify: `plugin/index.js`
- Test: `tests/node/plugin-lifecycle.test.mjs` and relevant host/runtime tests
- Modify: `docs/superpowers/plans/2026-08-18-visual-production-baseline.md` if final residual state changes

**Interfaces:**
- Plugin lifecycle must resolve only the shipped Runtime and Audio Engine paths.
- No source, CMake, manifest, or runtime configuration may reference `notification-hub-audio-service.exe`.

- [ ] **Step 1: Write a regression assertion that the active native audio path is Audio Engine only**
- [ ] **Step 2: Remove or replace the stale retired-service path**
- [ ] **Step 3: Run lifecycle, host adapter, native CTest and full Node tests**
- [ ] **Step 4: Commit `chore: remove retired audio service runtime reference`**

---

### Task 2: Define Card Runtime channel and policy contracts

**Files:**
- Create: `plugin/domain/card-runtime-policy.js`
- Modify: `plugin/domain/notification-presentation-profile.js`
- Modify: `plugin/domain/notification-presentation-selector.js`
- Test: `tests/node/card-runtime-policy.test.mjs`
- Test: `tests/node/notification-presentation-selector.test.mjs`

**Interfaces:**
- `createCardChannelPolicy(input)` returns a deeply frozen policy with `suppression`, `maxVisible`, `overflow`, `durationMs` and `channelId`.
- Supported suppression modes are `off`, `soft`, and `aggressive`.
- `resolveCardChannelPolicy({ eventId, categoryId, profile })` uses event → category → global fallback.
- `createPresentationSelector()` includes a frozen `behavior.channelPolicyId` and resolved policy metadata without changing sound selection.

- [ ] **Step 1: Add failing validation and event-over-category precedence tests**
- [ ] **Step 2: Implement bounded policy normalization; `off` must preserve every notification instance**
- [ ] **Step 3: Add selector projection tests for independent sound, visual, behavior and policy fields**
- [ ] **Step 4: Run the focused policy and selector tests**
- [ ] **Step 5: Commit `feat: add card channel policy model`**

---

### Task 3: Implement parallel Card Runtime channel management

**Files:**
- Modify: `plugin/domain/notification-behavior-manager.js`
- Modify: `plugin/index.js`
- Create or Modify: `plugin/domain/card-runtime-metrics.js`
- Test: `tests/node/notification-behavior-manager.test.mjs`
- Test: `tests/node/named-pipe-behavior-channel.test.mjs`

**Interfaces:**
- Each channel owns its behavior manager, visible cards, timers and overflow policy.
- `off` suppression does not merge, overwrite, queue or silently discard cards.
- `soft` limits visibility/queueing without deleting records.
- `aggressive` may aggregate repeated display work but must expose suppressed counts.
- Metrics expose `channelCount`, `activeCardCount`, `visibleCardCount`, `queuedCardCount`, `suppressedCardCount`, `layoutDurationMs` and `renderCommitDurationMs`.

- [ ] **Step 1: Add tests for simultaneous `stack.reply` and `stack.tool` channels**
- [ ] **Step 2: Add tests for storm mode retaining independent cards**
- [ ] **Step 3: Add tests for soft/aggressive suppression and observable counters**
- [ ] **Step 4: Implement per-channel lifecycle and bounded cleanup**
- [ ] **Step 5: Run focused behavior and Named Pipe tests**
- [ ] **Step 6: Commit `feat: add parallel card runtime channels`**

---

### Task 4: Add controlled minimal-card size and layout settings

**Files:**
- Modify: `plugin/domain/card-visual-settings.js`
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/index.js`
- Test: `tests/node/card-visual-settings.test.mjs`
- Test: `tests/node/settings-visual-route.test.mjs`

**Interfaces:**
- Normalize width to 240–720 px and height to 64–360 px.
- Normalize radius to 0–48 px, opacity to 0.3–1.0, gap to 0–48 px, and margin to 0–96 px.
- Clamp dimensions to the active work area before Runtime submission.
- Keep existing minimal-card defaults compatible for installations without new fields.

- [ ] **Step 1: Add failing range, default and work-area clamp tests**
- [ ] **Step 2: Implement normalization without accepting arbitrary style fields**
- [ ] **Step 3: Add width/height/gap/margin controls to the visual settings route**
- [ ] **Step 4: Verify rendered settings HTML remains self-contained and safe**
- [ ] **Step 5: Run focused visual settings tests**
- [ ] **Step 6: Commit `feat: add minimal card size controls`**

---

### Task 5: Build a runnable minimal-card parallel-channel sample

**Files:**
- Modify: `plugin/domain/notification-test-generator.js`
- Modify: `plugin/index.js`
- Modify: `runtime/scene/layout.cpp` and related Runtime files only if required by the existing scene contract
- Test: `tests/node/notification-test-generator.test.mjs`
- Test: `tests/node/named-pipe-multi-client.test.mjs` or the smallest existing scene smoke test

**Interfaces:**
- Test sample creates assistant reply and tool notifications with separate channel IDs.
- Both channels render minimal cards concurrently.
- Runtime submission remains asynchronous and failure-isolated.

- [ ] **Step 1: Add a deterministic two-channel sample input**
- [ ] **Step 2: Run the sample through the existing Runtime/Named Pipe smoke path**
- [ ] **Step 3: Verify independent ordering, dismissal and lifecycle cleanup**
- [ ] **Step 4: Commit `test: add parallel minimal card sample`**

---

### Task 6: Performance and regression gate before card skins

**Files:**
- Modify: `tests/node/` focused performance/regression test files
- Modify: `runtime/` only where measurement hooks are required
- Modify: `docs/superpowers/plans/2026-08-18-visual-production-baseline.md`

**Interfaces:**
- Event ingestion remains non-blocking with respect to render completion.
- Channel-local layout does not rebuild unrelated channels.
- Card cleanup releases timers and subscriptions.
- Metrics make storm behavior measurable without changing default user-facing semantics.

- [ ] **Step 1: Add a burst test with at least 100 independent tool cards and concurrent reply cards**
- [ ] **Step 2: Verify no notification loss in `suppression: off` mode**
- [ ] **Step 3: Verify soft/aggressive modes only change display work and expose counts**
- [ ] **Step 4: Run full Node, CTest, syntax, package and `git diff --check` verification**
- [ ] **Step 5: Record evidence and freeze Card Runtime Foundation**
- [ ] **Step 6: Commit `test: verify card runtime performance gate`**

---

## Later extensions, intentionally outside this first implementation

- Card skin registry and custom visual profiles.
- Danmaku renderer and movement timeline.
- Effect layer, particles and full-screen storm mode.
- DeepSeek 娘 / character card visual packages.
- Arbitrary user-authored visual code; any such capability requires a separate sandbox and security review.
