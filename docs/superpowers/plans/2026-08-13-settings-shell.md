# Settings Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Notification Hub 设置页收敛为一个保持在同一 Hana iframe 内的统一壳子，并先接入“常规与显示”和“声音”两个设置领域。

**Architecture:** `/settings` 永远渲染统一壳子，壳子拥有顶部大类导航、设置分类导航、当前视图标题和统一状态区域。子视图通过当前 iframe 内的 `settings-content?view=general|sound|visual` 获取 HTML 片段并挂载到内容区，不再创建新的 Page surface，也不使用 `document.open()` 或 `document.write()`。已有声音、视觉设置 API 与保存逻辑保持不变；常规与显示只接入当前已有的通知显示设置持久化能力，不虚构尚未存在的桌面通知开关。

**Tech Stack:** Node.js ESM, Hono-style route handlers, server-rendered HTML, inline browser JavaScript, Node test runner.

## Global Constraints

- 使用中文界面文案，保持当前深色薄荷绿色视觉基线。
- 顶部全局导航、通知中心布局和顶部设置图标不改动。
- Runtime、诊断页面和底层 Runtime API 不修改。
- 页面切换必须留在当前 iframe，使用 `window.hana.api.fetch()` 优先，普通 fetch 只作回退。
- 子页面独立保存；声音设置继续使用已有声音接口，显示设置继续使用通知中心显示设置接口。
- 响应式布局必须使用可收缩网格、换行和窄屏单列，禁止用 `overflow-x: hidden` 掩盖溢出。
- 不执行 Git commit。
- 完成声明前运行 focused 测试、`npm test`、`npm run check`、`git diff --check` 和打包验证。

---

### Task 1: 固化统一设置壳子与内部视图契约

**Files:**
- Modify: `plugin/routes/settings.js`
- Modify: `tests/node/settings-route.test.mjs`

**Interfaces:**
- Produces `GET /settings` as the only settings document route.
- Produces `GET /settings-content?view=general|sound|visual` returning an HTML fragment for the current iframe.
- Browser exposes `window.NotificationHubSettingsShell.loadView(view)` for sub-navigation.

- [ ] **Step 1: Write failing route and shell tests**

Add assertions that `/settings` contains one shell root, a `settings-view-content` mount point, four setting categories, and no embedded full sound/layout form. Add a test that `GET /settings-content?view=sound` returns a fragment without `<!doctype html>`, without a second `.page-navigation`, and with sound controls. Add a test that unsupported views return a structured 400 response.

- [ ] **Step 2: Run focused tests and confirm the old contract fails**

Run:

```powershell
node --test tests/node/settings-route.test.mjs
```

Expected: FAIL because the current route renders the old large form and has no settings-content endpoint.

- [ ] **Step 3: Implement the shell route and fragment route**

Refactor `renderSettingsPage()` so it renders only the shared shell, setting category navigation, current view header, status region, and `#settings-view-content`. Add a small server-side view resolver that reads `view` from the request URL and returns the general fragment initially. Register `GET /settings-content` to return the selected fragment and reject unknown views with `SETTINGS_VIEW_INVALID`.

The browser shell loader must:

```js
function loadView(view) {
  var allowed = { general: true, sound: true, visual: true };
  if (!allowed[view]) return;
  requestHtml("settings-content?view=" + encodeURIComponent(view))
    .then(readFragment)
    .then(mountSettingsFragment)
    .catch(showShellError);
}
```

