# SceneState Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or **inline execution**. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一个不改变现有 recovery replay 的、可独立校验和序列化的显式 `SceneState` 快照契约。

**Architecture:** 新增 Node `scene-state.js` 深模块，统一验证 `sceneWindow`、显式 `cardOrder`、卡片集合、active layout 和布局使用的 work area。快照契约只描述完整状态，不负责从 command entries 推导状态，也不在本刀替换 `RuntimeProcessManager` 的旧 recovery replay。

**Tech Stack:** Node.js ESM/node:test；JSON Schema Draft 2020-12 风格约束；现有 `PROTOCOL_VERSION`。

## Global Constraints

- `SCENE_STATE_VERSION` 固定为 1，本刀不改现有 `RECOVERY_SNAPSHOT_VERSION`。
- 现有 `scene.set-mode`、`scene.create`、`scene.update`、`scene.dismiss` replay 行为保持不变。
- `cardOrder` 是唯一有权威性的卡片顺序，不能依赖对象或 Map 遍历顺序。
- 快照内的几何和工作区尺寸使用整数物理像素；DPI 必须为有限正数。
- `layout` 可以为 `null`，表示 Scene 尚未有成功应用的活动布局。
- `SceneState` 校验失败返回稳定 `RUNTIME_SCENE_STATE_*` 错误码。
- 本刀只建立契约、schema、序列化和测试，不接入 Runtime 恢复路径。

---

### Task 1: Define SceneState interface and failing tests

**Files:**
- Create: `plugin/runtime/scene-state.js`
- Create: `schemas/scene-state.schema.json`
- Modify: `tests/node/recovery-snapshot.test.mjs`
- Create: `tests/node/scene-state.test.mjs`

**Interfaces:**
- Produces:
  - `SCENE_STATE_VERSION`
  - `createSceneState(input)`
  - `validateSceneState(state)`
  - `serializeSceneState(state)`
  - `parseSceneState(serialized)`
  - `sceneStateError(code, message, details)` (internal or named export only if tests need it)

Canonical shape:

```js
{
  sceneStateVersion: 1,
  protocolVersion: 1,
  updatedAt: '2026-08-01T12:00:00.000Z',
  sceneWindow: { x: 120, y: 80, width: 420, height: 180 },
  cardOrder: ['card-a', 'card-b'],
  cards: [
    { id: 'card-a', title: 'Card A', body: 'First', x: 0, y: 440, width: 320, height: 160 },
    { id: 'card-b', title: 'Card B', body: 'Second', x: 332, y: 440, width: 320, height: 160 }
  ],
  layout: {
    mode: 'shelf',
    direction: 'right',
    anchor: 'bottom-left',
    spacing: 12,
    workArea: {
      resolution: 'explicit',
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      dpiScale: 1,
      isFallback: false,
      source: 'explicit-override'
    }
  }
}
```

- [x] **Step 1: Write failing tests**

`scene-state.test.mjs` must cover:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSceneState,
  parseSceneState,
  serializeSceneState,
  validateSceneState
} from '../../plugin/runtime/scene-state.js';

test('SceneState preserves explicit card order and round-trips', () => {
  const state = createSceneState({
    sceneWindow: { x: 120, y: 80, width: 420, height: 180 },
    cardOrder: ['card-b', 'card-a'],
    cards: [
      { id: 'card-a', title: 'Card A', body: 'First', x: 0, y: 440, width: 320, height: 160 },
      { id: 'card-b', title: 'Card B', body: 'Second', x: 332, y: 440, width: 320, height: 160 }
    ],
    layout: {
      mode: 'shelf', direction: 'right', anchor: 'bottom-left', spacing: 12,
      workArea: {
        resolution: 'explicit', left: 0, top: 0, width: 800, height: 600,
        dpiScale: 1, isFallback: false, source: 'explicit-override'
      }
    }
  });
  assert.deepEqual(state.cardOrder, ['card-b', 'card-a']);
  assert.deepEqual(parseSceneState(serializeSceneState(state)), state);
});

