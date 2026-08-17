import assert from 'node:assert/strict';
import test from 'node:test';

import { NotificationStore } from '../../plugin/domain/notification-store.js';
import { createNotificationStoreSnapshot } from '../../plugin/domain/notification-store-snapshot.js';
import { NotificationStorePersistenceCoordinator } from '../../plugin/domain/notification-store-persistence.js';

function notification(notificationId, createdAt = '2020-01-01T08:00:00.000Z') {
  return {
    notificationId,
    traceId: `trace-${notificationId}`,
    createdAt,
    updatedAt: createdAt,
    type: 'message',
    importance: 'normal',
    source: 'test',
    title: notificationId,
    content: `内容-${notificationId}`,
    metadata: {},
    contentPolicy: {},
    runtimeHints: {},
    status: 'received'
  };
}

function snapshot(...records) {
  return createNotificationStoreSnapshot(records, {
    updatedAt: '2026-08-04T08:10:00.000Z'
  });
}

test('NotificationStore emits one change event for each real mutation with frozen records', () => {
  const store = new NotificationStore();
  const changes = [];
  const unsubscribe = store.subscribe((change) => changes.push(change));

  const first = store.add(notification('first'));
  const updated = store.update(first.notificationId, { title: 'updated' });
  store.setStatus(first.notificationId, 'shown');
  store.remove(first.notificationId);
  store.clear();
  unsubscribe();
  store.add(notification('after-unsubscribe'));

  assert.deepEqual(changes.map((change) => change.type), [
    'add', 'update', 'status', 'remove'
  ]);
  assert.equal(changes[0].record.notificationId, 'first');
  assert.equal(changes[1].record.title, 'updated');
  assert.equal(changes[2].record.status, 'shown');
  assert.equal(changes[3].record, null);
  assert.ok(Object.isFrozen(changes[0].records));
  assert.ok(Object.isFrozen(changes[0].records[0]));
});

test('NotificationStore emits clear only when it removes records and replaces records atomically', () => {
  const store = new NotificationStore();
  const changes = [];
  store.subscribe((change) => changes.push(change));
  store.clear();
  store.replaceAll([notification('first'), notification('second', '2026-08-04T08:01:00.000Z')]);

  assert.deepEqual(changes.map((change) => change.type), ['replace']);
  assert.equal(store.size, 2);
  assert.deepEqual(store.list().map((record) => record.notificationId), ['second', 'first']);
  assert.ok(Object.isFrozen(changes[0].records));

  assert.throws(
    () => store.replaceAll([notification('duplicate'), notification('duplicate')]),
    (error) => error.code === 'NOTIFICATION_STORE_DUPLICATE_ID'
  );
  assert.equal(store.size, 2);
});

test('NotificationStorePersistenceCoordinator persists a batch status change as one snapshot', async () => {
  const store = new NotificationStore();
  store.add(notification('first'));
  store.add(notification('second', '2026-08-04T08:01:00.000Z'));
  const saved = [];
  const scheduled = [];
  const coordinator = new NotificationStorePersistenceCoordinator({
    store,
    filePath: 'notifications.json',
    debounceMs: 25,
    save: async (nextSnapshot) => saved.push(nextSnapshot),
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      scheduled.push(timer);
      return timer;
    },
    cancel: (timer) => { timer.cancelled = true; }
  });

  coordinator.observe();
  store.setStatuses(['first', 'second'], 'read');
  assert.equal(scheduled.length, 1);
  scheduled[0].callback();
  await coordinator.flush();

  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].records.map((record) => record.status), ['read', 'read']);
});

