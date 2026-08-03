# Codex Handoff: notification-hub vNext

## 1. Mission

Continue development of `notification-hub vNext`, a Windows-native notification scene system for HanaAgent.

The repository is the complete source of truth. Do not reconstruct the project from chat history.

Workspace:

```text
C:\Users\Ganlin\Desktop\OH-WorkSpace\notification-hub-upgrade
```

Current branch and checkpoint:

```text
branch: main
previous committed checkpoint: 6c25504 fix: stabilize vnext install and idle runtime
current fix set: native card interaction fixes documented and verified below
```

The legacy plugin must remain installed and running in parallel. It must not be replaced, stopped, edited, or used as a runtime dependency.

## 2. Non-negotiable constraints

- The legacy plugin identity is `notification-hub`.
- The vNext plugin identity is `notification-hub-vnext`.
- Keep both plugins isolated and concurrently runnable.
- Do not stop or delete the legacy helper or the HanaAgent process.
- Only stop a process after verifying its executable path belongs to `notification-hub-vnext`.
- Any process stop, directory deletion, or other destructive cleanup requires explicit user confirmation.
- Final installation validation must use Hana's real UI drag-and-drop ZIP workflow.
- Do not replace real manual installation validation with a lower-level installer API.
- Do not claim installation success from static ZIP inspection alone.
- Do not claim complete multi-monitor, hot-plug, or cross-monitor DPI support; those are not finished.
- Preserve the one-change, test-before-stable, rollback-friendly workflow.

## 3. Repository map

```text
plugin/                         Node.js plugin domain and Hana lifecycle entry
plugin/index.js                 vNext onload/onunload entry
plugin/runtime/                 Host adapter, process manager, pipe client, recovery and persistence
plugin/protocol/                Versioned protocol envelope and message helpers
plugin/diagnostics/             Structured diagnostics and error codes
runtime/                        C++20 Native Scene Runtime
runtime/app/main.cpp            Runtime executable entry and self-tests
runtime/scene/                  Native window, controller, layout, geometry, renderer
runtime/transport/              Named Pipe framing and server
schemas/                        Versioned protocol and SceneState schemas
tests/node/                     Node unit and integration smoke tests
tests/cpp/                      Native unit tests
docs/                           Architecture and execution documents
legacy-reference/               Read-only behavior reference; never package into vNext
scripts/package-release.ps1     Builds the manual-install ZIP
notification-hub-0.2.1/         Legacy reference snapshot; do not modify for vNext work
build/                          Native build output; generated
dist/                           Release ZIP output; generated
```

## 4. Architecture already implemented

The current checkpoint includes:

- fixed, stack, and shelf layout math with shared linear layout primitives;
- Work Area Provider, explicit work-area overrides, fallback metadata, and layout state echo;
- explicit `cardOrder` / `card_order` handling;
- versioned `SceneState` contract and schema;
- `sceneStateSnapshot` read-only echo from Runtime ACK/health;
- SceneState-first recovery with legacy recovery snapshot fallback;
- atomic SceneState persistence with debounce, flush, rollback, and configuration parsing;
- `RuntimeHostAdapter` lifecycle orchestration;
- Node.js Named Pipe client and C++ Named Pipe server;
- Runtime process start, ready wait, exit monitoring, and bounded restart;
- Runtime recovery replay after restart;
- Win32 native scene window with Per-Monitor V2 DPI handling;
- Direct2D/DirectWrite offscreen card rendering with D3D11 and `WS_EX_LAYERED`/`UpdateLayeredWindow` presentation;
- transparent-region hit testing through `WM_NCHITTEST` and `HTTRANSPARENT`;
- close-button interaction and card dragging state machine;
- desktop hit-test and rendering self-tests;
- real Hana `onload` / `onunload` plugin entry;
- vNext-local Runtime path resolution;
- vNext-local Named Pipe namespace;
- startup failures confined to vNext diagnostics;
- `runtimeEnabled` configuration;
- release ZIP generation with root-level `manifest.json`.

## 5. Isolation contract

Installed legacy plugin:

```text
C:\Users\Ganlin\.hanako\plugins\notification-hub
```

Installed vNext plugin target:

```text
C:\Users\Ganlin\.hanako\plugins\notification-hub-vnext
```

Legacy helper:

```text
C:\Users\Ganlin\.hanako\plugins\notification-hub\helper\notification-toast-helper.exe
```

vNext Runtime:

```text
C:\Users\Ganlin\.hanako\plugins\notification-hub-vnext\runtime\notification-hub-runtime.exe
```

vNext Runtime pipes use the prefix:

