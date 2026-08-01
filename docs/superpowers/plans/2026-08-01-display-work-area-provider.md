# Display Work Area Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 stack、shelf 及后续布局建立统一的物理像素工作区与 DPI Provider 接口，并在 Windows 上提供安全回退。

**Architecture:** Provider 对上层只暴露一个当前工作区快照，快照包含物理像素矩形、DPI、来源和回退标志。纯数据模型与校验保持平台无关；Windows 查询作为适配器调用 Win32 显示器 API，查询失败时返回经过校验的虚拟屏幕回退快照。此刀只建立 Provider，不改变 `scene.set-mode` 的协议语义；下一刀再把 Runtime 布局接入 Provider。

**Tech Stack:** C++20、Win32 `EnumDisplayMonitors` / `GetMonitorInfoW` / `GetDpiForMonitor` 或窗口 DPI API、CTest、现有 Runtime 诊断模型。

## Global Constraints

- 工作区坐标和尺寸使用物理像素。
- DPI 必须为有限正数；工作区宽高必须为正整数。
- Provider 不得依赖 HWND 才能完成纯数据校验和回退计算。
- Windows 查询失败必须产生可观察的回退结果，不能静默伪造多显示器能力。
- 本刀不宣称支持显示器热插拔；只提供单次快照查询与安全回退。
- 保持一刀一提交，所有声称通过的测试必须使用本轮新运行结果证明。

---

### Task 1: Define the work-area snapshot module

**Status:** Completed in the current working tree; included in the Provider slice commit.

**Files:**
- Create: `runtime/scene/work_area.hpp`
- Create: `runtime/scene/work_area.cpp`
- Test: `runtime/app/main.cpp` via a new `--work-area-self-test` path

**Interfaces:**
- Produces `WorkAreaRect { int left, top, width, height }`.
- Produces `WorkAreaSnapshot { WorkAreaRect rect; float dpi_scale; bool is_fallback; std::string source; }`.
- Produces `bool valid_work_area(const WorkAreaSnapshot&) noexcept`.
- Produces `WorkAreaSnapshot fallback_work_area(int virtual_width, int virtual_height, float dpi_scale) noexcept`.

- [ ] **Step 1: Write the failing pure behavior test**

Add a self-test assertion block in `main.cpp` that calls `fallback_work_area(1920, 1080, 1.0f)` and requires a valid snapshot with `left == 0`, `top == 0`, `width == 1920`, `height == 1080`, `is_fallback == true`, and `source == "virtual-screen-fallback"`. Also assert that zero width, negative height, zero DPI, and NaN DPI are rejected by `valid_work_area`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
cmake --build --preset debug-vs2026
ctest --preset debug-vs2026 -R runtime_work_area_self_test --output-on-failure
```

Expected: configuration/build or test failure because the work-area module and test target do not exist yet.

- [ ] **Step 3: Implement the platform-neutral model and fallback**

Implement the structs and validation in `work_area.hpp/.cpp`. Treat `dpi_scale` as valid only when `std::isfinite(dpi_scale) && dpi_scale > 0.0f`; reject non-positive dimensions. `fallback_work_area` must return a zeroed invalid snapshot when dimensions or DPI are invalid; otherwise return a valid snapshot marked as fallback.

- [ ] **Step 4: Run the focused test to verify it passes**

Run the same focused CTest command and expect `1/1` passed.

- [ ] **Step 5: Commit**

```powershell
git add runtime/scene/work_area.hpp runtime/scene/work_area.cpp runtime/app/main.cpp runtime/CMakeLists.txt
git commit -m "feat: add work area snapshot model"
```

---

### Task 2: Add the Windows display-query adapter

**Status:** Completed in the current working tree; included in the Provider slice commit.

**Files:**
- Modify: `runtime/scene/work_area.hpp`
- Modify: `runtime/scene/work_area.cpp`
- Modify: `runtime/CMakeLists.txt`
- Test: `runtime/app/main.cpp`

**Interfaces:**
- Produces `WorkAreaSnapshot query_primary_work_area() noexcept`.
- On Windows, queries the primary monitor work area in physical pixels and obtains a positive DPI scale.
- On non-Windows or failed Windows queries, returns `fallback_work_area(...)` with `source == "virtual-screen-fallback"` when dimensions can be obtained; otherwise returns an invalid snapshot.

- [ ] **Step 1: Write the failing Windows adapter behavior test**

Extend `work_area_self_test()` to call `query_primary_work_area()` on Windows and assert that the returned snapshot is valid, has `is_fallback == false` in the normal Windows test environment, and has a positive DPI scale. Permit the fallback marker only when the API explicitly reports fallback; never accept an invalid snapshot.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
ctest --preset debug-vs2026 -R runtime_work_area_self_test --output-on-failure
```

