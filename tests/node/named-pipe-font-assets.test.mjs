import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { PipeClient } from '../../plugin/runtime/pipe-client.js';

const runtimePath = process.argv[2];

async function readyRuntime(t, suffix) {
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-font-assets-${suffix}-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => { if (!runtime.killed) runtime.kill(); });
  let stdout = '';
  runtime.stdout.setEncoding('utf8');
  runtime.stdout.on('data', (chunk) => { stdout += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Runtime ready timeout: ${stdout}`)), 3000);
    const ready = () => {
      if (!stdout.includes('named pipe ready:')) return;
      clearTimeout(timer);
      runtime.stdout.off('data', ready);
      resolve();
    };
    runtime.stdout.on('data', ready);
    runtime.once('error', reject);
  });
  const client = new PipeClient({ pipeName, connectTimeoutMs: 3000, requestTimeoutMs: 5000 });
  t.after(() => client.close());
  await client.request('hello', { clientVersion: 'font-assets-test' });
  return client;
}

test('Runtime accepts and validates font asset manifest over Named Pipe', async (t) => {
  if (!runtimePath) { t.skip('requires Runtime executable'); return; }
  const client = await readyRuntime(t, 'manifest');
  const manifest = { version: 1, rootDir: 'C:\\\\HanaData\\\\font-assets', assets: [{ assetId: 'font-asset-1', format: 'ttf', relativePath: 'font-assets/font-asset-1.ttf', sha256: 'a'.repeat(64), enabled: true }] };
  const accepted = await client.request('font-assets.configure', manifest, { retryable: false, idempotencyKey: 'font-assets-1' });
  assert.equal(accepted.payload.result.applied, true);
  assert.equal(accepted.payload.result.assetCount, 1);
  const repeated = await client.request('font-assets.configure', manifest, { retryable: false, idempotencyKey: 'font-assets-1' });
  assert.equal(repeated.payload.result.deduplicated, true);
  await assert.rejects(client.request('font-assets.configure', { version: 1, rootDir: 'C:\\\\HanaData\\\\font-assets', assets: [{ assetId: 'font-asset-2', format: 'ttf', relativePath: '../escape.ttf', sha256: 'b'.repeat(64), enabled: true }] }, { retryable: false }), (error) => error.code === 'FONT_ASSET_MANIFEST_PATH_INVALID');
  await assert.rejects(client.request('font-assets.configure', { version: 1, rootDir: 'C:\\\\HanaData\\\\font-assets', assets: [{ assetId: 'dup', format: 'ttf', relativePath: 'font-assets/dup.ttf', sha256: 'c'.repeat(64), enabled: true }, { assetId: 'dup', format: 'ttf', relativePath: 'font-assets/dup.ttf', sha256: 'd'.repeat(64), enabled: true }] }, { retryable: false }), (error) => error.code === 'FONT_ASSET_MANIFEST_DUPLICATE');
  await client.request('shutdown');
});

test('Runtime loads a font from ASCII temp path and accepts fontAssetId on parts', async (t) => {
  if (!runtimePath) { t.skip('requires Runtime executable'); return; }
  const source = 'C:\\\\Windows\\\\Fonts\\\\arial.ttf'.replace(/\\\\/g, '\\');
  let bytes;
  try { bytes = await readFile(source); } catch { t.skip('Arial not available'); return; }
  const rootDir = join(tmpdir(), `nh-font-selftest-${process.pid}`);
  const relativePath = 'font-assets/font-asset-1.ttf';
  await mkdir(join(rootDir, 'font-assets'), { recursive: true });
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  await copyFile(source, join(rootDir, relativePath));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const client = await readyRuntime(t, 'ascii');
  const cfg = await client.request('font-assets.configure', {
    version: 1,
    rootDir,
    assets: [{ assetId: 'font-asset-1', format: 'ttf', relativePath, sha256, enabled: true }]
  }, { retryable: false, idempotencyKey: 'font-ascii-cfg' });
  assert.equal(cfg.payload.result.applied, true);
  const card = await client.request('scene.create', {
    id: 'font-card',
    title: 'font',
    body: 'font',
    x: 40,
    y: 40,
    width: 320,
    height: 160,
    parts: [{
      id: 'title', kind: 'text', binding: 'title', x: 12, y: 12, w: 280, h: 28,
      fontFamily: 'yahei', fontAssetId: 'font-asset-1', fontSize: 20
    }],
    visual: {
      enabled: true, preset: 'minimal', intensity: 'balanced', category: 'plugin', cardType: 'minimal',
      behavior: { layout: 'simple', boundary: 'work-area' },
      appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#123456', borderRadius: 16, opacity: 1 }
    }
  }, { retryable: false, idempotencyKey: 'font-card-create' });
  assert.ok(card.payload.result.sceneCards.find((item) => item.id === 'font-card'));
  await assert.rejects(client.request('scene.create', {
    id: 'font-unknown-key',
    title: 'x',
    body: 'y',
    x: 1, y: 1, width: 100, height: 80,
    parts: [{ id: 'title', kind: 'text', binding: 'title', x: 1, y: 1, w: 80, h: 20, unknownFont: true }]
  }, { retryable: false }), (error) => error.code === 'RUNTIME_SCENE_CARD_INVALID');
  await client.request('shutdown');
});
