# Stack Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, DPI-aware mathematical stack layout and apply its placements to the fixed multi-card Scene without coupling layout rules to Win32 window control.

**Architecture:** `runtime/scene/layout.*` owns the pure stack calculation. The calculation receives an already ordered list of card sizes, a physical-pixel work area, spacing, direction, anchor, and DPI scale, and returns placements or a stable validation error. `RuntimeSceneController` owns card order and delegates placement to the layout module; `SceneWindow` remains responsible only for HWND geometry and rendering.

**Tech Stack:** C++20, CMake, CTest, existing Win32/DPI SceneWindow, existing self-test executable.

## Global Constraints

- Preserve the current versioned protocol and fixed-card commands.
- Keep layout computation independent of Win32 headers and HWND state.
- Preserve input order as the stack order; do not derive order from `unordered_map` iteration.
- Use integer physical pixels for final placement; use one explicit DPI scale conversion at the layout seam.
- Reject invalid work areas, card sizes, spacing, and DPI scale with stable local result errors.
- Keep one explainable Git commit with focused tests and documentation.

---

### Task 1: Pure Stack Layout Contract

**Files:**
- Create: `runtime/scene/layout.hpp`
- Create: `runtime/scene/layout.cpp`
- Test: `runtime/app/main.cpp`
- Modify: `runtime/CMakeLists.txt`

**Interfaces:**
- Produces `StackDirection`, `StackAnchor`, `StackLayoutOptions`, `StackCardInput`, `StackCardPlacement`, `StackLayoutResult`, and `layout_stack(...)`.
- `layout_stack` accepts ordered card sizes and returns placements in the same order.

- [ ] **Step 1: Write the failing runtime self-test**

Add a `layout_self_test()` in `runtime/app/main.cpp` that verifies:

```cpp
const std::vector<StackCardInput> cards{
    {"a", 100, 40},
    {"b", 120, 60},
    {"c", 80, 30},
};
const StackLayoutOptions options{
    StackDirection::Down,
    StackAnchor::TopRight,
    10,
    500,
    300,
    1.0f,
};
const auto result = layout_stack(cards, options);
assert(result.ok);
assert(result.placements[0].x == 390 && result.placements[0].y == 0);
assert(result.placements[1].x == 370 && result.placements[1].y == 50);
assert(result.placements[2].x == 410 && result.placements[2].y == 120);
```

Also assert that a card too large for the work area returns `ok == false` and `code == "LAYOUT_CARD_OUT_OF_BOUNDS"`, and that a zero DPI scale returns `code == "LAYOUT_DPI_INVALID"`.

- [ ] **Step 2: Run the focused CTest and verify it fails**

Run:

```powershell
cmake --preset debug-vs2026
cmake --build --preset debug-vs2026
ctest --preset debug-vs2026 -R runtime_layout_self_test --output-on-failure
```

Expected: configuration or compilation failure because the layout module and test target do not exist yet.

- [ ] **Step 3: Implement the minimal pure module**

Use these rules:

- `StackDirection::Down` advances `y` by card height plus spacing.
- `StackDirection::Up` advances upward and anchors each card's bottom edge.
- `StackDirection::Right` advances `x` by card width plus spacing.
- `StackDirection::Left` advances leftward and anchors each card's right edge.
- `TopLeft`, `TopRight`, `BottomLeft`, and `BottomRight` select the fixed cross-axis edge.
- `spacing` and card dimensions are logical pixels; multiply by `dpiScale` and round with `std::lround` before placement.
- Work-area dimensions are already physical pixels.
- Every resulting rectangle must stay inside the work area; return the first failing card id with `LAYOUT_CARD_OUT_OF_BOUNDS`.
- Reject `dpiScale <= 0` with `LAYOUT_DPI_INVALID`, non-positive work area with `LAYOUT_WORK_AREA_INVALID`, negative spacing with `LAYOUT_SPACING_INVALID`, and non-positive card dimensions with `LAYOUT_CARD_INVALID`.

- [ ] **Step 4: Register and run the focused test**

Add `scene/layout.cpp` to the runtime target and register:

```cmake
add_test(NAME runtime_layout_self_test COMMAND notification-hub-runtime --layout-self-test)
```

Run the focused CTest and expect it to pass.

- [ ] **Step 5: Commit the pure layout slice**

