import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const runtimePath = process.env.NOTIFICATION_HUB_RUNTIME_PATH || process.argv[2];

test('Native fill opacity 0 stays hittable without a visible wash', async (t) => {
  if (!runtimePath) {
    t.skip('requires Runtime executable');
    return;
  }
  const result = await run(runtimePath, ['--zero-opacity-hit-self-test'], { windowsHide: true });
  assert.match(result.stdout, /zero opacity hit self-test: ok/);
});

test('Native root height 30 and part height 30 occupy the same pixel rows', async (t) => {
  if (!runtimePath) {
    t.skip('requires Runtime executable');
    return;
  }
  const result = await run(runtimePath, ['--part-height-self-test'], { windowsHide: true });
  assert.match(result.stdout, /part height self-test: ok/);
});
