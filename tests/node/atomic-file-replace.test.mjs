import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { replaceFileAtomically } from '../../plugin/persistence/atomic-file-replace.js';

test('replaceFileAtomically writes a new file and leaves no tmp/bak', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'atomic-replace-'));
  const filePath = path.join(directory, 'doc.json');
  await replaceFileAtomically(filePath, '{"ok":true}\n');
  assert.equal(await readFile(filePath, 'utf8'), '{"ok":true}\n');
  assert.deepEqual(await readdir(directory), ['doc.json']);
});

test('replaceFileAtomically rejects an empty path', async () => {
  await assert.rejects(
    () => replaceFileAtomically('', 'x'),
    (error) => error.code === 'ATOMIC_FILE_PATH_INVALID'
  );
  await assert.rejects(
    () => replaceFileAtomically('   ', 'x'),
    (error) => error.code === 'ATOMIC_FILE_PATH_INVALID'
  );
});

test('replaceFileAtomically replaces an existing file and leaves no tmp/bak', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'atomic-replace-'));
  const filePath = path.join(directory, 'doc.json');
  await writeFile(filePath, 'old\n', 'utf8');
  await replaceFileAtomically(filePath, 'new\n');
  assert.equal(await readFile(filePath, 'utf8'), 'new\n');
  assert.deepEqual(await readdir(directory), ['doc.json']);
});

test('replaceFileAtomically restores the previous file when the second rename fails', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'atomic-replace-'));
  const filePath = path.join(directory, 'doc.json');
  await writeFile(filePath, 'old\n', 'utf8');
  let renameCalls = 0;
  const fsOps = {
    async renameFile(from, to) {
      renameCalls += 1;
      if (renameCalls === 2) {
        const error = new Error('replace blocked');
        error.code = 'EACCES';
        throw error;
      }
      return rename(from, to);
    }
  };

  await assert.rejects(
    () => replaceFileAtomically(filePath, 'new\n', { fsOps }),
    (error) => error.code === 'ATOMIC_FILE_REPLACE_FAILED'
  );
  assert.equal(await readFile(filePath, 'utf8'), 'old\n');
});

test('replaceFileAtomically throws rollback failure when restore also fails', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'atomic-replace-'));
  const filePath = path.join(directory, 'doc.json');
  await writeFile(filePath, 'old\n', 'utf8');
  let renameCalls = 0;
  const fsOps = {
    async renameFile(from, to) {
      renameCalls += 1;
      if (renameCalls >= 2) {
        const error = new Error('blocked');
        error.code = 'EACCES';
        throw error;
      }
      return rename(from, to);
    }
  };

  await assert.rejects(
    () => replaceFileAtomically(filePath, 'new\n', { fsOps }),
    (error) => error.code === 'ATOMIC_FILE_ROLLBACK_FAILED'
  );
});

test('replaceFileAtomically queues writes to the same path', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'atomic-replace-'));
  const filePath = path.join(directory, 'doc.json');
  const first = replaceFileAtomically(filePath, 'one');
  const second = replaceFileAtomically(filePath, 'two');
  await Promise.all([first, second]);
  assert.equal(await readFile(filePath, 'utf8'), 'two');
});
