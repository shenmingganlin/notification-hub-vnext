import assert from 'node:assert/strict';
import test from 'node:test';

import { SettingsStore } from '../../plugin/domain/settings-store.js';
import { createRuntimeConfigUpdate } from '../../plugin/domain/runtime-config.js';


test('runtime config update projects the current settings revision and audio values', () => {
  const store = new SettingsStore({
    initialSettings: {
      globalSoundEnabled: false,
      defaultPolicy: { volume: 0.35 }
    }
  });
  const snapshot = store.updateSoundSettings({ workModeMuted: true });

  assert.deepEqual(createRuntimeConfigUpdate(snapshot), {
    revision: snapshot.revision,
    audio: {
      enabled: false,
      volume: 0.35
    }
  });
});

test('runtime config update rejects stale or malformed settings snapshots', () => {
  assert.throws(
    () => createRuntimeConfigUpdate({ revision: 0, settings: {} }),
    (error) => error.code === 'RUNTIME_CONFIG_REVISION_INVALID'
  );
  assert.throws(
    () => createRuntimeConfigUpdate({ revision: 1, settings: { unknown: true } }),
    (error) => error.code === 'RUNTIME_CONFIG_SETTINGS_INVALID'
  );
});
