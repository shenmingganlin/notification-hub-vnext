# Non-Visual Repair Plan

Date: 2026-08-23
Project version: 0.1.4
Scope: non-visual code only

## Goal

Establish a trustworthy, maintainable foundation before the visual subsystem is rewritten. Preserve working domain modules and Native protocol behavior unless a listed defect requires change.

## Explicit Exclusions

This plan does not redesign or repair the visual settings page, visual Profile model, visual preview, visual assets, visual packages, visual registries, visual runtime promotion, or visual-specific tests. The visual subsystem will be rewritten after the foundation phases below are complete.

Do not execute commit, push, reset, or broad unrelated cleanup during this plan.

## Baseline Findings

The audit found no reason to discard the whole project. The following are reusable foundations:

- NotificationApi dependency injection and domain error codes.
- NotificationStore atomic batch mutations.
- Atomic file persistence with temporary files, backups, and serialized writes.
- Event-presentation persistence revision protection.
- PipeClient request queue and pending cleanup.
- Frame decoding and size/fragmentation checks.
- SceneState persistence debounce and flush seam.
- Structured diagnostics and sensitive-field redaction.

The following require repair before visual rewrite:

- Notification history restore race can overwrite local changes.
- Behavior snapshot restore drops pending entries.
- `aggregate` is exposed but behaves like `queue`.
- Test tool `playSound` default disagrees with its declared contract.
- Runtime restart budget resets too early and may never exhaust.
- Recovery entries are deleted after transient restore failures.
- Node/Native/Schema protocol contracts drift.
- Plugin lifecycle lacks a single idempotent state machine and complete rollback.
- Audio Engine activation can block Plugin startup despite ADR-001.
- Route error and invalid-JSON handling are inconsistent.
- Release tests and packaging have false-green and version/path drift risks.

## Phase 1: Data Correctness and Side Effects

### 1.1 Notification history restore race

Files: `plugin/domain/notification-store-persistence.js`, related store/persistence tests.

Behavior:

- Capture the store revision/generation before asynchronous load.
- Apply the disk snapshot only when no local mutation occurred during load.
- If local mutations occurred, preserve memory state and persist it after restore.
- Keep restore errors diagnosable.

Acceptance:

- A notification added during restore is not lost.
- An update/status change during restore is not lost.
- A clean restore still replaces the initial empty store.
- Existing persistence and lifecycle tests remain green.

### 1.2 Behavior snapshot restore

Files: `plugin/domain/notification-behavior-manager.js`, behavior tests.

Behavior:

- Define whether pending cards are recoverable state.
- Restore pending entries when the snapshot contract says they are present.
- Preserve ordering and avoid duplicate promotion side effects.
- Add explicit tests for cards, pending, invalid snapshots, and removal.

### 1.3 Test tool sound default

Files: `plugin/domain/notification-test-generator.js`, `plugin/tools/notification-hub-run-test.js`, `plugin/commands/notification-hub-run-test.js`, related tests.

Behavior:

- Make omitted `playSound` resolve to the declared default: `false`.
- Keep explicit `true` behavior unchanged.
- Test both tool and command entry points.

## Phase 2: Runtime Reliability

### 2.1 Restart budget and stability window

Files: `plugin/runtime/process-manager.js`, process-manager tests.

Separate restart attempt count from a crash-loop circuit breaker. Reset the breaker only after a configured stable-running window. Add repeated ready-then-crash coverage.

### 2.2 Recovery entry retention

Files: `plugin/runtime/process-manager.js`, recovery tests.

Retain entries after transient transport, timeout, or Runtime failures. Remove only schema-invalid or definitively unrecoverable entries. Record attempt/status/error information without losing the original command.

### 2.3 Host lifecycle listener cleanup

Files: `plugin/runtime/host-adapter.js`, lifecycle tests.

Store listener references, detach them on cleanup/stop, and reject stale-generation events from old manager/client objects.

### 2.4 Plugin lifecycle and Audio Engine isolation

Files: `plugin/index.js`, lifecycle tests, ADR-001 related tests.

