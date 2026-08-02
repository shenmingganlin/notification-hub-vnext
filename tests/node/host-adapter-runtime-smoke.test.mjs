import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { RuntimeHostAdapter } from '../../plugin/runtime/host-adapter.js';
import { loadSceneState } from '../../plugin/runtime/scene-state-store.js';

const runtimePath = process.argv[2];

test('RuntimeHostAdapter starts real Runtime, performs health, and flushes SceneState on stop', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-hub-host-adapter-'));
  const adapter = new RuntimeHostAdapter({
    context: {
      dataDir: directory,
      config: {
        sceneStatePersistencePath: 'snapshots/scene-state.json',
        sceneStatePersistenceDebounceMs: 10
      }
    },
    runtimePath,
    pipeName: `\\\\.\\pipe\\notification-hub-vnext-host-${process.pid}`,
    runtimeArgs: ['--drop-after-health'],
    runtimeOptions: { autoRestart: false },
    clientOptions: { connectTimeoutMs: 3000, requestTimeoutMs: 3000 }
  });

  t.after(async () => {
    await adapter.stop().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  });

  const healthEvents = [];
  adapter.on('health', (health) => healthEvents.push(health));
  await adapter.start();
  assert.equal(adapter.state, 'running');
  assert.equal(healthEvents.length, 1);
  const expected = healthEvents[0].payload.result.sceneStateSnapshot;

  await adapter.stop();
  const persisted = await loadSceneState(path.join(directory, 'snapshots', 'scene-state.json'));
  assert.deepEqual(persisted, expected);
});
