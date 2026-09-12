import assert from 'node:assert/strict';
import test from 'node:test';

import { createNotificationCenterServices } from '../../plugin/services/notification-center-services.js';

test('notification center services expose only the route interface and bind receivers', () => {
  const notificationApi = {
    prefix: 'notification',
    listNotifications() { return `${this.prefix}:list`; },
    getNotification(id) { return `${this.prefix}:get:${id}`; },
    setNotificationStatus(id, status) { return `${this.prefix}:set:${id}:${status}`; },
    setNotificationsStatus(ids, status) { return `${this.prefix}:set-many:${ids.join(',')}:${status}`; },
    removeNotification(id) { return `${this.prefix}:remove:${id}`; },
    removeNotifications(ids) { return `${this.prefix}:remove-many:${ids.join(',')}`; },
    extra() { return 'must not leak'; }
  };
  const settingsApi = {
    prefix: 'settings',
    getNotificationDisplaySettings() { return `${this.prefix}:display`; },
    updateNotificationDisplaySettings(patch) { return { prefix: this.prefix, patch }; },
    getSoundSettingsStatus() { return `${this.prefix}:sound`; },
    getVisualSettingsStatus() { return `${this.prefix}:visual`; },
    getEventPresentationSettings() { return `${this.prefix}:events`; },
    extra() { return 'must not leak'; }
  };

  const services = createNotificationCenterServices({ notificationApi, settingsApi });

  assert.deepEqual(Object.keys(services).sort(), [
    'getEventPresentationSettings',
    'getNotification',
    'getNotificationDisplaySettings',
    'getSoundSettingsStatus',
    'getVisualSettingsStatus',
    'listNotifications',
    'removeNotification',
    'removeNotifications',
    'setNotificationStatus',
    'setNotificationsStatus',
    'updateNotificationDisplaySettings'
  ]);
  assert.equal(Object.isFrozen(services), true);
  assert.equal(services.listNotifications(), 'notification:list');
  assert.equal(services.getNotification('n1'), 'notification:get:n1');
  assert.equal(services.setNotificationStatus('n1', 'read'), 'notification:set:n1:read');
  assert.equal(services.setNotificationsStatus(['n1'], 'read'), 'notification:set-many:n1:read');
  assert.equal(services.removeNotification('n1'), 'notification:remove:n1');
  assert.equal(services.removeNotifications(['n1']), 'notification:remove-many:n1');
  assert.equal(services.getNotificationDisplaySettings(), 'settings:display');
  assert.deepEqual(services.updateNotificationDisplaySettings({ limit: 30 }), { prefix: 'settings', patch: { limit: 30 } });
  assert.equal(services.getSoundSettingsStatus(), 'settings:sound');
  assert.equal(services.getVisualSettingsStatus(), 'settings:visual');
  assert.equal(services.getEventPresentationSettings(), 'settings:events');
  assert.equal('extra' in services, false);
  assert.equal('plugin' in services, false);
});

test('notification center services prefer notification API methods when both APIs provide one', () => {
  const notificationApi = { removeNotification: () => 'notification' };
  const settingsApi = { removeNotification: () => 'settings' };
  const services = createNotificationCenterServices({ notificationApi, settingsApi });
  assert.equal(services.removeNotification('n1'), 'notification');
});
