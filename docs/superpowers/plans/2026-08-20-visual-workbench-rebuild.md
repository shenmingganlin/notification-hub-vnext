# Visual Workbench Rebuild Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with a regression gate after each task.

**Goal:** Turn the visual settings page into a coherent visual workbench where a user can design one visual profile, apply it to selected events, test each event, and export the resulting package.

**Architecture:** Keep the existing visual settings store as the editable current draft. Add an explicit profile lifecycle bridge that saves the draft into `visualProfileRegistry`, then expose profile and event binding data to the page. Reuse the existing notification test generator with an explicit event list; do not create a second test protocol. Hide legacy resolver concepts from the primary UI while retaining their backend compatibility.

**Tech Stack:** Node.js ESM, Hono-style Plugin routes, existing visual registries, existing notification test generator, `node:test`.

## Global Constraints

- The primary visual workflow must be understandable without knowing `Visual Profile`, resolver, or category policy internals.
- Saving a visual draft must create or replace a named exportable profile.
- Applying a profile must use the existing `applyVisualProfileToEvents()` API and must not modify sound settings.
- Visual tests must accept explicit event names and default to all supported visual test events when the user chooses “全部事件”.
- Exporting a visual package must report a useful empty-state message only when no saved profile exists.
- Legacy `visualRules` and category preset data remain readable for compatibility but are not primary editing controls.
- Visual failures must not block notification persistence, sound playback, or Plugin lifecycle.
- Use structured file tools for source edits; run focused tests, `npm run check`, full Node tests, and `git diff --check` before completion.

---

### Task 1: Lock the profile and event workflow contract

**Files:**
- Modify: `tests/node/plugin-visual-api.test.mjs`
- Modify: `tests/node/settings-visual-route.test.mjs`
- Modify: `tests/node/notification-test-generator.test.mjs`

**Interfaces:**
- Consumes: existing `NotificationHubVNextPlugin`, visual registry, notification test generator.
- Produces: regression expectations for `saveVisualProfile`, profile listing, applying to events, and explicit event test requests.

- [ ] Add a test that saves the current visual draft under a profile id and name, then asserts the registry contains that profile and a second save replaces the same profile.
- [ ] Add a test that applies the saved profile to two explicit event ids and asserts `listCustomVisualEvents()` returns both events with the saved profile id and requested behavior channel.
- [ ] Add a test that the visual test route forwards an explicit `events` array instead of forcing `tool_completed`.
- [ ] Add a generator test that `events` preserves the requested event set when `count` is equal to the event count.
- [ ] Run the focused tests and confirm the new contract fails before implementation.

Run: `node --test tests/node/plugin-visual-api.test.mjs tests/node/settings-visual-route.test.mjs tests/node/notification-test-generator.test.mjs --test-concurrency=1`

---

### Task 2: Add the profile lifecycle API

**Files:**
- Modify: `plugin/index.js`
- Modify: `plugin/routes/settings.js`
- Modify: `plugin/routes/settings-visual.js`
- Test: `tests/node/plugin-visual-api.test.mjs`

**Interfaces:**
- Consumes: current draft from `visualSettingsStore`, `visualProfileRegistry`, `visualBindingRegistry`, and `visualRegistryPersistence`.
- Produces:
  - `listVisualProfiles()` -> `{ profileId, name, source, references }[]`
  - `saveVisualProfile({ profileId, name, profile })` -> `{ profileId, name, profile, visualRevision }`
  - `previewApplyVisualProfile({ profileId, eventIds, behaviorChannelId })`
  - `applyVisualProfileToEvents({ profileId, eventIds, behaviorChannelId })`

- [ ] Implement `listVisualProfiles()` using registry records and references.
- [ ] Implement `saveVisualProfile()` with safe id/name validation, current draft fallback when `profile` is omitted, copy-on-write replacement semantics, reference preservation, and persistence queueing.
- [ ] Add a route `GET /visual-profiles` returning profile summaries.
- [ ] Add a route `POST /visual-profiles/save` returning the saved profile summary.
- [ ] Add a route `POST /visual-profiles/preview-apply` delegating to the existing preview API.
- [ ] Add a route `POST /visual-profiles/apply` delegating to the existing apply API.
- [ ] Keep sound fields untouched when projecting bindings into event presentation settings.
- [ ] Run the plugin visual API tests and route tests.

