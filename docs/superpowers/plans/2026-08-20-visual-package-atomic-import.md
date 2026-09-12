# Visual Package Atomic Import Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with a test gate after each task.

**Goal:** Make visual package import atomic across assets, profiles, bindings, and asset files, so any non-recoverable import failure restores the exact pre-import state.

**Architecture:** Capture validated snapshots before mutation. Extend the Profile and Binding registries with full-state replacement restore operations. Run asset, profile, and binding import inside one transaction boundary; on failure restore registry/library snapshots and remove files created during this attempt. Return a structured failure report only after rollback succeeds, and surface rollback failure as a separate diagnostic error.

**Tech Stack:** Node.js ESM, `node:test`, `adm-zip`, existing visual registries and asset storage.

## Global Constraints

- Preserve `copy`, `skip`, and `overwrite` conflict semantics.
- Do not modify sound settings or sound bindings.
- Do not silently leave partial visual state after an import failure.
- Asset binary cleanup must be attempted when rollback removes newly imported assets.
- Keep existing successful import report shape backward compatible; add failure fields only for failed imports.
- Use structured file tools for source edits and run syntax check, full tests, and `git diff --check` before completion.

---

### Task 1: Define the observable rollback contract

**Files:**
- Modify: `tests/node/visual-package-io.test.mjs`
- Test: `tests/node/visual-package-io.test.mjs`

**Interfaces:**
- Consumes: existing `exportVisualPackage()` and `importVisualPackage()` public APIs.
- Produces: tests that require failed imports to restore profiles, bindings, assets, and storage files.

- [ ] Add one test where a package imports an asset and then profile registration fails; assert the target profile list, asset list, and storage directory equal their pre-import values.
- [ ] Add one test where profile import succeeds and binding application fails; assert no imported profile or binding remains and the report has `rolledBack: true`, `failedStage: 'bindings'`.
- [ ] Add one test for `overwrite` where an existing profile and binding are replaced before a later failure; assert the original name, profile data, binding target, and references are restored.
- [ ] Run only the new tests and confirm RED before implementation.

Run: `node --test tests/node/visual-package-io.test.mjs`
Expected: the new tests fail because failed mutations currently remain or errors are swallowed.

---

### Task 2: Add complete Profile Registry replacement restore

**Files:**
- Modify: `plugin/domain/visual-profile-registry.js`
- Test: `tests/node/visual-package-io.test.mjs`

**Interfaces:**
- Consumes: a validated profile snapshot containing profile records and references.
- Produces: `profileRegistry.snapshot()` and `profileRegistry.restoreSnapshot(snapshot)` with replacement semantics.

- [ ] Add `snapshot()` returning cloned profile records and their event references.
- [ ] Add `restoreSnapshot(snapshot)` that validates every profile in an isolated registry before mutating the live registry.
- [ ] Replace the live maps only after validation succeeds, preserving profile records and reference sets exactly.
- [ ] Keep existing `register`, `remove`, and reference APIs unchanged.
- [ ] Run the registry and package tests.

Run: `node --test tests/node/visual-package-io.test.mjs tests/node/visual-registry-persistence.test.mjs tests/node/visual-profile-binding-registry.test.mjs`
Expected: registry restore tests pass; package rollback tests may still fail until Task 3.

---

### Task 3: Add complete Binding Registry replacement restore

**Files:**
- Modify: `plugin/domain/event-binding-registry.js`
- Test: `tests/node/visual-package-io.test.mjs`

**Interfaces:**
- Consumes: a validated binding snapshot and the existing Profile Registry.
- Produces: `bindingRegistry.restoreSnapshot(snapshot)` with replacement semantics.

- [ ] Validate all snapshot bindings in an isolated registry before changing live bindings.
- [ ] Remove references for every current live binding.
- [ ] Clear and rebuild the binding map from the validated snapshot.
- [ ] Recreate Profile Registry references through the public reference methods.
- [ ] Preserve `behaviorChannelId` and `source` fields.
- [ ] Run the package rollback tests and existing binding tests.

Run: `node --test tests/node/visual-package-io.test.mjs tests/node/visual-profile-binding-registry.test.mjs`
Expected: binding rollback and reference restoration pass.

---

### Task 4: Make package import transactional

**Files:**
- Modify: `plugin/domain/visual-package-io.js`
- Test: `tests/node/visual-package-io.test.mjs`

**Interfaces:**
- Consumes: snapshots from Profile Registry, Binding Registry, and optional Asset Library.
- Produces: transactional `importVisualPackage()` behavior and structured failure results.

- [ ] Capture all available snapshots before importing any asset.
- [ ] Track each newly imported asset ID and its format for cleanup.
- [ ] Treat asset, profile, and binding failures as transaction failures when the operation cannot safely complete; preserve intentional `skip` conflict results.
- [ ] On failure, restore the Profile Registry first, then the Binding Registry, then asset library state, and remove files for assets created during this attempt; Binding validation depends on restored Profiles.
- [ ] Return a failure report with `rolledBack`, `failedStage`, and `rollbackReason` when rollback succeeds.
- [ ] Throw a stable `VISUAL_PACKAGE_ROLLBACK_FAILED` error with original and rollback details when rollback itself fails.
- [ ] Keep successful import reports unchanged except for additive metadata where useful.
- [ ] Run the focused package tests until GREEN.

Run: `node --test tests/node/visual-package-io.test.mjs`
Expected: all package import tests pass, including rollback tests.

---

### Task 5: Verify integration and document the boundary

**Files:**
- Modify: `CURRENT-STATUS.md`
- Test: all existing Node tests

- [ ] Run `npm run check`.
- [ ] Run `npm test -- --test-concurrency=1`.
- [ ] Run `git diff --check`.
- [ ] Confirm Native Runtime build is unnecessary unless Native files changed.
- [ ] Update `CURRENT-STATUS.md` with atomic rollback behavior, failure report fields, and any remaining dependency-report work.
