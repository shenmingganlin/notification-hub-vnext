# Visual Workbench Acceptance Repair Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with a regression gate after each task.

**Goal:** Repair the 0.1.4 visual workbench so the real workflow is reliable: design a card, save/export a profile, apply it to events, test all events, and return a valid asynchronous SceneState.

**Architecture:** Keep the existing profile, binding, asset, and sound domains. Repair the Native boundary in two places: do not leak Plugin-only layout inputs into the Native card root, and validate the complete controlled visual object returned by Native SceneState. Rebuild the settings UI around scoped page styles and one clear asset-library entry point.

**Tech Stack:** Node.js ESM, Hono-style Plugin routes, C++ Named Pipe Runtime, `node:test`.

## Global Constraints

- Version remains `0.1.4`.
- No Git reset, clean, push, or commit.
- Sound settings remain independent from visual settings.
- `gap` and `margin` are Plugin-side layout inputs and must not become unknown Native card fields.
- Native visual fields remain declaration-only and strictly validated; no arbitrary CSS, scripts, paths, or URLs.
- Fragment CSS must not mutate the settings shell navigation.
- Visual failures must not block sound playback, notification persistence, or Plugin lifecycle.
- Run focused tests, `npm run check`, full Node tests, `git diff --check`, and package validation.

---

### Task 1: Lock the two Native regressions

**Files:**
- Modify: `tests/node/native-visual-payload.test.mjs`
- Modify: `tests/node/scene-state.test.mjs`
- Modify: `tests/node/plugin-lifecycle.test.mjs`

**Tests to add first:**

- Assert the Native card payload contract excludes root-level `gap` and `margin` while preserving width, height, and visual appearance.
- Assert SceneState accepts a Native card whose `visual` contains `cardType`, controlled `behavior`, and controlled `appearance`.
- Assert SceneState still rejects unknown visual fields and unknown nested appearance fields.
- Add a Plugin scene path regression using a rich visual profile and assert the emitted `scene.create` payload has no root `gap` or `margin`.

Run:

```powershell
node --test tests/node/native-visual-payload.test.mjs tests/node/scene-state.test.mjs tests/node/plugin-lifecycle.test.mjs --test-concurrency=1
```

Expected before repair: the new contract tests fail.

---

### Task 2: Repair the Native card payload and asynchronous SceneState contract

**Files:**
- Modify: `plugin/index.js`
- Modify: `plugin/runtime/scene-state.js`
- Test: files from Task 1

**Implementation:**

- Build position with `gap` and `margin`, but return only `width` and `height` at the Native card root.
- Keep `gap` and `margin` in Plugin visual state and local layout calculations.
- Extend SceneState visual validation to accept the full controlled Native visual object with exact fields:
  - root: `enabled`, `preset`, `intensity`, `category`, optional `cardType`, `behavior`, `appearance`
  - behavior: `layout`, `boundary`
  - appearance: `size`, `aspectRatio`, `backgroundColor`, optional `backgroundAssetId`, `backgroundFit`, `backgroundPadding`, `borderRadius`, `opacity`
- Validate types, enums, numeric bounds, and exact fields without accepting arbitrary data.
- Preserve compatibility with the old four-field visual decision shape.

Run the focused tests again and then the real Native scene event smoke when the Runtime path is available.

---

### Task 3: Fix protected asset navigation and simplify the visual page

**Files:**
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/routes/page-navigation.js` only if the shared helper needs a correction
- Modify: `tests/node/settings-visual-route.test.mjs`
- Modify: `tests/node/settings-route.test.mjs`

**Implementation:**

- Use the shared protected page navigation path so `pluginIframeTicket`, `pluginSurfaceSession`, and `token` survive document navigation.
- Replace visual-page asset/import links with one button named `打开素材库` that uses the page router.
- Remove the visual-page `管理素材` duplicate link and the visual-page `导入视觉包` action; package import remains in the asset library page.
- Remove the four-step workflow strip and redundant `01/02/03` labels.
- Remove repeated shell/page headings and keep one concise visual-page title/subtitle.
- Reorganize the page as: scheme header/actions, card design with preview, apply-to-events, compact tests, and one asset-library shortcut.
- Keep profile save, export, event application, and six-event tests functional.
- Add route tests that assert the single asset entry point and all required credentials.

---

### Task 4: Move audio library and isolate fragment styles

**Files:**
- Modify: `plugin/routes/settings-sound.js`
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/routes/settings.js`
- Modify: `tests/node/settings-sound-route.test.mjs`
- Modify: `tests/node/settings-visual-route.test.mjs`
- Modify: `tests/node/settings-route.test.mjs`

**Implementation:**

- Render `音频库` as a full-width primary panel directly after `自定义声音`.
- Leave only `声音实验台`, `声音规则解释`, and `最近声音状态` inside `高级工具与诊断`.
- Prevent fragment CSS from applying generic `button` styles to `.settings-shell-nav-item`; use scoped selectors and an explicit shell-nav font contract.
- Add route assertions for vertical audio-library placement and shell-nav font isolation.

---

### Task 5: Verify the real acceptance chain and package

**Files:**
- Modify: `CURRENT-STATUS.md`

Run:

```powershell
npm run check
npm test -- --test-concurrency=1
git diff --check
```

When `NOTIFICATION_HUB_RUNTIME_PATH` is available, run the Native tests that wait for `scene.changed`, not only ACK tests. Rebuild and validate the 0.1.4 ZIP, including manifest version, entry count, SHA256, and required routes/runtime files.

Do not claim acceptance until the asynchronous SceneState diagnostics are clean and the user validates the installed Hana surface.