Run: `node --test tests/node/plugin-visual-api.test.mjs tests/node/settings-visual-route.test.mjs --test-concurrency=1`

---

### Task 3: Make visual testing event-complete

**Files:**
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/domain/notification-test-generator.js` only if the explicit-event behavior test reveals a defect
- Modify: `tests/node/settings-visual-route.test.mjs`
- Modify: `tests/node/notification-test-generator.test.mjs`

**Interfaces:**
- Consumes: `NOTIFICATION_TEST_EVENTS`, `getNotificationTestEventDefinition()`, and `runNotificationTest()`.
- Produces: a visual test route that accepts `{ events, count, intervalMs }` and defaults to all event definitions for the visual workbench.

- [ ] Change the visual test endpoint default from `['tool_completed']` to the complete supported event list.
- [ ] Add an explicit event selector model to the rendered page with one checkbox per event and a “全部事件” control.
- [ ] Send one notification per selected event by default; preserve a user-selected count only as a repeat count when explicitly requested.
- [ ] Render returned event labels, generated count, failed count, and card creation result in the feedback area.
- [ ] Add a focused test that the route forwards all six selected event names and does not silently force `tool_completed`.
- [ ] Run the focused route and generator tests.

Run: `node --test tests/node/settings-visual-route.test.mjs tests/node/notification-test-generator.test.mjs --test-concurrency=1`

---

### Task 4: Rebuild the visual page around the workbench flow

**Files:**
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/routes/settings-events.js` only if the shared event binding copy or link must be updated
- Test: `tests/node/settings-visual-route.test.mjs`

**Interfaces:**
- Consumes: profile summaries, current draft settings, event definitions, visual asset summaries, and the Task 2/3 routes.
- Produces: a page with these visible sections in order:
  1. Current visual scheme: name, save/update, profile status, export shortcut.
  2. Apply to events: event checklist, behavior channel, preview impact, apply button.
  3. Card appearance: existing minimal card controls and live local preview.
  4. Test this scheme: event checklist and per-event test result.
  5. Assets and import/export: links and package actions.

- [ ] Remove the legacy “视觉规则” editor from the primary page.
- [ ] Replace “分类视觉预设” with a compact compatibility note or move it below an explicit “高级兼容设置” disclosure.
- [ ] Rename internal terms in visible copy: `Visual Profile` -> `视觉方案`, `behaviorChannelId` -> `行为通道`, `apply` -> `应用到事件`.
- [ ] Add a named profile field with a stable default such as `默认视觉方案` and a generated safe id when first saved.
- [ ] Add event labels from the event catalog, not raw ids as the primary text.
- [ ] Add “预览将影响 N 个事件” before applying.
- [ ] Add clear saved/applied/unsaved states and make export disabled with a useful explanation until a profile exists.
- [ ] Keep the existing asset picker and local card preview, but place them after the workflow controls.
- [ ] Ensure the fragment version used inside the settings shell exposes the same workflow, not a stale subset.
- [ ] Update route tests to assert visible workflow labels and absence of the old primary panels.
- [ ] Run focused page tests and parse every embedded script with `new Function`.

Run: `node --test tests/node/settings-visual-route.test.mjs --test-concurrency=1`

---

### Task 5: Verify integration and document the boundary

**Files:**
- Modify: `CURRENT-STATUS.md`
- Test: all existing Node tests

- [ ] Run `npm run check`.
- [ ] Run `npm test -- --test-concurrency=1`.
- [ ] Run `git diff --check`.
- [ ] Record that the visual page now has a profile → event binding → per-event test → export workflow.
- [ ] Record any remaining real Hana/Native acceptance items separately, especially Native dismiss reconciliation.
- [ ] Do not claim the visual page is complete until the user validates the actual Hana surface.
