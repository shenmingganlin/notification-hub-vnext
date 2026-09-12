import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { PipeClient } from '../../plugin/runtime/pipe-client.js';
const runtimePath = process.argv[2];
test('Native JPEG manifest asset is accepted as backgroundAssetId', async (t) => {
  if (!runtimePath) { t.skip('requires Runtime executable'); return; }
  const rootDir = process.cwd();
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-jpg-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => { if (!runtime.killed) runtime.kill(); });
  let stdout = ''; runtime.stdout.setEncoding('utf8'); runtime.stdout.on('data', (chunk) => { stdout += chunk; });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`Runtime ready timeout: ${stdout}`)), 3000); const ready = () => { if (!stdout.includes('named pipe ready:')) return; clearTimeout(timer); runtime.stdout.off('data', ready); resolve(); }; runtime.stdout.on('data', ready); runtime.once('error', reject); });
  const client = new PipeClient({ pipeName, connectTimeoutMs: 3000, requestTimeoutMs: 3000 }); t.after(() => client.close()); await client.request('hello', { clientVersion: 'visual-jpg-test' });
  const bytes = await readFile(`${rootDir}/tests/fixtures/visual-asset-red.jpg`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const cfg = await client.request('visual-assets.configure', {version:1,rootDir,assets:[{assetId:'visual-asset-red',format:'jpg',relativePath:'tests/fixtures/visual-asset-red.jpg',sha256,enabled:true}]},{retryable:false,idempotencyKey:'jpg-cfg'});
  assert.equal(cfg.payload.result.applied, true);
  const card = await client.request('scene.create',{id:'jpg-card',title:'jpg',body:'jpg',x:50,y:50,width:320,height:160,visual:{enabled:true,preset:'minimal',intensity:'balanced',category:'plugin',cardType:'minimal',behavior:{layout:'simple',boundary:'work-area'},appearance:{size:'medium',aspectRatio:'default',backgroundColor:'#123456',backgroundAssetId:'visual-asset-red',borderRadius:16,opacity:1}}},{retryable:false,idempotencyKey:'jpg-card-create'});
  assert.equal(card.payload.result.sceneCards.find((c)=>c.id==='jpg-card').visual.appearance.backgroundAssetId,'visual-asset-red');
  await client.request('shutdown');
});
test('Native WEBP manifest asset is accepted as backgroundAssetId', async (t) => {
  if (!runtimePath) { t.skip('requires Runtime executable'); return; }
  const rootDir = process.cwd();
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-webp-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => { if (!runtime.killed) runtime.kill(); });
  let stdout = ''; runtime.stdout.setEncoding('utf8'); runtime.stdout.on('data', (chunk) => { stdout += chunk; });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`Runtime ready timeout: ${stdout}`)), 3000); const ready = () => { if (!stdout.includes('named pipe ready:')) return; clearTimeout(timer); runtime.stdout.off('data', ready); resolve(); }; runtime.stdout.on('data', ready); runtime.once('error', reject); });
  const client = new PipeClient({ pipeName, connectTimeoutMs: 3000, requestTimeoutMs: 3000 }); t.after(() => client.close()); await client.request('hello', { clientVersion: 'visual-webp-test' });
  const bytes = await readFile(`${rootDir}/tests/fixtures/visual-asset-red.webp`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const cfg = await client.request('visual-assets.configure', {version:1,rootDir,assets:[{assetId:'visual-asset-red',format:'webp',relativePath:'tests/fixtures/visual-asset-red.webp',sha256,enabled:true}]},{retryable:false,idempotencyKey:'webp-cfg'});
  assert.equal(cfg.payload.result.applied, true);
  const card = await client.request('scene.create',{id:'webp-card',title:'webp',body:'webp',x:50,y:50,width:320,height:160,visual:{enabled:true,preset:'minimal',intensity:'balanced',category:'plugin',cardType:'minimal',behavior:{layout:'simple',boundary:'work-area'},appearance:{size:'medium',aspectRatio:'default',backgroundColor:'#123456',backgroundAssetId:'visual-asset-red',borderRadius:16,opacity:1}}},{retryable:false,idempotencyKey:'webp-card-create'});
  assert.equal(card.payload.result.sceneCards.find((c)=>c.id==='webp-card').visual.appearance.backgroundAssetId,'visual-asset-red');
  await client.request('shutdown');
});