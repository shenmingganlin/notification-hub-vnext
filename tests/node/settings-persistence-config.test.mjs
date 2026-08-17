import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSettingsPersistenceFromHostContext,
  resolveSettingsPersistenceConfig
} from '../../plugin/domain/settings-persistence-config.js';
import { SettingsStore } from '../../plugin/domain/settings-store.js';

test('settings persistence config resolves settings.json below dataDir by default', () => {
  const resolved = resolveSettingsPersistenceConfig({ dataDir: 'C:\\Hana\\data' });

  assert.equal(resolved.enabled, true);
  assert.equal(resolved.filePath, 'C:\\Hana\\data\\settings.json');
  assert.equal(resolved.debounceMs, 100);
});

test('settings persistence config accepts an absolute path and debounce', () => {
  const resolved = resolveSettingsPersistenceConfig({
    dataDir: 'C:\\Hana\\data',
    config: {
      settingsPersistencePath: 'D:\\Profile\\notification-settings.json',
      settingsPersistenceDebounceMs: 250
    }
  });

  assert.equal(resolved.filePath, 'D:\\Profile\\notification-settings.json');
  assert.equal(resolved.debounceMs, 250);
});

test('settings persistence can be disabled and factory creates a coordinator when enabled', () => {
  assert.deepEqual(
    resolveSettingsPersistenceConfig({ config: { settingsPersistenceEnabled: false } }),
    { enabled: false, filePath: null, debounceMs: null }
  );
  const store = new SettingsStore();
  const coordinator = createSettingsPersistenceFromHostContext({
    dataDir: 'C:\\Hana\\data',
    config: { settingsPersistenceEnabled: true }
  }, { store });

  assert.equal(coordinator.store, store);
  assert.equal(coordinator.filePath, 'C:\\Hana\\data\\settings.json');
});

test('settings persistence config rejects invalid paths, debounce, and config reads', () => {
  assert.throws(
    () => resolveSettingsPersistenceConfig({ config: { settingsPersistencePath: 'settings.json' } }),
    (error) => error.code === 'SETTINGS_STORE_DATA_DIR_INVALID'
  );
  assert.throws(
    () => resolveSettingsPersistenceConfig({ dataDir: 'C:\\Hana\\data', config: { settingsPersistenceDebounceMs: -1 } }),
    (error) => error.code === 'SETTINGS_STORE_DEBOUNCE_INVALID'
  );
  assert.throws(
    () => resolveSettingsPersistenceConfig({ dataDir: 'C:\\Hana\\data', config: { getAll() { throw new Error('broken'); } } }),
    (error) => error.code === 'SETTINGS_STORE_CONFIG_READ_FAILED'
  );
});
