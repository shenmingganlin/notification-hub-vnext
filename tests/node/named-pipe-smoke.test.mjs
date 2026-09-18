import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';
import { validateSceneState } from '../../plugin/runtime/scene-state.js';

const runtimePath = process.env.NOTIFICATION_HUB_RUNTIME_PATH || process.argv[2];

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
  const eventHistory = [];
  client.on('state', (change) => states.push(change));
  client.on('event', (message) => eventHistory.push(message));
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
  const initialWorkArea = health.payload.result.workArea;
  assert.ok(initialWorkArea?.width > 0);
  assert.ok(initialWorkArea?.height > 0);
  assert.ok(initialWorkArea?.dpiScale > 0);

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
    height: 160,
    visual: {
      enabled: true,
      preset: 'warning',
      intensity: 'expressive',
      category: 'error',
      cardType: 'minimal',
      behavior: { layout: 'simple', boundary: 'work-area' },
      appearance: { size: 'large', aspectRatio: 'wide', backgroundColor: '#123456', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 24, opacity: 0.82 }
    }
  }, { retryable: false, idempotencyKey: 'card-a-create' });
  assert.equal(firstCard.type, 'ack');
  assert.equal(firstCard.payload.result.sceneCards.length, 1);
  assert.deepEqual(firstCard.payload.result.sceneCards[0].visual, {
    enabled: true,
    preset: 'warning',
    intensity: 'expressive',
    category: 'error',
    cardType: 'minimal',
    behavior: { layout: 'simple', boundary: 'work-area' },
    appearance: { size: 'large', aspectRatio: 'wide', backgroundColor: '#123456', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 24, opacity: 0.82 },
    // Runtime 始终回显已解析的交互设置（dismissMode 已在视觉页解锁，见收敛轮次）。
    interaction: { dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 30000 }
  });
  assert.deepEqual(firstCard.payload.result.workArea, initialWorkArea);

  const unicodeCard = await client.request('scene.create', {
    id: 'card-unicode-中文-🚀',
    title: '中文标题 · 🚀',
    body: '换行\n第二行\t制表符',
    x: 850,
    y: 90,
    width: 320,
    height: 160
  }, { retryable: false, idempotencyKey: 'card-unicode-create' });
  assert.equal(unicodeCard.type, 'ack');
  assert.ok(unicodeCard.payload.result.sceneCards.some((card) => card.id === 'card-unicode-中文-🚀'));

  const controlCharacterCard = await client.request('scene.create', {
    id: 'card-control-character',
    title: 'Control character body',
    body: `before\b\f\u000b\u000c\u000e\u001fafter`,
    x: 850,
    y: 280,
    width: 320,
    height: 160
  }, { retryable: false, idempotencyKey: 'card-control-character-create' });
  assert.equal(controlCharacterCard.type, 'ack');
  assert.ok(controlCharacterCard.payload.result.sceneCards.some((card) => card.id === 'card-control-character'));

  const secondCard = await client.request('scene.create', {
    id: 'card-b',
    title: 'Card B',
    body: 'Second fixed card',
    x: 500,
    y: 90,
    width: 320,
    height: 160
  }, { retryable: false, idempotencyKey: 'card-b-create' });
  assert.equal(secondCard.payload.result.sceneCards.length, 4);

  const updatedCard = await client.request('scene.update', {
    id: 'card-a',
    title: 'Card A updated',
    body: 'Updated fixed card',
    x: 160,
    y: 110,
    width: 340,
    height: 170
  }, { retryable: false, idempotencyKey: 'card-a-update' });
  assert.equal(updatedCard.payload.result.sceneCards.length, 4);
  assert.ok(updatedCard.payload.result.sceneCards.some((card) => card.id === 'card-a' && card.x === 160));

  const dismissedCard = await client.request('scene.dismiss', {
    id: 'card-b'
  }, { retryable: false, idempotencyKey: 'card-b-dismiss' });
  assert.equal(dismissedCard.payload.result.removed, true);
  assert.equal(dismissedCard.payload.result.targetId, 'card-b');
  assert.equal(dismissedCard.payload.result.change.targetId, 'card-b');
  assert.equal(dismissedCard.payload.result.change.reason, 'scene.dismiss');
  assert.deepEqual(dismissedCard.payload.result.sceneCards.map((card) => card.id), ['card-a', 'card-unicode-中文-🚀', 'card-control-character']);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const dismissedEvent = eventHistory.find((message) => {
    const change = message?.payload?.result?.change;
    return message?.payload?.eventType === 'scene.changed'
      && change?.target === 'card'
      && change?.targetId === 'card-b';
  });
  assert.equal(dismissedEvent?.payload?.result?.change?.reason, 'scene.dismiss');
  assert.equal(dismissedEvent?.payload?.result?.change?.recoverable, false);
  assert.equal(dismissedEvent?.payload?.result?.change?.notifyUser, false);

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
  assert.equal(shelfCard.payload.result.sceneCards[0].width, 320);
  assert.equal(shelfCard.payload.result.sceneCards[0].height, 160);
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
  })), [
    { id: 'card-a', x: 480, y: 0 },
    { id: 'card-unicode-中文-🚀', x: 480, y: 172 },
    { id: 'card-control-character', x: 480, y: 344 }
  ]);
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
  assert.deepEqual(stackedSnapshot.cardOrder, ['card-a', 'card-unicode-中文-🚀', 'card-control-character']);
  assert.deepEqual(stackedSnapshot.cards.map((card) => card.id), ['card-a', 'card-unicode-中文-🚀', 'card-control-character']);
  assert.equal(stackedSnapshot.layout.mode, 'stack');
  assert.equal(stackedSnapshot.layout.workArea.resolution, 'explicit');
  assert.equal(stackedSnapshot.layout.workArea.source, 'explicit-override');
  assert.equal(stackedCard.payload.result.layout.newest, 'dock');

  const newestNext = await client.request('scene.set-mode', {
    layout: 'stack',
    direction: 'down',
    anchor: 'top-right',
    spacing: 12,
    workAreaWidth: 800,
    workAreaHeight: 600,
    dpiScale: 1,
    newest: 'next'
  }, { retryable: false, idempotencyKey: 'scene-stack-newest-next' });
  assert.equal(newestNext.type, 'ack');
  assert.equal(newestNext.payload.result.layout.newest, 'next');
  assert.deepEqual(newestNext.payload.result.sceneCards.map((card) => ({
    id: card.id,
    x: card.x,
    y: card.y
  })), stackedCard.payload.result.sceneCards.map((card) => ({
    id: card.id,
    x: card.x,
    y: card.y
  })));

  const coilMode = await client.request('scene.set-mode', {
    layout: 'stack',
    direction: 'down',
    anchor: 'top-left',
    spacing: 0,
    workAreaWidth: 800,
    workAreaHeight: 600,
    dpiScale: 1,
    wrap: 'coil',
    newest: 'next'
  }, { retryable: false, idempotencyKey: 'scene-stack-wrap-coil' });
  assert.equal(coilMode.type, 'ack');
  assert.equal(coilMode.payload.result.layout.wrap, 'coil');
  assert.equal(coilMode.payload.result.layout.newest, 'next');

  await assert.rejects(
    client.request('scene.set-mode', {
      layout: 'stack',
      direction: 'down',
      anchor: 'top-right',
      spacing: 12,
      wrap: 'helix'
    }, { retryable: false }),
    (error) => error.code === 'LAYOUT_INVALID'
  );

  const restoreStacked = await client.request('scene.set-mode', {
    layout: 'stack',
    direction: 'down',
    anchor: 'top-right',
    spacing: 12,
    workAreaWidth: 800,
    workAreaHeight: 600,
    dpiScale: 1,
    newest: 'next'
  }, { retryable: false, idempotencyKey: 'scene-stack-restore-after-coil' });
  assert.equal(restoreStacked.type, 'ack');
  assert.equal(restoreStacked.payload.result.layout.anchor, 'top-right');
  assert.equal(restoreStacked.payload.result.layout.wrap, 'parallel');

  await assert.rejects(
    client.request('scene.set-mode', {
      layout: 'stack',
      direction: 'down',
      anchor: 'top-right',
      spacing: 12,
      newest: 'orbit'
    }, { retryable: false }),
    (error) => error.code === 'CHARTER_NEWEST_UNSUPPORTED'
  );

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

  const insetStackedCard = await client.request('scene.set-mode', {
    layout: 'stack',
    direction: 'down',
    anchor: 'top-right',
    spacing: 12,
    workAreaWidth: 800,
    workAreaHeight: 600,
    dpiScale: 1,
    marginLeft: 18,
    marginRight: 18,
    marginTop: 18,
    marginBottom: 18
  }, { retryable: false, idempotencyKey: 'scene-stack-margin-1' });
  assert.equal(insetStackedCard.type, 'ack');

  const wideMargin = await client.request('scene.set-mode', {
    layout: 'stack',
    direction: 'down',
    anchor: 'top-right',
    spacing: 12,
    workAreaWidth: 800,
    workAreaHeight: 600,
    dpiScale: 1,
    marginLeft: 99,
    marginRight: 18,
    marginTop: 18,
    marginBottom: 18
  }, { retryable: false, idempotencyKey: 'scene-stack-margin-99' });
  assert.equal(wideMargin.type, 'ack');
  assert.deepEqual(insetStackedCard.payload.result.sceneCards.map((card) => ({
    id: card.id,
    x: card.x,
    y: card.y
  })), [
    { id: 'card-a', x: 462, y: 18 },
    { id: 'card-unicode-中文-🚀', x: 462, y: 190 },
    { id: 'card-control-character', x: 462, y: 362 }
  ]);

  const shutdown = await client.request('shutdown');
  assert.equal(shutdown.type, 'ack');
  assert.equal(shutdown.payload.requestType, 'shutdown');

  const [exitCode] = await once(runtime, 'exit');
  assert.equal(exitCode, 0, `Runtime exited with stderr: ${stderr}`);
});

