import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createWindowsSaveFilePicker, safeFilename } from '../../plugin/domain/windows-file-picker.js';

test('safeFilename keeps export names inside the selected directory', () => {
  assert.equal(safeFilename('Notification Hub sounds'), 'Notification Hub sounds.nhsound');
  assert.equal(safeFilename('notification-hub-diagnostics', 'notification-hub-diagnostics', 'json'), 'notification-hub-diagnostics.json');
  assert.equal(safeFilename('../escape'), '.._escape.nhsound');
  assert.equal(safeFilename('foo/bar'), 'foo_bar.nhsound');
  assert.equal(safeFilename('CON'), '_CON.nhsound');
  assert.equal(safeFilename(''), 'notification-hub-sounds.nhsound');
  assert.match(safeFilename('中文声音'), /^中文声音\.nhsound$/u);
});

test('non-Windows save picker reports an explicit unavailable error', async () => {
  const picker = createWindowsSaveFilePicker({ platform: 'linux' });
  await assert.rejects(() => picker.save({ content: '{}' }), (error) => error.code === 'SOUND_PACKAGE_FILE_PICKER_UNAVAILABLE');
});

test('Windows picker writes the temporary script as UTF-8 with BOM', async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'nh-picker-test-'));
  let scriptPath = null;
  const spawnImpl = (_command, args) => {
    scriptPath = args[5];
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(async () => {
      const script = await readFile(scriptPath);
      assert.deepEqual([...script.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
      assert.match(script.toString('utf8'), /SetProcessDpiAwareness\(2\)/);
      assert.match(args.join(' '), /-Title/);
      assert.match(args.join(' '), /-Filter/);
      child.stdout.emit('data', Buffer.from('CANCELLED\\n', 'utf8'));
      child.emit('close', 0);
    });
    return child;
  };
  try {
    const picker = createWindowsSaveFilePicker({ platform: 'win32', tempDirectory, spawnImpl, timeoutMs: 1000 });
    const result = await picker.save({ suggestedName: '中文声音', content: '{}' });
    assert.deepEqual(result, { cancelled: true });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
