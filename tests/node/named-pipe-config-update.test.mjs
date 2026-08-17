import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';

const runtimePath = process.argv[2];

test('Runtime accepts, rejects, and deduplicates config.update over Named Pipe', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-config-${process.pid}`;
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

  const client = new PipeClient({ pipeName, connectTimeoutMs: 3000, requestTimeoutMs: 3000 });
  t.after(() => client.close());
  await client.request('hello', { clientVersion: 'config-test' });

  const update = await client.request('config.update', {
    revision: 3,
    audio: { enabled: true, volume: 0.65 }
  }, { retryable: false, idempotencyKey: 'config-update-3' });
  assert.equal(update.payload.result.applied, true);
  assert.equal(update.payload.result.revision, 3);
  assert.equal(update.payload.result.audio.enabled, true);
  assert.equal(update.payload.result.audio.volume, 0.65);
  assert.equal(update.payload.result.deduplicated, false);

  const repeated = await client.request('config.update', {
    revision: 3,
    audio: { enabled: true, volume: 0.65 }
  }, { retryable: false, idempotencyKey: 'config-update-3' });
  assert.equal(repeated.payload.result.deduplicated, true);
  assert.equal(repeated.payload.result.revision, 3);

  await assert.rejects(
    client.request('config.update', {
      revision: 2,
      audio: { enabled: false, volume: 0.2 }
    }, { retryable: false }),
    (error) => error.code === 'RUNTIME_CONFIG_REVISION_STALE'
  );
  await assert.rejects(
    client.request('config.update', {
      revision: 4,
      audio: { enabled: true, volume: 2 }
    }, { retryable: false }),
    (error) => error.code === 'RUNTIME_CONFIG_AUDIO_INVALID'
  );
  await assert.rejects(
    client.request('config.update', {
      revision: 4,
      audio: { enabled: true, volume: 0.5 },
      extra: true
    }, { retryable: false }),
    (error) => error.code === 'RUNTIME_CONFIG_UNKNOWN_FIELD'
  );

  const shutdown = await client.request('shutdown');
  assert.equal(shutdown.payload.requestType, 'shutdown');
});