test('Runtime accepts optional parts on scene.create without treating them as unknown keys', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-parts-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName], {
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

  await new Promise((resolve, reject) => {
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

  const client = new PipeClient({
    pipeName,
    connectTimeoutMs: 3000,
    requestTimeoutMs: 3000,
    reconnectDelayMs: 10
  });
  t.after(() => client.close());

  await client.request('hello', { clientVersion: 'node-parts' });
  const created = await client.request('scene.create', {
    id: 'card-parts',
    title: 'Parts card',
    body: 'Drawn from parts',
    assistantName: '明微',
    x: 80,
    y: 80,
    width: 320,
    height: 160,
    visual: {
      enabled: true,
      preset: 'minimal',
      intensity: 'balanced',
      category: 'plugin',
      cardType: 'minimal',
      behavior: { layout: 'simple', boundary: 'work-area' },
      appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0e1916', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 16, opacity: 0.96, borderWidth: 2, borderColor: '#62d0a8', paintOverflow: 12 },
      interaction: { dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 30000, hoverHighlight: true }
    },
    parts: [
      { id: 'title', kind: 'text', binding: 'title', x: 30, y: 24, w: 200, h: 34, fill: '#f2fff9' },
      { id: 'body', kind: 'text', binding: 'body', x: 30, y: 62, w: 260, h: 76 },
      { id: 'close', kind: 'close', x: 270, y: 22, w: 28, h: 28, fill: '#1d2b27', stroke: '#62d0a8', strokeWidth: 1, radius: 14 },
      { id: 'future-icon', kind: 'image', x: 8, y: 8, w: 16, h: 16, radius: 8 },
      { id: 'assistantName', kind: 'text', binding: 'assistantName', x: 30, y: 8, w: 120, h: 16 }
    ]
  }, { retryable: false, idempotencyKey: 'card-parts-create' });
  assert.equal(created.type, 'ack');
  const createdCard = created.payload.result.sceneCards.find((card) => card.id === 'card-parts');
  assert.ok(createdCard);
  assert.equal(createdCard.visual.appearance.borderWidth, 2);
  assert.equal(createdCard.visual.appearance.borderColor, '#62d0a8');
  assert.equal(createdCard.visual.appearance.paintOverflow, 12);
  assert.equal(createdCard.visual.interaction.hoverHighlight, true);

  const updated = await client.request('scene.update', {
    id: 'card-parts',
    title: 'Parts updated',
    body: 'Still from parts',
    x: 90,
    y: 90,
    width: 320,
    height: 160,
    parts: [
      { id: 'title', kind: 'text', binding: 'title', x: 30, y: 24, w: 200, h: 34 }
    ]
  }, { retryable: false, idempotencyKey: 'card-parts-update' });
  assert.equal(updated.type, 'ack');
  assert.ok(updated.payload.result.sceneCards.some((card) => card.id === 'card-parts' && card.x === 90));
});

test('Runtime accepts root block parts without treating them as unknown keys', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-root-part-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName], {
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

  await new Promise((resolve, reject) => {
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

  const client = new PipeClient({
    pipeName,
    connectTimeoutMs: 3000,
    requestTimeoutMs: 3000,
    reconnectDelayMs: 10
  });
  t.after(() => client.close());

  await client.request('hello', { clientVersion: 'node-root-part' });
  const created = await client.request('scene.create', {
    id: 'card-root-part',
    title: 'Root plate',
    body: 'Drawn from root part',
    x: 80,
    y: 80,
    width: 320,
    height: 160,
    visual: {
      enabled: true,
      preset: 'minimal',
      intensity: 'balanced',
      category: 'plugin',
      cardType: 'minimal',
      behavior: { layout: 'simple', boundary: 'work-area' },
      appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#ff0000', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 16, opacity: 0.96, borderWidth: 0, borderColor: '#ff0000', paintOverflow: 0 },
      interaction: { dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 30000, hoverHighlight: true }
    },
    parts: [
      { id: 'root', kind: 'block', x: 0, y: 0, w: 320, h: 160, fill: '#0044aa', stroke: '#62d0a8', strokeWidth: 2 },
      { id: 'title', kind: 'text', binding: 'title', x: 30, y: 24, w: 200, h: 34 },
      { id: 'body', kind: 'text', binding: 'body', x: 30, y: 62, w: 260, h: 76 }
    ]
  }, { retryable: false, idempotencyKey: 'card-root-part-create' });
  assert.equal(created.type, 'ack');
  const createdCard = created.payload.result.sceneCards.find((card) => card.id === 'card-root-part');
  assert.ok(createdCard);
  assert.equal(createdCard.visual.appearance.backgroundColor, '#ff0000');
});

test('Runtime accepts root wallpaper keys on parts without treating them as unknown keys', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-root-wallpaper-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName], {
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

  await new Promise((resolve, reject) => {
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

  const client = new PipeClient({
    pipeName,
    connectTimeoutMs: 3000,
    requestTimeoutMs: 3000,
    reconnectDelayMs: 10
  });
  t.after(() => client.close());

  await client.request('hello', { clientVersion: 'node-root-wallpaper' });
  const created = await client.request('scene.create', {
    id: 'card-root-wallpaper',
    title: 'Root wallpaper',
    body: 'Keys on root part',
    x: 80,
    y: 80,
    width: 320,
    height: 160,
    visual: {
      enabled: true,
      preset: 'minimal',
      intensity: 'balanced',
      category: 'plugin',
      cardType: 'minimal',
      behavior: { layout: 'simple', boundary: 'work-area' },
      appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0044aa', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 16, opacity: 0.96 },
      interaction: { dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 30000 }
    },
    parts: [
      {
        id: 'root',
        kind: 'block',
        x: 0,
        y: 0,
        w: 320,
        h: 160,
        fill: '#0044aa',
        backgroundAssetId: 'wall-red',
        backgroundFit: 'cover',
        backgroundScale: 1.25,
        backgroundX: 0.2,
        backgroundY: 0.8
      },
      { id: 'title', kind: 'text', binding: 'title', x: 30, y: 24, w: 200, h: 34 }
    ]
  }, { retryable: false, idempotencyKey: 'card-root-wallpaper-create' });
  assert.equal(created.type, 'ack');
  const createdCard = created.payload.result.sceneCards.find((card) => card.id === 'card-root-wallpaper');
  assert.ok(createdCard);
});

test('scene.update overflow keeps the hit-box origin after HWND sync', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-overflow-origin-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName], {
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

  await new Promise((resolve, reject) => {
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

  const client = new PipeClient({
    pipeName,
    connectTimeoutMs: 3000,
    requestTimeoutMs: 3000,
    reconnectDelayMs: 10
  });
  t.after(() => client.close());

  const visual = (paintOverflow) => ({
    enabled: true,
    preset: 'minimal',
    intensity: 'balanced',
    category: 'plugin',
    cardType: 'minimal',
    behavior: { layout: 'simple', boundary: 'work-area' },
    appearance: {
      size: 'medium',
      aspectRatio: 'default',
      backgroundColor: '#0e1916',
      backgroundFit: 'fill',
      backgroundPadding: 0,
      borderRadius: 16,
      opacity: 0.96,
      paintOverflow
    },
    interaction: { dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 30000 }
  });
  const cardFrom = (response) => response.payload.result.sceneCards.find((card) => card.id === 'card-overflow-origin');

  await client.request('hello', { clientVersion: 'node-overflow-origin' });
  const created = await client.request('scene.create', {
    id: 'card-overflow-origin',
    title: 'Overflow origin',
    body: 'Hit-box must stay put',
    x: 100,
    y: 200,
    width: 320,
    height: 160,
    visual: visual(0)
  }, { retryable: false, idempotencyKey: 'overflow-origin-create' });
  assert.equal(created.type, 'ack');

  const afterCreate = cardFrom(await client.request('health', {}, { retryable: false }));
  assert.ok(afterCreate);
  assert.equal(afterCreate.x, 100);
  assert.equal(afterCreate.y, 200);

  const updated12 = await client.request('scene.update', {
    id: 'card-overflow-origin',
    title: 'Overflow origin',
    body: 'Hit-box must stay put',
    x: afterCreate.x,
    y: afterCreate.y,
    width: 320,
    height: 160,
    visual: visual(12)
  }, { retryable: false, idempotencyKey: 'overflow-origin-12' });
  assert.equal(updated12.type, 'ack');

  const after12 = cardFrom(await client.request('health', {}, { retryable: false }));
  assert.ok(after12);
  assert.equal(after12.x, 100);
  assert.equal(after12.y, 200);
  assert.equal(after12.visual.appearance.paintOverflow, 12);

  const updated24 = await client.request('scene.update', {
    id: 'card-overflow-origin',
    title: 'Overflow origin',
    body: 'Hit-box must stay put',
    x: after12.x,
    y: after12.y,
    width: 320,
    height: 160,
    visual: visual(24)
  }, { retryable: false, idempotencyKey: 'overflow-origin-24' });
  assert.equal(updated24.type, 'ack');

  const after24 = cardFrom(await client.request('health', {}, { retryable: false }));
  assert.ok(after24);
  assert.equal(after24.x, 100);
  assert.equal(after24.y, 200);
  assert.equal(after24.visual.appearance.paintOverflow, 24);

  const updated120 = await client.request('scene.update', {
    id: 'card-overflow-origin',
    title: 'Overflow origin',
    body: 'Hit-box must stay put',
    x: after24.x,
    y: after24.y,
    width: 320,
    height: 160,
    visual: visual(120)
  }, { retryable: false, idempotencyKey: 'overflow-origin-120' });
  assert.equal(updated120.type, 'ack');
  const after120 = cardFrom(await client.request('health', {}, { retryable: false }));
  assert.equal(after120.visual.appearance.paintOverflow, 120);
  assert.equal(after120.x, 100);
  assert.equal(after120.y, 200);

  const updated240 = await client.request('scene.update', {
    id: 'card-overflow-origin',
    title: 'Overflow origin',
    body: 'Hit-box must stay put',
    x: after120.x,
    y: after120.y,
    width: 320,
    height: 160,
    visual: visual(240)
  }, { retryable: false, idempotencyKey: 'overflow-origin-240' });
  assert.equal(updated240.type, 'ack');
  const after240 = cardFrom(await client.request('health', {}, { retryable: false }));
  assert.equal(after240.visual.appearance.paintOverflow, 240);
  assert.equal(after240.x, 100);
  assert.equal(after240.y, 200);

  await assert.rejects(
    client.request('scene.update', {
      id: 'card-overflow-origin',
      title: 'Overflow origin',
      body: 'Hit-box must stay put',
      x: after240.x,
      y: after240.y,
      width: 320,
      height: 160,
      visual: visual(241)
    }, { retryable: false, idempotencyKey: 'overflow-origin-241' }),
    (error) => error.code === 'RUNTIME_SCENE_CARD_INVALID'
  );

  const shutdown = await client.request('shutdown');
  assert.equal(shutdown.type, 'ack');
  const [exitCode] = await once(runtime, 'exit');
  assert.equal(exitCode, 0, `Runtime exited with stderr: ${stderr}`);
});

test('Runtime ACKs autoDismiss and keeps channel-only create coordinates without set-mode', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-autodismiss-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName], {
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
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Runtime ready timeout; stderr=${stderr}`)), 3000);
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
  await client.request('hello', { clientVersion: 'auto-dismiss-smoke' });
  const created = await client.request('scene.create', {
    id: 'card-auto-dismiss',
    title: 'Auto dismiss',
    body: 'ACK autoDismiss',
    x: 88,
    y: 144,
    width: 320,
    height: 160,
    visual: {
      enabled: true,
      preset: 'minimal',
      intensity: 'balanced',
      category: 'plugin',
      cardType: 'minimal',
      behavior: { layout: 'simple', boundary: 'work-area' },
      appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0e1916', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 16, opacity: 0.96 },
      interaction: { dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 120000, autoDismiss: true }
    }
  }, { retryable: false, idempotencyKey: 'card-auto-dismiss-create' });
  assert.equal(created.type, 'ack');
  const autoCard = created.payload.result.sceneCards.find((card) => card.id === 'card-auto-dismiss');
  assert.equal(autoCard.visual.interaction.autoDismiss, true);
  assert.equal(autoCard.visual.interaction.timeoutMs, 120000);
  assert.equal(autoCard.x, 88);
  assert.equal(autoCard.y, 144);

  const channelCreated = await client.request('scene.create', {
    id: 'card-channel-keep-xy',
    title: 'Keep XY',
    body: 'no set-mode',
    x: 410,
    y: 220,
    width: 320,
    height: 160,
    behavior: { behaviorProfileId: 'stack', behaviorChannelId: 'stack.main' }
  }, { retryable: false, idempotencyKey: 'card-channel-keep-xy-create' });
  assert.equal(channelCreated.type, 'ack');
  const channelCard = channelCreated.payload.result.sceneCards.find((card) => card.id === 'card-channel-keep-xy');
  assert.equal(channelCard.x, 410);
  assert.equal(channelCard.y, 220);

  const shutdown = await client.request('shutdown');
  assert.equal(shutdown.type, 'ack');
  const [exitCode] = await once(runtime, 'exit');
  assert.equal(exitCode, 0, `Runtime exited with stderr: ${stderr}`);
});

test('Runtime ACKs holdDrag false and omits default on from cards_json', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-hold-drag-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName], {
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
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Runtime ready timeout; stderr=${stderr}`)), 3000);
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
  await client.request('hello', { clientVersion: 'hold-drag-smoke' });
  const createdOff = await client.request('scene.create', {
    id: 'card-hold-off',
    title: 'Hold off',
    body: 'no drag',
    x: 40,
    y: 40,
    width: 320,
    height: 160,
    visual: {
      enabled: true,
      preset: 'minimal',
      intensity: 'balanced',
      category: 'plugin',
      cardType: 'minimal',
      behavior: { layout: 'simple', boundary: 'work-area' },
      appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0e1916', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 16, opacity: 0.96 },
      interaction: { dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 30000, holdDrag: false }
    }
  }, { retryable: false, idempotencyKey: 'card-hold-off-create' });
  assert.equal(createdOff.type, 'ack');
  const offCard = createdOff.payload.result.sceneCards.find((card) => card.id === 'card-hold-off');
  assert.equal(offCard.visual.interaction.holdDrag, false);
  const createdOn = await client.request('scene.create', {
    id: 'card-hold-on',
    title: 'Hold on',
    body: 'default drag',
    x: 40,
    y: 220,
    width: 320,
    height: 160,
    visual: {
      enabled: true,
      preset: 'minimal',
      intensity: 'balanced',
      category: 'plugin',
      cardType: 'minimal',
      behavior: { layout: 'simple', boundary: 'work-area' },
      appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0e1916', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 16, opacity: 0.96 },
      interaction: { dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 30000 }
    }
  }, { retryable: false, idempotencyKey: 'card-hold-on-create' });
  assert.equal(createdOn.type, 'ack');
  const onCard = createdOn.payload.result.sceneCards.find((card) => card.id === 'card-hold-on');
  assert.equal('holdDrag' in onCard.visual.interaction, false);
  const shutdown = await client.request('shutdown');
  assert.equal(shutdown.type, 'ack');
  const [exitCode] = await once(runtime, 'exit');
  assert.equal(exitCode, 0, `Runtime exited with stderr: ${stderr}`);
});

