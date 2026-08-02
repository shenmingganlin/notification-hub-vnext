import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { RuntimeHostAdapter } from '../../plugin/runtime/host-adapter.js';
import { createRecoverySnapshot, saveRecoverySnapshot } from '../../plugin/runtime/recovery-snapshot.js';
import { loadSceneState } from '../../plugin/runtime/scene-state-store.js';

const runtimePath = process.argv[2];

function createAdapter(runtimePath, directory, suffix) {
  return new RuntimeHostAdapter({
    context: {
      dataDir: directory,
      config: {
        sceneStatePersistencePath: 'snapshots/scene-state.json',
        sceneStatePersistenceDebounceMs: 10
      }
    },
    runtimePath,
    pipeName: `\\\\.\\pipe\\notification-hub-vnext-host-restart-${process.pid}-${suffix}`,
    runtimeOptions: { autoRestart: false },
    clientOptions: { connectTimeoutMs: 3000, requestTimeoutMs: 3000 }
  });
}

test('RuntimeHostAdapter prefers persisted SceneState after a Runtime restart', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-hub-host-restart-'));
  const first = createAdapter(runtimePath, directory, 'first');
  const second = createAdapter(runtimePath, directory, 'second');
  t.after(async () => {
    await first.stop().catch(() => {});
    await second.stop().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  });

  await first.start();
  const created = await first.client.request('scene.create', {
    id: 'scene-state-card',
    title: 'SceneState card',
    body: 'Persisted by the first Host Adapter',
    x: 40,
    y: 60,
    width: 320,
    height: 160
  }, { retryable: false });
  assert.equal(created.type, 'ack');
  await first.stop();

  const sceneStatePath = path.join(directory, 'snapshots', 'scene-state.json');
  const persisted = await loadSceneState(sceneStatePath);
  assert.deepEqual(persisted.cardOrder, ['scene-state-card']);

  await saveRecoverySnapshot(createRecoverySnapshot({ entries: [{
    key: 'legacy-card',
    type: 'scene.create',
    payload: {
      id: 'legacy-card',
      title: 'Legacy fallback card',
      body: 'Must not win over SceneState',
      x: 400,
      y: 80,
      width: 320,
      height: 160
    }
  }] }), path.join(directory, 'recovery.json'));

  const started = [];
  second.on('started', (event) => started.push(event));
  await second.start();
  const health = await second.client.request('health');
  assert.equal(started[0].source, 'scene-state');
  assert.deepEqual(health.payload.result.sceneCards.map((card) => card.id), ['scene-state-card']);
});
