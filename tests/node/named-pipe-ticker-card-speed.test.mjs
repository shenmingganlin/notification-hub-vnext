import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';

const runtimePath = process.env.NOTIFICATION_HUB_RUNTIME_PATH || process.argv[2];

function tickerVisual(speedPxPerSec, extras = {}) {
  return {
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
      speedPxPerSec,
      band: extras.band ?? 'top',
      bandRatio: extras.bandRatio ?? 0.28,
      trackCount: extras.trackCount ?? 0,
      minGapPx: 64,
      clickThrough: extras.clickThrough !== false,
      hoverPause: false,
      overflow: 'avoid'
    }
  };
}

test('Native ticker uses each card speed immediately on the same channel', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }

  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-ticker-speed-${process.pid}`;
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
  t.after(() => client.close());

  await client.request('hello', { clientVersion: 'ticker-card-speed' });
  await client.request('scene.set-mode', {
    layout: 'stack',
    direction: 'down',
    anchor: 'top-left',
    spacing: 20,
    workAreaWidth: 1200,
    workAreaHeight: 800,
    dpiScale: 1
  }, { retryable: false });

  const create = (id, speed) => client.request('scene.create', {
    id,
    title: id,
    body: 'per-card ticker speed',
    x: 0,
    y: 0,
    width: 320,
    height: 76,
    visual: tickerVisual(speed),
    behavior: {
      behaviorProfileId: 'ticker',
      behaviorChannelId: 'visual.try-one'
    }
  }, { retryable: false });

  await create('ticker-fast', 800);
  await create('ticker-slow', 150);
  await new Promise((resolve) => setTimeout(resolve, 280));

  const snapshot = (await client.request('health', {}, { retryable: false })).payload.result.sceneStateSnapshot;
  const fast = snapshot.cards.find((card) => card.id === 'ticker-fast');
  const slow = snapshot.cards.find((card) => card.id === 'ticker-slow');
  assert.ok(fast && slow, 'both ticker cards should still be on scene');
  // 旧实现会把通道锁在第一张 800px/s，两张几乎并排。修完后慢卡明显更靠右。
  assert.ok(
    slow.x > fast.x + 80,
    `slow card should lag the fast card on the same channel, got fast.x=${fast.x} slow.x=${slow.x}`
  );

  const shutdown = await client.request('shutdown');
  assert.equal(shutdown.type, 'ack');
  const [exitCode] = await once(runtime, 'exit');
  assert.equal(exitCode, 0, `Runtime exited with stderr: ${stderr}`);
});

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
  t.after(() => client.close());
  await client.request('hello', { clientVersion: name });
  await fn(client, runtime, () => stderr);
}

test('Native honors explicit ticker trackCount beyond the 28% band', async (t) => {
  await withRuntime(t, 'ticker-tracks', async (client, runtime, stderrOf) => {
    await client.request('scene.set-mode', {
      layout: 'stack',
      direction: 'down',
      anchor: 'top-left',
      spacing: 20,
      workAreaWidth: 1920,
      workAreaHeight: 1080,
      dpiScale: 1
    }, { retryable: false });
    const create = (id) => client.request('scene.create', {
      id,
      title: id,
      body: 'ten tracks',
      x: 0,
      y: 0,
      width: 320,
      height: 76,
      visual: tickerVisual(400, { trackCount: 10 }),
      behavior: { behaviorProfileId: 'ticker', behaviorChannelId: 'ticker.tracks' }
    }, { retryable: false });
    for (let i = 0; i < 10; i += 1) await create(`track-card-${i}`);
    const snapshot = (await client.request('health', {}, { retryable: false })).payload.result.sceneStateSnapshot;
    const rows = new Set(snapshot.cards.filter((card) => card.id.startsWith('track-card-')).map((card) => card.y));
    assert.equal(rows.size, 10, `expected 10 ticker rows, got ${[...rows].sort((a, b) => a - b).join(',')}`);
    const shutdown = await client.request('shutdown');
    assert.equal(shutdown.type, 'ack');
    const [exitCode] = await once(runtime, 'exit');
    assert.equal(exitCode, 0, `Runtime exited with stderr: ${stderrOf()}`);
  });
});

test('Native explicit 3 tracks shrinks the band instead of leaving a 100% empty strip', async (t) => {
  await withRuntime(t, 'ticker-shrink', async (client, runtime, stderrOf) => {
    await client.request('scene.set-mode', {
      layout: 'stack',
      direction: 'down',
      anchor: 'top-left',
      spacing: 20,
      workAreaWidth: 1920,
      workAreaHeight: 1080,
      dpiScale: 1
    }, { retryable: false });
    const create = (id) => client.request('scene.create', {
      id,
      title: id,
      body: 'three tracks',
      x: 0,
      y: 0,
      width: 320,
      height: 76,
      visual: tickerVisual(400, { trackCount: 3, band: 'bottom', bandRatio: 1 }),
      behavior: { behaviorProfileId: 'ticker', behaviorChannelId: 'ticker.shrink' }
    }, { retryable: false });
    for (let i = 0; i < 3; i += 1) await create(`shrink-card-${i}`);
    const snapshot = (await client.request('health', {}, { retryable: false })).payload.result.sceneStateSnapshot;
    const ys = snapshot.cards.filter((card) => card.id.startsWith('shrink-card-')).map((card) => card.y).sort((a, b) => a - b);
    assert.deepEqual(ys, [836, 920, 1004], `expected bottom-anchored 3-track rows, got ${ys.join(',')}`);
    const shutdown = await client.request('shutdown');
    assert.equal(shutdown.type, 'ack');
    const [exitCode] = await once(runtime, 'exit');
    assert.equal(exitCode, 0, `Runtime exited with stderr: ${stderrOf()}`);
  });
});

test('Native stack cards on a mixed channel do not fly', async (t) => {
  await withRuntime(t, 'mixed-channel', async (client, runtime, stderrOf) => {
    await client.request('scene.set-mode', {
      layout: 'stack',
      direction: 'down',
      anchor: 'top-left',
      spacing: 20,
      workAreaWidth: 1200,
      workAreaHeight: 800,
      dpiScale: 1
    }, { retryable: false });
    await client.request('scene.create', {
      id: 'mixed-ticker',
      title: 'mixed-ticker',
      body: 'fly',
      x: 0,
      y: 0,
      width: 320,
      height: 76,
      visual: tickerVisual(400),
      behavior: { behaviorProfileId: 'ticker', behaviorChannelId: 'visual.try-one' }
    }, { retryable: false });
    await client.request('scene.create', {
      id: 'mixed-stack',
      title: 'mixed-stack',
      body: 'stay',
      x: 0,
      y: 0,
      width: 420,
      height: 220,
      behavior: { behaviorProfileId: 'stack', behaviorChannelId: 'visual.try-one' }
    }, { retryable: false });
    const first = (await client.request('health', {}, { retryable: false })).payload.result.sceneStateSnapshot;
    const stackBefore = first.cards.find((card) => card.id === 'mixed-stack');
    assert.equal(stackBefore.width, 420);
    assert.equal(stackBefore.height, 220);
    await new Promise((resolve) => setTimeout(resolve, 280));
    const second = (await client.request('health', {}, { retryable: false })).payload.result.sceneStateSnapshot;
    const stackAfter = second.cards.find((card) => card.id === 'mixed-stack');
    const tickerAfter = second.cards.find((card) => card.id === 'mixed-ticker');
    assert.equal(stackAfter.x, stackBefore.x, 'stack card must not inherit ticker motion');
    assert.equal(stackAfter.y, stackBefore.y);
    assert.ok(tickerAfter.x < 1200, 'ticker card should still be in flight');
    const shutdown = await client.request('shutdown');
    assert.equal(shutdown.type, 'ack');
    const [exitCode] = await once(runtime, 'exit');
    assert.equal(exitCode, 0, `Runtime exited with stderr: ${stderrOf()}`);
  });
});
