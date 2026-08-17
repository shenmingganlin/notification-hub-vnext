# Sound Workbench Simplification Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with a test gate after every task.

**Goal:** Replace the confusing category-default/custom-sound card UI with a simple Sound Configuration editor plus a separate Audio Library, while preserving Windows fallback, global mute, sound packages, and legacy profile reads.

**Architecture:** Keep `soundOverrides` as the internal exact binding store and keep the controlled sound asset registry as the file source of truth. New UI writes only exact bindings; audio import no longer requires a binding; preview accepts a temporary binding and optional temporary sound asset without persisting it. Legacy category policies and advanced rules remain readable for compatibility but disappear from the new user workflow.

**Tech Stack:** Node.js ES modules, Hono-style plugin routes, inline Hana iframe HTML/CSS/JS, Node built-in test runner, Windows PowerShell audio backend.

## Global Constraints

- Version remains `0.1.0-alpha.15`.
- Windows-first; unconfigured combinations use Windows system sounds through the existing fallback chain.
- Global mute is absolute, including critical notifications, asset preview, and temporary-combination preview.
- Preview never writes notification history, never mutates settings, and never blocks normal notification playback or Runtime lifecycle.
- Imported audio remains inside the controlled `sound-assets` directory.
- User-facing importance is only `普通` and `重要`; internal values remain compatible with `low`, `normal`, `high`, and `critical`.
- Error events default to `重要` and the UI locks their importance control.
- Removing a binding never removes its audio asset.
- Deleting an in-use audio asset is rejected until all bindings are removed.
- Source edits use structured `read` / `edit` / `write`; Shell is for tests, checks, build, and packaging only.
- Do not modify historical diagnostic records and do not run Git commit.

## File Map

- Modify `plugin/domain/sound-binding.js`: expose user-level importance mapping, error-event defaults, binding removal and reference collection.
- Modify `plugin/domain/sound-asset-importer.js`: import audio independently from bindings; keep optional legacy binding support for package/backward compatibility.
- Modify `plugin/index.js`: add binding removal, temporary preview sound selection, and in-use asset deletion protection; expose binding-aware asset status.
- Modify `plugin/routes/settings.js`: add binding removal and temporary preview request handling; make audio import binding-optional.
- Rewrite `plugin/routes/settings-sound.js`: render the two-area workbench and audio library without category defaults or a standalone test panel.
- Modify `tests/node/settings-sound-route.test.mjs`: assert the new information architecture and removed legacy UI.
- Modify `tests/node/settings-route.test.mjs`: cover binding removal, binding-optional import, and temporary preview forwarding.
- Modify `tests/node/custom-sound-configuration.test.mjs`: cover independent import and binding lifecycle where the plugin harness supports it.
- Modify `tests/node/sound-binding.test.mjs`: cover user importance mapping and binding removal/reference collection.
- Update `CURRENT-STATUS.md` and this plan with verified results.

---

### Task 1: Lock the simplified domain contract

**Files:**
- Modify: `plugin/domain/sound-binding.js`
- Test: `tests/node/sound-binding.test.mjs`

- [x] Add tests for `userImportanceToInternal('normal') === 'normal'`, `userImportanceToInternal('important') === 'critical'`, and `internalImportanceToUser('low'|'normal') === 'normal'`, `internalImportanceToUser('high'|'critical') === 'important'`.
- [x] Add tests that `defaultBindingImportance('error', 'error')` and all error-class events return `critical`, while ordinary events return `normal`.
- [x] Add tests that `removeSoundBinding(profile, { category, event, importance })` removes exactly one override and leaves the asset untouched.
- [x] Add tests that `collectSoundAssetReferences(profile, soundId)` reports categories, exact overrides, and advanced rules.
- [x] Run `node --test tests/node/sound-binding.test.mjs` and verify the new tests fail before implementation.
- [x] Implement the helpers with the existing controlled choice constants and no profile version change.
- [x] Run the focused test again and verify it passes.

### Task 2: Decouple audio import from binding configuration

**Files:**
- Modify: `plugin/domain/sound-asset-importer.js`
- Modify: `plugin/index.js`
- Modify: `plugin/routes/settings.js`
- Test: `tests/node/settings-route.test.mjs`
- Test: `tests/node/custom-sound-configuration.test.mjs`