Introduce idempotent Plugin start/stop coordination. Make Audio Engine startup and backend activation best-effort so sound failure cannot block notifications, settings, or Plugin lifecycle.

## Phase 3: Contract and Build Trust

### 3.1 Unified route error contract

Files: non-visual routes and shared route helpers.

Reject invalid JSON as HTTP 400. Return `{ error: { code, message, details } }` consistently. Map domain, unavailable, and internal failures to appropriate HTTP status classes.

### 3.2 Protocol cross-implementation contract

Files: `plugin/protocol`, `runtime/protocol`, `schemas`, protocol fixtures/tests.

Align response error fields, timestamp validation, command/event registries, and add Node/Native/Schema corpus tests. Prefer a single source or generated artifacts.

### 3.3 Version source and release path

Files: `VERSION`, package/manifest/CMake/version generation, `scripts/package-release.ps1`, tests.

Make version and build output paths single-source and explicit. Release verification must build or validate the selected artifacts, check exact version agreement, unpack the ZIP, and run staging smoke.

### 3.4 Native test truthfulness

Files: native test assertion helpers, CMake/CTest, package scripts.

Prevent Release `NDEBUG` from removing assertions. Distinguish pass, fail, skip, and environment unavailable. Do not let `runtime_smoke` be an unconditional success path.

## Phase 4: Structural Isolation

Only after Phases 1-3 are stable:

- Reduce `plugin/index.js` to a thin composition root.
- Isolate notification-center query, mutation, view, and route modules.
- Separate settings-sound server data, client binding, assets, diagnostics, and package flows.
- Redesign `notification-behavior-manager` as pure state transition + policy + side-effect adapter.
- Split Native transport/session dispatcher into listener, session, protocol dispatcher, idempotency store, command handlers, and event publisher.
- Remove visual fields from stable SceneState/recovery contracts through a versioned visual adapter.

## Verification Policy

Each repair must include a focused regression test before implementation or an explicit reproduction test when the bug is integration-only. Run:

```powershell
npm run check
npm test
```

For Runtime/native changes, also run the configured CMake build and CTest with the selected build directory. Record skipped tests and environment requirements; never summarize skipped tests as passed.

## Execution Status

### Phase 1: Completed

Completed without editing visual files:

- Notification history restore now protects local add/update/status mutations during asynchronous load.
- Behavior snapshot restore preserves cards and pending order without replaying adapter side effects.
- Tool, command, and generator `playSound` defaults now agree: omitted means `false`; explicit `true` remains enabled.

Verification:

- Phase 1 focused tests: 31 passed.
- Main-session focused recheck: 28 passed.
- `npm run check`: passed, 314 JavaScript files.
- `git diff --check`: passed.
- Full `npm test`: 902 passed, 27 skipped, 1 failed in an existing visual test outside this phase.

The existing visual failure is tracked but intentionally not modified by this non-visual phase.

### Phase 2: Completed

Completed:

1. Runtime restart budget now uses a stability window and can exhaust during repeated ready-then-crash loops.
2. Transient recovery failures retain entries and record attempt/status/lastError for later retry.
3. HostAdapter detaches forwarded listeners and filters stale lifecycle generations.
4. Plugin `onload/onunload` is idempotent and shares lifecycle promises with rollback cleanup.
5. Audio Engine host/backend failures are degraded and diagnosable without blocking the main Plugin lifecycle.

Verification:

- Runtime/HostAdapter/SceneState focused: 24 passed, 5 skipped, 0 failed.
- Lifecycle/Audio/Settings focused: 77 passed, 1 existing visual failure.
- `npm run check`: passed, 314 JavaScript files.
- `git diff --check`: passed.
- Full Node tests after Phase 2: 909 passed, 27 skipped, 1 existing visual failure.

### Phase 3: In Progress

#### 3.1 Route error contract: completed core

Completed for non-visual JSON APIs:

- Added shared `plugin/routes/route-errors.js` helper.
- Invalid JSON now returns `ROUTE_INVALID_JSON` with `details.field = body` before entering domain APIs.
- Error responses use `{ ok: false, error: { code, message, details } }`.
- Core settings, widget, diagnostics, and notification-center routes distinguish input, not-found, conflict, internal, and unavailable failures.

