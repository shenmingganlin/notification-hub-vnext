import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';
import { RuntimeProcessManager } from '../../plugin/runtime/process-manager.js';
import { createSceneStatePersistence } from '../../plugin/runtime/scene-state-config.js';
import { loadSceneState } from '../../plugin/runtime/scene-state-store.js';

const runtimePath = process.argv[2];

test('real Runtime health response is persisted as SceneState', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-hub-runtime-scene-state-'));
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-scene-state-${process.pid}`;
  const persistence = createSceneStatePersistence({
    dataDir: directory,
    config: {
      sceneStatePersistencePath: 'snapshots/scene-state.json',
      sceneStatePersistenceDebounceMs: 10
    }
  });
  const manager = new RuntimeProcessManager({
    runtimePath,
    pipeName,
    runtimeArgs: ['--drop-after-health'],
    readyTimeoutMs: 3000,
    autoRestart: false,
    sceneStatePersistence: persistence
  });
  const client = new PipeClient({
    pipeName,
    connectTimeoutMs: 3000,
    requestTimeoutMs: 3000
  });
  manager.setRecoveryClient(client);

  t.after(async () => {
    await client.close();
    await manager.stop().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  });

  await manager.start();
  const health = await client.request('health');
  assert.equal(health.type, 'ack');
  assert.ok(health.payload.result.sceneStateSnapshot);

  await manager.stop();
  const persisted = await loadSceneState(path.join(directory, 'snapshots', 'scene-state.json'));
  assert.deepEqual(persisted, health.payload.result.sceneStateSnapshot);
});
