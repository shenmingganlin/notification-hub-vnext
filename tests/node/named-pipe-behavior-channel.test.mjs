import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';

const runtimePath = process.argv[2];

function waitForSnapshot(client, history, predicate, timeoutMs = 3000) {
  const find = () => {
    for (const message of history) {
      const snapshot = message?.payload?.eventType === 'scene.changed'
        ? message.payload.result?.sceneStateSnapshot
        : null;
      if (snapshot && predicate(snapshot)) return snapshot;
    }
    return null;
  };
  const existing = find();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('event', onEvent);
      reject(new Error(`Timed out waiting for behavior-channel snapshot: ${JSON.stringify(history)}`));
    }, timeoutMs);
    const onEvent = (message) => {
      if (message?.payload?.eventType !== 'scene.changed') return;
      const snapshot = message.payload.result?.sceneStateSnapshot;
      if (!snapshot || !predicate(snapshot)) return;
      clearTimeout(timer);
      client.off('event', onEvent);
      resolve(snapshot);
    };
    client.on('event', onEvent);
  });
}

function card(snapshot, id) {
  return snapshot.cards.find((candidate) => candidate.id === id);
}

test('Native Runtime isolates behavior-channel layout and lifecycle', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }

  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-behavior-channel-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let stdout = '';
  let stderr = '';
  runtime.stdout.setEncoding('utf8');
  runtime.stderr.setEncoding('utf8');
  runtime.stdout.on('data', (chunk) => { stdout += chunk; });
  runtime.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(() => {
    if (runtime.exitCode === null) runtime.kill();
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Runtime ready timeout; stdout=${stdout}; stderr=${stderr}`)), 3000);
    const onData = () => {
      if (!stdout.includes('named pipe ready:')) return;
      clearTimeout(timer);
      runtime.stdout.off('data', onData);
      resolve();
    };
    runtime.stdout.on('data', onData);
    runtime.once('error', reject);
  });

  const client = new PipeClient({
    pipeName,
    connectTimeoutMs: 3000,
    requestTimeoutMs: 3000,
    reconnectDelayMs: 10
  });
  const history = [];
  client.on('event', (message) => history.push(message));
  t.after(() => client.close());

  await client.request('hello', { clientVersion: 'behavior-channel-smoke' });
  await client.request('scene.set-mode', {
    layout: 'stack',
    direction: 'down',
    anchor: 'top-left',
    spacing: 20,
    workAreaWidth: 1200,
    workAreaHeight: 800,
    dpiScale: 1
  }, { retryable: false });

  const create = (id, channel, profile = 'stack') => client.request('scene.create', {
    id,
    title: id,
    body: 'behavior channel smoke',
    x: 0,
    y: 0,
    width: 320,
    height: 160,
    presentation: {
      eventId: `test.${id}`,
      categoryId: 'test',
      eventTypeId: 'behavior-channel',
      visualProfileId: 'visual.default'
    },
    behavior: {
      behaviorProfileId: profile,
      behaviorChannelId: channel
    }
  }, { retryable: false });

  await create('channel-a-1', 'stack.main');
  await create('channel-a-2', 'stack.main');
  await create('channel-b-1', 'ticker.main', 'ticker');
  await create('channel-b-2', 'ticker.main', 'ticker');

  const stacked = await client.request('health', {}, { retryable: false });
  const snapshot = stacked.payload.result.sceneStateSnapshot;
  assert.deepEqual(snapshot.cardOrder, ['channel-a-1', 'channel-a-2', 'channel-b-1', 'channel-b-2']);
  assert.deepEqual(snapshot.cards.map((item) => item.behavior), [
    { behaviorProfileId: 'stack', behaviorChannelId: 'stack.main' },
    { behaviorProfileId: 'stack', behaviorChannelId: 'stack.main' },
    { behaviorProfileId: 'ticker', behaviorChannelId: 'ticker.main' },
    { behaviorProfileId: 'ticker', behaviorChannelId: 'ticker.main' }
  ]);
  assert.deepEqual(snapshot.behaviorChannels, [
    { channelId: 'stack.main', profileId: 'stack', cardOrder: ['channel-a-1', 'channel-a-2'] },
    { channelId: 'ticker.main', profileId: 'ticker', cardOrder: ['channel-b-1', 'channel-b-2'] }
  ]);

  const a1 = card(snapshot, 'channel-a-1');
  const a2 = card(snapshot, 'channel-a-2');
  const b1 = card(snapshot, 'channel-b-1');
  const b2 = card(snapshot, 'channel-b-2');
  assert.deepEqual([a1.x, a1.y], [0, 0]);
  assert.deepEqual([a2.x, a2.y], [0, 180]);
  assert.deepEqual([b1.x, b1.y], [600, 0]);
  assert.deepEqual([b2.x, b2.y], [600, 180]);

  await client.request('scene.dismiss', { id: 'channel-a-1' }, { retryable: false });
  const reflowed = await client.request('health', {}, { retryable: false });
  const reflowedSnapshot = reflowed.payload.result.sceneStateSnapshot;
  assert.deepEqual(reflowedSnapshot.cardOrder, ['channel-a-2', 'channel-b-1', 'channel-b-2']);
  assert.deepEqual(reflowedSnapshot.behaviorChannels, [
    { channelId: 'stack.main', profileId: 'stack', cardOrder: ['channel-a-2'] },
    { channelId: 'ticker.main', profileId: 'ticker', cardOrder: ['channel-b-1', 'channel-b-2'] }
  ]);
  assert.deepEqual([card(reflowedSnapshot, 'channel-a-2').x, card(reflowedSnapshot, 'channel-a-2').y], [0, 0]);
  assert.deepEqual([card(reflowedSnapshot, 'channel-b-1').x, card(reflowedSnapshot, 'channel-b-1').y], [600, 0]);
  assert.deepEqual([card(reflowedSnapshot, 'channel-b-2').x, card(reflowedSnapshot, 'channel-b-2').y], [600, 180]);

  await client.request('scene.dismiss', { id: 'channel-a-2' }, { retryable: false });
  const isolated = await client.request('health', {}, { retryable: false });
  const isolatedSnapshot = isolated.payload.result.sceneStateSnapshot;
  assert.deepEqual(isolatedSnapshot.cardOrder, ['channel-b-1', 'channel-b-2']);
  assert.deepEqual(isolatedSnapshot.behaviorChannels, [
    { channelId: 'ticker.main', profileId: 'ticker', cardOrder: ['channel-b-1', 'channel-b-2'] }
  ]);
  assert.deepEqual([card(isolatedSnapshot, 'channel-b-1').x, card(isolatedSnapshot, 'channel-b-1').y], [0, 0]);
  assert.deepEqual([card(isolatedSnapshot, 'channel-b-2').x, card(isolatedSnapshot, 'channel-b-2').y], [340, 0]);

  await client.request('scene.dismiss', { id: 'channel-b-1' }, { retryable: false });
  const finalState = await client.request('health', {}, { retryable: false });
  const finalSnapshot = finalState.payload.result.sceneStateSnapshot;
  assert.deepEqual(finalSnapshot.cardOrder, ['channel-b-2']);
  assert.deepEqual([card(finalSnapshot, 'channel-b-2').x, card(finalSnapshot, 'channel-b-2').y], [0, 0]);

  const shutdown = await client.request('shutdown');
  assert.equal(shutdown.type, 'ack');
  const [exitCode] = await once(runtime, 'exit');
  assert.equal(exitCode, 0, `Runtime exited with stderr: ${stderr}`);
});
