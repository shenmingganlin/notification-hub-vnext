import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const run = promisify(execFile);
const runtimePath = process.argv[2];
test('Native WIC failure falls back to the configured background color', async (t) => {
  if (!runtimePath) { t.skip('requires Runtime executable'); return; }
  const fixture = fileURLToPath(new URL('../fixtures/visual-asset-corrupt.png', import.meta.url));
  const result = await run(runtimePath, ['--visual-asset-fallback-self-test', fixture], { windowsHide: true });
  assert.match(result.stdout, /visual asset fallback self-test: ok/);
});