`mountSettingsFragment` must remove only the previous settings-view styles, replace only `#settings-view-content`, execute returned inline scripts, update the selected category and heading, and preserve the outer document and top navigation.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
node --test tests/node/settings-route.test.mjs
```

Expected: PASS.

---

### Task 2: Add the real “常规与显示” child view

**Files:**
- Modify: `plugin/routes/settings.js`
- Modify: `tests/node/settings-route.test.mjs`

**Interfaces:**
- General fragment reads `GET /notification-center-display-settings`.
- General fragment writes `POST /notification-center-display-settings`.
- General fragment preserves `mode`, `limit`, and `cardLifetimeSeconds` independently.

- [ ] **Step 1: Write failing general-view tests**

Assert that the general fragment contains:

- “常规与显示” title;
- 30/100/500/1000/无限/自定义 display-limit controls;
- custom limit range 1–10000;
- card lifetime range 0–3600;
- explicit explanation that zero seconds hides newly-created desktop cards without deleting history;
- `notification-center-display-settings` requests;
- no Runtime health, SceneState, or layout controls.

- [ ] **Step 2: Implement general fragment**

Create `renderGeneralSettingsFragment(initialData)` with a compact two-section layout: Notification Center display limit and desktop card lifetime. Keep the existing display-settings validation and server endpoint unchanged. The fragment owns its own busy state and feedback, while the outer shell owns only the common status slot.

- [ ] **Step 3: Run focused tests**

Run:

```powershell
node --test tests/node/settings-route.test.mjs
```

Expected: PASS.

---

### Task 3: Mount the existing sound domain inside the shell

**Files:**
- Modify: `plugin/routes/settings.js`
- Modify: `plugin/routes/settings-sound.js`
- Modify: `tests/node/settings-route.test.mjs`
- Modify: `tests/node/settings-sound-route.test.mjs`

**Interfaces:**
- `renderSoundSettingsFragment(currentUrl, initialData)` returns content markup and a scoped script without a second outer page shell.
- Existing `GET /settings-sound` remains as a backward-compatible standalone route during this phase.
- Shell navigation loads `view=sound` through `GET /settings-content`, not through a new Page surface.

- [ ] **Step 1: Write failing sound-shell integration tests**

Assert that the sound fragment has the existing global sound, volume, duplicate suppression, category toggles, test strategy control, and `sound-settings-update` / `sound-settings-test` calls. Assert that it does not include `<!doctype html>`, `page-nav-settings`, or a second settings toolbar. Assert that shell HTML contains only one `NotificationHubPageRouter` definition and one top navigation.

- [ ] **Step 2: Implement fragment extraction/rendering**

Expose a sound fragment renderer that reuses the existing sound page data and markup while removing the standalone document wrapper, duplicated top navigation, and child-page toolbar. Adapt only the fragment script bindings that target removed standalone controls; keep the existing API request, timeout, fallback, save, test, and cleanup behavior.

- [ ] **Step 3: Route sound through the shell**

Make `settings-content?view=sound` return the fragment renderer. Keep `/settings-sound` unchanged as a compatibility route so existing direct links remain safe, but all shell navigation uses the fragment endpoint.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
node --test tests/node/settings-route.test.mjs tests/node/settings-sound-route.test.mjs
```

Expected: PASS.

---

### Task 4: Mount visual as the next child view without changing visual behavior

**Files:**
- Modify: `plugin/routes/settings.js`
- Modify: `plugin/routes/settings-visual.js`
- Modify: `tests/node/settings-route.test.mjs`
- Modify: `tests/node/settings-visual-route.test.mjs`

**Interfaces:**
- `renderVisualSettingsFragment(currentUrl, initialData)` returns shell-compatible markup and script.
- Visual save and preview continue using existing visual settings routes and validation.

- [ ] **Step 1: Write failing visual-shell tests**

Assert that the visual fragment contains controlled presets, preview controls, and `visual-settings-update` / `visual-settings-preview`, while excluding the standalone doctype and duplicate top navigation.

- [ ] **Step 2: Implement the visual fragment renderer**

Reuse the current visual page behavior, remove only its standalone shell/navigation bindings, and keep server-injected initial state, Hana API fetch, timeout, fallback session header, preview, and save feedback unchanged.

- [ ] **Step 3: Run focused tests**

Run:

```powershell
node --test tests/node/settings-route.test.mjs tests/node/settings-visual-route.test.mjs
```

Expected: PASS.

---

### Task 5: Full verification, status update, and package delivery

**Files:**
- Modify: `CURRENT-STATUS.md`
- Create/replace: `dist/notification-hub-vnext-0.1.0-alpha.11.zip`

- [ ] **Step 1: Run focused tests**

Run the settings route, sound route, visual route, and page-navigation tests.

- [ ] **Step 2: Run complete verification**

Run:

```powershell
npm test
npm run check
git diff --check
```

- [ ] **Step 3: Package and hash the release ZIP**

Run:

```powershell
& .\scripts\package-release.ps1 -Configuration Release
Get-FileHash .\dist\notification-hub-vnext-0.1.0-alpha.11.zip -Algorithm SHA256
```

- [ ] **Step 4: Update status and stage deliverables**

Record the shell implementation, test evidence, package hash, and the remaining real Hana checks in `CURRENT-STATUS.md`. Stage the ZIP and changed source/status files with `stage_files`. Do not commit.

## Self-review

- Covers unified shell, internal iframe routing, responsive navigation, general display settings, sound integration, visual integration, independent save feedback, tests, package and status update.
- Deliberately does not invent desktop notification enablement or default strategy persistence because no corresponding domain/API exists yet; those controls remain a later product slice.
- Runtime and diagnostics are explicitly excluded from implementation files.
