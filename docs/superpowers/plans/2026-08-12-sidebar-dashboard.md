# Sidebar Dashboard Implementation Plan

> **For agentic workers:** This plan is executed inline in the current session. Each slice follows TDD and must preserve the alpha.8 Runtime baseline.

**Goal:** 将现有 `/widget` 从 Runtime 开发验收面板收敛为轻量侧边栏驾驶仪表盘。

**Architecture:** 保留现有 Widget 路由和 Runtime 测试 API，先只改变页面展示层。侧边栏只读取最近通知、Runtime 健康摘要和现有 Settings API，开发卡片、Shelf 参数、SceneState 详情继续保留在 API 层，等待 Runtime/Diagnostics 页面承载。

**Tech Stack:** Node.js ES modules、Hono-style route handlers、内嵌 HTML/CSS/JavaScript、Node test runner。

## Global Constraints

- 保持 `0.1.0-alpha.8` Runtime 行为不变：创建卡片不左上角闪现、一次点击只关闭一张卡片、剩余卡片正确重排。
- 侧边栏只显示通知简要、Runtime 健康摘要和轻量声音控制。
- 不把完整历史、复杂筛选、Shelf 调试、测试卡片和 SceneState 原始数据放回侧边栏首屏。
- 不使用 `overflow-x: hidden` 掩盖横向溢出；布局必须允许窄宽度换行或单列重排。
- 不删除现有 Runtime 测试 API；它们由后续 Runtime/Diagnostics 页面复用。
- 不执行 Git commit。

---

### Task 1: Sidebar contract test

**Files:**
- Modify: `tests/node/widget-route.test.mjs`

**Interfaces:**
- The widget page continues to use `notification-widget-status` and `runtime-test-status`.
- The widget page additionally uses existing `settings-status` and `settings-update` routes.
- Runtime test endpoints remain registered but are not referenced by the sidebar HTML.

- [x] Write assertions for a compact sidebar shell, recent notifications, Runtime summary, quick sound controls, settings link, and responsive layout markers.
- [x] Assert the sidebar no longer renders or invokes Shelf/test-card/SceneState controls.
- [x] Extend the fake API with `getSettingsStatus` and `updateSettings` so the endpoint contract remains testable.
- [x] Run `node --test tests/node/widget-route.test.mjs` and use any failure as the red stage before implementation.

### Task 2: Implement the compact sidebar

**Files:**
- Modify: `plugin/routes/widget.js`

**Interfaces:**
- `renderWidget()` returns a self-contained sidebar page.
- The page fetches `./notification-widget-status`, `./runtime-test-status`, and `./settings-status`.
- Quick sound save posts `{ globalSoundEnabled, workModeMuted, defaultPolicy: { enabled, volume, suppressDuplicates } }` to `./settings-update`.
- Existing Runtime test endpoints remain registered below the page for later surfaces.

- [x] Remove the development controls from the rendered page: Shelf fields, test-card inputs, clear-test-card button, raw SceneState JSON, and debug layout actions.
- [x] Add compact sections for recent notifications, Runtime health, and quick sound controls.
- [x] Make the quick sound controls share the existing Settings API rather than creating a second settings store.
- [x] Replace fixed two-column assumptions with `minmax(0, 1fr)`, wrapping, and single-column narrow-width rules.
- [x] Keep notification deep links and the `window.parent.postMessage({ type: "ready" }, "*")` handshake.

### Task 3: Verify and package

**Files:**
- Modify: `CURRENT-STATUS.md`
- Create/update: `dist/notification-hub-vnext-0.1.0-alpha.8.zip`

- [ ] Run focused widget tests.
- [ ] Run `npm run check`, full Node tests, and `git diff --check`.
- [ ] Build the latest Release package and record its SHA256.
- [ ] Stage the package and changed source/test/status files for Hana validation.
- [ ] Do not claim real Hana sidebar acceptance until the user confirms the installed/reloaded widget at minimum, medium, narrow, and smallest host widths.
