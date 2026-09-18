# 堆叠落点 follow（持续追槽）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 堆叠通道 `settle: follow` 时，槽位一变，卡平滑追过去；`snap` 仍瞬移。入场出场、淡入、粒子都不做。

**Architecture:** 布局仍只算槽位。`snap` 立刻 `SetWindowPos` 到槽。`follow` 把槽当目标，用临界阻尼 PD（无积分）追；出生在槽上；拖着的卡暂停追随，松手再追。移动复用弹幕的 `DeferWindowPos`（NOREDRAW），禁止 `UpdateLayeredWindow`，禁止因追随发 `scene.changed`。到位停算。

**Tech Stack:** Plugin JS charter + 工作室通道芯片；Native `scene.set-mode` + `tick_animation`；header-only `runtime/scene/follow.hpp`（避免 cmake 加源文件）。

## Global Constraints

- 产品版本保持 **0.1.8**，不升号。钉死 zip `notification-hub-vnext-0.1.8.zip` 不准覆盖。
- 试包打 `dist/notification-hub-vnext-0.1.8-follow.zip`，完整插件 zip，不热换 community。
- Native 新字段只垫结构体末尾。不改 CMake `VERSION` 去重配；不新增必须进 cmake 的 `.cpp`（积分器放头文件）。
- 配置包仍不含通道规约。
- 不做路径飞、淡入淡出、粒子、入场出场位移、皮肤/裁切。
- 用户词：跟随 / 瞬移。代码：`settle` / `follow` / `snap`。PID 不当控件名。
- 性能铁律：追槽只挪窗口；到位停心跳；卡顿不允许。
- 默认 `follow`。旧 `set-mode` 没带 `settle` 时 Native 仍当 `snap`。
- 构建：`D:\MyApplications\VS\MSBuild\Current\Bin\MSBuild.exe` 打 `build/runtime-set-charter\runtime\notification-hub-runtime.vcxproj` Release，拷到 `plugin/runtime/`。

## 文件

- Create: `runtime/scene/follow.hpp`
- Create: `docs/adr/ADR-007-stack-settle-follow.md`
- Modify: `plugin/domain/channel-charter.js`
- Modify: `plugin/domain/native-visual-payload.js`
- Modify: `plugin/runtime/recovery-snapshot.js`
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/routes/settings-visual-client.js`
- Modify: `runtime/scene/layout.hpp`（`StackSettle::Follow`）
- Modify: `runtime/transport/named_pipe.cpp`
- Modify: `runtime/scene/controller.cpp` / `controller.hpp`
- Modify: `runtime/app/main.cpp`（`--follow-self-test`）
- Modify: `CONTEXT.md` / `CURRENT-STATUS.md` / `docs/superpowers/plans/README.md`
- Test: `tests/node/channel-charter.test.mjs`
- Test: `tests/node/native-visual-payload.test.mjs`
- Test: `tests/node/recovery-snapshot.test.mjs`
- Test: `tests/node/settings-visual-route.test.mjs`
- Test: `tests/node/named-pipe-smoke.test.mjs`（若覆盖 set-mode settle）

---

### Task 1: 规约承认 follow

**Files:**
- Modify: `plugin/domain/channel-charter.js`
- Test: `tests/node/channel-charter.test.mjs`

**Interfaces:**
- Consumes: 现行 `createStackCharter`
- Produces: `CHARTER_SETTLE_IDS = ['snap','follow']`；默认 `follow`；`createStackCharter({settle:'follow'}).settle === 'follow'`；未知值仍 `CHARTER_SETTLE_UNSUPPORTED`，`expected: 'snap|follow'`；`migrateStackCharterFromSpace` 读取 `space.settle`

- [ ] **Step 1: 改测试**

```js
test('stack charter accepts snap and follow, defaults follow', () => {
  assert.equal(createStackCharter().settle, 'follow');
  assert.equal(createStackCharter({ settle: 'snap' }).settle, 'snap');
  assert.equal(createStackCharter({ settle: 'follow' }).settle, 'follow');
  assert.throws(() => createStackCharter({ settle: 'spring' }), (error) => (
    error.code === 'CHARTER_SETTLE_UNSUPPORTED'
    && error.details.expected === 'snap|follow'
    && error.details.actual === 'spring'
  ));
});

