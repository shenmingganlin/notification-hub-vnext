# Notification Hub vNext

Notification Hub vNext is a Windows notification scene system for HanaAgent.

## Direction

- Node.js plugin domain manages notification semantics, policies, state, pages, widgets, diagnostics, and migration.
- C++20 Native Scene Runtime manages native windows, layout, physics, interaction, rendering, particles, DPI, and GPU composition.
- The two processes communicate through a versioned JSON protocol over Windows Named Pipe.
- `legacy-reference/notification-hub-0.2.1` is retained for behavior comparison and migration only.

## Current status

The project is beginning Phase 0 and Phase 1 from [PLAN.md](./PLAN.md): repository boundaries, build tooling, and reproducible foundations. No runtime feature is considered implemented yet.

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
- CMake
- MSVC with C++20 support
- Windows 10/11 SDK

The current machine has Node.js, npm, and a Windows SDK detected. CMake and the MSVC developer toolchain still need to be made available in the build environment before the C++ runtime can be built.

## Commands

```powershell
npm test
cmake --preset debug-vs2022
cmake --build --preset debug-vs2022
ctest --preset debug-vs2022
```

The CMake and CTest commands become active after Visual Studio 2022 and the local C++ toolchain are installed. The repository preset targets the Visual Studio 2022 x64 generator.

## Version

Current development version: `0.1.0-alpha.1`

## License

MIT. See [LICENSE](./LICENSE).
