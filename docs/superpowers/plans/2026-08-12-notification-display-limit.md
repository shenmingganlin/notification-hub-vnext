# Notification Center Display Limit Implementation Plan

> **For agentic workers:** This plan is executed inline in the current session. Each step must be verified before moving on.

**Goal:** Add a persisted Notification Center display-limit preference with presets 30, 100, 500, 1000, unlimited, and custom, limiting only the current page query/render workload while preserving complete notification history.

**Architecture:** Keep the display preference separate from sound/Native Runtime settings. Add a small validated preference module and persistence file under the plugin data directory. The Notification Center route reads the preference for every list request, while an explicit page query can override it during a user selection. The Widget keeps its existing recent-notification behavior.

**Tech Stack:** Node.js ESM, existing Hono-style route adapters, JSON persistence, Node test runner.

## Global Constraints

- Notification history and Store data must never be deleted or truncated by this feature.
- Default page display limit is 100.
- Supported presets are exactly 30, 100, 500, 1000, unlimited, and custom.
- Custom limits accept integers from 1 through 10000.
- Unlimited means no route-level limit; it may still be expensive for very large histories.
- Display-limit settings must not be sent to Native Runtime `config.update`.
- Existing alpha.8 Runtime behavior must remain unchanged.
- No Git commit.

---

### Task 1: Define and test display-limit validation

**Files:**
- Create: `plugin/domain/notification-display-settings.js`
- Test: `tests/node/notification-display-settings.test.mjs`

**Interface:**
- `NOTIFICATION_DISPLAY_LIMIT_PRESETS`
- `NOTIFICATION_DISPLAY_LIMIT_DEFAULT`
- `NOTIFICATION_DISPLAY_LIMIT_MAX`
- `createNotificationDisplaySettings(input = {})`
- `validateNotificationDisplaySettings(settings)`
- `resolveNotificationDisplayLimit(settings)` returning `null` for unlimited

- [ ] Write tests for default 100, presets, unlimited, custom 1..10000, and rejection of invalid values.
- [ ] Run the focused test and confirm the new test fails before implementation.
- [ ] Implement the minimal immutable validated module.
- [ ] Run the focused test and confirm it passes.

### Task 2: Persist display settings independently

**Files:**
- Create: `plugin/domain/notification-display-settings-persistence.js`
- Test: `tests/node/notification-display-settings-persistence.test.mjs`
- Modify: `plugin/index.js`

**Interface:**
- `createNotificationDisplaySettingsPersistence(ctx, options)`
- `restore()`
- `save(settings)`
- `filePath`

- [ ] Add tests for default path below `ctx.dataDir`, absent-file restore, atomic validated save/load, and malformed-file rejection.
- [ ] Run focused tests and confirm the new persistence assertions fail before implementation.
- [ ] Implement persistence using the existing atomic JSON file conventions.
- [ ] Instantiate it during plugin load and restore before serving routes.
- [ ] Run focused persistence and plugin lifecycle tests.

### Task 3: Add settings API and page control

**Files:**
- Modify: `plugin/index.js`
- Modify: `plugin/routes/settings.js`
- Modify: `tests/node/settings-route.test.mjs`
- Modify: `tests/node/plugin-lifecycle.test.mjs`

**Interface:**
- `getNotificationDisplaySettings()`
- `updateNotificationDisplaySettings(patch)`

- [ ] Add route tests for read/update and invalid custom limits.
- [ ] Add a Settings page control with preset select and custom number input.
- [ ] Implement validation, persistence, and response status without Runtime sync.
- [ ] Run focused route and lifecycle tests.

### Task 4: Apply the preference to Notification Center

**Files:**
- Modify: `plugin/routes/notification-center.js`
- Modify: `tests/node/notification-center-route.test.mjs`

- [ ] Add a route test proving default 100 is passed to the Store and that explicit `limit=unlimited` omits the limit.
- [ ] Add tests for 30, 500, 1000, and custom values.
- [ ] Implement preference resolution and safe query parsing.
- [ ] Add a compact page control near the list summary for immediate switching; save it through the settings API.
- [ ] Keep detail requests unbounded for the selected notification and keep full content/metadata intact.
- [ ] Run focused Notification Center tests.

### Task 5: Full verification and package delivery

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `README.md` only if the user-facing configuration needs documenting.

- [ ] Run `npm run check`.
- [ ] Run `npm test`.
- [ ] Run `git diff --check`.
- [ ] Build a fresh `0.1.0-alpha.8` ZIP with the current workspace Runtime.
- [ ] Verify ZIP root manifest, Runtime entry, size, and SHA256.
- [ ] Stage the ZIP and changed files for delivery.
- [ ] Record that real Hana performance and limit switching still require the user's reinstall/restart or an explicit desktop acceptance run.
