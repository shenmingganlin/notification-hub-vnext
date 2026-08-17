import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSceneState,
  parseSceneState,
  serializeSceneState,
  validateSceneState
} from '../../plugin/runtime/scene-state.js';

const explicitShelfLayout = {
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
};

test('SceneState preserves explicit card order and round-trips', () => {
  const state = createSceneState({
    sceneWindow: { x: 120, y: 80, width: 420, height: 180 },
    cardOrder: ['card-b', 'card-a'],
    cards: [
      { id: 'card-a', title: 'Card A', body: 'First', x: 0, y: 440, width: 320, height: 160 },
      { id: 'card-b', title: 'Card B', body: 'Second', x: 332, y: 440, width: 320, height: 160 }
    ],
    layout: explicitShelfLayout
  });

  assert.equal(state.sceneStateVersion, 1);
  assert.equal(state.protocolVersion, 1);
  assert.deepEqual(state.cardOrder, ['card-b', 'card-a']);
  assert.deepEqual(parseSceneState(serializeSceneState(state)), state);
});

test('SceneState preserves controlled presentation and behavior metadata', () => {
  const state = createSceneState({
    sceneWindow: { x: 0, y: 0, width: 420, height: 180 },
    cardOrder: ['card-a'],
    cards: [{
      id: 'card-a', title: 'Card A', body: '', x: 0, y: 0, width: 320, height: 160,
      presentation: { eventId: 'tool.execution.failed', categoryId: 'tool', eventTypeId: 'execution.failed', visualProfileId: 'visual.error' },
      behavior: { behaviorProfileId: 'stack', behaviorChannelId: 'stack.main' }
    }],
    layout: null
  });
  assert.equal(parseSceneState(serializeSceneState(state)).cards[0].behavior.behaviorChannelId, 'stack.main');
  assert.equal(state.cards[0].presentation.eventId, 'tool.execution.failed');
});

test('SceneState preserves behavior channel lifecycle metadata', () => {
  const state = createSceneState({
    sceneWindow: { x: 0, y: 0, width: 420, height: 180 },
    cardOrder: ['card-a', 'card-b'],
    cards: [
      { id: 'card-a', title: 'A', body: '', x: 0, y: 0, width: 320, height: 160, behavior: { behaviorProfileId: 'stack', behaviorChannelId: 'stack.main' } },
      { id: 'card-b', title: 'B', body: '', x: 600, y: 0, width: 320, height: 160, behavior: { behaviorProfileId: 'ticker', behaviorChannelId: 'ticker.main' } }
    ],
    behaviorChannels: [
      { channelId: 'stack.main', profileId: 'stack', cardOrder: ['card-a'] },
      { channelId: 'ticker.main', profileId: 'ticker', cardOrder: ['card-b'] }
    ],
    layout: null
  });
  assert.deepEqual(parseSceneState(serializeSceneState(state)).behaviorChannels, state.behaviorChannels);
  assert.throws(
    () => validateSceneState({ ...state, behaviorChannels: [
      { channelId: 'stack.main', profileId: 'stack', cardOrder: ['card-a', 'card-b'] },
      { channelId: 'ticker.main', profileId: 'ticker', cardOrder: ['card-b'] }
    ] }),
    (error) => error.code === 'RUNTIME_SCENE_STATE_BEHAVIOR_INVALID'
  );
});

test('SceneState accepts an empty scene without an active layout', () => {
  const state = createSceneState({
    sceneWindow: { x: 0, y: 0, width: 420, height: 180 },
    cardOrder: [],
    cards: [],
    layout: null
  });

  assert.equal(state.layout, null);
  assert.deepEqual(state.cardOrder, []);
  assert.deepEqual(state.cards, []);
});

test('SceneState accepts a closed scene window', () => {
  const state = createSceneState({
    sceneWindow: null,
    cardOrder: ['card-a'],
    cards: [{ id: 'card-a', title: 'Card A', body: '', x: 0, y: 0, width: 320, height: 160 }],
    layout: null
  });

  assert.equal(state.sceneWindow, null);
});

