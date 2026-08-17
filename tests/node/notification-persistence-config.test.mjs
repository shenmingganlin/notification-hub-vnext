import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNotificationPersistence,
  createNotificationPersistenceFromHostContext,
  resolveNotificationPersistenceConfig
} from '../../plugin/domain/notification-persistence-config.js';

test('Notification persistence config resolves the default path below dataDir', () => {
  const resolved = resolveNotificationPersistenceConfig({
    dataDir: 'C:\\Hana\\data\\notification-hub-vnext',
    config: {}
  });

  assert.deepEqual(resolved, {
    enabled: true,
    filePath: 'C:\\Hana\\data\\notification-hub-vnext\\notification-store.json',
    debounceMs: 100
  });
});

test('Notification persistence config accepts an explicit absolute path and debounce', () => {
  const resolved = resolveNotificationPersistenceConfig({
    dataDir: 'C:\\Hana\\data',
    config: {
      notificationPersistencePath: 'D:\\Snapshots\\notifications.json',
      notificationPersistenceDebounceMs: 250
    }
  });

  assert.equal(resolved.filePath, 'D:\\Snapshots\\notifications.json');
  assert.equal(resolved.debounceMs, 250);
});

test('Notification persistence can be disabled without dataDir', () => {
  assert.deepEqual(resolveNotificationPersistenceConfig({
    config: { notificationPersistenceEnabled: false }
  }), {
    enabled: false,
    filePath: null,
    debounceMs: null
  });
  assert.equal(createNotificationPersistence({
    config: { notificationPersistenceEnabled: false }
  }), null);
});

test('Notification persistence config reads Hana config wrappers', () => {
  const coordinator = createNotificationPersistenceFromHostContext({
    dataDir: 'C:\\Hana\\data',
    config: {
      getAll: () => ({ notificationPersistenceDebounceMs: 75 })
    }
  }, { save: async () => {} });

  assert.equal(coordinator.filePath, 'C:\\Hana\\data\\notification-store.json');
  assert.equal(coordinator.debounceMs, 75);
});

test('Notification persistence config rejects invalid path, dataDir, and debounce', () => {
  assert.throws(
    () => resolveNotificationPersistenceConfig({
      dataDir: 'C:\\Hana\\data',
      config: { notificationPersistencePath: '' }
    }),
    (error) => error.code === 'NOTIFICATION_STORE_PATH_INVALID'
  );
  assert.throws(
    () => resolveNotificationPersistenceConfig({
      dataDir: 'C:\\Hana\\data',
      config: { notificationPersistenceDebounceMs: -1 }
    }),
    (error) => error.code === 'NOTIFICATION_STORE_DEBOUNCE_INVALID'
  );
  assert.throws(
    () => resolveNotificationPersistenceConfig({ config: {} }),
    (error) => error.code === 'NOTIFICATION_STORE_DATA_DIR_INVALID'
  );
});
