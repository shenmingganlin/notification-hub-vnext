import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  RuntimeProcessManager,
  sceneStateFingerprint,
  sceneStateSyncDelayMs
} from '../../plugin/runtime/process-manager.js';
import { SceneStatePersistenceCoordinator } from '../../plugin/runtime/scene-state-persistence.js';
import { addRecoveryEntry, createRecoverySnapshot } from '../../plugin/runtime/recovery-snapshot.js';

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

test('RuntimeProcessManager ignores intermediate scene.changed events during recovery replay', async () => {
  const recoverySnapshot = {
    recoveryVersion: 1,
    protocolVersion: 1,
    updatedAt: '2026-08-01T12:00:00.000Z',
    entries: [
      {
        key: 'scene-window',
        type: 'scene.update',
        payload: { x: 120, y: 80, width: 420, height: 180 }
      },
      {
        key: 'scene-card-card-a',
        type: 'scene.create',
        payload: {
          id: 'card-a',
          title: 'Card A',
          body: 'Recovery card',
          x: 140,
          y: 90,
          width: 320,
          height: 160
        }
      }
    ]
  };
  const intermediateSnapshot = {
    ...nativeChangedSnapshot,
    updatedAt: '2026-08-01T12:00:02.500Z',
    cardOrder: [],
    cards: [],
    layout: null
  };
  const client = new EventEmitter();
  const persistence = new SceneStatePersistenceCoordinator({
    filePath: 'scene-state.json',
    debounceMs: 60_000,
    save: async () => { throw new Error('intermediate recovery snapshot must not be persisted'); }
  });
  const requests = [];
  const manager = new RuntimeProcessManager({
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\notification-hub-recovery-event-gate',
    autoRestart: false,
    recoverySnapshot,
    recoveryClient: client,
    sceneStatePersistence: persistence
  });
  client.request = async (type, payload, options) => {
    requests.push({ type, payload, options });
    const message = { type: 'ack', payload: { requestType: type, result: { sceneStateSnapshot: intermediateSnapshot } } };
    manager.observeSceneStateResponse(message);
    if (type === 'scene.update') {
      client.emit('event', {
        type: 'event',
        payload: {
          eventType: 'scene.changed',
          result: { sceneStateSnapshot: intermediateSnapshot }
        }
      });
    }
    return message;
  };
  await manager.restoreRecoverySnapshot(client);
  assert.deepEqual(manager.recoverySnapshot, recoverySnapshot);
  assert.equal(manager.recoveryInProgress, false);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.retryable, true);
  assert.equal(requests[0].options.maxAttempts, 2);
  assert.equal(requests[0].options.idempotencyKey, 'recovery:2026-08-01T12:00:00.000Z:scene-window');
  assert.equal(requests[1].options.idempotencyKey, 'recovery:2026-08-01T12:00:00.000Z:scene-card-card-a');
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

test('RuntimeProcessManager forwards native scene.changed target metadata to consumers', () => {
  const client = new EventEmitter();
  const manager = new RuntimeProcessManager({
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\notification-hub-scene-change-metadata-test',
    autoRestart: false,
    recoveryClient: client
  });
  const forwarded = [];
  manager.on('scene.changed', (payload) => forwarded.push(payload));
  const change = {
    status: 'changed',
    reason: 'user-close',
    target: 'card',
    targetId: 'nh-vnext-notification-notification-closed',
    recoverable: false,
    notifyUser: false,
    error: null
  };

  client.emit('event', {
    type: 'event',
    requestId: 'scene-change-event',
    traceId: 'scene-change-trace',
    payload: {
      eventType: 'scene.changed',
      result: {
        sceneStateSnapshot: nativeChangedSnapshot,
        change
      }
    }
  });

  assert.equal(forwarded.length, 1);
  assert.deepEqual(forwarded[0].change, change);
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

test('RuntimeProcessManager skips one failed recovery entry and continues with later entries', async () => {
  const recoverySnapshot = createRecoverySnapshot();
  addRecoveryEntry(recoverySnapshot, {
    key: 'broken-card',
    type: 'scene.create',
    payload: { id: 'broken-card', title: 'Broken card', body: 'x', x: 0, y: 0, width: 320, height: 160 }
  });
  addRecoveryEntry(recoverySnapshot, {
    key: 'valid-card',
    type: 'scene.create',
    payload: { id: 'valid-card', title: 'Valid card', body: 'x', x: 0, y: 0, width: 320, height: 160 }
  });
  const requests = [];
  const recoveryEvents = [];
  const client = {
    request: async (type, payload) => {
      requests.push(payload.id);
      if (payload.id === 'broken-card') {
        throw Object.assign(new Error('window creation failed'), { code: 'RUNTIME_SCENE_WINDOW_APPLY_FAILED' });
      }
      return { type: 'ack', payload: { requestType: type, result: {} } };
    }
  };
  const manager = new RuntimeProcessManager({
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\notification-hub-recovery-skip',
    autoRestart: false,
    recoverySnapshot,
    recoveryClient: client
  });
  manager.on('recovery-skipped', (event) => recoveryEvents.push(event));

  const results = await manager.restoreRecoverySnapshot(client);

  assert.deepEqual(requests, ['broken-card', 'valid-card']);
  assert.deepEqual(results.map((entry) => entry.skipped === true), [true, false]);
  assert.deepEqual(manager.recoverySnapshot.entries.map((entry) => entry.key), ['broken-card', 'valid-card']);
  assert.equal(recoveryEvents[0].status, 'retained');
  assert.equal(recoveryEvents[0].attempt, 1);
  assert.equal(manager.recoveryDiagnostics.at(-1).cause, 'RUNTIME_SCENE_WINDOW_APPLY_FAILED');
  assert.equal(recoveryEvents[0].key, 'broken-card');
});

test('RuntimeProcessManager ignores late SceneState responses after stop begins', async () => {
  const saved = [];
  const persistence = new SceneStatePersistenceCoordinator({
    filePath: 'scene-state.json',
    debounceMs: 60_000,
    save: async (snapshot, filePath) => saved.push({ snapshot, filePath })
  });
  const client = new EventEmitter();
  const manager = new RuntimeProcessManager({
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\notification-hub-persistence-late-response',
    autoRestart: false,
    sceneStatePersistence: persistence,
    recoveryClient: client
  });

  client.emit('response', {
    type: 'ack',
    payload: { result: { sceneStateSnapshot: nativeChangedSnapshot } }
  });
  await manager.stop();

  const emptySnapshot = {
    ...nativeChangedSnapshot,
    updatedAt: '2026-08-01T12:00:04.000Z',
    sceneWindow: null,
    cardOrder: [],
    cards: [],
    layout: null
  };
  client.emit('response', {
    type: 'ack',
    payload: { requestType: 'health', result: { sceneStateSnapshot: emptySnapshot } }
  });

  await persistence.flush();
  assert.deepEqual(saved, [{ snapshot: nativeChangedSnapshot, filePath: 'scene-state.json' }]);
});

test('sceneStateFingerprint ignores updatedAt without cloning the snapshot', () => {
  const left = {
    ...nativeChangedSnapshot,
    updatedAt: '2026-08-01T12:00:01.000Z',
    cards: [{ id: 'card-a', title: 'A', body: 'BODY'.repeat(50), x: 1, y: 2 }]
  };
  const right = {
    ...left,
    updatedAt: '2026-08-01T12:00:09.000Z'
  };
  assert.equal(sceneStateFingerprint(left), sceneStateFingerprint(right));
  assert.notEqual(
    sceneStateFingerprint(left),
    sceneStateFingerprint({ ...left, cards: [{ ...left.cards[0], x: 9 }] })
  );
});

test('sceneStateSyncDelayMs backs off only for production idle polling', () => {
  assert.equal(sceneStateSyncDelayMs({ intervalMs: 500, cardCount: 0 }), 2000);
  assert.equal(sceneStateSyncDelayMs({ intervalMs: 500, cardCount: 2 }), 500);
  assert.equal(sceneStateSyncDelayMs({ intervalMs: 5, cardCount: 0 }), 5);
});