test('SceneState accepts an empty scene without an active layout', () => {
  const state = createSceneState({
    sceneWindow: { x: 0, y: 0, width: 420, height: 180 },
    cardOrder: [], cards: [], layout: null
  });
  assert.equal(state.layout, null);
});

test('SceneState rejects order/card mismatches and invalid layout work areas', () => {
  assert.throws(() => validateSceneState({ /* duplicate cardOrder or missing card */ }),
    (error) => error.code === 'RUNTIME_SCENE_STATE_CARD_ORDER_INVALID');
  assert.throws(() => createSceneState({
    sceneWindow: { x: 0, y: 0, width: 420, height: 180 }, cardOrder: [], cards: [],
    layout: {
      mode: 'shelf', direction: 'right', anchor: 'bottom-left', spacing: 0,
      workArea: { resolution: 'provider', left: 0, top: 0, width: 0, height: 600,
        dpiScale: 1, isFallback: true, source: 'virtual-screen-fallback' }
    }
  }), (error) => error.code === 'RUNTIME_SCENE_STATE_WORK_AREA_INVALID');
});
```

- [x] **Step 2: Run the focused test to establish red**

Run: `node --test tests/node/scene-state.test.mjs`

Expected: FAIL because `plugin/runtime/scene-state.js` does not exist yet.

---

### Task 2: Implement validation and serialization

**Status:** Completed. The contract rejects unknown fields, non-finite values, invalid card order, invalid geometry, and inconsistent work-area metadata.

**Files:**
- Modify: `plugin/runtime/scene-state.js`
- Modify: `schemas/scene-state.schema.json`

**Interfaces:**
- `createSceneState(input)` fills `sceneStateVersion`, `protocolVersion`, and `updatedAt`, deep-clones input, then validates it.
- `validateSceneState(state)` returns the same state or throws a stable error.
- `serializeSceneState(state)` validates then returns compact JSON.
- `parseSceneState(serialized)` parses JSON and validates it.

- [x] **Step 1: Implement exact validators**

Validate:

- required top-level fields and no unknown fields;
- ISO date-time `updatedAt`;
- `sceneWindow` integer geometry with positive width/height and max 10000;
- `cardOrder` non-empty unique strings;
- every card id unique and present exactly once in `cardOrder`;
- cards use valid title, integer geometry and max 10000 dimensions;
- `layout === null` or valid `mode`, direction, anchor, non-negative integer spacing;
- layout work area has `resolution` provider/explicit, integer left/top, positive width/height, finite positive dpiScale, boolean fallback and non-empty source;
- provider resolution requires a provider-style source; explicit resolution requires `explicit-override`.

- [x] **Step 2: Run focused tests**

Run: `node --test tests/node/scene-state.test.mjs tests/node/recovery-snapshot.test.mjs`

Expected: all SceneState and recovery tests pass.

---

### Task 3: Publish schema and document non-integration boundary

**Status:** Completed. JSON Schema, architecture notes, package syntax checks, and full Node verification are updated; Runtime recovery remains command replay.

**Files:**
- Modify: `schemas/scene-state.schema.json`
- Modify: `docs/architecture/phase-0-1-status.md`
- Modify: `docs/superpowers/plans/2026-08-01-layout-state-convergence.md`

- [x] **Step 1: Add JSON Schema**

The schema must mirror the JS validator, use `additionalProperties: false`, enforce `cardOrder` uniqueness, and express the `layout: null | object` union.

- [x] **Step 2: Document the seam**

Record that `SceneState` is now a canonical contract but Runtime recovery still replays version-1 command entries; snapshot persistence and migration are intentionally deferred.

- [x] **Step 3: Run all verification**

```powershell
npm run check
npm test
node --test tests/node/scene-state.test.mjs
 git diff --check
```

- [x] **Step 4: Commit one slice**

```powershell
git add plugin/runtime/scene-state.js schemas/scene-state.schema.json tests/node/scene-state.test.mjs docs/architecture/phase-0-1-status.md docs/superpowers/plans/2026-08-01-layout-state-convergence.md docs/superpowers/plans/2026-08-01-scene-state-contract.md
git commit -m "feat: define scene state snapshot contract"
```
