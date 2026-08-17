import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOTIFICATION_DISPLAY_LIMIT_DEFAULT,
  NOTIFICATION_DISPLAY_LIMIT_MAX,
  NOTIFICATION_DISPLAY_LIMIT_PRESETS,
  createNotificationDisplaySettings,
  resolveNotificationDisplayLimit,
  validateNotificationDisplaySettings
} from '../../plugin/domain/notification-display-settings.js';

test('notification display settings default to 100 and resolve numeric presets', () => {
  const settings = createNotificationDisplaySettings();

  assert.equal(NOTIFICATION_DISPLAY_LIMIT_DEFAULT, 100);
  assert.deepEqual(NOTIFICATION_DISPLAY_LIMIT_PRESETS, [30, 100, 500, 1000, 'unlimited', 'custom']);
  assert.equal(settings.mode, 'preset');
  assert.equal(settings.limit, 100);
  assert.equal(settings.cardLifetimeSeconds, 120);
  assert.equal(resolveNotificationDisplayLimit(settings), 100);
});

test('notification display settings support unlimited and custom limits', () => {
  assert.equal(resolveNotificationDisplayLimit(createNotificationDisplaySettings({ mode: 'unlimited' })), null);
  assert.deepEqual(createNotificationDisplaySettings({ mode: 'custom', limit: 321 }), { mode: 'custom', limit: 321, cardLifetimeSeconds: 120 });
  assert.equal(createNotificationDisplaySettings({ cardLifetimeSeconds: 0 }).cardLifetimeSeconds, 0);
  assert.equal(resolveNotificationDisplayLimit({ mode: 'custom', limit: 321 }), 321);
  assert.equal(NOTIFICATION_DISPLAY_LIMIT_MAX, 10000);
});

test('notification display settings reject invalid modes and limits', () => {
  assert.throws(
    () => createNotificationDisplaySettings({ mode: 'preset', limit: 31 }),
    (error) => error.code === 'NOTIFICATION_DISPLAY_SETTINGS_PRESET_INVALID'
  );
  assert.throws(
    () => createNotificationDisplaySettings({ mode: 'custom', limit: 0 }),
    (error) => error.code === 'NOTIFICATION_DISPLAY_SETTINGS_CUSTOM_INVALID'
  );
  assert.throws(
    () => createNotificationDisplaySettings({ cardLifetimeSeconds: -1 }),
    (error) => error.code === 'NOTIFICATION_CARD_LIFETIME_INVALID'
  );
  assert.throws(
    () => createNotificationDisplaySettings({ cardLifetimeSeconds: 3601 }),
    (error) => error.code === 'NOTIFICATION_CARD_LIFETIME_INVALID'
  );
  assert.throws(
    () => createNotificationDisplaySettings({ mode: 'custom', limit: 10001 }),
    (error) => error.code === 'NOTIFICATION_DISPLAY_SETTINGS_CUSTOM_INVALID'
  );
  assert.throws(
    () => createNotificationDisplaySettings({ mode: 'unexpected', limit: 100 }),
    (error) => error.code === 'NOTIFICATION_DISPLAY_SETTINGS_MODE_INVALID'
  );
  assert.throws(
    () => validateNotificationDisplaySettings({ mode: 'custom', limit: 1.5 }),
    (error) => error.code === 'NOTIFICATION_DISPLAY_SETTINGS_CUSTOM_INVALID'
  );
});
