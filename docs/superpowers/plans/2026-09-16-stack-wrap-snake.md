# Stack Wrap Off / Parallel / Snake Implementation Plan

> **For agentic workers:** Main session slices this. Do not dispatch one Wright brief across JS + Native + studio.

**Goal:** Studio exposes 新列/行 plus 走线. Off keeps a single strip. Parallel is today's wrap. Snake is oldest-at-dock, tight boustrophedon, mixed sizes use real card boxes. Screen-full still drops oldest.

**Architecture:** One `space.wrap` field: `off | parallel | snake` (missing → `parallel`, so current profiles keep wrapping). Parallel and off keep newest-at-corner (`stackGrowToNativeDirection` opposite). Snake sends Native `direction` = user grow so oldest sits on the dock. `layout_stack` branches on wrap; snake packs oldest-first into runs of real sizes; even runs follow `direction`, odd runs reverse; run cross-size = max in that run; leftover on a reverse run is the visible hole. Plugin eviction loop unchanged.

**Tech Stack:** Plugin JS domain + studio chips, Native `layout.hpp` / `layout.cpp` / `named_pipe.cpp` / `main.cpp`, Node tests, `--self-test`.

## Locked contract

- **新列/行 关** (`wrap=off`): one column/row along 往哪长. Primary full → Native OOB → Plugin 掀最旧. Newest stays on the dock (current).
- **走线 平行** (`wrap=parallel`, default): current wrap. Newest on the dock. Columns/rows all face the same way. 2D full → 掀最旧.
- **走线 蛇形** (`wrap=snake`): dock is the **oldest** card's home. Fill along grow; next run starts at the far end and comes back. Equal-size picture:

  ```
  1234
  8765
  ```

  After 掀 1 (reflow remaining, same as Native already re-lays):

  ```
  2345
  (空)876
  ```

  Next new card 9 fills the hole: `2345 / 9876`.
- **混尺寸 = 紧排:** real width/height, no shrink, no stolen gap. Run cross-size = max card on that run. Shorter/narrower cards align to the dock side of the run. 5 is not required to sit under 4's corner when widths differ. No uniform chessboard.
- 平行混尺寸 unchanged: column width = widest in that column.
- 拒绝新卡 still not a user option. Native OOB remains the fuse after eviction.
- Ticker unchanged. 0.1.6 freeze zip untouched. Try pack `dist/notification-hub-vnext-0.1.7-try.zip`.

## Global constraints

- Native new fields only at struct tail (`StackLayoutOptions::wrap`). No CardPart fields.
- `scene.set-mode` parser currently rejects unknown keys — add optional `"wrap"`; omit = parallel.
- `collect()` is eval'd alone — inline wrap helpers in the client string, no import.
- Studio tests still ban `<select|button disabled>`; illegal 走线 when 新列/行 is off uses `aria-disabled` / `is-off` like grow.
- Do not reintroduce an 8-card count clamp.

---

### Task 1: Domain wrap

**Files:**
- Modify: `plugin/domain/stack-grow.js` (or small `stack-wrap.js` next to it), `plugin/domain/card-visual-settings.js`, `plugin/domain/native-visual-payload.js`, `plugin/domain/visual-event-native-behavior.js`
- Test: `tests/node/stack-grow.test.mjs` (or new `stack-wrap.test.mjs`), `tests/node/native-visual-payload.test.mjs`

- [x] `STACK_WRAPS = off | parallel | snake`; `resolveStackWrap` missing/invalid → `parallel`
- [x] `SPACE_FIELDS` includes `wrap`
- [x] `spaceToNativeStackLayout` writes `wrap`; parallel/off keep opposite direction; snake uses user grow as Native direction
- [x] Fingerprint / native behavior payload include wrap

### Task 2: JS snake + wrap-off

**Files:**
- Modify: `plugin/runtime/stack-layout.js`
- Test: `tests/node/visual-stack.test.mjs`

- [x] Existing parallel fixtures bit-identical when wrap is missing or `parallel`
- [x] `wrap=off`: one run; overflow throws `VISUAL_BEHAVIOR_LAYOUT_FAILED` (do not open a second run)
- [x] `wrap=snake`: oldest-first tight pack; reverse odd runs; leftover is on the start side of the reverse run
- [x] Snake mixed-size: 80+40+40 then 80 from the right; no shrink
- [x] Seven equal cells after dropping the oldest match `(空)876`

### Task 3: Native wrap field + snake

**Files:**
- Modify: `runtime/scene/layout.hpp`, `runtime/scene/layout.cpp`, `runtime/transport/named_pipe.cpp`, `runtime/app/main.cpp`

- [x] `enum class StackWrap { Parallel, Off, Snake }` at tail of `StackLayoutOptions`, default Parallel
- [x] `layout_stack`: Off = linear only; Parallel = current wrap; Snake = tight boustrophedon
- [x] Parser: optional `"wrap":"off"|"parallel"|"snake"`; unknown wrap invalid; omitted = parallel
- [x] Self-test: parallel wrap fixture unchanged; snake 4+4 equal cards; snake 7 cards leave a hole; mixed-size tight pack; wrap=off two-card primary overflow fails
- [x] Rebuild runtime, copy exe into `plugin/runtime`

### Task 4: Studio 新列/行 + 走线

**Files:**
- Modify: `plugin/routes/settings-visual.js`, `plugin/routes/settings-visual-client.js`
- Test: `tests/node/settings-visual-route.test.mjs`

- [x] Beside 往哪长: 新列/行 chip (关/开). Open → 走线 chips 平行 / 蛇形
- [x] 关 → `wrap=off`; 开+平行 → `parallel`; 开+蛇形 → `snake`. Default open+平行
- [x] 关时 走线灰掉（`aria-disabled` / `is-off`），不是 `disabled`
- [x] Notes: 关「满了掀最旧」；平行「满了沿另一边开列」；蛇形「折返，二维满了掀最旧。停靠是最先来的那张。」
- [x] Grow vertical → 开新列; grow horizontal → 开新行 (label can follow axis)
- [x] `collect()` writes `space.wrap`; fingerprint includes wrap; ghosts may stay 3-card grow ghosts this cut

### Task 5: Verify and try-pack

- [x] Focused Node tests + Native `--self-test`
- [x] Plugin eviction path needs no new branch if OOB still uses `LAYOUT_*_OUT_OF_BOUNDS`
- [x] Pack `0.1.7-try` if freeze zip present; otherwise reuse last try zip's audio engine

## Out of scope

- Snake animation (cards jump to reflow; no bead-slide tween)
- Uniform grid / 统一格子
- Ticker, 突脸, 淡入, 裁切
- Changing 8-card policy defaults
