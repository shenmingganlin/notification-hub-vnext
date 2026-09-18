import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';

const runtimePath = process.env.NOTIFICATION_HUB_RUNTIME_PATH || process.argv[2];

async function withRuntime(t, name, fn) {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-${name}-${process.pid}`;
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
  t.after(() => { if (runtime.exitCode === null) runtime.kill(); });
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
  const events = [];
  client.on('event', (message) => events.push(message));
  t.after(() => client.close());
  await client.request('hello', { clientVersion: name });
  await fn({ client, runtime, events, stderrOf: () => stderr });
}

function perfOf(health) {
  return health?.payload?.result?.perf ?? { paints: 0, moves: 0, sceneChanges: 0 };
}

test('stack card persist does not keep painting, moving, or emitting scene.changed', async (t) => {
  await withRuntime(t, 'persist-stack', async ({ client, events }) => {
    await client.request('scene.set-mode', {
      layout: 'stack',
      direction: 'down',
      anchor: 'bottom-right',
      spacing: 12,
      workAreaWidth: 1200,
      workAreaHeight: 800,
      dpiScale: 1
    }, { retryable: false });
    await client.request('scene.create', {
      id: 'persist-stack',
      title: 'persist-stack',
      body: 'stay',
      x: 0,
      y: 0,
      width: 420,
      height: 180,
      behavior: { behaviorProfileId: 'stack', behaviorChannelId: 'visual.try-one' }
    }, { retryable: false });
    const before = perfOf(await client.request('health', {}, { retryable: false }));
    const eventBefore = events.length;
    await new Promise((resolve) => setTimeout(resolve, 800));
    const after = perfOf(await client.request('health', {}, { retryable: false }));
    console.log('STACK_PERSIST', { before, after, events: events.length - eventBefore });
    assert.equal(after.paints, before.paints, 'stack persist must not repaint');
    assert.equal(after.moves, before.moves, 'stack persist must not SetWindowPos');
    assert.equal(after.sceneChanges, before.sceneChanges, 'stack persist must not emit scene.changed');
    assert.equal(events.length, eventBefore, 'stack persist must not send scene.changed events');
  });
});

test('ticker persist does not repaint or emit scene.changed while it flies', async (t) => {
  await withRuntime(t, 'persist-ticker', async ({ client, events }) => {
    await client.request('scene.set-mode', {
      layout: 'stack',
      direction: 'down',
      anchor: 'bottom-right',
      spacing: 12,
      workAreaWidth: 1200,
      workAreaHeight: 800,
      dpiScale: 1
    }, { retryable: false });
    await client.request('scene.create', {
      id: 'persist-ticker',
      title: 'persist-ticker',
      body: 'fly',
      x: 0,
      y: 0,
      width: 320,
      height: 76,
      visual: {
        enabled: true,
        preset: 'minimal',
        intensity: 'balanced',
        category: null,
        cardType: 'minimal',
        behavior: { layout: 'simple', boundary: 'work-area' },
        interaction: { dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 30000 },
        appearance: {
          size: 'medium',
          aspectRatio: 'wide',
          backgroundColor: '#0e1916',
          backgroundFit: 'fill',
          backgroundPadding: 0,
          borderRadius: 12,
          opacity: 0.96
        },
        ticker: {
          speedPxPerSec: 400,
          band: 'top',
          bandRatio: 0.28,
          trackCount: 3,
          minGapPx: 64,
          clickThrough: true,
          hoverPause: false,
          overflow: 'avoid'
        }
      },
      behavior: { behaviorProfileId: 'ticker', behaviorChannelId: 'visual.try-one' }
    }, { retryable: false });
    const before = perfOf(await client.request('health', {}, { retryable: false }));
    const eventBefore = events.length;
    await new Promise((resolve) => setTimeout(resolve, 800));
    const after = perfOf(await client.request('health', {}, { retryable: false }));
    console.log('TICKER_PERSIST', { before, after, events: events.length - eventBefore, moveDelta: after.moves - before.moves, paintDelta: after.paints - before.paints });
    assert.ok(after.moves > before.moves, 'ticker must still advance with compositor offsets');
    assert.equal(after.paints, before.paints, 'ticker motion must not reupload the card surface');
    assert.equal(after.sceneChanges, before.sceneChanges, 'ticker motion must not emit scene.changed');
    assert.equal(events.length, eventBefore, 'ticker motion must not send scene.changed events');
  });
});
