# Custom Sound Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users import, configure, preview, replace, and delete custom notification sounds from the existing sound settings page while preserving built-in defaults for unconfigured category + event + importance combinations.

**Architecture:** Keep the existing controlled sound asset registry as the source of truth for files and metadata. Extend the sound settings boundary with an explicit category-assignment operation that writes `soundId` references into the existing sound profile; the resolver already supports custom `soundId` references and falls back to built-in cues when no reference exists. Make single-file replacement atomic at the importer boundary and automatically remove deleted asset references from the profile.

**Tech Stack:** Node.js ESM, Hana plugin routes, existing SoundSettingsStore, sound asset registry/persistence, Windows audio adapter, Node built-in test runner.

## Global Constraints

- Target platform is Windows-first.
- Global mute remains absolute and cannot be bypassed by preview or critical notifications.
- Unconfigured categories continue using their built-in Windows system sound mapping.
- Audio files remain inside the controlled `sound-assets` root; no arbitrary playback paths or DSL are exposed.
- Duplicate three-layer bindings use replacement semantics and must be rollback-safe; the exact identity is category + event + importance.
- Deleting a custom asset must not leave a dangling profile reference in categories, exact overrides, or advanced rules.
- UI must remain responsive from 300px upward and must not use horizontal overflow hiding to mask layout errors.
- Keep version `0.1.0-alpha.15`.
- Do not execute Git commit.

---

### Task 1: Replace one custom asset atomically

**Files:**
- Modify: `plugin/domain/sound-asset-importer.js`
- Modify: `plugin/index.js`
- Test: `tests/node/sound-asset-importer.test.mjs`
- Test: `tests/node/plugin-lifecycle.test.mjs` or the nearest existing plugin asset API coverage

**Interfaces:**
- `importSoundAsset({ file, filePath, filename, assetRoot, registry, name, soundId, replaceExisting = false })` accepts the new flag.
- Existing default `replaceExisting = false` keeps duplicate rejection for callers that do not opt in.
- `NotificationHubPlugin.importSoundAsset()` and the runtime test API pass `replaceExisting` through.

- [x] **Step 1: Add a failing test** for importing the same generated `soundId` with `replaceExisting: true`: the second bytes replace the file, registry metadata changes, and the registry contains one custom asset.
- [x] **Step 2: Run the focused importer test** and confirm it fails because duplicates are still rejected.
- [x] **Step 3: Implement atomic replacement** using a temporary file plus a backup of the existing target; update the registry only after the new file is in place; restore the old file and registry entry on any failure.
- [x] **Step 4: Add plugin pass-through coverage** that verifies the API accepts `replaceExisting` without changing the default rejection path.
- [x] **Step 5: Run focused importer and plugin tests** and confirm they pass.

---

### Task 2: Configure custom assets for notification categories

**Files:**
- Modify: `plugin/index.js`
- Modify: `plugin/routes/settings.js`
- Test: `tests/node/settings-route.test.mjs` or the nearest settings route test
- Test: `tests/node/plugin-lifecycle.test.mjs`

**Interfaces:**
- Add `updateSoundAssetConfiguration({ soundId, categories })` to the plugin runtime test API.
- `categories` is an array of zero or more values from `chat`, `channel`, `tool`, `error`, `plugin`.
- The operation only accepts existing custom assets; built-ins cannot be configured through this endpoint.
- For each selected category, set `profile.categories[category].soundId = soundId`.
- For categories currently pointing to this `soundId` but omitted from `categories`, remove `soundId` so they fall back to their default cue.
- Return the normal sound settings status including the updated `assets` list and profile.

- [x] **Step 1: Add a failing domain/API test** covering assignment to two categories, clearing all assignments, rejecting unknown assets, and rejecting invalid category values.
- [x] **Step 2: Run the focused test** and confirm the API is absent or rejects the new contract.
- [x] **Step 3: Implement the operation** by cloning the current profile, updating only category `soundId` fields, applying it through `SoundSettingsStore`, updating NotificationApi, and marking the new revision applied.
- [x] **Step 4: Add `POST /sound-asset-configure`** with structured validation errors and the existing route error envelope.
- [x] **Step 5: Add deletion cleanup**: before removing a custom asset, clear every category that references its `soundId`, save the settings, then remove the asset; restore both settings and registry during rollback if deletion fails.
- [x] **Step 6: Run focused API, route, and asset deletion tests** and confirm they pass.
- [x] Added `profile.soundOverrides` as an exact category + event + importance index, with precedence over generic rules and compatibility with legacy category defaults.

---

### Task 3: Upgrade the sound settings UI to custom sound cards

**Files:**
- Modify: `plugin/routes/settings-sound.js`
- Modify: `tests/node/settings-sound-route.test.mjs`

**Interfaces:**
- The page consumes `status.assets` and `status.profile.categories` from the existing status endpoint.
- It calls `POST sound-asset-import` with multipart audio and `{ replaceExisting: true }` in the multipart fields.
- It calls `POST sound-asset-configure` with `{ soundId, categories }`.
- Built-in category cues remain visible as the fallback explanation; custom cards show assigned categories or “未配置，使用默认声音”.

- [x] **Step 1: Add route markup assertions** for the custom sound card container, category checkboxes, replace wording, default fallback wording, and configure endpoint.
- [x] **Step 2: Run the focused route test** and confirm the new UI contract is absent.
- [x] **Step 3: Replace the old asset rows with responsive custom asset cards** while retaining import, package import/export, preview, and explicit two-click delete behavior.
- [x] **Step 4: Add per-card category + event + importance selectors**; the three values are submitted as one atomic binding and re-render the returned status.
- [x] **Step 5: Make repeat import opt into replacement only for the same three-layer binding** and show “已覆盖” when the backend reports a replacement.
- [x] **Step 6: Run the route test and JavaScript syntax checks**.

---

### Task 4: Full verification and release artifact

**Files:**
- Modify: `docs/superpowers/plans/2026-08-14-custom-sound-settings.md`
- Modify: `CURRENT-STATUS.md` only if the implementation evidence is worth recording
- Generated: `dist/notification-hub-vnext-0.1.0-alpha.15.zip`

- [x] **Step 1: Run focused custom sound tests.**
- [x] **Step 2: Run `npm test`, `npm run check`, and `git diff --check`.**
- [x] **Step 3: Rebuild the release Runtime if required by the release script, then run `scripts/package-release.ps1 -Configuration Release`.**
- [x] **Step 4: Validate ZIP structure and calculate SHA256.**
- [x] **Step 5: Stage the changed source files, plan/status evidence, and ZIP with `stage_files`; do not commit.**
