# Shelf Layout Implementation Plan

**Goal:** 在已有物理像素 Work Area Provider 和 stack 数学引擎上增加最小可验证的 shelf 布局。

**Contract:** `scene.set-mode` 的 `layout` 接受 `shelf`。Shelf 只允许横向排列，卡片沿工作区上边缘或下边缘形成单行；`direction: right` 表示从左向右，`direction: left` 表示从右向左；`anchor: top-left/top-right` 选择上边缘，`bottom-left/bottom-right` 选择下边缘，并同时决定主轴起始侧。卡片顺序仍使用显式 `card_order`。工作区不足时返回 `LAYOUT_SHELF_OUT_OF_BOUNDS`，不换行、不缩放。

**Reuse:** 复用 `StackLayoutOptions`、`StackCardInput`、`StackCardPlacement`、DPI 缩放和工作区原点；新增 `layout_shelf(...)`，内部复用线性横向布局逻辑，不复制 controller 的窗口应用代码。

## Task 1: Pure shelf math

**Status:** Completed in the current working tree.

- [x] Add `layout_shelf(...)` declaration and implementation.
- [x] Validate positive finite DPI, positive work area, non-negative spacing and horizontal direction.
- [x] Support top/bottom anchors and left/right direction with physical work-area origin.
- [x] Return `LAYOUT_SHELF_OUT_OF_BOUNDS` for insufficient horizontal extent.
- [x] Extend `layout_self_test()` with right/top, left/bottom, origin and overflow cases.
- [x] Run focused build and `runtime_layout_self_test`.

## Task 2: Runtime and protocol integration

**Status:** Completed in the current working tree.

- [x] Allow `layout == "shelf"` in the Named Pipe parser.
- [x] Keep stack behavior unchanged.
- [x] Dispatch shelf requests through `RuntimeSceneController`.
- [x] Include the active work-area metadata in the existing ACK/health result.
- [x] Return `LAYOUT_SHELF_OUT_OF_BOUNDS` unchanged from the math layer.

## Task 3: Recovery and regression coverage

**Status:** Completed in the current working tree.

- [x] Allow shelf payloads in Node recovery validation, including provider-default work area and complete explicit overrides.
- [x] Reject unsupported layout names and partial overrides.
- [x] Extend Named Pipe smoke with provider-default shelf, explicit shelf, and overflow rejection.
- [x] Extend recovery snapshot test with a shelf entry.

## Task 4: Verification and commit

**Status:** Completed in the current working tree; ready to commit.

- [x] Run `npm run check`.
- [x] Run `npm test`.
- [x] Build with VS2026 Developer Command Prompt.
- [x] Run all CTest tests.
- [x] Run `git diff --check` and confirm clean status.
- [ ] Commit as `feat: add shelf layout mode`.
