import assert from 'node:assert/strict';
import test from 'node:test';

import { SoundSettingsStore } from '../../plugin/domain/sound-settings-store.js';
import { SoundSettingsPersistenceCoordinator } from '../../plugin/domain/sound-settings-store-persistence.js';

test('sound persistence saves the latest debounced profile snapshot', async () => {
  const store = new SoundSettingsStore();
  const saved = [];
  const timers = [];
  const coordinator = new SoundSettingsPersistenceCoordinator({
    store, filePath: 'sound-settings.json', debounceMs: 50,
    save: async (snapshot, filePath) => saved.push({ snapshot, filePath }),
    schedule: (callback, delay) => { const timer = { callback, delay, cancelled: false }; timers.push(timer); return timer; },
    cancel: (timer) => { timer.cancelled = true; }
  });
  coordinator.observe();
  store.updateSoundSettings({ globalSoundEnabled: false });
  store.updateSoundSettings({ workModeMuted: true });
  timers[1].callback();
  await coordinator.flush();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].snapshot.version, 1);
  assert.equal(saved[0].snapshot.revision, 3);
  assert.equal(saved[0].snapshot.settings.workModeMuted, true);
});

test('sound restore does not schedule a save and bad snapshots have stable load errors', async () => {
  const store = new SoundSettingsStore();
  const coordinator = new SoundSettingsPersistenceCoordinator({
    store, filePath: 'sound-settings.json', load: async () => { throw Object.assign(new Error('bad'), { code: 'SOUND_SETTINGS_SNAPSHOT_PARSE_FAILED' }); },
    schedule: () => { throw new Error('must not schedule'); }, cancel: () => {}
  });
  coordinator.observe();
  await assert.rejects(() => coordinator.restore(), (error) => error.code === 'SOUND_SETTINGS_LOAD_FAILED');
});

test('save failure retains pending snapshot for retry', async () => {
  const store = new SoundSettingsStore();
  let attempts = 0;
  const coordinator = new SoundSettingsPersistenceCoordinator({
    store, filePath: 'sound-settings.json', save: async () => { attempts += 1; if (attempts === 1) throw new Error('disk'); },
    schedule: (callback) => ({ callback }), cancel: () => {}
  });
  coordinator.observe();
  store.updateSoundSettings({ globalSoundEnabled: false });
  await assert.rejects(() => coordinator.flush(), (error) => error.code === 'SOUND_SETTINGS_PERSIST_FAILED');
  await coordinator.flush();
  assert.equal(attempts, 2);
});
