import assert from 'node:assert/strict';
import test from 'node:test';

import { SOUND_SETTINGS_DEFAULTS } from '../../plugin/domain/sound-settings.js';
import { SoundSettingsStore, SOUND_SETTINGS_STORE_STATUSES } from '../../plugin/domain/sound-settings-store.js';

test('sound store owns an independent profile snapshot', () => {
  const store = new SoundSettingsStore();
  const snapshot = store.getSnapshot();
  assert.deepEqual(snapshot.settings, SOUND_SETTINGS_DEFAULTS);
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.revision, 1);
  assert.equal(snapshot.savedRevision, 1);
  assert.equal(snapshot.appliedRevision, 0);
  assert.equal(snapshot.status, SOUND_SETTINGS_STORE_STATUSES.SAVED);
  assert.equal(snapshot.applyError, null);
  assert.equal(Object.isFrozen(snapshot), true);
});

test('sound store updates and restores without runtime state', () => {
  const store = new SoundSettingsStore();
  const changed = store.updateSoundSettings({ globalSoundEnabled: false });
  assert.equal(changed.revision, 2);
  assert.equal(changed.settings.globalSoundEnabled, false);
  const restored = store.restoreSnapshot({
    version: 1, revision: 9, updatedAt: '2026-08-04T12:00:00.000Z',
    settings: { globalSoundEnabled: true }
  });
  assert.equal(restored.revision, 9);
  assert.equal(restored.appliedRevision, 0);
  assert.equal(restored.status, SOUND_SETTINGS_STORE_STATUSES.SAVED);
});

test('sound store rejects malformed snapshots with stable errors', () => {
  const store = new SoundSettingsStore();
  assert.throws(() => store.restoreSnapshot({ version: 2 }), (error) => error.code === 'SOUND_SETTINGS_STORE_SNAPSHOT_VERSION_UNSUPPORTED');
  assert.equal(store.getSnapshot().revision, 1);
});
