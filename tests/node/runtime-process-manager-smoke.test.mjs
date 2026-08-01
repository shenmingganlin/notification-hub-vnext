import assert from 'node:assert/strict';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';
import { RuntimeProcessManager } from '../../plugin/runtime/process-manager.js';
import { addRecoveryEntry, createRecoverySnapshot } from '../../plugin/runtime/recovery-snapshot.js';

const runtimePath = process.argv[2];

test('RuntimeProcessManager restarts Runtime after a controlled exit', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }

  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-restart-${process.pid}`;
  const recoverySnapshot = createRecoverySnapshot();
  addRecoveryEntry(recoverySnapshot, {
    key: 'runtime-config',
    type: 'config.update',
    payload: { profile: 'default', displayDurationMs: 4500 }
  });
  addRecoveryEntry(recoverySnapshot, {
    key: 'scene-window',
    type: 'scene.update',
    payload: { x: 137, y: 83, width: 500, height: 220 }
  });
  addRecoveryEntry(recoverySnapshot, {
    key: 'card-a',
    type: 'scene.create',
    payload: { id: 'card-a', title: 'Card A', body: 'First card', x: 140, y: 90, width: 320, height: 160 }
  });
  addRecoveryEntry(recoverySnapshot, {
    key: 'card-b',
    type: 'scene.create',
    payload: { id: 'card-b', title: 'Card B', body: 'Second card', x: 500, y: 90, width: 320, height: 160 }
  });
  addRecoveryEntry(recoverySnapshot, {
    key: 'card-b-dismiss',
    type: 'scene.dismiss',
    payload: { id: 'card-b' }
  });
  addRecoveryEntry(recoverySnapshot, {
    key: 'scene-stack',
    type: 'scene.set-mode',
    payload: {
      layout: 'stack',
      direction: 'down',
      anchor: 'top-right',
      spacing: 12,
      workAreaWidth: 800,
      workAreaHeight: 600,
      dpiScale: 1
    }
  });
  const manager = new RuntimeProcessManager({
    runtimePath,
    pipeName,
    runtimeArgs: ['--exit-after-health'],
    restartRuntimeArgs: [],
    readyTimeoutMs: 3000,
    restartDelayMs: 10,
    maxRestartAttempts: 2,
    recoverySnapshot
  });
  const client = new PipeClient({
    pipeName,
    connectTimeoutMs: 3000,
    requestTimeoutMs: 3000,
    maxReconnectAttempts: 5,
    reconnectDelayMs: 20
  });
  const managerStates = [];
  const clientStates = [];
  const recoveryEvents = [];
  manager.on('state', (change) => managerStates.push(change));
  manager.on('recovery-applied', (event) => recoveryEvents.push(event));
  client.on('state', (change) => clientStates.push(change));
  manager.setRecoveryClient(client);

  t.after(async () => {
    await client.close();
    await manager.stop();
  });

  await manager.start();
  assert.equal(manager.state, 'running');
  const hello = await client.request('hello', { clientVersion: 'process-manager-smoke' });
  assert.equal(hello.type, 'ack');

  const firstHealth = await client.request('health');
  assert.equal(firstHealth.type, 'ack');

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(poll);
      reject(new Error(`Runtime did not restart; states=${JSON.stringify(managerStates)}`));
    }, 2500);
    const check = () => {
      if (!managerStates.some((change) => change.state === 'crashed')) return;
      if (!managerStates.some((change) => change.state === 'running' && change.reason === 'ready')) return;
      if (recoveryEvents.length !== 6) return;
      clearTimeout(timer);
      clearInterval(poll);
      manager.off('state', check);
      resolve();
    };
    const poll = setInterval(check, 10);
    manager.on('state', check);
    check();
  });

  const recoveredHealth = await client.request('health');
  assert.equal(recoveredHealth.type, 'ack');
  assert.equal(recoveredHealth.payload.requestType, 'health');
  assert.equal(recoveryEvents.length, 6);
  assert.deepEqual(recoveryEvents.map((event) => event.key), [
    'runtime-config',
    'scene-window',
    'card-a',
    'card-b',
    'card-b-dismiss',
    'scene-stack'
  ]);
  assert.deepEqual(recoveredHealth.payload.result.sceneState, {
    x: 137,
    y: 83,
    width: 500,
    height: 220
  });
  assert.deepEqual(recoveredHealth.payload.result.sceneCards.map((card) => card.id), ['card-a']);
  assert.equal(recoveredHealth.payload.result.sceneCards[0].x, 480);
  assert.equal(recoveredHealth.payload.result.sceneCards[0].y, 0);
  assert.ok(clientStates.some((change) => change.state === 'reconnecting'));
  assert.ok(managerStates.some((change) => change.state === 'starting'));
  assert.ok(managerStates.some((change) => change.state === 'crashed'));
});
