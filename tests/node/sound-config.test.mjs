import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOUND_CONFIG_DEFAULTS,
  resolveGlobalSoundConfig
} from '../../plugin/domain/sound-config.js';

test('missing global sound configuration defaults to enabled', () => {
  const result = resolveGlobalSoundConfig();

  assert.deepEqual(result, {
    enabled: SOUND_CONFIG_DEFAULTS.globalSoundEnabled,
    diagnostic: null
  });
});

test('explicit boolean global sound configuration is preserved', () => {
  assert.deepEqual(resolveGlobalSoundConfig({ config: { globalSoundEnabled: false } }), {
    enabled: false,
    diagnostic: null
  });
  assert.deepEqual(resolveGlobalSoundConfig({ config: { globalSoundEnabled: true } }), {
    enabled: true,
    diagnostic: null
  });
});

test('host configuration wrappers and explicit overrides use the established boundary', () => {
  assert.deepEqual(resolveGlobalSoundConfig({
    config: { get() { return { globalSoundEnabled: false }; } }
  }), {
    enabled: false,
    diagnostic: null
  });
  assert.deepEqual(resolveGlobalSoundConfig({
    config: { getAll() { return { globalSoundEnabled: false }; } },
    overrides: { globalSoundEnabled: true }
  }), {
    enabled: true,
    diagnostic: null
  });
});

test('invalid global sound configuration safely disables sound', () => {
  const result = resolveGlobalSoundConfig({
    config: { globalSoundEnabled: 'false' }
  });

  assert.deepEqual(result, {
    enabled: false,
    diagnostic: 'NOTIFICATION_SOUND_CONFIG_INVALID'
  });
});

test('configuration read failure safely disables sound', () => {
  const result = resolveGlobalSoundConfig({
    config: {
      getAll() {
        throw new Error('config unavailable');
      }
    }
  });

  assert.deepEqual(result, {
    enabled: false,
    diagnostic: 'NOTIFICATION_SOUND_CONFIG_READ_FAILED'
  });
});

test('resolved global sound configuration is frozen and does not mutate input', () => {
  const config = { globalSoundEnabled: false };
  const result = resolveGlobalSoundConfig({ config });

  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(config, { globalSoundEnabled: false });
});
