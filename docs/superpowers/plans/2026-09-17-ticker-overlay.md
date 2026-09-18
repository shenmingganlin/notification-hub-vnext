# 弹幕幕布 overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 弹幕从一卡一窗换成一座幕布上的 DComp 精灵，打满时不再跟 HWND 数线性涨；位移不上传位图。

**Architecture:** 工作区一块 `WS_EX_NOREDIRECTIONBITMAP` 幕布 HWND。每张弹幕卡一个 DirectComposition visual。卡面仍走现有 D2D 零件树，内容变才写 surface；平移 `SetOffset` + 一次 `Commit`。堆叠仍一卡一窗，并压在幕布之上。

**Tech Stack:** Native DirectComposition + 现有 D2D DC 离屏；header-only `runtime/scene/overlay.hpp` 命中数学；`TickerOverlay` 实现放 `window.cpp`。

## Global Constraints

- 产品版本保持 **0.1.8**，不升号。钉死 zip、follow / newest / coil 试包不准覆盖。
- 试包打 `dist/notification-hub-vnext-0.1.8-overlay.zip`，完整插件 zip，不热换。
- 不改 CMake `VERSION`。不新增必须 cmake 重配的 `.cpp`。vcxproj 只补链 `dcomp.lib`。
- 配置包仍不含通道规约。默认带宽、轨道、点穿法律不改。
- 不做路径飞、淡入、粒子、图集 Present、WinRT Composition、把堆叠改幕布。
- 铁律：位移是合成器的事。卡面是纹理。上传只发生在内容变时。
- 构建：MSBuild 现有 `build/runtime-set-charter/runtime/notification-hub-runtime.vcxproj` Release，拷到 `plugin/runtime/`。

## 文件

- Create: `runtime/scene/overlay.hpp`
- Create: `docs/adr/ADR-010-ticker-overlay-compositor.md`
- Modify: `runtime/scene/window.cpp` / `window.hpp`（`TickerOverlay`）
- Modify: `runtime/scene/renderer.hpp` / `renderer.cpp`（`draw_buffer`，不 ULW）
- Modify: `runtime/scene/controller.cpp`（弹幕建精灵不建卡窗；tick 改偏移）
- Modify: `runtime/app/main.cpp`（`--overlay-self-test`）
- Modify: `build/runtime-set-charter/runtime/notification-hub-runtime.vcxproj`（`dcomp.lib`）
- Modify: `runtime/CMakeLists.txt`（同样补 `dcomp`，防以后重配丢链）
- Modify: `CONTEXT.md` / `CURRENT-STATUS.md` / `docs/adr/ADR-004-*.md` / `docs/superpowers/plans/README.md`
- Modify: `scripts/pack-try-zip.py`
- Test: `tests/node/named-pipe-smoke.test.mjs`（弹幕 create 后卡窗不必存在；health 仍有 x,y）

---

### Task 1: 幕布命中数学

**Files:**
- Create: `runtime/scene/overlay.hpp`
- Modify: `runtime/app/main.cpp`

**Interfaces:**
- Consumes: 卡的屏幕命中框（不含 paint overflow）
- Produces: `hit_test_overlay_sprites(sprites, x, y)` 从上到下返回卡 id；空白返回空串。`overlay_host_rect(work_area)` 等于工作区。

- [ ] **Step 1: 写 `--overlay-self-test` 的命中断言**
- [ ] **Step 2: 最小 `overlay.hpp` 让命中通过**
- [ ] **Step 3: 跑 `--overlay-self-test`（此步可先只测数学，DComp 下步）**

---

### Task 2: 幕布 HWND + DComp 精灵平移

**Files:**
- Modify: `runtime/scene/window.hpp` / `window.cpp`
- Modify: vcxproj + CMakeLists 链 `dcomp.lib`

**Interfaces:**
- `TickerOverlay::create(x,y,w,h)` / `destroy` / `add_sprite` / `update_pixels` / `set_offset` / `remove_sprite` / `commit`
- `paint_count` 只在 `update_pixels` 加；`set_offset` 不加
- 无卡时 `empty()` 为真，可拆窗

- [ ] **Step 1: self-test 建两张实心精灵，挪偏移，paint_count 不变、commit_count 增加**
- [ ] **Step 2: 实现 TickerOverlay**
- [ ] **Step 3: 跑 `--overlay-self-test` 全绿**

---

### Task 3: 卡面画进精灵，不 ULW

**Files:**
- Modify: `runtime/scene/renderer.hpp` / `renderer.cpp`

**Interfaces:**
- `CardRenderer::draw_buffer(...)` 只离屏，不 `UpdateLayeredWindow`
- `buffer_bits(bits, pitch, width, height)` 读 BGRA

- [ ] **Step 1: overlay-self-test 用 draw_buffer 画一张真卡面再挂精灵**
- [ ] **Step 2: 实现 draw_buffer**
- [ ] **Step 3: 跑测试；stack 的 `draw()` 仍 ULW**

---

### Task 4: create/dismiss 弹幕不建卡窗

**Files:**
- Modify: `runtime/scene/controller.cpp`

**Interfaces:**
- ticker 卡进 `cards` + overlay sprite，不进 `card_windows`
- 第一张弹幕建幕布；最后一张拆幕布
- `place_ticker_channel` 不再要求 `card_windows`
- stack 路径零变化

- [ ] **Step 1: scene-controller / named-pipe 覆盖弹幕 create**
- [ ] **Step 2: 最小分支**
- [ ] **Step 3: stack self-test 仍绿**

---

### Task 5: tick 平移走 SetOffset

**Files:**
- Modify: `runtime/scene/controller.cpp` `tick_animation`

**Interfaces:**
- ticker 移动不进 `DeferWindowPos`，不 `paint()`，不 `scene.changed`
- stack follow 仍走原来的 HDWP
- 出屏回收语义不变

- [ ] **Step 1: overlay-self-test 或 pipe smoke 断言 paints 不随 tick 涨**
- [ ] **Step 2: 改 tick**
- [ ] **Step 3: `--follow-self-test` 与 `--self-test` 仍绿**

---

### Task 6: 点穿、命中、堆叠压幕布

**Files:**
- Modify: `window.cpp` 幕布 WndProc
- Modify: `controller.cpp`

**Interfaces:**
- 幕布 HWND 的 USER 区域永远是卡面并集（`SetWindowRgn`），空处不挡鼠标
- 点穿开：`WS_EX_TRANSPARENT` + 整窗 `HTTRANSPARENT`
- 点穿关：空白 `HTTRANSPARENT`，卡面 `HTCLIENT`；关闭按钮仍能 dismiss
- 弹幕不拖
- 每次 stack 建窗/置顶后，把 stack HWND 提到幕布之上（`SWP_NOMOVE|SWP_NOSIZE`）

---

### Task 7: 打包

**Files:**
- Modify: `scripts/pack-try-zip.py` → `notification-hub-vnext-0.1.8-overlay.zip`
- 断言 coil zip 哈希 `C8B503DA19BDCBCD61CA23A4CA62F3874DF6E7C442A0BAC07BC2B1CDC4EF0900` 与钉死 `5EE8E3FBDF49B571DD76CBCE715710D2522D21F1D645CE9023FEA1D2346AB0E1` 不变

- [ ] **Step 1: 拷 Release exe 到 plugin/runtime，不碰安装目录**
- [ ] **Step 2: 跑 `--self-test --follow-self-test --overlay-self-test --window-self-test --render-self-test --scene-controller-self-test` 与 named-pipe-smoke**
- [ ] **Step 3: `python scripts/pack-try-zip.py`**