Verification:

- Non-visual route focused tests: 44 passed.
- `npm run check`: passed, 315 JavaScript files.
- `git diff --check`: passed.

Known tail item: some sound asset/package endpoints in `settings.js` still use legacy per-route status mapping. Their invalid-JSON handling is fixed; their status mapping remains for a later small cleanup.

#### 3.2 Protocol contract alignment: completed

Completed:

- Node, Native, and Schema command/event registries include the same non-visual command set.
- Native error responses include `requestType`, `accepted`, `code`, `message`, `retryable`, and `details`.
- Node and Native use strict ISO-8601 timestamp validation.
- PipeClient verifies `requestId`, `traceId`, and `payload.requestType` before resolving a response.
- Added a shared protocol corpus and Node contract tests.

Verification:

- Protocol/PipeClient focused: 19 passed, 1 Runtime executable test skipped.
- `npm run check`: passed, 316 JavaScript files.
- `git diff --check`: passed.
- C++ build/CTest: not executed because `cmake`, `msbuild`, and `ninja` are unavailable in the current shell environment.

#### 3.3 Version and release contract: completed

Completed:

- `VERSION` is the canonical current release version (`0.1.4`).
- Node, package metadata, manifest, CMake, Runtime version macro, and hello default are checked against it.
- Historical diagnostic artifacts remain unchanged and are explicitly excluded from current release checks.
- Release packaging uses the current `debug-vs2026` output only, or explicit artifact paths; historical path fallback is rejected.
- Release packaging validates artifact names, same output directory, age delta, optional PE ProductVersion, ZIP contents, and emits a release manifest.

Verification:

- Version/release contract: 10 passed.
- Protocol contract regression: passed.
- `npm run check`: passed, 318 JavaScript files.
- `git diff --check`: passed.
- CMake configuration/build: not executed because CMake is unavailable in the current shell.

#### 3.4 Test and package truthfulness: completed

Completed:

- Native test targets keep `assert` expressions active in Release builds.
- Runtime `--self-test` executes protocol and transport checks and returns their real result.
- Added `test:unit`, `test:integration`, and `test:all` entry points; the integration gate fails when Runtime is missing.
- Release packaging runs staging Runtime smoke by default and records explicit `not-run` only when requested.
- Audio device unavailability is reported as CTest environment skip code 77, not PASS.

Verification:

- Version/release gate tests: 10 passed.
- Runtime integration gate: 8 passed, 0 skipped.
- `npm run check`: passed, 318 JavaScript files.
- `git diff --check`: passed.
- C++ configure/build/CTest from source: still requires the Visual Studio/CMake environment; an existing Release Runtime passed the process integration gate.

#### Non-visual correctness tail: completed

Completed:

- Notification center now probes `limit + 1`, clips the response, and reports `hasMore` only when an additional matching record exists.
- Sound asset and sound package JSON endpoints use the shared error body and domain-specific status mapping.

Verification:

- Notification-center/settings/sound focused: 36 passed.
- `npm run check`: passed, 318 JavaScript files.
- `git diff --check`: passed.

## Phase 4: Structural Isolation

Status: ready to begin. Visual code remains frozen and will be rewritten separately.

### 4.1 Notification service composition: completed

Completed:

- Added `plugin/services/notification-services.js` with an explicit notification service composition interface.
- Moved construction of notification store, settings stores, sound asset registry, sound backend, sound scheduler, `NotificationApi`, and sound configuration behind the composition factory.
- Preserved existing factory options, backend executable path, scheduler duration/play closures, and sound diagnostic callback behavior.
- Kept persistence, file pickers, Runtime adapters, visual services, and lifecycle cleanup in the Plugin composition root.
- Added focused tests for the composition interface, factory options, and shared Store/Scheduler instances.

Verification:

- Notification service focused: 3 passed.
- Plugin lifecycle focused: 69 passed, 1 pre-existing visual failure.
- `npm run check`: passed, 320 JavaScript files.
- `git diff --check`: passed.
- Pre-existing visual failure: `tests/node/plugin-lifecycle.test.mjs:1646`, expected `preset: soft / intensity: expressive` but received `preset: accent / intensity: balanced`; not modified.

