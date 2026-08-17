import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSoundSettingsPersistenceFromHostContext,
  resolveSoundSettingsPersistenceConfig
} from '../../plugin/domain/sound-settings-persistence-config.js';
import { SoundSettingsStore } from '../../plugin/domain/sound-settings-store.js';

test('sound persistence defaults to sound-settings.json below dataDir', () => {
  assert.deepEqual(resolveSoundSettingsPersistenceConfig({ dataDir: 'C:\\Hana\\data' }), {
    enabled: true, filePath: 'C:\\Hana\\data\\sound-settings.json', debounceMs: 100
  });
});

test('sound persistence accepts independent enabled, path, and debounce settings', () => {
  const resolved = resolveSoundSettingsPersistenceConfig({
    dataDir: 'C:\\Hana\\data',
    config: { soundSettingsPersistenceEnabled: true, soundSettingsPersistencePath: 'D:\\sound.json', soundSettingsPersistenceDebounceMs: 250 }
  });
  assert.deepEqual(resolved, { enabled: true, filePath: 'D:\\sound.json', debounceMs: 250 });
  assert.deepEqual(resolveSoundSettingsPersistenceConfig({ config: { soundSettingsPersistenceEnabled: false } }), {
    enabled: false, filePath: null, debounceMs: null
  });
});

test('sound persistence validates config and creates an isolated coordinator', () => {
  assert.throws(() => resolveSoundSettingsPersistenceConfig({ config: { soundSettingsPersistencePath: 'x' } }), /dataDir/);
  assert.throws(() => resolveSoundSettingsPersistenceConfig({ dataDir: 'C:\\data', config: { soundSettingsPersistenceDebounceMs: -1 } }), /non-negative/);
  const store = new SoundSettingsStore();
  const coordinator = createSoundSettingsPersistenceFromHostContext({ dataDir: 'C:\\data' }, { store });
  assert.equal(coordinator.store, store);
  assert.equal(coordinator.filePath, 'C:\\data\\sound-settings.json');
});
