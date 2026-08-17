# Windows Built-in Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace vNext's synthetic single-frequency default cues with the Windows built-in sounds used by the legacy plugin, while preserving vNext's mute, scheduling, preview isolation, fallback, and lifecycle boundaries.

**Architecture:** Keep sound policy and schedulers unchanged. Extend the Windows audio backend so each built-in cue first tries legacy-compatible WAV candidates under `%WINDIR%\Media`, then the corresponding Win32 `PlaySound` system alias, and finally the existing generated WAV tone. The generated PowerShell script remains behind the existing persistent runner and returns failure only if every playback path fails.

**Tech Stack:** Node.js ESM, PowerShell 5.1/7, Win32 `winmm.dll` `PlaySound`, Node test runner, Windows-first plugin runtime.

## Global Constraints

- Keep version `0.1.0-alpha.15`; do not commit.
- Global mute must prevent all playback paths, including fallback.
- Preview must remain on its independent backend and scheduler.
- Notification ingestion must not wait on preview playback.
- Do not include the legacy plugin in the release package.
- Use structured file tools for source edits; use shell only for tests, checks, build, and packaging.

---

### Task 1: Define and test legacy-compatible Windows cue mapping

**Files:**
- Modify: `plugin/domain/audio-adapter.js`
- Test: `tests/node/audio-adapter.test.mjs`

**Interfaces:**
- Produce exported `WINDOWS_SYSTEM_SOUND_CUES` and `resolveWindowsSystemSoundCue(cue)` for deterministic mapping tests.
- Each resolved mapping contains `files` (ordered Windows Media filenames) and `alias` (Win32 system sound alias).

- [ ] Add tests for default, chat, channel, warning/error, critical, and unknown cue mappings.
- [ ] Run the focused audio adapter test and confirm the new mapping tests fail before implementation.
- [ ] Add the frozen mapping and resolver without changing the public `playNotificationSound` contract.
- [ ] Run the focused audio adapter test and confirm the mapping tests pass.

Expected mapping:

```text
default, success, tool-complete -> ding.wav / Windows Ding.wav -> SystemDefault
chat-incoming                 -> chimes.wav / Windows Notify.wav -> SystemAsterisk
channel-incoming, plugin-notice -> notify.wav / Windows Notify.wav -> SystemAsterisk
tool-failed, warning, error    -> Windows Exclamation.wav -> SystemExclamation
critical, critical-error      -> Windows Critical Stop.wav -> SystemHand
```

### Task 2: Replace synthetic-first cue playback with Windows built-in-first playback

**Files:**
- Modify: `plugin/domain/audio-adapter.js`
- Test: `tests/node/audio-adapter.test.mjs`

**Interfaces:**
- `createWindowsAudioBackend().playCue({ cue, volume })` continues to return `{ played: boolean }` compatible with the scheduler.
- The generated PowerShell script tries existing Windows Media WAV candidates, then `PlaySound` alias, then the existing generated WAV fallback.

- [ ] Add script-level regression tests that verify `playCue` includes `winmm.dll`, `PlaySound`, `SND_FILENAME`, `SND_ALIAS`, ordered media candidates, and the final synthetic waveform fallback.
- [ ] Run focused tests and confirm the new script assertions fail.
- [ ] Implement a PowerShell `Add-Type` wrapper for `winmm.dll!PlaySound`, using synchronous playback and `SND_NODEFAULT` so missing assets do not silently report success.
- [ ] Generate the candidate path from the Windows directory at runtime, never from a hard-coded user-specific path.
- [ ] Preserve the existing frequency synthesis block as the final fallback and preserve volume clamping for that path.
- [ ] Run focused audio tests and confirm all pass, including persistent-runner reuse.

### Task 3: Update user-facing sound settings copy and add fallback diagnostics coverage

**Files:**
- Modify: `plugin/routes/settings-sound.js`
- Test: `tests/node/settings-sound-route.test.mjs`
- Test: `tests/node/plugin-lifecycle.test.mjs`

**Interfaces:**
- Sound settings page states that built-in cues use the Windows sound scheme and fall back only when unavailable.
- Existing global mute and preview result semantics remain unchanged.

- [ ] Add a route rendering assertion for the Windows sound scheme copy and the fallback description.
- [ ] Run focused route tests and confirm the assertion fails.
- [ ] Update only the relevant explanatory text; do not redesign the page.
- [ ] Add or retain a lifecycle regression proving global mute prevents the backend from being called at all.
- [ ] Run focused route and lifecycle tests and confirm all pass.

### Task 4: Full verification and release package

**Files:**
- No source changes expected.
- Package: `dist/notification-hub-vnext-0.1.0-alpha.15.zip`

- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Run `git diff --check`.
- [ ] Rebuild the Release ZIP with `scripts/package-release.ps1 -Configuration Release`.
- [ ] Validate ZIP root structure, Runtime presence, and absence of nested plugin roots.
- [ ] Compute SHA256 and stage the ZIP plus changed source/test files for delivery.
- [ ] Report that real Hana validation remains required for audible quality and system sound scheme behavior.