test('migrateStackCharterFromSpace copies settle', () => {
  assert.equal(migrateStackCharterFromSpace({ anchor: 'bottom-right', settle: 'snap' }).settle, 'snap');
  assert.equal(migrateStackCharterFromSpace({}).settle, 'follow');
});
```

- [ ] **Step 2: 跑测试，确认旧断言失败**

Run: `node --test tests/node/channel-charter.test.mjs`
Expected: FAIL `settle` 仍是 snap / follow 被拒

- [ ] **Step 3: 最小实现**

`CHARTER_SETTLE_IDS` 含 `follow`。`STACK_CHARTER_DEFAULTS.settle = 'follow'`。校验后 **返回 `settle`，不要写死 `'snap'`**。`migrateStackCharterFromSpace` 传入 `settle: source.settle`。错误文案 `stack settle must be snap or follow`。

- [ ] **Step 4: 测试全绿**

Run: `node --test tests/node/channel-charter.test.mjs`
Expected: PASS

---

### Task 2: 下发与恢复带 follow

**Files:**
- Modify: `plugin/domain/native-visual-payload.js` `spaceToNativeStackLayout`
- Modify: `plugin/runtime/recovery-snapshot.js`
- Test: `tests/node/native-visual-payload.test.mjs`
- Test: `tests/node/recovery-snapshot.test.mjs`

**Interfaces:**
- Consumes: Task 1 `settle`
- Produces: `spaceToNativeStackLayout({settle:'follow'}).settle === 'follow'`；缺省 `follow`；非法值不当 follow 乱传，回落 `follow` 或视为缺省。恢复快照 `settle:'follow'` 通过；`settle:'orbit'` 仍 `CHARTER_SETTLE_UNSUPPORTED`

- [ ] **Step 1: 改测试**

`native-visual-payload.test.mjs`：缺省与 `follow` 都是 `'follow'`；显式 `'snap'` 仍 snap。
`recovery-snapshot.test.mjs`：把「follow 必拒」改成 follow 通过，另加未知值仍拒。

- [ ] **Step 2: 跑红**

Run: `node --test tests/node/native-visual-payload.test.mjs tests/node/recovery-snapshot.test.mjs`

- [ ] **Step 3: 实现**

```js
settle: space.settle === 'snap' ? 'snap' : 'follow'
```

恢复：`payload.settle` 缺省或 `snap`/`follow` 合法；其他抛 `CHARTER_SETTLE_UNSUPPORTED`，`expected: 'snap|follow'`。

- [ ] **Step 4: 测试全绿**

---

### Task 3: Native 协议认 follow

**Files:**
- Modify: `runtime/scene/layout.hpp` `enum class StackSettle { Snap, Follow }`
- Modify: `runtime/transport/named_pipe.cpp` `parse_scene_mode_payload`
- Test: `tests/node/named-pipe-smoke.test.mjs`（若已有 set-mode 样例）或 `runtime/app/main.cpp` 里已有 payload 解析自测

**Interfaces:**
- Consumes: JSON `settle: "follow"`
- Produces: `options.settle == StackSettle::Follow`；未知值 `CHARTER_SETTLE_UNSUPPORTED`；**缺字段仍 Snap**（旧管道）

- [ ] **Step 1: 把解析改成**

```cpp
if (!seen_settle || settle == "snap") options.settle = scene::StackSettle::Snap;
else if (settle == "follow") options.settle = scene::StackSettle::Follow;
else { error_code = "CHARTER_SETTLE_UNSUPPORTED"; return false; }
```

错误文案改为 `stack settle must be snap or follow`。

- [ ] **Step 2: 编译**

`MSBuild ... notification-hub-runtime.vcxproj /p:Configuration=Release /m /v:minimal`

---

### Task 4: 临界阻尼追随积分器（纯函数）

**Files:**
- Create: `runtime/scene/follow.hpp`
- Modify: `runtime/app/main.cpp` 增加 `--follow-self-test`

**Interfaces:**
- Produces:

```cpp
namespace notification_hub::scene {
struct FollowState { double x{}; double y{}; double vx{}; double vy{}; };
struct FollowStep { FollowState state{}; bool settled{}; };
constexpr double kFollowOmega = 14.0;
constexpr double kFollowZeta = 1.0;
constexpr double kFollowPosEps = 0.5;
constexpr double kFollowVelEps = 8.0;
FollowStep tick_follow(FollowState s, double target_x, double target_y, double dt) noexcept;
}
```

无积分项。`dt` 钳在 `[1/120, 1/20]`。`settled` 当位移和速度都低于阈值，并吸附到目标、速度清零。

- [ ] **Step 1: 写自测**（`main.cpp`）

1. 从 `(0,0)` 追 `(200,80)`，`dt=1/60`，120 步内 `settled`，无越过目标 8px 以上。
2. 已在目标、速度 0 → 一步 `settled`，状态不变。
3. `dt=2.0` 被钳住，不飞出屏幕量级。

- [ ] **Step 2: 实现 `follow.hpp` 头文件内联**
- [ ] **Step 3: 跑** `notification-hub-runtime.exe --follow-self-test`
- [ ] **Step 4: 把它挂进 `--self-test` 总入口**（与 ticker/layout 自测并列）

---

### Task 5: 布局 apply 分 snap / follow

**Files:**
- Modify: `runtime/scene/controller.cpp` `apply_layout` 循环
- Modify: `runtime/scene/controller.hpp` / Impl：`std::unordered_map<std::string, FollowState> stack_follows;`

**Interfaces:**
- Consumes: `options.settle`、`layout_stack` 的 placements
- Produces:
  - `Snap`：立刻 `SetWindowPos` 到槽，清 `stack_follows[id]`
  - `Follow`：写入目标；**新卡**（没有 follow 状态）在槽上出生并 `SetWindowPos` 一次；旧卡只更新目标，不在 apply 里瞬移
  - 尺寸变化仍立刻 resize + paint
  - 预览卡、弹幕卡不进 follow
  - `is_dragging()` 的卡本帧不改目标追随（目标仍更新，状态 x/y 跟窗口走）

- [ ] **Step 1: apply 后 follow 旧卡窗口坐标不得等于新槽，直到 tick**
- [ ] **Step 2: 实现**
- [ ] **Step 3: 用现有 scene-controller self-test 保证 snap 路径不失明**

---

### Task 6: tick 追槽 + 性能

**Files:**
- Modify: `runtime/scene/controller.cpp` `tick_animation`、`pump_messages`、`has_ticker_motion`

**Interfaces:**
- Consumes: Task 4 `tick_follow`，Task 5 `stack_follows`
- Produces:
  - 无 ticker 且无未到位 follow → `ticker_ticking=false`，心跳停
  - 有 follow 未到位 → 与 ticker 共用 16ms tick
  - 移动：`BeginDeferWindowPos` + `SWP_NOACTIVATE|SWP_NOZORDER|SWP_NOSIZE|SWP_NOREDRAW|SWP_NOSENDCHANGING|SWP_NOCOPYBITS|SWP_ASYNCWINDOWPOS`
  - 不 `paint()`、不 `UpdateLayeredWindow`
  - `pump_messages`：非拖动的堆叠追随 **不** 置 `changed`（与 ticker 相同）
  - 拖动中跳过该 id 的 `tick_follow`；松手后从落点追槽
  - `perf.moves` 可增加；`perf.paints` 不得因纯追随上升；`perf.sceneChanges` 不得因纯追随上升

- [ ] **Step 1: 扩展 `--follow-self-test` 或 scene-controller 测： chase 期间 `scene_window_paint_count` 不变**
- [ ] **Step 2: 实现 tick / pump**
- [ ] **Step 3: Release 编译 + `--self-test`**

---

### Task 7: 工作室通道「落点」

**Files:**
- Modify: `plugin/routes/settings-visual.js` `stackSection`
- Modify: `plugin/routes/settings-visual-client.js` collect / hydrate
- Test: `tests/node/settings-visual-route.test.mjs`

**Interfaces:**
- Consumes: `space.settle`
- Produces: 通道区芯片 `瞬移` / `跟随`（默认跟随）。collect 写 `properties.space.settle`。不进「这张卡」。弹幕区不出现。

文案：`落点。跟随=槽动了卡追过去。瞬移=立刻跳到槽。`

- [ ] **Step 1: 测试 HTML 含 `prop-settle-follow` / `prop-settle-snap`，缺省跟随；collect `settle:'snap'`**
- [ ] **Step 2: 实现芯片、hydrate、collect**
- [ ] **Step 3: `node --test tests/node/settings-visual-route.test.mjs`**

---

### Task 8: 文档与试包

**Files:**
- Create: `docs/adr/ADR-007-stack-settle-follow.md`
- Modify: `docs/adr/ADR-006-flight-channel-charter.md` 把「settle 仅 snap / 不实现 PID」改为「见 ADR-007」
- Modify: `CURRENT-STATUS.md`、`docs/superpowers/plans/README.md`（当前入口改到本计划）
- Pack: `python scripts/pack-try-zip.py` → 确认输出名/或拷成 `notification-hub-vnext-0.1.8-follow.zip`
- 核钉死包 SHA256 仍是 `5EE8E3FBDF49B571DD76CBCE715710D2522D21F1D645CE9023FEA1D2346AB0E1`

ADR 必写：窗口路径不变（ADR-004）；PD 无 I；出生在槽；图层/入场出场不进本刀。

- [ ] **Step 1: 写 ADR-007**
- [ ] **Step 2: 全量 `node --test tests/node/*.mjs` 相关子集 + runtime `--self-test`**
- [ ] **Step 3: 拷 exe、打包、报 SHA256。不覆盖 0.1.8.zip**

---

## 验收

1. 工作室落点=跟随，连点试一条（关开新行会掀旧）：旧卡滑去补位，不瞬移，不卡顿。
2. 落点=瞬移：行为与 0.1.8 相同。
3. 弹幕仍飞，不受 follow 影响。
4. 拖一张堆叠卡，松手滑回槽（跟随）；瞬移模式保持现有「停在拖到的地方直到下次排版」。
5. 健康计数：追随期间 paints/sceneChanges 不狂涨。
6. 入场出场、淡入没有新控件。
