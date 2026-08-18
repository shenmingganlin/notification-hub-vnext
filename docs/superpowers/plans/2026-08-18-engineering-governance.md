# Engineering Governance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 在不改变 Notification Hub 运行行为的前提下，降低旧音频链路的维护复杂度，统一构建与发布验证，并为下一阶段视觉制作建立干净、可回滚的基线。

**Architecture:** 保持 Audio Engine、WAV/Media Foundation 解码、Mixer、WASAPI、PowerShell/Windows Media fallback 和上层声音模型不变。先将 Audio Engine 依赖的 WAV 解析模块迁移到 `runtime/audio-engine/`，再删除仅用于旧服务的目标与实现；发布脚本继续只打包 Runtime 和 Audio Engine，并增加产物指纹与必需文件校验。

**Tech Stack:** C++20、CMake、MSVC Release、Node.js ESM、PowerShell、CTest、Node test runner。

## Global Constraints

- 不改变 `soundId`、`eventId`、`.nhsound`、`.nhcombo`、声音设置和试听语义。
- 不删除 Audio Engine、WASAPI、Media Foundation、PowerShell/Windows Media fallback。
- 不执行 Git `reset`、`clean`、`push`。
- 每个阶段先验证再提交，提交可独立回滚。
- 不把 IPC accepted 延迟称为设备回采延迟。
- 发布包必须只包含同一构建产出的 Runtime 和 Audio Engine。

---

### Task 1: 迁移共享 WAV 解析模块

**Files:**
- Create: `runtime/audio-engine/wav-pcm.hpp`
- Create: `runtime/audio-engine/wav-pcm.cpp`
- Modify: `runtime/audio-engine/asset-cache.cpp`
- Modify: `runtime/audio-engine/CMakeLists.txt` or `runtime/CMakeLists.txt`
- Test: existing `tests/native/audio-engine-asset-cache.test.cpp`

**Interfaces:**
- Preserve `notification_hub::audio::PcmFormat`, `PcmAsset`, `WavResult` and `parse_wav_pcm(std::span<const std::uint8_t>)` exactly.
- Move implementation without changing error codes, supported PCM layouts, or returned sample bytes.

- [ ] **Step 1: Copy the implementation and include it from Audio Engine**
- [ ] **Step 2: Run AssetCache native test and compare self-test output**
- [ ] **Step 3: Switch CMake Audio Engine targets to `audio-engine/wav-pcm.cpp`**
- [ ] **Step 4: Run CTest `audio_engine_asset_cache` and the Audio Engine self-test**
- [ ] **Step 5: Commit `refactor: move wav parser into audio engine`**

---

### Task 2: Remove retired audio-service build path

**Files:**
- Modify: `runtime/CMakeLists.txt`
- Delete: `runtime/audio-service/main.cpp`
- Delete: `runtime/audio-service/service.cpp`
- Delete: `runtime/audio-service/audio_output.cpp`
- Delete: `runtime/audio-service/audio_output.hpp`
- Delete: `runtime/audio-service/wav_pcm.cpp`
- Delete: `runtime/audio-service/wav_pcm.hpp`
- Test: CTest registration and full native matrix

**Interfaces:**
- The repository no longer builds or packages `notification-hub-audio-service.exe`.
- Audio Engine remains the only native audio executable shipped.

- [ ] **Step 1: Remove the old executable target and `runtime_audio_service_self_test`**
- [ ] **Step 2: Remove old source files only after Task 1 passes**
- [ ] **Step 3: Reconfigure and build Release**
- [ ] **Step 4: Run all CTest tests and Node tests**
- [ ] **Step 5: Commit `refactor: remove retired audio service`**

---

### Task 3: Strengthen release artifact verification

**Files:**
- Modify: `scripts/package-release.ps1`
- Test: add `tests/node/package-release-script.test.mjs` if script logic needs an isolated fixture

**Interfaces:**
- The package script accepts only `RuntimePath` and `AudioEnginePath` for native artifacts.
- It rejects missing artifacts, mismatched version metadata, nested plugin roots, legacy audio-service entries, command entries, and duplicate executable names.
- It records SHA256 and raw/ZIP size in its console output.

- [ ] **Step 1: Add explicit executable version/size manifest checks**
- [ ] **Step 2: Add a ZIP manifest summary to the script output**
- [ ] **Step 3: Package with the optimized Release binaries**
- [ ] **Step 4: Validate the ZIP entry set and SHA256**
- [ ] **Step 5: Commit `chore: harden release artifact verification`**

---

### Task 4: Establish visual-production handoff baseline

**Files:**
- Create: `docs/superpowers/plans/2026-08-18-visual-production-baseline.md`
- Modify: `README.md` only if the final stable artifact and governance state need documenting.

**Interfaces:**
- Record the frozen Audio Engine commit, optimized package SHA256, test counts, and known compatibility constraints.
- No visual feature implementation is included in this plan.

- [ ] **Step 1: Run final syntax, Node, CTest, package and `git diff --check` verification**
- [ ] **Step 2: Record the final evidence and rollback package**
- [ ] **Step 3: Commit `docs: record visual production handoff baseline`**
- [ ] **Step 4: Start the visual-production plan as a separate change stream**