test('Runtime ticker overlay create keeps health x,y without a card HWND', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }
  const pipeName = String.raw`\\.\pipe\notification-hub-vnext-overlay-smoke-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName], {
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
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Runtime ready timeout; stderr=${stderr}`)), 3000);
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
  await client.request('hello', { clientVersion: 'overlay-smoke' });
  await client.request('scene.set-mode', {
    layout: 'stack',
    direction: 'down',
    anchor: 'bottom-right',
    spacing: 12,
    workAreaWidth: 1200,
    workAreaHeight: 800,
    dpiScale: 1
  }, { retryable: false });
  const created = await client.request('scene.create', {
    id: 'overlay-ticker',
    title: 'overlay-ticker',
    body: 'sprite',
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
  assert.equal(created.type, 'ack', `overlay ticker create failed: ${JSON.stringify(created)}`);
  const card = created.payload.result.sceneCards.find((item) => item.id === 'overlay-ticker');
  assert.ok(card, 'health must still list the ticker card');
  assert.equal(typeof card.x, 'number');
  assert.equal(typeof card.y, 'number');
  assert.ok(card.x > 900, `ticker spawn x should be near the right edge, got ${card.x}`);
  const shutdown = await client.request('shutdown');
  assert.equal(shutdown.type, 'ack');
  const [exitCode] = await once(runtime, 'exit');
  assert.equal(exitCode, 0, `Runtime exited with stderr: ${stderr}`);
});