### 4.2 Notification-center route interface: completed

Completed:

- Added `plugin/services/notification-center-services.js` with a narrow, frozen route interface.
- The interface exposes only notification-center methods for listing, details, status changes, removal, display settings, and settings-page initialization data.
- Bound methods preserve the receiver of the existing Notification API and Settings API.
- `notification-center.js` now prefers `_notificationHubVNextNotificationCenterServices` and no longer falls back to the whole Plugin object.
- Plugin construction, API replacement after persistence restore, and unload cleanup keep the route service injection synchronized.
- Existing explicit Notification API / Settings API composition remains compatible for isolated route tests and other callers.

Verification:

- Notification-center service and route focused: 27 passed.
- `npm run check`: passed, 322 JavaScript files.
- `git diff --check`: passed.
- Full specified route/lifecycle set: 94 passed, 1 pre-existing visual failure at `tests/node/plugin-lifecycle.test.mjs:1646`.

### 4.3 Sound-settings route interface: completed

Completed:

- Added `plugin/services/sound-settings-services.js` with an explicit frozen interface of the 18 methods used by sound settings, sound asset, diagnostics, and package routes.
- Sound routes now prefer `_notificationHubVNextSoundSettingsServices` and no longer use the whole Plugin as a fallback.
- Kept the wide Settings API available for unrelated non-visual routes.
- Synchronized sound service injection during construction, load, Notification API replacement, and unload cleanup.
- Preserved existing sound route URLs, payloads, error bodies, and `400/404/409/500/503` mappings.
- Kept file pickers, audio backends, persistence, and domain validation behind the existing Plugin/domain implementation.

Verification:

- Sound service/settings focused: 16 passed.
-墨斗指定的 sound/settings/lifecycle suite: 83 passed, 1 pre-existing visual failure.
- `npm run check`: passed, 324 JavaScript files.
- `git diff --check`: passed.
- Pre-existing visual failure remains at `tests/node/plugin-lifecycle.test.mjs:1646`; not modified.

### 4.4 Sound rule and asset service split: completed

Completed:

- Reduced `sound-settings-services.js` to the 8 methods for sound rules, playback, workbench, and diagnostics.
- Added `sound-asset-services.js` with the 10 methods for assets, bindings, and sound package import/export.
- Updated `settings.js` so rule routes and asset/package routes use separate service keys.
- Both services are frozen, receiver-bound, mutually isolated, and never fall back to the whole Plugin.
- Synchronized both service references through Plugin construction, load, Notification API replacement, and unload cleanup.
- Preserved route URLs, payloads, error bodies, and HTTP status mappings.
- Did not modify `settings-sound.js` page content or any visual path.

Verification:

- Focused sound/settings/lifecycle suite: 86 passed, 1 pre-existing visual failure.
- `npm run check`: passed, 326 JavaScript files.
- `git diff --check`: passed.
- Pre-existing visual failure remains at `tests/node/plugin-lifecycle.test.mjs:1660`; not modified.

### 4.5 Notification behavior state split: completed

Completed:

- Added `plugin/domain/notification-behavior-state.js` as the state module for visible/pending card collections, capacity placement, promotion, aggregate keys, suppression metrics, and snapshot validation.
- Kept `notification-behavior-manager.js` responsible for profile/policy normalization, decisions, and adapter side effects.
- Preserved `createBehaviorManager`, snapshot, restore, enqueue, remove, and promotion contracts.
- Restore remains side-effect free and preserves the complete manager snapshot contract.

Verification:

- Behavior manager/state focused: 12 passed.
- SceneState/persistence/lifecycle regression matrix: 96 passed, 1 pre-existing visual failure.
- `npm run check`: passed, 328 JavaScript files.
- `git diff --check`: passed.
- Pre-existing visual failure remains at `tests/node/plugin-lifecycle.test.mjs:1660`; not modified.

### 4.6 Request session dispatcher: completed

Completed:

