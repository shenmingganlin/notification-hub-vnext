const NOTIFICATION_METHODS = Object.freeze([
  'listNotifications',
  'getNotification',
  'setNotificationStatus',
  'setNotificationsStatus',
  'removeNotification',
  'removeNotifications'
]);

const SETTINGS_METHODS = Object.freeze([
  'getNotificationDisplaySettings',
  'updateNotificationDisplaySettings',
  'getSoundSettingsStatus',
  'getVisualSettingsStatus',
  'getEventPresentationSettings'
]);

function bindMethods(target, source, methodNames) {
  for (const methodName of methodNames) {
    if (typeof source?.[methodName] !== 'function' || target[methodName]) continue;
    target[methodName] = source[methodName].bind(source);
  }
}

export function createNotificationCenterServices({ notificationApi, settingsApi } = {}) {
  const services = {};
  bindMethods(services, notificationApi, NOTIFICATION_METHODS);
  bindMethods(services, settingsApi, [...NOTIFICATION_METHODS, ...SETTINGS_METHODS]);
  bindMethods(services, notificationApi, SETTINGS_METHODS);
  return Object.freeze(services);
}
