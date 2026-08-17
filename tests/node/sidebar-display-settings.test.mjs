import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SIDEBAR_DISPLAY_LIMIT_DEFAULT,
  SIDEBAR_DISPLAY_LIMIT_MAX,
  SIDEBAR_DISPLAY_LIMIT_PRESETS,
  createSidebarDisplaySettings,
  resolveSidebarDisplayLimit,
  validateSidebarDisplaySettings
} from '../../plugin/domain/sidebar-display-settings.js';

test('sidebar display settings default to 3 and support numeric presets', () => {
  assert.equal(SIDEBAR_DISPLAY_LIMIT_DEFAULT, 3);
  assert.deepEqual(SIDEBAR_DISPLAY_LIMIT_PRESETS, [1, 3, 5, 10, 'custom']);
  assert.deepEqual(createSidebarDisplaySettings(), { mode: 'preset', limit: 3 });
  assert.equal(resolveSidebarDisplayLimit({ mode: 'preset', limit: 10 }), 10);
  assert.equal(SIDEBAR_DISPLAY_LIMIT_MAX, 20);
});

test('sidebar display settings support custom limits within the safe range', () => {
  assert.deepEqual(createSidebarDisplaySettings({ mode: 'custom', limit: 7 }), { mode: 'custom', limit: 7 });
  assert.equal(resolveSidebarDisplayLimit({ mode: 'custom', limit: 20 }), 20);
});

test('sidebar display settings reject invalid values', () => {
  assert.throws(
    () => createSidebarDisplaySettings({ mode: 'preset', limit: 2 }),
    (error) => error.code === 'SIDEBAR_DISPLAY_SETTINGS_PRESET_INVALID'
  );
  assert.throws(
    () => createSidebarDisplaySettings({ mode: 'custom', limit: 0 }),
    (error) => error.code === 'SIDEBAR_DISPLAY_SETTINGS_CUSTOM_INVALID'
  );
  assert.throws(
    () => createSidebarDisplaySettings({ mode: 'custom', limit: 21 }),
    (error) => error.code === 'SIDEBAR_DISPLAY_SETTINGS_CUSTOM_INVALID'
  );
  assert.throws(
    () => validateSidebarDisplaySettings({ mode: 'unexpected', limit: 3 }),
    (error) => error.code === 'SIDEBAR_DISPLAY_SETTINGS_MODE_INVALID'
  );
  assert.throws(
    () => validateSidebarDisplaySettings({ mode: 'preset', limit: 3, extra: true }),
    (error) => error.code === 'SIDEBAR_DISPLAY_SETTINGS_FIELD_UNKNOWN'
  );
});
