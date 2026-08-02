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
commit: 76faf40 feat: integrate isolated vnext plugin runtime
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
- Direct2D/DirectWrite card rendering with D3D11/DirectComposition path and fallback;
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

## 6. Known manual-install incident

The release ZIP was generated and statically checked:

```text
file: dist\notification-hub-vnext-0.1.0-alpha.1.zip
sha256: 6472C25ACB6BC2037A328B6A01BA4DA83C5C928180415455201049A1689E2DD8
```

Static ZIP checks passed:

- root-level `manifest.json` exists;
- `runtime/notification-hub-runtime.exe` exists;
- no nested `plugin/manifest.json` exists;
- no legacy `notification-hub-0.2.1` reference was included.

A real Hana drag-and-drop attempt produced a red `EPERM / Permission denied` error while handling the vNext target directory. The failed attempt left a partial directory containing `runtime/` and `schemas/`. The vNext Runtime was then auto-started from that partial directory because the process manager had `autoRestart: true`. Stopping it caused Hana to start a new vNext Runtime, producing a cleanup loop.

The user explicitly confirmed cleanup. The vNext process was stopped only after path verification and the partial vNext directory was removed. Current verified state at handoff:

- vNext install directory: absent;
- vNext Runtime process: absent;
- legacy plugin directory: present;
- legacy helper: remains untouched.

There is currently no confirmed successful manual installation of this ZIP. Treat the package as unverified for Hana installation.

Do not repeatedly drag the same ZIP before deciding whether the installer needs a package or lifecycle change. If another attempt produces red text, preserve the complete screenshot and installer log before cleanup.

## 7. Current UI observation

A screenshot also showed `Plugin internal error` after clicking a `恢复隐藏` action in a possible-follow-up panel. That error belongs to the panel action and was not evidence of vNext installation failure. Do not conflate it with the ZIP installer error.

The user also reported an apparently unresponsive invisible area near the upper-left corner. At the time of the latest inspection there was no vNext Runtime window or process, so that specific observation could not be attributed to the Native Runtime. Reproduce after a confirmed install and identify the owning window/process before changing hit-test code.

## 8. Required verification commands

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

Expected historical results at the current checkpoint:

```text
npm test: 62 passed, 8 skipped, 0 failed
CTest: 21/21 passed
```

Re-run them before claiming any new fix is complete.

## 9. Release ZIP command

After source changes and passing tests:

```powershell
& pwsh -NoProfile -Command '& .\scripts\package-release.ps1 -Configuration Release'
```

The script must produce a ZIP whose root contains `manifest.json` and whose Runtime is at `runtime/notification-hub-runtime.exe`.

Before any manual installation attempt, inspect the ZIP entries and record the new SHA256. Static validation is necessary but insufficient.

## 10. Recommended next investigation

Priority order:

1. Reproduce the Hana drag-and-drop install from a clean state and capture the exact installer error.
2. Determine whether Hana's installer treats the temporary extraction directory and target directory as the same path when the plugin ID is new.
3. Inspect Hana installer logs or implementation if available; do not guess from the ZIP alone.
4. Review the vNext startup policy so a failed or incomplete installation cannot keep a Runtime alive and block cleanup.
5. Consider setting `autoRestart: false` until the first successful handshake, or introducing an explicit installation/startup failure state. Any change must be backed by focused tests.
6. After successful install, inspect all visible windows and process paths to identify the reported invisible upper-left region.
7. Only then continue shelf visual/interaction work, host configuration hot reload, shutdown error reporting, and later multi-monitor work.

## 11. Files that must travel with the project

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

Keep `dist/notification-hub-vnext-0.1.0-alpha.1.zip` only when the next agent needs to inspect or manually install the exact historical artifact. Rebuild it after any source change.

## 12. First prompt for the next Codex

Use this prompt after opening the repository:

```text
Read HANDOFF.md, README.md, docs/architecture/phase-0-1-status.md, and the latest git history before changing anything. Inspect the current worktree and do not touch the legacy notification-hub plugin. The vNext manual Hana drag-and-drop installation is not confirmed successful: a prior clean-ish attempt produced EPERM while handling notification-hub-vnext, and autoRestart caused a Runtime cleanup loop. First diagnose the installer/lifecycle boundary and reproduce only with explicit user approval for destructive cleanup. Run the existing Node and CTest suites before claiming any fix. Final validation must use Hana's real drag-and-drop UI; static ZIP inspection is not sufficient.
```

## 13. Recommended skills / operating habits

- disciplined bug diagnosis: reproduce, minimize, instrument, fix, regression-test;
- test-driven development for lifecycle and installer behavior changes;
- verification before completion;
- architecture review before changing process or plugin boundaries;
- Git-safe, one-change-per-commit workflow;
- dry-run-first and path-verified process operations;
- explicit user confirmation before deleting directories or stopping unrelated processes.

No credentials, API keys, or passwords are required by this handoff.
