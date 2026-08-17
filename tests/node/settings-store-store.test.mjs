import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadSettingsStoreSnapshot,
  saveSettingsStoreSnapshot
} from '../../plugin/domain/settings-store-store.js';
import { createSettingsStoreSnapshot } from '../../plugin/domain/settings-store-snapshot.js';

test('settings snapshot file saves and loads the independent snapshot format', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-settings-'));
  const filePath = path.join(directory, 'settings.json');
  const snapshot = createSettingsStoreSnapshot({ globalSoundEnabled: false }, 4);

  await saveSettingsStoreSnapshot(snapshot, filePath);
  const loaded = await loadSettingsStoreSnapshot(filePath);

  assert.deepEqual(loaded, snapshot);
  assert.match(await readFile(filePath, 'utf8'), /"version":1/);
});

test('missing settings snapshot returns null', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-settings-'));
  const loaded = await loadSettingsStoreSnapshot(path.join(directory, 'missing.json'));

  assert.equal(loaded, null);
});

test('corrupted settings snapshot returns a stable load failure', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-settings-'));
  const filePath = path.join(directory, 'settings.json');
  const fsOps = {
    async readFile() {
      return '{bad json';
    }
  };

  await assert.rejects(
    () => loadSettingsStoreSnapshot(filePath, { fsOps }),
    (error) => error.code === 'SETTINGS_STORE_LOAD_FAILED'
      && error.details.cause === 'SETTINGS_STORE_SNAPSHOT_PARSE_FAILED'
  );
});

test('settings snapshot save wraps replacement failures with a stable code', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-settings-'));
  const filePath = path.join(directory, 'settings.json');
  const snapshot = createSettingsStoreSnapshot({ globalSoundEnabled: false }, 2);
  let renameCalls = 0;
  const fsOps = {
    async mkdir() {},
    async writeFile() {},
    async renameFile() {
      renameCalls += 1;
      if (renameCalls === 1) {
        const error = new Error('replace blocked');
        error.code = 'EACCES';
        throw error;
      }
    },
    async removeFile() {}
  };

  await assert.rejects(
    () => saveSettingsStoreSnapshot(snapshot, filePath, { fsOps }),
    (error) => error.code === 'SETTINGS_STORE_PERSIST_FAILED'
  );
});
