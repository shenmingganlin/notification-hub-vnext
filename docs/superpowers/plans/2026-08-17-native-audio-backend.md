# Native Audio Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans when implementing this plan.

**Goal:** Replace the PowerShell/MCI playback path with a native Windows audio service that preserves existing sound configuration APIs while reducing custom-audio startup latency.

**Architecture:** Keep `soundId`, event bindings, settings, package formats, scheduler, and diagnostics in Node. Add a separate native audio process with a Named Pipe control protocol, Media Foundation decoding, PCM asset cache, and WASAPI shared-mode output. The old PowerShell backend is removed after the native path is verified.

**Tech Stack:** C++20, Windows Media Foundation, WASAPI, Windows Named Pipes, Node.js ESM.

## Global Constraints

- Preserve existing sound resource and binding semantics.
- Do not change `eventId` identity or `.nhsound`/`.nhcombo` formats.
- Do not retain the PowerShell backend as a runtime fallback.
- Keep audio service failure isolated from notification card Runtime failure.
- Verify before claiming completion.

### Task 1: Native audio service boundary

**Files:**
- Create: `runtime/audio-service/` sources and headers
- Modify: `runtime/CMakeLists.txt`
- Test: native service self-test and protocol tests

- [ ] Define `audio.load`, `audio.play`, `audio.stop`, `audio.unload`, and `audio.health` messages.
- [ ] Implement Named Pipe server lifecycle and JSON acknowledgements.
- [ ] Add WAV PCM loader and in-memory asset cache.
- [ ] Add WASAPI shared-mode output with a mixer thread and voice list.
- [ ] Add Media Foundation decoder for MP3/M4A/AAC/WMA.
- [ ] Add service self-tests for load, play acceptance, unload, and malformed requests.

### Task 2: Node native audio client

**Files:**
- Create: `plugin/domain/native-audio-client.js`
- Modify: `plugin/domain/audio-adapter.js`, `plugin/index.js`
- Test: `tests/node/native-audio-client.test.mjs`, `tests/node/audio-adapter.test.mjs`

- [ ] Start and monitor the native audio process.
- [ ] Load custom assets before playback and maintain request/response correlation.
- [ ] Preserve `playCue` and `playFile` adapter result shape.
- [ ] Make `playFile` send `soundId`, path, and volume without PowerShell.
- [ ] Remove PowerShell spawning and persistent runner code.

### Task 3: Resource lifecycle and packaging

**Files:**
- Modify: `plugin/domain/sound-asset-importer.js`, `scripts/package-release.ps1`, `plugin/manifest.json`
- Test: import, delete, reload, package, and service restart tests

- [ ] Load/decode imported files into the native service before marking playback ready.
- [ ] Remove decoded cache with the corresponding asset.
- [ ] Package the native audio executable and required runtime files.
- [ ] Verify service restart and device-unavailable diagnostics.

### Task 4: Verification

- [ ] Run focused Node tests.
- [ ] Build native service in Release mode.
- [ ] Run full tests and syntax checks.
- [ ] Run an on-machine first-sound latency benchmark.
- [ ] Package the release and record SHA256.