```text
notification-hub-vnext-<pid>-<nonce>
```

The vNext host resolves its Runtime relative to `ctx.pluginDir` by default:

```text
runtime/notification-hub-runtime.exe
```

Do not hard-code a path into the old plugin directory. Do not reuse the legacy TCP helper, legacy data directory, or legacy process.

## 6. Manual-install incident and resolution

The release ZIP was generated and statically checked:

```text
file: dist\notification-hub-vnext-0.1.0-alpha.1.zip
sha256: 6472C25ACB6BC2037A328B6A01BA4DA83C5C928180415455201049A1689E2DD8
```

The first real Hana drag-and-drop attempt produced a red `EPERM / Permission denied` error while handling the vNext target directory. The failed attempt left a partial directory, and the vNext Runtime auto-started from that partial directory because `autoRestart: true`, creating a cleanup loop. This context was preserved before cleanup.

The following fixes were then applied in the vNext source:

- `runtime/transport/named_pipe.cpp`: avoid a blocking idle `ReadFile` on the Runtime UI thread; pump window messages while waiting for pipe data so transparent hit testing does not make the window appear hung.
- `plugin/runtime/scene-state-recovery.js`: do not replay `scene.update` for a truly empty Scene, preventing an empty upper-left Native window from being created.
- `plugin/index.js`: expose a JSON-safe plugin instance summary through `toJSON()`, preventing Hana install/lifecycle serialization from traversing the Runtime Host's Node timer graph.

Focused regression tests were added in `tests/node/plugin-lifecycle.test.mjs` and `tests/node/scene-state-recovery.test.mjs`.

After disabling the vNext plugin and reinstalling/enabling it through Hana's real UI, manual installation succeeded. Current verified state:

- vNext plugin: `loaded/activated`;
- vNext Runtime: running from the vNext install directory;
- empty Scene: no main window handle is created;
- legacy plugin and helper: remain installed and untouched.

The verified release ZIP is:

```text
file: dist\notification-hub-vnext-0.1.0-alpha.1.zip
sha256: 8A253EABB5F554333E0BDE5F823B3A9E0389421E3B81BDA4A0753C229F643ED2
```

Static ZIP checks passed:

- root-level `manifest.json` exists;
- `runtime/notification-hub-runtime.exe` exists;
- no nested `plugin/manifest.json` exists;
- no legacy `notification-hub-0.2.1` reference was included.

Replacing the files in an already active vNext install directory can still produce Windows `EPERM` due to directory/process locks. That is a live-replacement limitation, not evidence that the confirmed disable-then-install workflow failed. Do not replace an active install in place; disable it first and use the real Hana drag-and-drop flow.

The follow-up native interaction fix set is now verified in the repository and Debug Runtime:

- `runtime/scene/window.cpp`: keep scene/card windows topmost without activation; handle close-button press on `WM_LBUTTONDOWN` so a non-activating window does not lose the release message.
- `runtime/scene/controller.cpp`: explicitly preserve topmost ordering during geometry updates; synchronize native drag coordinates into card state; remove cards whose native windows were destroyed.
- `runtime/app/main.cpp`: extend the controller self-test to cover card hit testing, drag state synchronization, and close-on-press cleanup.

The new Release ZIP after these native fixes is:

```text
file: dist\notification-hub-vnext-0.1.0-alpha.1.zip
sha256: 8FD9445485690B121CF17A745FFB067E9FE878315BCA7CD952D7343C4FA00A86
```

The previously installed Hana package with hash `8A253EABB5F554333E0BDE5F823B3A9E0389421E3B81BDA4A0753C229F643ED2` remains the manually verified package. The new `8FD9...` package has not yet been installed through Hana's UI; disable vNext before replacing it and do not treat the Debug Runtime acceptance as a substitute for that manual installation.

## 7. Current UI observation

A screenshot also showed `Plugin internal error` after clicking a `恢复隐藏` action in a possible-follow-up panel. That error belongs to the panel action and was not evidence of vNext installation failure.

The user reported an apparently unresponsive invisible area near the upper-left corner. After the named-pipe message-pump fix and the empty-Scene recovery fix, the user confirmed that the area disappeared and the vNext package installed normally.

The native Debug Runtime and CTest now cover card center hit testing, drag coordinate synchronization, card close cleanup, main Scene window close cleanup, and unsolicited `scene.changed` delivery. SceneState now records a closed main window as `sceneWindow: null`, so recovery does not recreate it. Final validation of the new Release ZIP still requires the real Hana UI after reinstall.

## 8. Recent vNext fixes