- Added `plugin/runtime/request-session-dispatcher.js` for request pending registration, correlation validation, response settlement, timeout cleanup, late-response rejection, and session-wide rejection.
- Kept `pipe-client.js` responsible for socket connection, reconnect, frame decoding, event forwarding, and diagnostics.
- Preserved request/response API, protocol fields, error codes, timeout behavior, and the original socket identity during timeout handling.
- Avoided touching Native `named_pipe.cpp`, whose current implementation is coupled to scene/visual payload handling and would exceed this minimal slice.

Verification:

- Dispatcher focused: 4 passed.
- PipeClient/HostAdapter/RuntimeProcessManager focused: 21 passed, 5 environment skips, 0 failed.
- `npm run check`: passed, 330 JavaScript files.
- `git diff --check`: passed.
- Native CMake/MSBuild/CTest unavailable in the environment; no new behavior failure.

### 4.7 Recovery replay coordinator: completed

Completed:

- Added `plugin/runtime/recovery-replay.js` for ordered recovery execution, per-key attempt tracking, transient failure retention, definitive failure removal, and recovery diagnostics/results.
- Kept `RuntimeProcessManager` responsible for lifecycle gating, `recoveryInProgress`, and event forwarding.
- Preserved retry count, idempotency keys, diagnostic fields, and external recovery API behavior.
- Reused the existing `recovery-plan.js` for source selection instead of duplicating its responsibility.

Verification:

- Recovery replay + Runtime/Host/Scene/Pipe focused: 31 passed, 5 Runtime executable environment skips, 0 failed.
- `npm run check`: passed, 332 JavaScript files.
- `git diff --check`: passed.
- No visual paths touched.

### 4.8 Runtime diagnostics projection: completed

Completed:

- Added `plugin/runtime/diagnostics-projection.js` for diagnostic normalization, recursive sensitive-field filtering, current/recovery error projection, source ordering, and bounded summary counts.
- Replaced only the non-visual diagnostics/status/log logic in `plugin/index.js`.
- Preserved current failure semantics, JSON fields, recovery notices, and diagnostics export behavior.
- Corrected a validation-found regression so Runtime page status continues to expose `lastError` and connected SceneState errors still count as `currentFailure`.
- Left `plugin/routes/diagnostics.js` HTML and URL handling untouched.

Verification:

- Diagnostics projection + protocol/route/Host/Process focused: 35 passed, 5 Runtime executable environment skips, 0 failed.
- `npm run check`: passed, 334 JavaScript files.
- `git diff --check`: passed.
- Full `npm run test:all`: 963 passed, 27 skipped, 1 pre-existing visual failure.
- Runtime integration: 8 passed, 0 failed.
- No visual paths touched.

### 4.9 Final non-visual structure audit: completed

Audit result:

- `plugin/index.js` wide `runtimeTestApi` is a legitimate composition root and compatibility facade.
- Runtime/diagnostics routes use a cross-domain Runtime facade intentionally; further splitting would not improve the current non-visual contract without widening scope.
- Widget remains a cross-domain aggregation entry and is reserved for later Runtime/visual structure work.
- Generic settings and visual forwarding remain intentionally wide until the planned visual rewrite.
- Fixed the only missed non-visual seam: `settings-sound.js` now uses explicit sound settings services or an explicit Settings API composition and never falls back to `_notificationHubVNextPlugin`.

Verification:

- Final non-visual focused set: 105 passed, 0 failed, 6 Runtime environment skips.
- Runtime integration: 8 passed, 0 failed.
- `npm run check`: passed, 334 JavaScript files.
- `git diff --check`: passed.
- No visual paths touched by the final audit fix.

Phase 4 non-visual structural isolation is complete. Further decomposition should wait for the visual rewrite or a new concrete defect; do not manufacture additional service layers.

Later slices:

- notification-center query/mutation/view isolation;
- sound settings server/client/asset isolation;
- behavior manager state/policy/adapter separation;
- Native transport/session dispatcher isolation;
- SceneState and visual adapter separation.

Do not edit visual files. Do not change version `0.1.4`. Do not commit or push.
