import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SETTINGS_STORE_STATUSES,
  SettingsStore
} from '../../plugin/domain/settings-store.js';
import { SOUND_SETTINGS_DEFAULTS } from '../../plugin/domain/sound-settings.js';
import { createSettingsStoreSnapshot } from '../../plugin/domain/settings-store-snapshot.js';

test('empty SettingsStore exposes default sound settings and initial saved state', () => {
  const store = new SettingsStore();
  const snapshot = store.getSnapshot();

  assert.deepEqual(snapshot.settings, SOUND_SETTINGS_DEFAULTS);
  assert.equal(snapshot.revision, 1);
  assert.equal(snapshot.savedRevision, 1);
  assert.equal(snapshot.appliedRevision, 0);
  assert.equal(snapshot.status, SETTINGS_STORE_STATUSES.SAVED);
  assert.equal(snapshot.applyError, null);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.settings), true);
});

test('SettingsStore returns a stable frozen snapshot', () => {
  const store = new SettingsStore();
  const first = store.getSnapshot();
  const second = store.getSnapshot();

  assert.equal(first, second);
  assert.equal(Object.isFrozen(first.settings.defaultPolicy), true);
  assert.throws(() => { first.settings.globalSoundEnabled = false; }, TypeError);
});

test('updateSoundSettings deep-merges a patch and increments the saved revision', () => {
  const store = new SettingsStore({
    initialSettings: {
      defaultPolicy: { enabled: true, cue: 'success' },
      typePolicies: { 'task.completed': { enabled: true, cue: 'success' } }
    }
  });
  const patch = {
    globalSoundEnabled: false,
    defaultPolicy: { volume: 0.4 },
    typePolicies: { 'task.completed': { volume: 0.7 } }
  };

  const snapshot = store.updateSoundSettings(patch);

  assert.equal(snapshot.revision, 2);
  assert.equal(snapshot.savedRevision, 2);
  assert.equal(snapshot.appliedRevision, 0);
  assert.equal(snapshot.status, SETTINGS_STORE_STATUSES.SAVED);
  assert.equal(snapshot.settings.globalSoundEnabled, false);
  assert.deepEqual(snapshot.settings.defaultPolicy, {
    enabled: true,
    cue: 'success',
    volume: 0.4,
    minImportance: 'low',
    suppressDuplicates: true,
    quietMode: false,
    criticalBypass: true
  });
  assert.deepEqual(snapshot.settings.typePolicies['task.completed'], {
    enabled: true,
    cue: 'success',
    volume: 0.7
  });
});

test('invalid sound settings patches do not change the current snapshot', () => {
  const store = new SettingsStore();
  const before = store.getSnapshot();

  assert.throws(
    () => store.updateSoundSettings({ defaultPolicy: { volume: 2 } }),
    (error) => error.code === 'SOUND_SETTINGS_VOLUME_INVALID'
  );
  assert.equal(store.getSnapshot(), before);
  assert.equal(store.getSnapshot().revision, 1);
});

test('markApplied transitions the current saved revision to applied', () => {
  const store = new SettingsStore();
  const saved = store.updateSoundSettings({ globalSoundEnabled: false });
  const applied = store.markApplied(saved.revision);

  assert.equal(applied.revision, saved.revision);
  assert.equal(applied.savedRevision, saved.revision);
  assert.equal(applied.appliedRevision, saved.revision);
  assert.equal(applied.status, SETTINGS_STORE_STATUSES.APPLIED);
  assert.equal(applied.applyError, null);
});

test('stale apply results cannot overwrite a newer saved revision', () => {
  const store = new SettingsStore();
  const first = store.updateSoundSettings({ globalSoundEnabled: false });
  const second = store.updateSoundSettings({ globalSoundEnabled: true });

  assert.throws(
    () => store.markApplied(first.revision),
    (error) => error.code === 'SETTINGS_STORE_REVISION_STALE'
  );
  assert.equal(store.getSnapshot().revision, second.revision);
  assert.equal(store.getSnapshot().status, SETTINGS_STORE_STATUSES.SAVED);
});

test('markApplyFailed preserves saved settings and records an apply error', () => {
  const store = new SettingsStore();
  const saved = store.updateSoundSettings({ globalSoundEnabled: false });
  const failed = store.markApplyFailed(saved.revision, {
    code: 'RUNTIME_UNAVAILABLE',
    message: 'Runtime is offline'
  });

  assert.equal(failed.status, SETTINGS_STORE_STATUSES.APPLY_FAILED);
  assert.equal(failed.appliedRevision, 0);
  assert.deepEqual(failed.applyError, {
    code: 'RUNTIME_UNAVAILABLE',
    message: 'Runtime is offline'
  });
  assert.equal(Object.isFrozen(failed.applyError), true);
  assert.equal(failed.settings.globalSoundEnabled, false);
});

test('SettingsStore rejects invalid revisions and malformed apply errors', () => {
  const store = new SettingsStore();

  assert.throws(
    () => store.markApplied(0),
    (error) => error.code === 'SETTINGS_STORE_REVISION_INVALID'
  );
  assert.throws(
    () => store.markApplyFailed(1, null),
    (error) => error.code === 'SETTINGS_STORE_APPLY_FAILED'
  );
  assert.throws(
    () => store.updateSoundSettings(null),
    (error) => error.code === 'SETTINGS_STORE_PATCH_INVALID'
  );
});

test('SettingsStore does not mutate update patches', () => {
  const store = new SettingsStore();
  const patch = {
    defaultPolicy: { enabled: true },
    typePolicies: { 'task.completed': { cue: 'success' } }
  };
  const before = structuredClone(patch);

  store.updateSoundSettings(patch);

  assert.deepEqual(patch, before);
});

test('restoreSnapshot restores settings and revision but resets application state', () => {
  const store = new SettingsStore();
  const persisted = createSettingsStoreSnapshot({
    globalSoundEnabled: false,
    defaultPolicy: { enabled: true, cue: 'success' }
  }, 7, { updatedAt: '2026-08-04T12:00:00.000Z' });

  const restored = store.restoreSnapshot(persisted);

  assert.equal(restored.revision, 7);
  assert.equal(restored.savedRevision, 7);
  assert.equal(restored.appliedRevision, 0);
  assert.equal(restored.status, SETTINGS_STORE_STATUSES.SAVED);
  assert.equal(restored.applyError, null);
  assert.equal(restored.settings.globalSoundEnabled, false);
});
