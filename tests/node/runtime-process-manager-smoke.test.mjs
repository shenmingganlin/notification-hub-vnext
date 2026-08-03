import assert from 'node:assert/strict';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';
import { RuntimeProcessManager } from '../../plugin/runtime/process-manager.js';
import { addRecoveryEntry, createRecoverySnapshot } from '../../plugin/runtime/recovery-snapshot.js';

const runtimePath = process.argv[2];

async function runRecoveryScenario(t, suffix, entries) {
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-recovery-${suffix}-${process.pid}`;
  const recoverySnapshot = createRecoverySnapshot({ entries });
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
  const recoveryEvents = [];
  manager.on('state', (change) => managerStates.push(change));
  manager.on('recovery-applied', (event) => recoveryEvents.push(event));
  manager.setRecoveryClient(client);

  t.after(async () => {
    await client.close();
    await manager.stop();
  });

  await manager.start();
  await client.request('hello', { clientVersion: `recovery-${suffix}` });
  await client.request('health');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(poll);
      reject(new Error(`Runtime did not recover; states=${JSON.stringify(managerStates)}`));
    }, 3000);
    const check = () => {
      if (!managerStates.some((change) => change.state === 'crashed')) return;
      if (!managerStates.some((change) => change.state === 'running' && change.reason === 'ready')) return;
      if (recoveryEvents.length !== entries.length) return;
      clearTimeout(timer);
      clearInterval(poll);
      resolve();
    };
    const poll = setInterval(check, 10);
    check();
  });

  return { manager, client, managerStates, recoveryEvents, health: await client.request('health') };
}

test('RuntimeProcessManager re-handshakes after restart with an empty recovery snapshot', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }

  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-empty-restart-${process.pid}`;
  const manager = new RuntimeProcessManager({
    runtimePath,
    pipeName,
    runtimeArgs: ['--exit-after-health'],
    restartRuntimeArgs: [],
    readyTimeoutMs: 3000,
    restartDelayMs: 10,
    maxRestartAttempts: 2,
    recoverySnapshot: createRecoverySnapshot()
  });
  const client = new PipeClient({
    pipeName,
    connectTimeoutMs: 3000,
    requestTimeoutMs: 3000,
    maxReconnectAttempts: 5,
    reconnectDelayMs: 20
  });
  const managerStates = [];
  const responses = [];
  const restarts = [];
  manager.on('state', (change) => managerStates.push(change));
  manager.on('restarted', (event) => restarts.push(event));
  client.on('response', (message) => responses.push(message.payload?.requestType));
  manager.setRecoveryClient(client);

  t.after(async () => {
    await client.close();
    await manager.stop();
  });

  await manager.start();
  await client.request('hello', { clientVersion: 'empty-restart-test' });
  await client.request('health');

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(poll);
      reject(new Error(`Runtime did not re-handshake after restart: ${JSON.stringify({ managerStates, responses, restarts })}`));
    }, 3000);
    const check = () => {
      const helloCount = responses.filter((type) => type === 'hello').length;
      const healthCount = responses.filter((type) => type === 'health').length;
      const restarted = restarts.length > 0;
      const crashed = managerStates.some((change) => change.state === 'crashed');
      const runningAgain = managerStates.filter((change) => change.state === 'running' && change.reason === 'ready').length >= 2;
      if (!crashed || !runningAgain || !restarted || helloCount < 2 || healthCount < 2) return;
      clearTimeout(timer);
      clearInterval(poll);
      resolve();
    };
    const poll = setInterval(check, 10);
    check();
  });

  assert.equal(client.connected, true);
  assert.ok(responses.filter((type) => type === 'hello').length >= 2);
  assert.ok(responses.filter((type) => type === 'health').length >= 2);
});

test('RuntimeProcessManager restores the last replayed layout with no cards', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }

  const result = await runRecoveryScenario(t, 'empty-scene', [
    {
      key: 'stack-mode',
      type: 'scene.set-mode',
      payload: {
        layout: 'stack',
        direction: 'down',
        anchor: 'top-right',
        spacing: 8,
        workAreaWidth: 800,
        workAreaHeight: 600,
        dpiScale: 1
      }
    },
    {
      key: 'shelf-mode',
      type: 'scene.set-mode',
      payload: {
        layout: 'shelf',
        direction: 'right',
        anchor: 'bottom-left',
        spacing: 12,
        workAreaWidth: 800,
        workAreaHeight: 600,
        dpiScale: 1
      }
    }
  ]);

  assert.equal(result.health.payload.result.layout.layout, 'shelf');
  assert.equal(result.health.payload.result.layout.direction, 'right');
  assert.deepEqual(result.health.payload.result.sceneCards, []);
  assert.deepEqual(result.recoveryEvents.map((event) => event.key), ['stack-mode', 'shelf-mode']);
});

test('RuntimeProcessManager reapplies recovery layout when cards follow the mode', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }

  const result = await runRecoveryScenario(t, 'layout-before-card', [
    {
      key: 'shelf-mode',
      type: 'scene.set-mode',
      payload: {
        layout: 'shelf',
        direction: 'right',
        anchor: 'bottom-left',
        spacing: 12,
        workAreaWidth: 800,
        workAreaHeight: 600,
        dpiScale: 1
      }
    },
    {
      key: 'card-a',
      type: 'scene.create',
      payload: {
        id: 'card-a',
        title: 'Card A',
        body: 'Created after shelf recovery',
        x: 700,
        y: 80,
        width: 320,
        height: 160
      }
    }
  ]);

  assert.equal(result.health.payload.result.layout.layout, 'shelf');
  assert.deepEqual(result.health.payload.result.sceneCards.map((card) => ({
    id: card.id,
    x: card.x,
    y: card.y
  })), [{ id: 'card-a', x: 0, y: 440 }]);
  assert.deepEqual(result.recoveryEvents.map((event) => event.key), ['shelf-mode', 'card-a']);
});

test('RuntimeProcessManager reapplies recovery layout when cards precede the mode', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }

  const result = await runRecoveryScenario(t, 'card-before-layout', [
    {
      key: 'card-a',
      type: 'scene.create',
      payload: {
        id: 'card-a',
        title: 'Card A',
        body: 'Created before shelf recovery',
        x: 700,
        y: 80,
        width: 320,
        height: 160
      }
    },
    {
      key: 'shelf-mode',
      type: 'scene.set-mode',
      payload: {
        layout: 'shelf',
        direction: 'right',
        anchor: 'bottom-left',
        spacing: 12,
        workAreaWidth: 800,
        workAreaHeight: 600,
        dpiScale: 1
      }
    }
  ]);

  assert.equal(result.health.payload.result.layout.layout, 'shelf');
  assert.deepEqual(result.health.payload.result.sceneCards.map((card) => ({
    id: card.id,
    x: card.x,
    y: card.y
  })), [{ id: 'card-a', x: 0, y: 440 }]);
  assert.deepEqual(result.recoveryEvents.map((event) => event.key), ['card-a', 'shelf-mode']);
});

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