- [x] Add a route test proving JSON and multipart audio import are accepted without `binding`.
- [x] Add a plugin/domain test proving an imported asset can be present in the registry without adding `soundOverrides`.
- [x] Preserve optional `binding` handling for older package/import callers.
- [x] Add `removeSoundBindingConfiguration({ category, event, importance })` in the plugin; validate the exact binding, update only `soundOverrides`, update NotificationApi, mark applied, and return the complete settings status.
- [x] Make `_deleteSoundAsset` reject `SOUND_ASSET_IN_USE` with a reference list when any category, exact override, global policy, or advanced rule uses the asset.
- [x] Add `previewSoundSettings` support for `{ labels, event, importance, soundId? }`; when `soundId` is supplied, use the temporary asset reference only for the returned decision and test playback.
- [x] Keep global mute as the first hard gate for temporary preview.
- [ ] Run focused route and configuration tests and verify they pass.

### Task 3: Replace the page with the two-area workbench

**Files:**
- Rewrite: `plugin/routes/settings-sound.js`
- Modify: `tests/node/settings-sound-route.test.mjs`

- [x] Add failing markup assertions for `声音配置`, `音频库`, `普通`, `重要`, `已自定义声音`, `解除配置`, binding-optional import, and a preview request carrying the temporary `soundId`.
- [x] Add failing negative assertions for `分类默认`, `分类声音开关与音量`, standalone `声音测试`, `保存三层组合`, and import-time binding selectors.
- [x] Render only these user-facing controls in the configuration area: category, translated event, ordinary/important level, audio-library select, save, test current combination.
- [x] Lock the level to `重要` for error events and show a plain-language explanation instead of an implementation term.
- [x] Render exact configured combinations as compact rows with translated category/event/level, selected audio name, `测试`, and `解除配置`.
- [x] Render an explicit Windows default fallback note for combinations absent from `soundOverrides`.
- [x] Render the audio library with add local audio, package import/export, asset preview, usage count/reference text, and delete behavior.
- [x] Import audio without binding; after import, refresh the audio library and keep the configuration editor independent.
- [x] Make the current-combination test send `{ labels, event, importance, soundId }` without saving.
- [x] Make unbind send the exact binding and never delete the audio asset.
- [x] Keep the iframe request/fallback, timeout, page navigation, and responsive no-horizontal-overflow contracts.
- [x] Run `node --test tests/node/settings-sound-route.test.mjs` and verify it passes.

### Task 4: Integrate package and legacy compatibility behavior

**Files:**
- Modify: `plugin/domain/sound-package-importer.js` only if package binding normalization requires it.
- Modify: `plugin/domain/sound-package-exporter.js` only if reference metadata is needed.
- Modify: `plugin/index.js` if package status needs binding-aware usage counts.
- Test: `tests/node/sound-package.test.mjs`
- Test: `tests/node/custom-sound-configuration.test.mjs`

- [ ] Verify exported packages retain exact `soundOverrides` bindings.
- [ ] Verify importing a package restores bindings independently from the new UI's audio import flow.
- [x] Verify old profiles with `categories.*.soundId` still load, while new page submissions do not write category defaults.
- [x] Verify unbinding one exact combination leaves the asset and all other combinations intact.
- [x] Run package and configuration focused tests.
- [x] Added the follow-up user model: three visible categories, four visible events, forced important level for timeout/error, cascade deletion confirmation, and per-binding volume.

### Task 5: Regression, documentation, and release artifact

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `docs/superpowers/plans/2026-08-14-sound-workbench-simplification.md`

- [ ] Run focused sound/page/route tests.
- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Run `git diff --check`.
- [ ] Run CTest 27/27 in the existing Release build directory.
- [ ] Rebuild the Release ZIP with `scripts/package-release.ps1`.
- [ ] Validate required ZIP entries and calculate SHA256.
- [ ] Update `CURRENT-STATUS.md` with the new workbench architecture and actual evidence only.
- [ ] Stage the changed source, tests, plan/status docs, and ZIP using `stage_files`; do not commit.
