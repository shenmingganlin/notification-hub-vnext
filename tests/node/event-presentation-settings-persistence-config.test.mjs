import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVENT_PRESENTATION_SETTINGS_PERSISTENCE_DEFAULTS,
  resolveEventPresentationSettingsPersistenceConfig
} from '../../plugin/domain/event-presentation-settings-persistence-config.js';

test('event presentation persistence resolves independent path and debounce settings', () => {
  const resolved = resolveEventPresentationSettingsPersistenceConfig({
    dataDir: 'C:\\Hana\\data',
    config: {
      eventPresentationSettingsPersistenceEnabled: true,
      eventPresentationSettingsPersistencePath: 'D:\\event-presentation.json',
      eventPresentationSettingsPersistenceDebounceMs: 250
    }
  });
  assert.deepEqual(resolved, {
    enabled: true,
    filePath: 'D:\\event-presentation.json',
    debounceMs: 250
  });
});

test('event presentation persistence can be disabled without requiring dataDir', () => {
  assert.deepEqual(resolveEventPresentationSettingsPersistenceConfig({
    config: { eventPresentationSettingsPersistenceEnabled: false }
  }), {
    enabled: false,
    filePath: null,
    debounceMs: null
  });
});

test('event presentation persistence uses the isolated default file', () => {
  assert.deepEqual(EVENT_PRESENTATION_SETTINGS_PERSISTENCE_DEFAULTS, {
    enabled: true,
    relativePath: 'event-presentation-settings.json',
    debounceMs: 100
  });
  assert.throws(
    () => resolveEventPresentationSettingsPersistenceConfig({ config: {} }),
    (error) => error.code === 'EVENT_PRESENTATION_SETTINGS_DATA_DIR_INVALID'
  );
});
