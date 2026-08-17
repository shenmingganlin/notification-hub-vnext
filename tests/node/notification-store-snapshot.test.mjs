import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOTIFICATION_STORE_VERSION,
  createNotificationStoreSnapshot,
  parseNotificationStoreSnapshot,
  serializeNotificationStoreSnapshot,
  validateNotificationStoreSnapshot
} from '../../plugin/domain/notification-store-snapshot.js';

const firstRecord = {
  notificationId: 'notification-first',
  traceId: 'trace-first',
  createdAt: '2026-08-04T08:00:00.000Z',
  updatedAt: '2026-08-04T08:00:00.000Z',
  type: 'message',
  importance: 'normal',
  source: 'test',
  title: '第一条',
  content: '内容一',
  metadata: {},
  contentPolicy: {},
  runtimeHints: {},
  status: 'received'
};

const secondRecord = {
  notificationId: 'notification-second',
  traceId: 'trace-second',
  createdAt: '2026-08-04T08:01:00.000Z',
  updatedAt: '2026-08-04T08:01:00.000Z',
  type: 'diagnostic',
  importance: 'high',
  source: 'test',
  title: '第二条',
  content: '内容二',
  metadata: { retryable: true },
  contentPolicy: {},
  runtimeHints: {},
  status: 'classified'
};

test('Notification Store snapshot creates and serializes deterministic records', () => {
  const snapshot = createNotificationStoreSnapshot([firstRecord, secondRecord], {
    updatedAt: '2026-08-04T08:02:00.000Z'
  });

  assert.equal(snapshot.notificationStoreVersion, NOTIFICATION_STORE_VERSION);
  assert.equal(snapshot.updatedAt, '2026-08-04T08:02:00.000Z');
  assert.deepEqual(snapshot.records.map((record) => record.notificationId), [
    'notification-first',
    'notification-second'
  ]);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.records));
  assert.ok(Object.isFrozen(snapshot.records[1].metadata));
  assert.equal(
    serializeNotificationStoreSnapshot(snapshot),
    `${JSON.stringify(snapshot)}\n`
  );
});

test('Notification Store snapshot creates an empty snapshot with a valid timestamp', () => {
  const snapshot = createNotificationStoreSnapshot([]);

  assert.equal(snapshot.notificationStoreVersion, 1);
  assert.deepEqual(snapshot.records, []);
  assert.ok(!Number.isNaN(Date.parse(snapshot.updatedAt)));
});

test('Notification Store snapshot parses valid JSON and isolates parsed data', () => {
  const source = createNotificationStoreSnapshot([firstRecord], {
    updatedAt: '2026-08-04T08:03:00.000Z'
  });
  const parsed = parseNotificationStoreSnapshot(serializeNotificationStoreSnapshot(source));

  assert.deepEqual(parsed, source);
  assert.notEqual(parsed, source);
  assert.notEqual(parsed.records, source.records);
  assert.notEqual(parsed.records[0], source.records[0]);
  assert.ok(Object.isFrozen(parsed));
});

test('Notification Store snapshot rejects malformed JSON and invalid contracts', () => {
  assert.throws(
    () => parseNotificationStoreSnapshot('{not-json'),
    (error) => error.code === 'NOTIFICATION_STORE_SNAPSHOT_INVALID'
      && error.details.field === 'json'
  );

  assert.throws(
    () => validateNotificationStoreSnapshot({
      notificationStoreVersion: 99,
      updatedAt: '2026-08-04T08:00:00.000Z',
      records: []
    }),
    (error) => error.code === 'NOTIFICATION_STORE_SNAPSHOT_VERSION_UNSUPPORTED'
      && error.details.field === 'notificationStoreVersion'
  );

  assert.throws(
    () => validateNotificationStoreSnapshot({
      notificationStoreVersion: 1,
      updatedAt: 'invalid-time',
      records: []
    }),
    (error) => error.code === 'NOTIFICATION_STORE_SNAPSHOT_TIMESTAMP_INVALID'
      && error.details.field === 'updatedAt'
  );

  assert.throws(
    () => validateNotificationStoreSnapshot({
      notificationStoreVersion: 1,
      updatedAt: '2026-08-04T08:00:00.000Z',
      records: {}
    }),
    (error) => error.code === 'NOTIFICATION_STORE_SNAPSHOT_RECORDS_INVALID'
      && error.details.field === 'records'
  );

  assert.throws(
    () => validateNotificationStoreSnapshot({
      notificationStoreVersion: 1,
      updatedAt: '2026-08-04T08:00:00.000Z',
      records: [{ ...firstRecord, title: '' }]
    }),
    (error) => error.code === 'NOTIFICATION_STORE_SNAPSHOT_RECORD_INVALID'
      && error.details.field === 'records[0].title'
  );

  assert.throws(
    () => validateNotificationStoreSnapshot({
      notificationStoreVersion: 1,
      updatedAt: '2026-08-04T08:00:00.000Z',
      records: [firstRecord, { ...secondRecord, notificationId: firstRecord.notificationId }]
    }),
    (error) => error.code === 'NOTIFICATION_STORE_SNAPSHOT_DUPLICATE_ID'
      && error.details.field === 'records[1].notificationId'
  );
});

test('Notification Store snapshot rejects non-plain inputs and invalid creation options', () => {
  assert.throws(
    () => createNotificationStoreSnapshot('records'),
    (error) => error.code === 'NOTIFICATION_STORE_SNAPSHOT_RECORDS_INVALID'
      && error.details.field === 'records'
  );

  assert.throws(
    () => createNotificationStoreSnapshot([firstRecord], { updatedAt: 'invalid-time' }),
    (error) => error.code === 'NOTIFICATION_STORE_SNAPSHOT_TIMESTAMP_INVALID'
      && error.details.field === 'updatedAt'
  );

  assert.throws(
    () => validateNotificationStoreSnapshot(null),
    (error) => error.code === 'NOTIFICATION_STORE_SNAPSHOT_INVALID'
  );
});
