import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';

const runtimePath = process.argv[2];

test('Runtime keeps serving after two independent pipe clients', async (t) => {
  if (!runtimePath) {
    t.skip('requires a Runtime executable path; CTest supplies it');
    return;
  }

  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-multi-client-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  t.after(() => {
    if (!runtime.killed) runtime.kill();
  });
  let stdout = '';
  let stderr = '';
  runtime.stdout.setEncoding('utf8');
  runtime.stderr.setEncoding('utf8');
  runtime.stdout.on('data', (chunk) => { stdout += chunk; });
  runtime.stderr.on('data', (chunk) => { stderr += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Runtime ready timeout; stdout=${stdout}; stderr=${stderr}`));
    }, 3000);
    runtime.stdout.on('data', () => {
      if (!stdout.includes('named pipe ready:')) return;
      clearTimeout(timer);
      resolve();
    });
    runtime.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  const sendCard = async (suffix) => {
    const client = new PipeClient({
      pipeName,
      connectTimeoutMs: 1500,
      requestTimeoutMs: 1500,
      maxReconnectAttempts: 3,
      reconnectDelayMs: 20
    });
    try {
      const hello = await client.request('hello', { clientVersion: `multi-client-${suffix}` });
      const card = await client.request('scene.create', {
        id: `multi-client-card-${suffix}`,
        title: `Multi-client ${suffix}`,
        body: 'Consecutive client connection test',
        x: suffix === 'first' ? 900 : 1300,
        y: 120,
        width: 300,
        height: 100
      }, { retryable: false });
      return { hello, card };
    } finally {
      await client.close();
    }
  };

  assertAccepted(await sendCard('first'));
  assertAccepted(await sendCard('second'));
});

function assertAccepted(result) {
  if (result.hello.payload?.accepted !== true || result.card.payload?.accepted !== true) {
    throw new Error(`Pipe request was not accepted: ${JSON.stringify(result)}`);
  }
}
