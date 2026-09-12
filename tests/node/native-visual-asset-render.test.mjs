import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const run = promisify(execFile);
const runtimePath = process.argv[2];
const sha256 = async (rel) => createHash('sha256').update(await readFile(fileURLToPath(new URL(rel, import.meta.url)))).digest('hex');
test('Native WIC PNG asset renders into the Direct2D card surface', async (t) => {
  if (!runtimePath) { t.skip('requires Runtime executable'); return; }
  const fixture = fileURLToPath(new URL('../fixtures/visual-asset-red.png', import.meta.url));
  const hash = await sha256('../fixtures/visual-asset-red.png');
  const result = await run(runtimePath, ['--visual-asset-self-test', fixture, hash], { windowsHide: true });
  assert.match(result.stdout, /visual asset self-test: ok/);
});
test('Native WIC JPEG asset renders into the Direct2D card surface', async (t) => {
  if (!runtimePath) { t.skip('requires Runtime executable'); return; }
  const fixture = fileURLToPath(new URL('../fixtures/visual-asset-red.jpg', import.meta.url));
  const hash = await sha256('../fixtures/visual-asset-red.jpg');
  const result = await run(runtimePath, ['--visual-asset-self-test', fixture, hash], { windowsHide: true });
  assert.match(result.stdout, /visual asset self-test: ok/);
});
test('Native WIC WEBP asset renders into the Direct2D card surface', async (t) => {
  if (!runtimePath) { t.skip('requires Runtime executable'); return; }
  const fixture = fileURLToPath(new URL('../fixtures/visual-asset-red.webp', import.meta.url));
  const hash = await sha256('../fixtures/visual-asset-red.webp');
  const result = await run(runtimePath, ['--visual-asset-self-test', fixture, hash], { windowsHide: true });
  assert.match(result.stdout, /visual asset self-test: ok/);
});