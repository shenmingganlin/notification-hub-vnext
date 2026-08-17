import assert from 'node:assert/strict';
import test from 'node:test';

import { SettingsStore } from '../../plugin/domain/settings-store.js';
import { createSettingsStoreSnapshot } from '../../plugin/domain/settings-store-snapshot.js';
import { SettingsStorePersistenceCoordinator } from '../../plugin/domain/settings-store-persistence.js';

test('SettingsStore persistence saves only the latest debounced snapshot', async () => {
  const store = new SettingsStore();
  const saved = [];
  const timers = [];
  const coordinator = new SettingsStorePersistenceCoordinator({
    store,
    filePath: 'settings.json',
    debounceMs: 50,
    save: async (snapshot, filePath) => saved.push({ snapshot, filePath }),
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel: (timer) => { timer.cancelled = true; }
  });

  coordinator.observe();
  store.updateSoundSettings({ globalSoundEnabled: false });
  store.updateSoundSettings({ workModeMuted: true });

  assert.equal(timers.length, 2);
  assert.equal(timers[0].cancelled, true);
  assert.equal(saved.length, 0);

  timers[1].callback();
  await coordinator.flush();

  assert.equal(saved.length, 1);
  assert.equal(saved[0].filePath, 'settings.json');
  assert.equal(saved[0].snapshot.revision, 3);
  assert.equal(saved[0].snapshot.settings.globalSoundEnabled, false);
  assert.equal(saved[0].snapshot.settings.workModeMuted, true);
});

test('restore loads a snapshot into SettingsStore without scheduling a save', async () => {
  const store = new SettingsStore();
  const timers = [];
  const persisted = createSettingsStoreSnapshot({ globalSoundEnabled: false }, 8);
  const coordinator = new SettingsStorePersistenceCoordinator({
    store,
    filePath: 'settings.json',
    load: async () => persisted,
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel: (timer) => { timer.cancelled = true; }
  });

  coordinator.observe();
  await coordinator.restore();

  assert.equal(store.getSnapshot().revision, 8);
  assert.equal(store.getSnapshot().status, 'saved');
  assert.equal(timers.length, 0);
});

test('save failure retains the pending snapshot and emits a diagnostic for retry', async () => {
  const store = new SettingsStore();
  const diagnostics = [];
  let attempts = 0;
  const coordinator = new SettingsStorePersistenceCoordinator({
    store,
    filePath: 'settings.json',
    save: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('disk unavailable');
    },
    schedule: (callback) => ({ callback }),
    cancel: () => {}
  });
  coordinator.on('diagnostic', (diagnostic) => diagnostics.push(diagnostic));
  coordinator.observe();
  store.updateSoundSettings({ globalSoundEnabled: false });

  await assert.rejects(() => coordinator.flush(), (error) => error.code === 'SETTINGS_STORE_PERSIST_FAILED');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'SETTINGS_STORE_PERSIST_FAILED');

  await coordinator.flush();
  assert.equal(attempts, 2);
});

test('persistence coordinator validates its construction boundary', () => {
  assert.throws(
    () => new SettingsStorePersistenceCoordinator({ filePath: 'settings.json' }),
    (error) => error.code === 'SETTINGS_STORE_PERSISTENCE_INVALID'
  );
  assert.throws(
    () => new SettingsStorePersistenceCoordinator({ store: new SettingsStore() }),
    (error) => error.code === 'SETTINGS_STORE_PATH_INVALID'
  );
});
