import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const run = promisify(execFile);
const runtimePath = process.argv[2];
test('Native semi-transparent PNG with opacity correctly blends with background', async (t) => {
  if (!runtimePath) { t.skip('requires Runtime executable'); return; }
  const fixture = fileURLToPath(new URL('../fixtures/visual-asset-semi.png', import.meta.url));
  const hash = createHash('sha256').update(await readFile(fixture)).digest('hex');
  const result = await run(runtimePath, ['--visual-asset-opacity-self-test', fixture, hash], { windowsHide: true });
  assert.match(result.stdout, /visual asset opacity self-test: ok/);
});