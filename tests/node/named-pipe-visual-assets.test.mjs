import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { PipeClient } from '../../plugin/runtime/pipe-client.js';
const runtimePath = process.argv[2];
test('Runtime accepts and validates visual asset manifest over Named Pipe', async (t) => {
  if (!runtimePath) { t.skip('requires Runtime executable'); return; }
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-visual-assets-${process.pid}`;
  const runtime = spawn(runtimePath, ['--pipe-server', pipeName], { stdio:['ignore','pipe','pipe'], windowsHide:true });
  t.after(() => { if (!runtime.killed) runtime.kill(); });
  let stdout=''; runtime.stdout.setEncoding('utf8'); runtime.stdout.on('data',(chunk)=>{stdout+=chunk});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Runtime ready timeout: ${stdout}`)),3000);const ready=()=>{if(!stdout.includes('named pipe ready:'))return;clearTimeout(timer);runtime.stdout.off('data',ready);resolve()};runtime.stdout.on('data',ready);runtime.once('error',reject)});
  const client=new PipeClient({pipeName,connectTimeoutMs:3000,requestTimeoutMs:3000}); t.after(()=>client.close()); await client.request('hello',{clientVersion:'visual-assets-test'});
  const manifest={version:1,rootDir:'C:\\\\HanaData\\\\visual-assets',assets:[{assetId:'visual-asset-1',format:'png',relativePath:'visual-assets/visual-asset-1.png',sha256:'a'.repeat(64),enabled:true}]};
  const accepted=await client.request('visual-assets.configure',manifest,{retryable:false,idempotencyKey:'visual-assets-1'});
  assert.equal(accepted.payload.result.applied,true); assert.equal(accepted.payload.result.assetCount,1);
  const repeated=await client.request('visual-assets.configure',manifest,{retryable:false,idempotencyKey:'visual-assets-1'});
  assert.equal(repeated.payload.result.deduplicated,true);
  await assert.rejects(client.request('visual-assets.configure',{version:1,rootDir:'C:\\\\HanaData\\\\visual-assets',assets:[{assetId:'visual-asset-2',format:'png',relativePath:'../escape.png',sha256:'b'.repeat(64),enabled:true}]},{retryable:false}), (error)=>error.code==='VISUAL_ASSET_MANIFEST_PATH_INVALID');
  await assert.rejects(client.request('visual-assets.configure',{version:1,rootDir:'C:\\\\HanaData\\\\visual-assets',assets:[{assetId:'dup',format:'png',relativePath:'visual-assets/dup.png',sha256:'c'.repeat(64),enabled:true},{assetId:'dup',format:'png',relativePath:'visual-assets/dup.png',sha256:'d'.repeat(64),enabled:true}]},{retryable:false}), (error)=>error.code==='VISUAL_ASSET_MANIFEST_DUPLICATE');
  await assert.rejects(client.request('visual-assets.configure',{version:1,rootDir:'C:\\\\HanaData\\\\visual-assets',assets:[{assetId:'a',format:'png',relativePath:'visual-assets/a.png',sha256:'e'.repeat(64),enabled:true},{assetId:'b',format:'png',relativePath:'visual-assets/b.png',sha256:'e'.repeat(64),enabled:true}]},{retryable:false}), (error)=>error.code==='VISUAL_ASSET_MANIFEST_DUPLICATE');
  await client.request('shutdown');
});