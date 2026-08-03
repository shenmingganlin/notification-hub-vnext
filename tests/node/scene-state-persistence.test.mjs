import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { RuntimeProcessManager } from '../../plugin/runtime/process-manager.js';
import { SceneStatePersistenceCoordinator } from '../../plugin/runtime/scene-state-persistence.js';

const firstSnapshot = {
  sceneStateVersion: 1,
  protocolVersion: 1,
  updatedAt: '2026-08-01T12:00:00.000Z',
  sceneWindow: { x: 120, y: 80, width: 420, height: 180 },
  cardOrder: [],
  cards: [],
  layout: null
};

const secondSnapshot = {
  ...firstSnapshot,
  updatedAt: '2026-08-01T12:00:01.000Z',
  sceneWindow: { x: 140, y: 90, width: 500, height: 220 }
};

const nativeChangedSnapshot = {
  ...firstSnapshot,
  updatedAt: '2026-08-01T12:00:02.000Z',
  sceneWindow: { x: 240, y: 190, width: 420, height: 180 },
  cardOrder: ['card-a'],
  cards: [{
    id: 'card-a',
    title: 'Card A',
    body: 'Native drag result',
    x: 360,
    y: 280,
    width: 320,
    height: 160
  }]
};

test('SceneState persistence coordinator writes only the latest debounced snapshot', async () => {
  const saved = [];
  const scheduled = [];
  const coordinator = new SceneStatePersistenceCoordinator({
    filePath: 'scene-state.json',
    debounceMs: 25,
    save: async (snapshot, filePath) => saved.push({ snapshot, filePath }),
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      scheduled.push(timer);
      return timer;
    },
    cancel: (timer) => { timer.cancelled = true; }
  });

  coordinator.observe(firstSnapshot);
  coordinator.observe(secondSnapshot);
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[0].cancelled, true);
  assert.equal(saved.length, 0);

  scheduled[1].callback();
  await coordinator.flush();
  assert.deepEqual(saved, [{ snapshot: secondSnapshot, filePath: 'scene-state.json' }]);
});

test('SceneState persistence coordinator emits structured diagnostics on save failure', async () => {
  const diagnostics = [];
  const coordinator = new SceneStatePersistenceCoordinator({
    filePath: 'scene-state.json',
    debounceMs: 0,
    save: async () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    }
  });
  coordinator.on('diagnostic', (diagnostic) => diagnostics.push(diagnostic));

  coordinator.observe(firstSnapshot);
  await assert.rejects(coordinator.flush(), (error) => error.code === 'RUNTIME_SCENE_STATE_PERSIST_FAILED');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'RUNTIME_SCENE_STATE_PERSIST_FAILED');
  assert.equal(diagnostics[0].details.path, 'scene-state.json');
  assert.equal(diagnostics[0].details.cause, 'ENOSPC');
});

test('RuntimeProcessManager persists snapshots observed from PipeClient responses and flushes on stop', async () => {
  const saved = [];
  const coordinator = new SceneStatePersistenceCoordinator({
    filePath: 'scene-state.json',
    debounceMs: 60_000,
    save: async (snapshot, filePath) => saved.push({ snapshot, filePath })
  });
  const client = new EventEmitter();
  const manager = new RuntimeProcessManager({
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\notification-hub-persistence-test',
    autoRestart: false,
    sceneStatePersistence: coordinator,
    recoveryClient: client
  });

  client.emit('response', {
    type: 'ack',
    payload: { result: { sceneStateSnapshot: firstSnapshot } }
  });
  client.emit('response', {
    type: 'ack',
    payload: { result: { sceneStateSnapshot: secondSnapshot } }
  });
  assert.equal(saved.length, 0);

  await manager.stop();
  assert.deepEqual(saved, [{ snapshot: secondSnapshot, filePath: 'scene-state.json' }]);
});