```powershell
git add runtime/scene/layout.hpp runtime/scene/layout.cpp runtime/app/main.cpp runtime/CMakeLists.txt
git commit -m "feat: add deterministic stack layout math"
```

---

### Task 2: Stable Card Order and Controller Integration

**Files:**
- Modify: `runtime/scene/controller.hpp`
- Modify: `runtime/scene/controller.cpp`
- Modify: `runtime/transport/named_pipe.cpp`
- Test: `runtime/app/main.cpp`

**Interfaces:**
- `RuntimeSceneController` keeps insertion order separately from card lookup.
- Existing `scene.create`, card `scene.update`, and `scene.dismiss` retain their protocol shapes.

- [ ] **Step 1: Extend the runtime self-test with ordered card behavior**

Create three cards through `RuntimeSceneController` in order `a`, `b`, `c`, call a controller method that applies the stack layout, and assert the returned `cards_json()` order is `a`, `b`, `c` with the calculated positions. Dismiss `b` and assert the remaining order is `a`, `c`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
cmake --build --preset debug-vs2026
ctest --preset debug-vs2026 -R runtime_layout_self_test --output-on-failure
```

Expected: failure because the controller currently serializes cards from an unordered map and has no layout application seam.

- [ ] **Step 3: Add stable order and a narrow controller seam**

Add an ordered id vector to the controller implementation. Append on successful create, erase on dismiss, and never reorder on update. Serialize cards by that vector. Add an internal controller method that builds ordered layout inputs, calls `layout_stack`, then applies each returned rectangle using the existing card window update path. Keep error propagation from the layout result unchanged.

Use one default stack configuration for this slice: vertical `Down`, `TopRight`, 12 logical-pixel spacing, and the current primary work-area size supplied by the controller's layout entry point. Do not change the external command schema until the layout behavior is proven.

- [ ] **Step 4: Run the focused test and the existing multi-card smoke**

Run:

```powershell
cmake --build --preset debug-vs2026
ctest --preset debug-vs2026 -R "runtime_layout_self_test|runtime_scene_controller_self_test|runtime_named_pipe_smoke" --output-on-failure
node tests/node/named-pipe-smoke.test.mjs build/debug-vs2026/runtime/Debug/notification-hub-runtime.exe
```

Expected: all selected tests pass and fixed command behavior remains compatible.

- [ ] **Step 5: Commit the integration slice**

```powershell
git add runtime/scene/controller.hpp runtime/scene/controller.cpp runtime/transport/named_pipe.cpp runtime/app/main.cpp
git commit -m "feat: apply stack layout to scene cards"
```

---

### Task 3: DPI and Boundary Regression Coverage

**Files:**
- Modify: `runtime/app/main.cpp`
- Modify: `docs/architecture/phase-0-1-status.md`
- Test: CTest runtime layout and existing DPI tests

- [ ] **Step 1: Add behavior checks**

Extend the layout self-test with:

- `dpiScale = 1.25` converts 100 logical pixels to 125 physical pixels.
- Bottom-right anchoring keeps the final card's right and bottom edges equal to the work-area edges.
- A stack whose cumulative extent exceeds the work area returns `LAYOUT_CARD_OUT_OF_BOUNDS` instead of clipping or wrapping.
- Empty card input succeeds with an empty placement list.

- [ ] **Step 2: Run the focused regression**

```powershell
cmake --build --preset debug-vs2026
ctest --preset debug-vs2026 -R "runtime_layout_self_test|runtime_dpi_self_test|runtime_dpi_transition_self_test" --output-on-failure
```

- [ ] **Step 3: Update phase documentation**

Record that stack math, stable order, boundary validation, and DPI conversion are implemented. Leave shelf/cascade/focus/freeform and real multi-monitor work-area discovery explicitly pending.

- [ ] **Step 4: Run the full verification suite**

```powershell
npm run check
npm test
cmake --build --preset debug-vs2026
ctest --preset debug-vs2026 --output-on-failure
git diff --check
git status --short --branch
```

Expected: Node tests pass with the existing two executable-dependent skips, all CTest tests pass, and the worktree is clean after commit.

- [ ] **Step 5: Commit the regression/documentation slice**

```powershell
git add runtime/app/main.cpp docs/architecture/phase-0-1-status.md
git commit -m "test: cover stack layout boundaries and dpi"
```