test('NotificationStorePersistenceCoordinator saves only the latest debounced snapshot', async () => {
  const store = new NotificationStore();
  const saved = [];
  const scheduled = [];
  const coordinator = new NotificationStorePersistenceCoordinator({
    store,
    filePath: 'notifications.json',
    debounceMs: 25,
    save: async (nextSnapshot, filePath) => saved.push({ nextSnapshot, filePath }),
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      scheduled.push(timer);
      return timer;
    },
    cancel: (timer) => { timer.cancelled = true; }
  });

  coordinator.observe();
  store.add(notification('first'));
  store.add(notification('second', '2026-08-04T08:01:00.000Z'));
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[0].cancelled, true);
  assert.equal(saved.length, 0);

  scheduled[1].callback();
  await coordinator.flush();
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].nextSnapshot.records.map((record) => record.notificationId), [
    'first', 'second'
  ]);
  assert.equal(saved[0].filePath, 'notifications.json');
});

test('NotificationStorePersistenceCoordinator flush waits for pending save and supports explicit observe', async () => {
  const store = new NotificationStore();
  const saves = [];
  let resolveSave;
  const savePromise = new Promise((resolve) => { resolveSave = resolve; });
  const coordinator = new NotificationStorePersistenceCoordinator({
    store,
    filePath: 'notifications.json',
    debounceMs: 60_000,
    save: async (nextSnapshot) => {
      saves.push(nextSnapshot);
      await savePromise;
    }
  });

  coordinator.observe();
  store.add(notification('first'));
  const flush = coordinator.flush();
  await Promise.resolve();
  assert.equal(saves.length, 1);
  assert.equal(flush instanceof Promise, true);
  resolveSave();
  await flush;
});

test('NotificationStorePersistenceCoordinator restores valid snapshots and handles absent files', async () => {
  const store = new NotificationStore();
  store.add(notification('stale'));
  const loaded = snapshot(notification('restored'));
  const loads = [loaded, null];
  const coordinator = new NotificationStorePersistenceCoordinator({
    store,
    filePath: 'notifications.json',
    load: async () => loads.shift()
  });

  const restored = await coordinator.restore();
  assert.equal(restored, loaded);
  assert.deepEqual(store.list().map((record) => record.notificationId), ['restored']);

  const empty = await coordinator.restore();
  assert.equal(empty, null);
  assert.equal(store.size, 0);
});

test('NotificationStorePersistenceCoordinator preserves memory state and reports load failures', async () => {
  const store = new NotificationStore();
  store.add(notification('memory'));
  const diagnostics = [];
  const coordinator = new NotificationStorePersistenceCoordinator({
    store,
    filePath: 'notifications.json',
    load: async () => {
      throw Object.assign(new Error('corrupted'), {
        code: 'NOTIFICATION_STORE_LOAD_FAILED',
        details: { path: 'notifications.json', cause: 'NOTIFICATION_STORE_SNAPSHOT_INVALID' }
      });
    }
  });
  coordinator.on('diagnostic', (diagnostic) => diagnostics.push(diagnostic));

  await assert.rejects(
    coordinator.restore(),
    (error) => error.code === 'NOTIFICATION_STORE_LOAD_FAILED'
  );
  assert.deepEqual(store.list().map((record) => record.notificationId), ['memory']);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'NOTIFICATION_STORE_LOAD_FAILED');
  assert.equal(diagnostics[0].details.path, 'notifications.json');
  assert.ok(diagnostics[0].timestamp);
});

test('NotificationStorePersistenceCoordinator keeps failed snapshot for retry and reports persist failure', async () => {
  const store = new NotificationStore();
  const diagnostics = [];
  let attempts = 0;
  const coordinator = new NotificationStorePersistenceCoordinator({
    store,
    filePath: 'notifications.json',
    debounceMs: 60_000,
    save: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      }
    }
  });
  coordinator.on('diagnostic', (diagnostic) => diagnostics.push(diagnostic));

  coordinator.observe();
  store.add(notification('retry'));
  await assert.rejects(
    coordinator.flush(),
    (error) => error.code === 'NOTIFICATION_STORE_PERSIST_FAILED'
  );
  assert.equal(store.size, 1);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'NOTIFICATION_STORE_PERSIST_FAILED');
  assert.equal(diagnostics[0].details.path, 'notifications.json');
  assert.equal(diagnostics[0].details.cause, 'ENOSPC');

  await coordinator.flush();
  assert.equal(attempts, 2);
});
