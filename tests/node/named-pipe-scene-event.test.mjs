import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';

const execFileAsync = promisify(execFile);
const runtimePath = process.argv[2];

async function sendNativeCardAction(title, action) {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NotificationHubSceneEventTest {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindow(string className, string windowName);
  [DllImport("user32.dll")]
  public static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
  public static IntPtr LParam(int low, int high) {
    return new IntPtr((high << 16) | (low & 0xffff));
  }
}
'@
$hwnd = [NotificationHubSceneEventTest]::FindWindow('NotificationHubVNextSceneWindow', '${title.replaceAll("'", "''")}')
if ($hwnd -eq [IntPtr]::Zero) { throw 'Native scene card window was not found' }
${action}
`;
  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script
    ], { timeout: 3000, windowsHide: true });
  } catch (error) {
    throw new Error(`Native card action failed: ${error.stderr || error.message}`);
  }
}

function waitForSceneSnapshot(client, history, predicate, timeoutMs = 3000) {
  const findMatch = () => {
    for (const message of history) {
      if (message?.payload?.eventType !== 'scene.changed') continue;
      const snapshot = message.payload.result?.sceneStateSnapshot;
      if (snapshot && predicate(snapshot)) return snapshot;
    }
    return null;
  };
  const existing = findMatch();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('event', onEvent);
      reject(new Error(`Timed out waiting for matching scene.changed event; history=${JSON.stringify(history)}`));
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

test('Named Pipe delivers native drag and close scene.changed events', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }

  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-scene-event-${process.pid}`;
  const title = `pipe-scene-event-card-${process.pid}`;
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

  t.after(async () => {
    if (runtime.exitCode === null) runtime.kill();
  });

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
  const eventHistory = [];
  client.on('event', (message) => eventHistory.push(message));
  t.after(() => client.close());

  await client.request('hello', { clientVersion: 'scene-event-smoke' });
  await client.request('scene.create', {
    id: 'scene-event-card',
    title,
    body: 'Native event smoke',
    x: 140,
    y: 90,
    width: 320,
    height: 160
  }, { retryable: false });

  await sendNativeCardAction(title, `
[void][NotificationHubSceneEventTest]::SendMessage($hwnd, 0x0201, [IntPtr]1, [NotificationHubSceneEventTest]::LParam(80, 80))
[void][NotificationHubSceneEventTest]::SendMessage($hwnd, 0x0200, [IntPtr]1, [NotificationHubSceneEventTest]::LParam(120, 100))
[void][NotificationHubSceneEventTest]::SendMessage($hwnd, 0x0202, [IntPtr]::Zero, [NotificationHubSceneEventTest]::LParam(120, 100))
`);
  const movedSnapshot = await waitForSceneSnapshot(
    client,
    eventHistory,
    (snapshot) => snapshot.cards.some((card) => card.id === 'scene-event-card'
      && card.x === 200
      && card.y === 120)
  );
  assert.deepEqual(
    movedSnapshot.cards.find((card) => card.id === 'scene-event-card'),
    {
      id: 'scene-event-card',
      title,
      body: 'Native event smoke',
      x: 200,
      y: 120,
      width: 320,
      height: 160
    }
  );

  await sendNativeCardAction(title, `
[void][NotificationHubSceneEventTest]::SendMessage($hwnd, 0x0201, [IntPtr]1, [NotificationHubSceneEventTest]::LParam(190, 24))
`);
  const closedSnapshot = await waitForSceneSnapshot(
    client,
    eventHistory,
    (snapshot) => snapshot.cardOrder.length === 0 && snapshot.cards.length === 0
  );
  assert.deepEqual(closedSnapshot.cardOrder, []);
  assert.deepEqual(closedSnapshot.cards, []);

  const shutdown = await client.request('shutdown');
  assert.equal(shutdown.type, 'ack');
  const [exitCode] = await once(runtime, 'exit');
  assert.equal(exitCode, 0, `Runtime exited with stderr: ${stderr}`);
});
