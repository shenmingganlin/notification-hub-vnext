import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';

const runtimePath = process.argv[2];

test('Node client completes hello, health, and shutdown over Named Pipe', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-smoke-${process.pid}`;
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
  const client = new PipeClient({ pipeName, connectTimeoutMs: 3000, requestTimeoutMs: 3000 });
  t.after(() => client.close());

  const hello = await client.request('hello', { clientVersion: 'node-smoke' });
  assert.equal(hello.type, 'ack');
  assert.equal(hello.requestId, 'req-node-1');
  assert.equal(hello.payload.requestType, 'hello');
  assert.equal(hello.payload.accepted, true);

  const health = await client.request('health');
  assert.equal(health.type, 'ack');
  assert.equal(health.payload.requestType, 'health');

  const shutdown = await client.request('shutdown');
  assert.equal(shutdown.type, 'ack');
  assert.equal(shutdown.payload.requestType, 'shutdown');

  const [exitCode] = await once(runtime, 'exit');
  assert.equal(exitCode, 0, `Runtime exited with stderr: ${stderr}`);
});
