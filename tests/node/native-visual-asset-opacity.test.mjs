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
// Fill opacity 0.15 must not wipe a semi-transparent PNG wallpaper.
// Native --visual-asset-opacity-self-test samples that the image is still there (alpha > 80, red still obvious).
// Copy to an ASCII temp path: WIC open still uses naive path widening, so 中文工作区路径会打不开图。
test('Native semi-transparent PNG stays visible under low fill opacity', async (t) => {
  if (!runtimePath) { t.skip('requires Runtime executable'); return; }
  const source = fileURLToPath(new URL('../fixtures/visual-asset-semi.png', import.meta.url));
  const dir = await mkdtemp(path.join(tmpdir(), 'nh-opacity-'));
  const fixture = path.join(dir, 'visual-asset-semi.png');
  await copyFile(source, fixture);
  const hash = createHash('sha256').update(await readFile(fixture)).digest('hex');
  const result = await run(runtimePath, ['--visual-asset-opacity-self-test', fixture, hash], { windowsHide: true });
  assert.match(result.stdout, /visual asset opacity self-test: ok/);
});
