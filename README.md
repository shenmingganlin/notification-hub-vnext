# Notification Hub vNext

Notification Hub vNext is a Windows notification scene system for HanaAgent.

## Direction

- Node.js plugin domain manages notification semantics, policies, state, pages, widgets, diagnostics, and migration.
- C++20 Native Scene Runtime manages native windows, layout, physics, interaction, rendering, particles, DPI, and GPU composition.
- The two processes communicate through a versioned JSON protocol over Windows Named Pipe.
- `legacy-reference/notification-hub-0.2.1` is retained for behavior comparison and migration only; it is never included in the vNext release package.

## Current status

The project has completed the Phase 0/1 repository foundation and the initial Phase 2 protocol/diagnostic contracts. The vNext plugin now owns its Hana `onload/onunload` lifecycle, launches only the bundled Native Runtime, and persists SceneState below its own `dataDir`.

## Repository layout

- `plugin/`: Node.js plugin domain and surface adapters
- `runtime/`: C++ Native Scene Runtime
- `schemas/`: versioned protocol and domain schemas
- `tests/`: unit, protocol, fault-injection, performance, and window regression tests
- `docs/`: architecture and engineering documentation
- `legacy-reference/`: isolated legacy source and behavior reference

## Development prerequisites

- Windows 10/11
- Node.js >= 18
- npm
- Visual Studio Community 2026 with the Desktop development with C++ workload
- CMake and CTest from the Visual Studio 2026 installation
- Windows 10/11 SDK

Use a Visual Studio 2026 Developer Command Prompt or Developer PowerShell when building native code. This supplies the matching MSVC and Windows SDK environment without manually adding compiler internals to the system PATH.

## Commands

```powershell
npm run check
npm test
cmake --preset debug-vs2026
cmake --build --preset debug-vs2026
ctest --preset debug-vs2026

# Build an installable ZIP for manual drag-and-drop installation in Hana.
# The ZIP contains manifest.json at its root and the Release Runtime below runtime/.
& pwsh -NoProfile -Command '& .\\scripts\\package-release.ps1 -Configuration Release'
```

The repository preset targets the confirmed `Visual Studio 18 2026` x64 generator.

## vNext and legacy isolation

The vNext package uses the plugin ID `notification-hub-vnext`. Its Native Runtime is loaded from the installed vNext plugin directory, its SceneState and recovery files use the vNext `dataDir`, and each host instance uses a `notification-hub-vnext-*` Named Pipe. The package does not contain the legacy plugin, legacy helper, or legacy data files. Installing it by dragging the generated ZIP into Hana therefore leaves the existing `notification-hub` plugin untouched; both plugins may run concurrently.

## Version

Current development version: `0.1.0-alpha.1`

## License

MIT. See [LICENSE](./LICENSE).
