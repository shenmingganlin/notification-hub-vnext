import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
test('Native root wallpaper paints red PNG without visual background asset', async (t) => {
  if (!runtimePath) { t.skip('requires Runtime executable'); return; }
  const fixture = fileURLToPath(new URL('../fixtures/visual-asset-red.png', import.meta.url));
  const hash = await sha256('../fixtures/visual-asset-red.png');
  const result = await run(runtimePath, ['--root-wallpaper-self-test', fixture, hash], { windowsHide: true });
  assert.match(result.stdout, /root wallpaper self-test: ok/);
});
test('Native close part wallpaper sits above card background and below the icon', async (t) => {
  if (!runtimePath) { t.skip('requires Runtime executable'); return; }
  const source = fileURLToPath(new URL('../fixtures/visual-asset-red.png', import.meta.url));
  const dir = await mkdtemp(path.join(tmpdir(), 'nh-close-part-'));
  const fixture = path.join(dir, 'visual-asset-red.png');
  await copyFile(source, fixture);
  const hash = createHash('sha256').update(await readFile(fixture)).digest('hex');
  const result = await run(runtimePath, ['--close-part-image-self-test', fixture, hash], { windowsHide: true });
  assert.match(result.stdout, /close part image self-test: ok/);
});