Expected: FAIL because the adapter is not implemented or not linked.

- [ ] **Step 3: Implement the Windows adapter**

Use `MonitorFromPoint({0, 0}, MONITOR_DEFAULTTONEAREST)` and `GetMonitorInfoW` to obtain `rcWork`. Compute width and height from the physical-pixel rectangle. Obtain DPI through the existing Per-Monitor V2-compatible window/DPI route or a monitor DPI API already linked by the project. If the monitor or DPI query fails, use the virtual-screen dimensions and a scale of `1.0f` only through `fallback_work_area`.

- [ ] **Step 4: Run focused and platform tests**

Run the focused CTest command, then:

```powershell
ctest --preset debug-vs2026 -R "runtime_(work_area|dpi|scene_controller)_self_test" --output-on-failure
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```powershell
git add runtime/scene/work_area.hpp runtime/scene/work_area.cpp runtime/CMakeLists.txt runtime/app/main.cpp
git commit -m "feat: query primary display work area"
```

---

### Task 3: Document the seam and verification boundary

**Status:** In progress; documentation is updated in the current working tree and will be committed with the Provider slice.

**Files:**
- Modify: `docs/architecture/phase-0-1-status.md`
- Modify: `docs/superpowers/plans/2026-08-01-display-work-area-provider.md`

**Interfaces:**
- Documents that the Provider returns a single snapshot, uses physical pixels, and has an explicit fallback marker.
- Documents that true multi-monitor topology, hot-plug refresh, and Runtime layout integration remain later work.

- [ ] **Step 1: Update the architecture status**

Add the Provider to completed infrastructure and explicitly retain “真实多显示器拓扑、热插拔刷新、Runtime 自动接入” as unfinished.

- [ ] **Step 2: Run documentation consistency checks**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 3: Commit**

```powershell
git add docs/architecture/phase-0-1-status.md docs/superpowers/plans/2026-08-01-display-work-area-provider.md
git commit -m "docs: define display work area provider boundary"
```

---

### Task 4: Final verification

**Files:**
- No source changes expected.

- [ ] **Step 1: Run Node checks**

```powershell
npm run check
npm test
```

Expected: syntax check passes; Node reports 11 passed and 2 skipped unless the suite changes independently.

- [ ] **Step 2: Build and run all CTest tests**

Use the VS2026 Developer Command Prompt command from the repository instructions:

```powershell
$devCmd = 'D:\MyApplications\VS\Common7\Tools\VsDevCmd.bat'
$project = 'C:\Users\Ganlin\Desktop\OH-WorkSpace\notification-hub-upgrade'
$command = 'call "' + $devCmd + '" -arch=x64 -host_arch=x64 && cd /d "' + $project + '" && cmake --build --preset debug-vs2026 && ctest --preset debug-vs2026 --output-on-failure'
cmd.exe /d /s /c $command
```

Expected: build succeeds and every registered CTest test passes.

- [ ] **Step 3: Confirm repository state**

```powershell
git diff --check
git status --short --branch
git log --oneline -4
```

Expected: clean working tree and the Provider commits visible in history.
