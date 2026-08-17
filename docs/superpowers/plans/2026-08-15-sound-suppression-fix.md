# Sound Suppression Cooldown Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suppress the same actual playback resource while it is active, including different domain cues that map to one Windows system sound, while preserving independent different resources and immediate replay after settlement.

**Architecture:** Keep notification-level deduplication in `NotificationApi` separate from sound scheduling. The scheduler merges only an already-active request with the same playback key. The plugin supplies `resolveSoundPlaybackKey()`: custom `soundId` values remain independent, full-volume built-in cues use their actual Windows media resource, and lower-volume generated tones use the domain cue. No stable-key cooldown is introduced.

**Tech Stack:** Node.js ESM, Node built-in test runner.

## Global Constraints

- Do not merge notification deduplication and sound cooldown into one layer.
- `suppressDuplicates: false` bypasses active same-sound merge.
- Stable notification keys and notification deduplication do not control same-sound active merge.
- Physical playback resources, rather than only domain cue names, determine active merge identity.
- Preserve `runNotificationTest`, preview behavior, diagnostic safety, and all existing public result fields.
- Do not introduce a time-based cooldown; playback settlement is the only release boundary.
- Do not execute Git commit.

---

### Task 1: Lock the intended scheduler behavior with regression tests

**Files:**
- Modify: `tests/node/sound-scheduler.test.mjs`

**Interfaces:**
- Consumes: `createSoundScheduler({ play, now })` and `schedule(decision, { stableKey })`.
- Produces: regression coverage for active same-sound merge, independent different-sound playback, and post-settlement replay.

- [x] **Step 1: Add active-window behavior coverage**

Add a test that uses `now` backed by a mutable `currentTime` and an immediately-resolving player:

```js
const first = scheduler.schedule({ play: true, cue: 'chat-incoming', suppressDuplicates: true });
const second = scheduler.schedule({ play: true, cue: 'chat-incoming', suppressDuplicates: true });
// second is merged while first is active; after first settles, the same cue can play again.
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
node --test tests/node/sound-scheduler.test.mjs
```

Expected: the new test fails because the current scheduler ignores `stableKey` and `cooldownMs` after the first playback settles.

---

### Task 2: Verify the scheduler boundary and inspect the real playback lifecycle

**Files:**
- Modify: `plugin/domain/sound-scheduler.js`
- Modify: `tests/node/sound-scheduler.test.mjs`

**Interfaces:**
- Consumes: final `decision.soundId/cue`, `decision.suppressDuplicates`, and injected player lifecycle.
- Produces: `status: 'merged'` only while the same sound key is active; after settlement the next same-key request is `played`.

- [x] **Step 1: Confirm activeBySound is the only repeated-sound gate**
- [x] **Step 2: Add a playback-resource key seam**

Use the existing `activeBySound` map keyed by `keyOf(decision, context)`. The default remains `soundId ?? cue`; the production plugin injects `resolveSoundPlaybackKey()` so aliases such as `tool-failed` and `warning` share the same Windows media key at full volume. Do not add stable-key or cooldown state.

- [x] **Step 3: Remove the speculative cooldown implementation**

The user clarified that cooldown is not desired. The scheduler remains active-window-only.

- [x] **Step 4: Run the focused scheduler tests**

```powershell
node --test tests/node/sound-scheduler.test.mjs
```

Expected: all scheduler tests pass, including active merge, disabled suppression, different-sound independence, failure recovery, and clear.

---

### Task 3: Add end-to-end diagnosis and user-facing clarification

**Files:**
- Modify: `tests/node/notification-api-sound.test.mjs`
- Modify: `tests/node/plugin-lifecycle.test.mjs`
- Modify: `plugin/routes/settings-sound.js`

**Interfaces:**
- Consumes: resolved `cooldownMs` from the sound profile and the scheduler result.
- Produces: proof that `NotificationApi → resolver → scheduler` carries the final suppression flag, the scheduler uses the actual playback resource, and the test tool reports per-item `played/merged` scheduling outcomes.

- [ ] **Step 1: Add a NotificationApi test with explicit `cooldownMs`**

Use a controlled scheduler or injected clock to assert the first sound is `played`, the second same stable key is `suppressed`, and different stable keys remain independent. Keep existing notification deduplication assertions separate.

- [ ] **Step 2: Verify plugin settings update reaches the resolver**

Extend the existing lifecycle setting test to update `profile.global.suppressDuplicates` both `false` and `true`, then assert the next notification decisions reflect the setting. Do not use settings preview for this test.

- [ ] **Step 3: Update preview copy**

Add a concise note near the sound test controls: `试听为独立播放，不验证真实通知的重复声音抑制。` Keep `testSoundSettings()` bypass behavior unchanged.

- [ ] **Step 4: Run focused API, lifecycle, and route tests**

```powershell
node --test tests/node/sound-scheduler.test.mjs tests/node/notification-api-sound.test.mjs tests/node/plugin-lifecycle.test.mjs tests/node/settings-sound-route.test.mjs
```

---

### Task 4: Full verification and release package

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `README.md` if the public suppression semantics need clarification.
- Modify: `docs/superpowers/plans/2026-08-15-sound-suppression-fix.md`

- [ ] **Step 1: Run all verification commands**

```powershell
npm test
npm run check
npm run pressure -- --scenario all --count 1000
git diff --check
```

- [ ] **Step 2: Rebuild the release ZIP and verify its SHA256**

```powershell
& pwsh -NoProfile -Command '& .\scripts\package-release.ps1 -Configuration Release'
```

Inspect the archive and confirm the packaged `domain/sound-scheduler.js` contains the cooldown implementation.

- [ ] **Step 3: Update status evidence**

Record the focused regression, full Node count, pressure output, package SHA256, and the remaining real-Hana verification boundary. Do not claim physical speaker behavior from fake-player or scheduler evidence.

- [ ] **Step 4: Stage changed files for delivery**

Use `stage_files`; do not commit Git changes.
