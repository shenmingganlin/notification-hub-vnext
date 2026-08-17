# Sound Diagnostics and Explainability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. 本项目不执行 Git commit；每个任务必须独立完成测试、检查和证据记录。

**Goal:** 为声音系统增加最近一次诊断链路，让用户能看到声音输入、策略决策、调度结果、实际播放结果和失败原因，同时不改变现有声音行为。

**Architecture:** 新增纯领域模块 `sound-diagnostic.js`，只负责规范化和深冻结诊断记录；插件在通知声音调度和声音试听完成后记录最近诊断。声音设置状态接口返回有限数量的最近记录，页面增加只读“最近声音状态”区域。诊断写入失败不得影响通知入库、声音策略或插件生命周期。

**Tech Stack:** Node.js ESM、原生 JavaScript、Node test runner、现有 SoundSettingsStore、SoundScheduler、NotificationApi、Hana iframe 页面。

## Global Constraints

- 保持版本 `0.1.0-alpha.15`，不执行 Git commit。
- 全局静音绝对有效，critical、音频库试听和组合试听均不可绕过。
- 诊断只读、有限长度、内存保存，不新增持久化格式。
- 诊断不能保存绝对路径、原始音频数据、PowerShell 内容、stderr、完整通知正文或任意 metadata。
- 诊断失败不能阻塞通知入库、普通通知、Runtime 生命周期、试听和插件卸载。
- 页面保持当前 iframe 内切换、响应式布局，不使用 `overflow-x: hidden` 掩盖布局问题。
- 修改源码使用 `read` / `edit` / `write`；Shell 只用于测试、检查、构建和打包。
- 完成前运行 focused 测试、全量 `npm test`、`npm run check`、`git diff --check`、CTest、Release 打包校验，并使用 `stage_files` 交付。

---

### Task 1: 冻结声音诊断记录契约

**Files:**
- Create: `plugin/domain/sound-diagnostic.js`
- Create: `tests/node/sound-diagnostic.test.mjs`

**Interfaces:**
- `createSoundDiagnostic(input = {})` returns a deeply frozen diagnostic record.
- `normalizeSoundDiagnosticStatus(value)` returns one of `played`, `failed`, `suppressed`, `merged`, `queued`, `skipped`, `dropped`, `cleared`, `unavailable`.

**Record shape:**

```js
{
  id: 'sound-diagnostic-...',
  timestamp: '2026-08-15T00:00:00.000Z',
  source: 'notification' | 'settings-test' | 'sound-asset-test',
  input: { labels, event, importance, producer, source, channel, stableKey },
  decision: { play, soundId, cue, volume, volumeLayers, priority, interrupt, cooldownMs, matchedRuleId, matchedBy, reason, bypassed },
  scheduling: { status, reason, stableKey, queuePosition },
  playback: { attempted, played, source, soundId, cue, volume, reason, diagnostic, backend },
  summary: { outcome, explanation }
}
```

- [x] Write failing tests for required fields, defaults, deep freeze, bounded strings, omission of raw paths/body, and stable status normalization.
- [x] Run `node --test tests/node/sound-diagnostic.test.mjs`; confirmed failure because the module did not exist.
- [x] Implement validation and safe defaults; unknown optional fields are omitted, not copied wholesale.
- [x] Run the focused test and confirm all assertions pass.

### Task 2: Record notification and preview diagnostics without changing behavior

**Files:**
- Modify: `plugin/index.js`
- Modify: `plugin/api/notification-api.js` only if a narrow callback seam is required
- Test: `tests/node/plugin-lifecycle.test.mjs`
- Test: `tests/node/notification-api-sound.test.mjs`

**Interfaces:**
- `recordSoundDiagnostic(input)` appends a frozen record to a bounded in-memory list of at most 30 items and returns it.
- `getRecentSoundDiagnostics()` returns a new array containing the current records.

**Required behavior:**
- Notification sound scheduling records `skipped`/policy outcomes immediately and records scheduler plus playback outcome when the scheduler Promise settles.
- Settings preview and asset preview record `settings-test` or `sound-asset-test` outcomes.
- A scheduler result such as `{ status: 'merged', cue }` is represented as scheduling status; actual playback remains null.
- A playback result with `played: false` becomes `failed` and preserves only stable diagnostic code/reason.
- Recording errors are caught and logged through the existing sound diagnostic path; they never reject the original operation.

- [x] Add tests proving global mute records `skipped` without calling the backend, successful preview records `played`, failed backend records `failed`, and notification ingestion still returns its original result when diagnostic recording throws.
- [x] Run focused integration tests after adding the diagnostic seam.
- [x] Add the bounded recorder and wrap existing notification/preview scheduling Promises with a non-blocking diagnostic observer.
- [x] Run focused sound and lifecycle tests; old playback and ingestion assertions remain unchanged.

### Task 3: Expose diagnostics through sound settings status

**Files:**
- Modify: `plugin/index.js`
- Test: `tests/node/plugin-lifecycle.test.mjs`
- Test: `tests/node/settings-sound-route.test.mjs`

**Interface:**
- `getSoundSettingsStatus()` includes `soundDiagnostics`, an array of at most 30 sanitized diagnostic records.
- Existing `diagnostics` remains for configuration/persistence diagnostics to preserve compatibility.

- [x] Add lifecycle assertions for `status.soundDiagnostics` after successful, muted and failed试听.
- [x] Implement the additive `soundDiagnostics` field using `getRecentSoundDiagnostics()`.
- [x] Assert returned records are frozen/sanitized and no raw path or audio payload is exposed.
- [x] Run focused lifecycle and route tests.

### Task 4: Add a responsive read-only diagnosis panel to the sound workbench

**Files:**
- Modify: `plugin/routes/settings-sound.js`
- Test: `tests/node/settings-sound-route.test.mjs`

**UI contract:**
- Add panel title `最近声音状态` and status node `sound-diagnostics-list`.
- Empty state: `还没有声音诊断记录。试听或收到一条通知后，这里会显示结果。`
- Each record shows source, outcome, event/importance, selected sound, effective volume, scheduling status, playback status and explanation.
- No raw path, script, body, or arbitrary JSON editor is rendered.
- Refreshing `sound-settings-status` replaces the list; existing actions and iframe navigation remain unchanged.

- [x] Add static route tests for panel, empty-state text, status node, and safe fields.
- [x] Implement server-rendered initial diagnostics and client `renderDiagnostics()` with HTML escaping.
- [x] Add responsive CSS using existing grid/flex constraints; no horizontal overflow rule was introduced.
- [x] Run focused route tests and `node --check plugin/routes/settings-sound.js`.

### Task 5: Full verification, package and evidence

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: this plan checklist

- [ ] Run focused diagnostic, sound, lifecycle and route tests.
- [ ] Run `npm test`, `npm run check`, `git diff --check`, and CTest.
- [ ] Rebuild Release ZIP and validate required entries, no nested plugin root, and SHA256.
- [ ] Update `CURRENT-STATUS.md` with the diagnostic contract, verification counts, package hash and remaining real Hana acceptance.
- [ ] Stage the modified files and ZIP with `stage_files`; do not commit.