The previous install/lifecycle fix set consists of five source/test changes:

- `plugin/index.js`
- `plugin/runtime/scene-state-recovery.js`
- `runtime/transport/named_pipe.cpp`
- `tests/node/plugin-lifecycle.test.mjs`
- `tests/node/scene-state-recovery.test.mjs`

Do not modify the installed legacy plugin while validating or committing this fix set.

The current native interaction follow-up consists of:

- `runtime/app/main.cpp`
- `runtime/scene/controller.cpp`
- `runtime/scene/window.cpp`

The BUG-5 state synchronization fix consists of:

- `plugin/protocol/index.js`
- `plugin/runtime/pipe-client.js`
- `plugin/runtime/process-manager.js`
- `plugin/runtime/scene-state.js`
- `plugin/runtime/scene-state-recovery.js`
- `runtime/protocol/message.cpp`
- `runtime/protocol/message.hpp`
- `runtime/transport/named_pipe.cpp`
- `schemas/scene-state.schema.json`
- `tests/node/protocol-diagnostics.test.mjs`
- `tests/node/scene-state-persistence.test.mjs`
- `tests/node/scene-state-recovery.test.mjs`
- `tests/node/scene-state.test.mjs`
- `tests/node/named-pipe-scene-event.test.mjs`

## 9. Required verification commands

Run from the repository root. Native commands require Visual Studio 2026 Developer PowerShell or an x64 Native Tools prompt.

```powershell
npm run check
npm test
cmake --preset debug-vs2026
cmake --build --preset debug-vs2026
ctest --preset debug-vs2026

git diff --check
git status --short
```

Expected results for the current fix set:

```text
npm test: 69 passed, 11 skipped, 0 failed
CTest: 25/25 passed
```

Re-run them before claiming any new fix is complete.

## 10. Release ZIP command

After source changes and passing tests:

```powershell
& pwsh -NoProfile -Command '& .\scripts\package-release.ps1 -Configuration Release'
```

The script must produce a ZIP whose root contains `manifest.json` and whose Runtime is at `runtime/notification-hub-runtime.exe`.

Before any manual installation attempt, inspect the ZIP entries and record the new SHA256. Static validation is necessary but insufficient.

## 11. Recommended next investigation

Priority order:

1. Disable vNext in Hana and install the new `8FD9...` ZIP through the real drag-and-drop UI; confirm `loaded/activated` and the vNext Runtime path.
2. Perform real Hana end-to-end acceptance with a non-empty card: display, drag, close, restart, and SceneState recovery.
3. Verify that the legacy plugin remains functional and that all vNext Runtime/process paths stay isolated.
4. Continue shelf visual/interaction work, host configuration hot reload, shutdown error reporting, and later multi-monitor work.

## 12. Files that must travel with the project

For a Codex session using the same machine, open the entire repository directory. Do not copy only `plugin/`.

Required source and project files:

```text
.git/
CMakeLists.txt
CMakePresets.json
VERSION
package.json
package-lock.json
plugin/
runtime/
schemas/
tests/
scripts/
docs/
README.md
PLAN.md
notification-hub-vnext-plan.md
legacy-reference/notification-hub-0.2.1/
notification-hub-0.2.1/        # reference only; do not edit for vNext
HANDOFF.md
```

Generated files are optional and should not be treated as source:

```text
build/
dist/
node_modules/
```

Keep `dist/notification-hub-vnext-0.1.0-alpha.1.zip` only when the next agent needs to inspect or manually install the exact artifact. Rebuild it after any source change.

## 13. First prompt for the next Codex

Use this prompt after opening the repository:

```text
Read HANDOFF.md, README.md, docs/architecture/phase-0-1-status.md, and the latest git history before changing anything. Inspect the current worktree and do not touch the legacy notification-hub plugin. The earlier vNext package was manually installed successfully; the new `C8BF...` package adds native topmost, drag-state, and close-button fixes and still requires real Hana drag-and-drop validation. Run the existing Node and CTest suites before changing behavior. Next, install the new package with vNext disabled, then validate non-empty card display, drag, close, restart, and SceneState recovery.
```

## 14. Recommended skills / operating habits

- disciplined bug diagnosis: reproduce, minimize, instrument, fix, regression-test;
- test-driven development for lifecycle and installer behavior changes;
- verification before completion;
- architecture review before changing process or plugin boundaries;
- Git-safe, one-change-per-commit workflow;
- dry-run-first and path-verified process operations;
- explicit user confirmation before deleting directories or stopping unrelated processes.

No credentials, API keys, or passwords are required by this handoff.
