# Scene Behavior Diagnostics Implementation Plan

> **For agentic workers:** implement as a small vertical slice; do not change channel layout or Scene protocol behavior.

**Goal:** Expose a bounded, read-only summary of visible Scene cards and behavior channels so real Hana verification can identify event, profile, channel, and geometry without guessing from window titles.

**Architecture:** Reuse the existing Runtime `health.sceneStateSnapshot`. A pure projection module strips title/body and returns only safe identity, behavior, geometry, ordering, and bounded/truncated metadata. The diagnostics page renders the projection as compact channel and card rows.

**Tech Stack:** Node.js ESM, existing Hana route HTML, node:test.

## Global Constraints

- Do not change Native layout algorithms, Scene payload contracts, sound/visual policy, or card lifecycle.
- Do not expose notification title/body, raw process streams, paths, scripts, or unbounded SceneState.
- Cap diagnostic cards and channels at 50 entries.
- Keep the existing diagnostics API and page responsive.
- Do not execute Git commit, push, reset, clean, or overwrite unrelated changes.

### Task 1: Safe projection

**Files:**
- Create: `plugin/domain/scene-behavior-diagnostics.js`
- Test: `tests/node/scene-behavior-diagnostics.test.mjs`

Implement `createSceneBehaviorDiagnostics(snapshot)` returning `{ version: 'v1', cardCount, channelCount, truncated, cards, channels }`. Cards contain only `id`, `x`, `y`, `width`, `height`, `eventId`, `categoryId`, `eventTypeId`, `visualProfileId`, `behaviorProfileId`, and `behaviorChannelId`. Channels contain `channelId`, `profileId`, and bounded `cardOrder`.

### Task 2: Runtime diagnostics integration

**Files:**
- Modify: `plugin/index.js`
- Test: existing lifecycle/diagnostics tests if needed

Add the projection to `getDiagnosticsPageStatus().runtime.sceneBehavior`. Preserve existing health fields and diagnostics sanitization.

### Task 3: Diagnostics page

**Files:**
- Modify: `plugin/routes/diagnostics.js`
- Test: `tests/node/diagnostics-route.test.mjs`

Add a compact “行为通道与卡片” panel with channel rows and card rows. Render bounded data only and show an explicit empty state.

### Task 4: Verification and package

Run the focused tests, full `npm test`, `npm run check`, and `git diff --check`. Rebuild/package the Release ZIP and stage it for real Hana verification.