test('RuntimeProcessManager applies and persists native scene.changed events', async () => {
  const saved = [];
  const coordinator = new SceneStatePersistenceCoordinator({
    filePath: 'scene-state.json',
    debounceMs: 60_000,
    save: async (snapshot, filePath) => saved.push({ snapshot, filePath })
  });
  const client = new EventEmitter();
  const manager = new RuntimeProcessManager({
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\notification-hub-native-event-test',
    autoRestart: false,
    sceneStatePersistence: coordinator,
    recoveryClient: client
  });

  client.emit('event', {
    type: 'event',
    payload: {
      eventType: 'scene.changed',
      result: { sceneStateSnapshot: nativeChangedSnapshot }
    }
  });

  assert.deepEqual(manager.recoverySnapshot.entries, [
    {
      key: 'scene-window',
      type: 'scene.update',
      payload: nativeChangedSnapshot.sceneWindow
    },
    {
      key: 'scene-card-card-a',
      type: 'scene.create',
      payload: {
        id: 'card-a',
        title: 'Card A',
        body: 'Native drag result',
        x: 360,
        y: 280,
        width: 320,
        height: 160
      }
    }
  ]);
  assert.equal(saved.length, 0);

  await manager.stop();
  assert.deepEqual(saved, [{ snapshot: nativeChangedSnapshot, filePath: 'scene-state.json' }]);
});

test('RuntimeProcessManager health sync persists a snapshot when unsolicited events are unavailable', async () => {
  const saved = [];
  const persistence = new SceneStatePersistenceCoordinator({
    filePath: 'scene-state.json',
    debounceMs: 0,
    save: async (snapshot, filePath) => saved.push({ snapshot, filePath })
  });
  const syncedSnapshot = {
    ...nativeChangedSnapshot,
    updatedAt: '2026-08-01T12:00:03.000Z',
    cards: [{ ...nativeChangedSnapshot.cards[0], x: 2063, y: 933 }]
  };
  const client = new EventEmitter();
  client.request = async (type) => {
    assert.equal(type, 'health');
    return {
      type: 'ack',
      requestId: 'health-sync-request',
      traceId: 'health-sync-trace',
      payload: { result: { sceneStateSnapshot: syncedSnapshot } }
    };
  };
  const manager = new RuntimeProcessManager({
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\health-sync',
    sceneStatePersistence: persistence,
    recoveryClient: client,
    sceneStateSyncIntervalMs: 5
  });
  manager.state = 'running';
  manager.startSceneStateSync();
  await new Promise((resolve) => setTimeout(resolve, 30));
  manager.stopSceneStateSync();
  await persistence.flush();

  assert.equal(saved.length, 1);
  assert.deepEqual(saved.at(-1), { snapshot: syncedSnapshot, filePath: 'scene-state.json' });
  assert.equal(manager.recoverySnapshot.entries.some((entry) => entry.key === 'scene-card-card-a'), true);
});

test('RuntimeProcessManager still stops when the final SceneState flush fails', async () => {
  let stopped = false;
  const persistence = {
    observe() {},
    async flush() {
      throw Object.assign(new Error('disk full'), { code: 'RUNTIME_SCENE_STATE_PERSIST_FAILED' });
    }
  };
  const manager = new RuntimeProcessManager({
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\notification-hub-persistence-failure',
    autoRestart: false,
    sceneStatePersistence: persistence
  });
  manager.setState = (state) => {
    if (state === 'stopped') stopped = true;
  };

  await assert.rejects(manager.stop(), (error) => error.code === 'RUNTIME_SCENE_STATE_PERSIST_FAILED');
  assert.equal(stopped, true);
});

test('RuntimeProcessManager ignores responses without SceneState snapshots', async () => {
  const observed = [];
  const persistence = {
    observe(snapshot) { observed.push(snapshot); },
    async flush() {}
  };
  const client = new EventEmitter();
  const manager = new RuntimeProcessManager({
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\notification-hub-persistence-empty',
    autoRestart: false,
    sceneStatePersistence: persistence,
    recoveryClient: client
  });

  client.emit('response', { type: 'ack', payload: { result: { sceneCards: [] } } });
  client.emit('response', { type: 'error', payload: { code: 'RUNTIME_TEST', message: 'test' } });
  await manager.stop();
  assert.deepEqual(observed, []);
});
