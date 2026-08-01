import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';
import { validateSceneState } from '../../plugin/runtime/scene-state.js';

const runtimePath = process.argv[2];

test('Node client completes hello, health, and shutdown over Named Pipe', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-smoke-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName, '--drop-after-health'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  t.after(async () => {
    if (!runtime.killed) runtime.kill();
  });

  let stdout = '';
  let stderr = '';
  runtime.stdout.setEncoding('utf8');
  runtime.stderr.setEncoding('utf8');
  runtime.stdout.on('data', (chunk) => { stdout += chunk; });
  runtime.stderr.on('data', (chunk) => { stderr += chunk; });

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Runtime ready timeout; stderr=${stderr}`)), 3000);
    const onData = () => {
      if (!stdout.includes('named pipe ready:')) return;
      clearTimeout(timer);
      runtime.stdout.off('data', onData);
      resolve();
    };
    runtime.stdout.on('data', onData);
    runtime.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  await ready;
  const client = new PipeClient({
    pipeName,
    connectTimeoutMs: 3000,
    requestTimeoutMs: 3000,
    reconnectDelayMs: 10
  });
  const states = [];
  client.on('state', (change) => states.push(change));
  t.after(() => client.close());

  const hello = await client.request('hello', { clientVersion: 'node-smoke' });
  assert.equal(hello.type, 'ack');
  assert.equal(hello.requestId, 'req-node-1');
  assert.equal(hello.payload.requestType, 'hello');
  assert.equal(hello.payload.accepted, true);

  const health = await client.request('health', {}, { idempotencyKey: 'health-smoke-1' });
  assert.equal(health.type, 'ack');
  assert.equal(health.payload.requestType, 'health');
  assert.equal(health.payload.result.deduplicated, false);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Runtime did not report disconnect; states=${JSON.stringify(states)}`)), 1500);
    const check = () => {
      if (!states.some((change) => change.state === 'disconnected')) return;
      clearTimeout(timer);
      client.off('state', check);
      resolve();
    };
    client.on('state', check);
    check();
  });

  const recoveredHealth = await client.request('health', {}, { idempotencyKey: 'health-smoke-1' });
  assert.equal(recoveredHealth.type, 'ack');
  assert.equal(recoveredHealth.payload.requestType, 'health');
  assert.equal(recoveredHealth.payload.result.deduplicated, true);

  await assert.rejects(
    client.request('health', { different: true }, { idempotencyKey: 'health-smoke-1', retryable: false }),
    (error) => error.code === 'TRANSPORT_IDEMPOTENCY_CONFLICT'
  );
  assert.ok(states.some((change) => change.state === 'reconnecting'));
  assert.ok(states.filter((change) => change.state === 'connected').length >= 2);

  const sceneUpdate = await client.request('scene.update', {
    x: 120,
    y: 80,
    width: 420,
    height: 180
  }, { retryable: false, idempotencyKey: 'scene-window-1' });
  assert.equal(sceneUpdate.type, 'ack');
  assert.deepEqual(sceneUpdate.payload.result.sceneState, {
    x: 120,
    y: 80,
    width: 420,
    height: 180
  });
  const emptySnapshot = validateSceneState(sceneUpdate.payload.result.sceneStateSnapshot);
  assert.deepEqual(emptySnapshot.sceneWindow, sceneUpdate.payload.result.sceneState);
  assert.deepEqual(emptySnapshot.cardOrder, []);
  assert.deepEqual(emptySnapshot.cards, []);
  assert.equal(emptySnapshot.layout, null);

  await assert.rejects(
    client.request('scene.update', { x: 0, y: 0, width: 0, height: 180 }, { retryable: false }),
    (error) => error.code === 'RUNTIME_SCENE_STATE_INVALID'
  );

  const firstCard = await client.request('scene.create', {
    id: 'card-a',
    title: 'Card A',
    body: 'First fixed card',
    x: 140,
    y: 90,
    width: 320,
    height: 160
  }, { retryable: false, idempotencyKey: 'card-a-create' });
  assert.equal(firstCard.type, 'ack');
  assert.equal(firstCard.payload.result.sceneCards.length, 1);

  const secondCard = await client.request('scene.create', {
    id: 'card-b',
    title: 'Card B',
    body: 'Second fixed card',
    x: 500,
    y: 90,
    width: 320,
    height: 160
  }, { retryable: false, idempotencyKey: 'card-b-create' });
  assert.equal(secondCard.payload.result.sceneCards.length, 2);

  const updatedCard = await client.request('scene.update', {
    id: 'card-a',
    title: 'Card A updated',
    body: 'Updated fixed card',
    x: 160,
    y: 110,
    width: 340,
    height: 170
  }, { retryable: false, idempotencyKey: 'card-a-update' });
  assert.equal(updatedCard.payload.result.sceneCards.length, 2);
  assert.ok(updatedCard.payload.result.sceneCards.some((card) => card.id === 'card-a' && card.x === 160));

  const dismissedCard = await client.request('scene.dismiss', {
    id: 'card-b'
  }, { retryable: false, idempotencyKey: 'card-b-dismiss' });
  assert.deepEqual(dismissedCard.payload.result.sceneCards.map((card) => card.id), ['card-a']);

  const providerStackedCard = await client.request('scene.set-mode', {
    layout: 'stack',
    direction: 'down',
    anchor: 'top-right',
    spacing: 12
  }, { retryable: false, idempotencyKey: 'scene-stack-provider-1' });
  assert.equal(providerStackedCard.type, 'ack');
  assert.ok(providerStackedCard.payload.result.workArea.width > 0);
  assert.ok(providerStackedCard.payload.result.workArea.height > 0);
  assert.ok(providerStackedCard.payload.result.workArea.dpiScale > 0);
  assert.ok(['primary-monitor-work-area', 'virtual-screen-fallback'].includes(
    providerStackedCard.payload.result.workArea.source
  ));
  assert.equal(typeof providerStackedCard.payload.result.workArea.isFallback, 'boolean');

  const shelfCard = await client.request('scene.set-mode', {
    layout: 'shelf',
    direction: 'right',
    anchor: 'bottom-left',
    spacing: 12
  }, { retryable: false, idempotencyKey: 'scene-shelf-provider-1' });
  assert.equal(shelfCard.type, 'ack');
  assert.equal(shelfCard.payload.result.sceneCards[0].x, 0);
  assert.ok(shelfCard.payload.result.sceneCards[0].y >= 0);
  assert.ok(shelfCard.payload.result.workArea.width > 0);
  assert.equal(shelfCard.payload.result.layout.layout, 'shelf');
  assert.equal(shelfCard.payload.result.layout.direction, 'right');

  const repeatedShelfCard = await client.request('scene.set-mode', {
    layout: 'shelf',
    direction: 'right',
    anchor: 'bottom-left',
    spacing: 12
  }, { retryable: false });
  assert.deepEqual(repeatedShelfCard.payload.result.sceneCards, shelfCard.payload.result.sceneCards);
  assert.deepEqual(repeatedShelfCard.payload.result.layout, shelfCard.payload.result.layout);

  const stackedCard = await client.request('scene.set-mode', {
    layout: 'stack',
    direction: 'down',
    anchor: 'top-right',
    spacing: 12,
    workAreaWidth: 800,
    workAreaHeight: 600,
    dpiScale: 1
  }, { retryable: false, idempotencyKey: 'scene-stack-1' });
  assert.equal(stackedCard.type, 'ack');
  assert.deepEqual(stackedCard.payload.result.sceneCards.map((card) => ({
    id: card.id,
    x: card.x,
    y: card.y
  })), [{ id: 'card-a', x: 480, y: 0 }]);
  assert.deepEqual(stackedCard.payload.result.workArea, {
    left: 0,
    top: 0,
    width: 800,
    height: 600,
    dpiScale: 1,
    isFallback: false,
    source: 'explicit-override'
  });
  const stackedSnapshot = validateSceneState(stackedCard.payload.result.sceneStateSnapshot);
  assert.deepEqual(stackedSnapshot.cardOrder, ['card-a']);
  assert.deepEqual(stackedSnapshot.cards.map((card) => card.id), ['card-a']);
  assert.equal(stackedSnapshot.layout.mode, 'stack');
  assert.equal(stackedSnapshot.layout.workArea.resolution, 'explicit');
  assert.equal(stackedSnapshot.layout.workArea.source, 'explicit-override');

  await assert.rejects(
    client.request('scene.set-mode', {
      layout: 'stack',
      direction: 'down',
      anchor: 'top-right',
      spacing: 12,
      workAreaWidth: 100,
      workAreaHeight: 100,
      dpiScale: 1
    }, { retryable: false }),
    (error) => error.code === 'LAYOUT_CARD_OUT_OF_BOUNDS'
  );

  await assert.rejects(
    client.request('scene.set-mode', {
      layout: 'stack',
      direction: 'down',
      anchor: 'top-right',
      spacing: 12,
      workAreaWidth: 800
    }, { retryable: false }),
    (error) => error.code === 'LAYOUT_INVALID'
  );

  await assert.rejects(
    client.request('scene.set-mode', {
      layout: 'shelf',
      direction: 'right',
      anchor: 'top-left',
      spacing: 12,
      workAreaWidth: 100,
      workAreaHeight: 100,
      dpiScale: 1
    }, { retryable: false }),
    (error) => error.code === 'LAYOUT_SHELF_OUT_OF_BOUNDS'
  );

  const stateAfterRejectedLayout = await client.request('health', {}, { retryable: false });
  assert.equal(stateAfterRejectedLayout.payload.result.layout.layout, 'stack');
  assert.deepEqual(stateAfterRejectedLayout.payload.result.workArea, stackedCard.payload.result.workArea);
  const rejectedSnapshot = validateSceneState(stateAfterRejectedLayout.payload.result.sceneStateSnapshot);
  const withoutTimestamp = ({ updatedAt, ...snapshot }) => snapshot;
  assert.deepEqual(withoutTimestamp(rejectedSnapshot), withoutTimestamp(stackedSnapshot));
  assert.notEqual(rejectedSnapshot.updatedAt, stackedSnapshot.updatedAt);

  const shutdown = await client.request('shutdown');
  assert.equal(shutdown.type, 'ack');
  assert.equal(shutdown.payload.requestType, 'shutdown');

  const [exitCode] = await once(runtime, 'exit');
  assert.equal(exitCode, 0, `Runtime exited with stderr: ${stderr}`);
});
