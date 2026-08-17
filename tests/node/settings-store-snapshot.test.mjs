import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SETTINGS_STORE_VERSION,
  createSettingsStoreSnapshot,
  parseSettingsStoreSnapshot,
  serializeSettingsStoreSnapshot
} from '../../plugin/domain/settings-store-snapshot.js';
import { createSoundSettings } from '../../plugin/domain/sound-settings.js';

test('settings snapshot creates, serializes, and parses a valid persisted settings state', () => {
  const settings = createSoundSettings({
    globalSoundEnabled: false,
    defaultPolicy: { enabled: true, cue: 'success' }
  });
  const snapshot = createSettingsStoreSnapshot(settings, 3, {
    updatedAt: '2026-08-04T12:00:00.000Z'
  });

  assert.deepEqual(snapshot, {
    version: SETTINGS_STORE_VERSION,
    revision: 3,
    settings,
    updatedAt: '2026-08-04T12:00:00.000Z'
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.settings), true);
  assert.equal('appliedRevision' in snapshot, false);
  assert.equal('applyError' in snapshot, false);

  const parsed = parseSettingsStoreSnapshot(serializeSettingsStoreSnapshot(snapshot));
  assert.deepEqual(parsed, snapshot);
  assert.equal(Object.isFrozen(parsed), true);
});

test('settings snapshot rejects unsupported versions, unknown fields, and invalid JSON', () => {
  const valid = {
    version: SETTINGS_STORE_VERSION,
    revision: 1,
    settings: createSoundSettings({}),
    updatedAt: '2026-08-04T12:00:00.000Z'
  };

  assert.throws(
    () => parseSettingsStoreSnapshot(JSON.stringify({ ...valid, version: 2 })),
    (error) => error.code === 'SETTINGS_STORE_SNAPSHOT_VERSION_UNSUPPORTED'
  );
  assert.throws(
    () => parseSettingsStoreSnapshot(JSON.stringify({ ...valid, extra: true })),
    (error) => error.code === 'SETTINGS_STORE_SNAPSHOT_INVALID'
  );
  assert.throws(
    () => parseSettingsStoreSnapshot('{bad json'),
    (error) => error.code === 'SETTINGS_STORE_SNAPSHOT_PARSE_FAILED'
  );
});

test('settings snapshot rejects invalid revision, settings, and timestamp', () => {
  const valid = {
    version: SETTINGS_STORE_VERSION,
    revision: 1,
    settings: createSoundSettings({}),
    updatedAt: '2026-08-04T12:00:00.000Z'
  };

  assert.throws(
    () => createSettingsStoreSnapshot(valid.settings, 0),
    (error) => error.code === 'SETTINGS_STORE_SNAPSHOT_INVALID'
  );
  assert.throws(
    () => parseSettingsStoreSnapshot(JSON.stringify({ ...valid, settings: { globalSoundEnabled: 'no' } })),
    (error) => error.code === 'SETTINGS_STORE_SNAPSHOT_INVALID'
  );
  assert.throws(
    () => parseSettingsStoreSnapshot(JSON.stringify({ ...valid, updatedAt: 'invalid' })),
    (error) => error.code === 'SETTINGS_STORE_SNAPSHOT_INVALID'
  );
});
