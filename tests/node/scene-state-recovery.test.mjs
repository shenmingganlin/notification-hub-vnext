import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecoverySnapshot } from '../../plugin/runtime/recovery-snapshot.js';
import { sceneStateToRecoveryEntries } from '../../plugin/runtime/scene-state-recovery.js';

const baseWindow = { x: 120, y: 80, width: 420, height: 180 };

function createState(overrides = {}) {
  return {
    sceneStateVersion: 1,
    protocolVersion: 1,
    updatedAt: '2026-08-01T12:00:00.000Z',
    sceneWindow: baseWindow,
    cardOrder: ['card-b', 'card-a'],
    cards: [
      { id: 'card-a', title: 'Card A', body: 'A', x: 10, y: 20, width: 320, height: 160 },
      { id: 'card-b', title: 'Card B', body: 'B', x: 30, y: 40, width: 300, height: 140 }
    ],
    layout: {
      mode: 'stack',
      direction: 'down',
      anchor: 'top-right',
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
    },
    ...overrides
  };
}

test('SceneState projection emits deterministic window, layout, and card replay order', () => {
  const state = createState();
  const before = structuredClone(state);
  const entries = sceneStateToRecoveryEntries(state);

  assert.deepEqual(entries.map(({ key, type }) => ({ key, type })), [
    { key: 'scene-window', type: 'scene.update' },
    { key: 'scene-layout', type: 'scene.set-mode' },
    { key: 'scene-card-card-b', type: 'scene.create' },
    { key: 'scene-card-card-a', type: 'scene.create' }
  ]);
  assert.deepEqual(entries[1].payload, {
    layout: 'stack',
    direction: 'down',
    anchor: 'top-right',
    spacing: 12,
    workAreaWidth: 800,
    workAreaHeight: 600,
    dpiScale: 1
  });
  assert.deepEqual(entries[2].payload, {
    id: 'card-b', title: 'Card B', body: 'B', x: 30, y: 40, width: 300, height: 140
  });
  assert.deepEqual(state, before);
  assert.doesNotThrow(() => createRecoverySnapshot({ entries }));
});

test('SceneState projection lets Runtime re-query provider work areas', () => {
  const entries = sceneStateToRecoveryEntries(createState({
    cardOrder: [],
    cards: [],
    layout: {
      mode: 'shelf',
      direction: 'right',
      anchor: 'bottom-left',
      spacing: 8,
      workArea: {
        resolution: 'provider',
        left: -1920,
        top: 0,
        width: 1920,
        height: 1080,
        dpiScale: 1.25,
        isFallback: true,
        source: 'virtual-screen-fallback'
      }
    }
  }));

  assert.deepEqual(entries.map((entry) => entry.type), ['scene.update', 'scene.set-mode']);
  assert.deepEqual(entries[1].payload, {
    layout: 'shelf',
    direction: 'right',
    anchor: 'bottom-left',
    spacing: 8
  });
  assert.doesNotThrow(() => createRecoverySnapshot({ entries }));
});

test('SceneState projection does not create a Native Scene window for an empty scene', () => {
  const entries = sceneStateToRecoveryEntries(createState({
    cardOrder: [],
    cards: [],
    layout: null
  }));

  assert.deepEqual(entries, []);
});

test('SceneState projection without layout preserves card geometry', () => {
  const entries = sceneStateToRecoveryEntries(createState({ layout: null }));

  assert.deepEqual(entries.map((entry) => entry.type), [
    'scene.update',
    'scene.create',
    'scene.create'
  ]);
  assert.deepEqual(entries.slice(1).map((entry) => entry.payload.id), ['card-b', 'card-a']);
  assert.deepEqual(entries[1].payload, {
    id: 'card-b', title: 'Card B', body: 'B', x: 30, y: 40, width: 300, height: 140
  });
  assert.doesNotThrow(() => createRecoverySnapshot({ entries }));
});

test('SceneState projection rejects lossy explicit work-area origins', () => {
  assert.throws(
    () => sceneStateToRecoveryEntries(createState({
      layout: {
        ...createState().layout,
        workArea: { ...createState().layout.workArea, left: 10 }
      }
    })),
    (error) => error.code === 'RUNTIME_SCENE_STATE_RECOVERY_WORK_AREA_UNSUPPORTED'
  );
});
