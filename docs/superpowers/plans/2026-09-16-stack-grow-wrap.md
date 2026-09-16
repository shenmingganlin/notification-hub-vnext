# Stack Grow Wrap Implementation Plan

> **For agentic workers:** Main session slices this. Do not dispatch one Wright brief across JS + Native + studio.

**Goal:** Corner dock plus grow pad (invalid sides gray); all stack cards share one channel and wrap to a new column when the primary axis is full; screen-full drops oldest so the newest card stays visible.

**Architecture:** User-facing `space.grow` (up/down/left/right) maps to Native packing `direction` (opposite) so newest stays on the corner. `layout_stack` keeps one-column linear placement when it fits, then bins from newest and opens columns along the other allowed axis. Plugin retries create by dismissing the oldest stack card on `LAYOUT_*_OUT_OF_BOUNDS`. Native no longer bisects the work area by stack channel.

**Tech Stack:** Plugin JS domain + studio HTML/CSS, Native `layout.cpp` / `controller.cpp`, Node tests, `--self-test`.

## Global Constraints

- 0.1.6 freeze zip untouched; try pack is `dist/notification-hub-vnext-0.1.7-try.zip`
- Native new fields only at struct tail (this cut adds no CardPart fields)
- `collect()` tests eval the function alone — inline grow helpers in the client string
- Do not silently shrink cards or steal gap
- Reject-new is not a studio option; Native OOB remains a fuse after eviction
- No column-count number; wrap until the next column would leave the work area

---

### Task 1: Domain grow

**Files:**
- Create: `plugin/domain/stack-grow.js`
- Modify: `plugin/domain/card-visual-settings.js`, `plugin/domain/native-visual-payload.js`
- Test: `tests/node/stack-grow.test.mjs`, `tests/node/native-visual-payload.test.mjs`

- [ ] `defaultStackGrow` / `allowedStackGrows` / `resolveStackGrow` / `stackGrowToNativeDirection`
- [ ] `SPACE_FIELDS` includes `grow`; missing grow resolves from anchor
- [ ] `spaceToNativeStackLayout` uses mapped direction; no-grow still top→up, bottom→down

### Task 2: JS wrap layout

**Files:**
- Modify: `plugin/runtime/stack-layout.js`
- Test: `tests/node/visual-stack.test.mjs`

- [ ] Existing one-column fixtures stay bit-identical
- [ ] Primary full → wrap along the other allowed direction; column width = max card cross-size
- [ ] Still throws `VISUAL_BEHAVIOR_LAYOUT_FAILED` when even wrapping cannot fit (single card too large, or wrap axis full)

### Task 3: Native wrap + one stack flow

**Files:**
- Modify: `runtime/scene/layout.cpp`, `runtime/scene/controller.cpp`, `runtime/app/main.cpp`

- [ ] `layout_stack`: linear if it fits; else column-bin from newest; place each column via existing linear in a sub-rect
- [ ] `layout_shelf` unchanged
- [ ] Controller: all non-preview stack cards share one full-work-area `layout_stack`; ticker still full-bleed; no equal-width stack lanes
- [ ] Self-test: wrap three 80×40 cards in 200×80 BottomRight+Down

### Task 4: Studio grow pad

**Files:**
- Modify: `plugin/routes/settings-visual.js`, `plugin/routes/settings-visual-client.js`
- Test: `tests/node/settings-visual-route.test.mjs`

- [ ] Grow pad beside dock; illegal sides disabled/gray like dock margins
- [ ] Changing dock snaps illegal grow to default
- [ ] `collect()` writes `space.grow`; preview ghosts follow grow
- [ ] Fingerprint includes grow

### Task 5: Newest-visible eviction

**Files:**
- Modify: `plugin/index.js`

- [ ] Stack create on OOB: dismiss oldest visible card on the stack channel, retry
- [ ] Ticker unchanged
- [ ] Do not reintroduce an 8-card count clamp

### Task 6: Verify and try-pack

- [ ] Focused Node tests + Native `--self-test` / ticker self-test as needed
- [ ] Rebuild `notification-hub-runtime`, copy exe into `plugin/runtime`
- [ ] Pack `0.1.7-try` if freeze zip is present; otherwise report