test('SceneState accepts provider work areas with explicit fallback metadata', () => {
  const state = createSceneState({
    sceneWindow: { x: 0, y: 0, width: 420, height: 180 },
    cardOrder: ['card-a'],
    cards: [{ id: 'card-a', title: 'Card A', body: '', x: 0, y: 0, width: 320, height: 160 }],
    layout: {
      mode: 'stack',
      direction: 'down',
      anchor: 'top-right',
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
  });

  assert.equal(state.layout.workArea.resolution, 'provider');
  assert.equal(state.layout.workArea.isFallback, true);
});

test('SceneState rejects card order mismatches and duplicate ids', () => {
  assert.throws(
    () => validateSceneState({
      sceneStateVersion: 1,
      protocolVersion: 1,
      updatedAt: new Date().toISOString(),
      sceneWindow: { x: 0, y: 0, width: 420, height: 180 },
      cardOrder: ['card-a'],
      cards: [],
      layout: null
    }),
    (error) => error.code === 'RUNTIME_SCENE_STATE_CARD_ORDER_INVALID'
  );

  assert.throws(
    () => createSceneState({
      sceneWindow: { x: 0, y: 0, width: 420, height: 180 },
      cardOrder: ['card-a', 'card-a'],
      cards: [{ id: 'card-a', title: 'Card A', body: '', x: 0, y: 0, width: 320, height: 160 }],
      layout: null
    }),
    (error) => error.code === 'RUNTIME_SCENE_STATE_CARD_ORDER_INVALID'
  );
});

test('SceneState rejects invalid work area metadata', () => {
  assert.throws(
    () => createSceneState({
      sceneWindow: { x: 0, y: 0, width: 420, height: 180 },
      cardOrder: [],
      cards: [],
      layout: {
        ...explicitShelfLayout,
        workArea: {
          ...explicitShelfLayout.workArea,
          width: 0
        }
      }
    }),
    (error) => error.code === 'RUNTIME_SCENE_STATE_WORK_AREA_INVALID'
  );

  assert.throws(
    () => createSceneState({
      sceneWindow: { x: 0, y: 0, width: 420, height: 180 },
      cardOrder: [],
      cards: [],
      layout: {
        ...explicitShelfLayout,
        workArea: {
          ...explicitShelfLayout.workArea,
          resolution: 'provider',
          source: 'explicit-override'
        }
      }
    }),
    (error) => error.code === 'RUNTIME_SCENE_STATE_WORK_AREA_INVALID'
  );
});

test('SceneState rejects non-finite values and unknown input fields without coercion', () => {
  assert.throws(
    () => createSceneState({
      sceneWindow: { x: 0, y: 0, width: 420, height: 180 },
      cardOrder: [],
      cards: [],
      layout: null,
      unexpected: true
    }),
    (error) => error.code === 'RUNTIME_SCENE_STATE_INVALID'
  );

  assert.throws(
    () => createSceneState({
      sceneWindow: { x: 0, y: 0, width: 420, height: 180 },
      cardOrder: [],
      cards: [],
      layout: {
        ...explicitShelfLayout,
        workArea: { ...explicitShelfLayout.workArea, dpiScale: Number.NaN }
      }
    }),
    (error) => error.code === 'RUNTIME_SCENE_STATE_INVALID'
  );
});

test('SceneState parser rejects unsupported versions and unknown fields', () => {
  const state = createSceneState({
    sceneWindow: { x: 0, y: 0, width: 420, height: 180 },
    cardOrder: [],
    cards: [],
    layout: null
  });

  assert.throws(
    () => parseSceneState(JSON.stringify({ ...state, sceneStateVersion: 2 })),
    (error) => error.code === 'RUNTIME_SCENE_STATE_VERSION_UNSUPPORTED'
  );
  assert.throws(
    () => parseSceneState(JSON.stringify({ ...state, unexpected: true })),
    (error) => error.code === 'RUNTIME_SCENE_STATE_INVALID'
  );
});
