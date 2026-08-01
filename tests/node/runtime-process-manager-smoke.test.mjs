import assert from 'node:assert/strict';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';
import { RuntimeProcessManager } from '../../plugin/runtime/process-manager.js';

const runtimePath = process.argv[2];

test('RuntimeProcessManager restarts Runtime after a controlled exit', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }

  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-restart-${process.pid}`;
  const manager = new RuntimeProcessManager({
    runtimePath,
    pipeName,
    runtimeArgs: ['--exit-after-health'],
    restartRuntimeArgs: [],
    readyTimeoutMs: 3000,
    restartDelayMs: 10,
    maxRestartAttempts: 2
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
  manager.on('state', (change) => managerStates.push(change));
  client.on('state', (change) => clientStates.push(change));

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
    const timer = setTimeout(() => reject(new Error(`Runtime did not restart; states=${JSON.stringify(managerStates)}`)), 2500);
    const check = () => {
      if (!managerStates.some((change) => change.state === 'crashed')) return;
      if (!managerStates.some((change) => change.state === 'running' && change.reason === 'ready')) return;
      clearTimeout(timer);
      manager.off('state', check);
      resolve();
    };
    manager.on('state', check);
    check();
  });

  const recoveredHealth = await client.request('health');
  assert.equal(recoveredHealth.type, 'ack');
  assert.equal(recoveredHealth.payload.requestType, 'health');
  assert.ok(clientStates.some((change) => change.state === 'reconnecting'));
  assert.ok(managerStates.some((change) => change.state === 'starting'));
  assert.ok(managerStates.some((change) => change.state === 'crashed'));
});
