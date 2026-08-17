import {
  createNotificationRecord,
  validateNotificationRecord
} from './notification-record.js';

export const NOTIFICATION_STORE_VERSION = 1;

function snapshotError(code, message, field, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field, ...details } : { ...details };
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneDeep(value) {
  if (Array.isArray(value)) return value.map(cloneDeep);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneDeep(entry)]));
  }
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function requireSnapshotObject(snapshot) {
  if (!isPlainObject(snapshot)) {
    throw snapshotError(
      'NOTIFICATION_STORE_SNAPSHOT_INVALID',
      'Notification Store snapshot must be a plain object'
    );
  }
}

function validateTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validateSnapshotShape(snapshot) {
  requireSnapshotObject(snapshot);

  if (snapshot.notificationStoreVersion !== NOTIFICATION_STORE_VERSION) {
    throw snapshotError(
      'NOTIFICATION_STORE_SNAPSHOT_VERSION_UNSUPPORTED',
      `Unsupported Notification Store snapshot version: ${snapshot.notificationStoreVersion}`,
      'notificationStoreVersion'
    );
  }
  if (!validateTimestamp(snapshot.updatedAt)) {
    throw snapshotError(
      'NOTIFICATION_STORE_SNAPSHOT_TIMESTAMP_INVALID',
      'Notification Store snapshot updatedAt must be a valid ISO timestamp',
      'updatedAt'
    );
  }
  if (!Array.isArray(snapshot.records)) {
    throw snapshotError(
      'NOTIFICATION_STORE_SNAPSHOT_RECORDS_INVALID',
      'Notification Store snapshot records must be an array',
      'records'
    );
  }
}

export function validateNotificationStoreSnapshot(snapshot) {
  validateSnapshotShape(snapshot);

  const ids = new Set();
  snapshot.records.forEach((record, index) => {
    try {
      validateNotificationRecord(record);
    } catch (error) {
      throw snapshotError(
        'NOTIFICATION_STORE_SNAPSHOT_RECORD_INVALID',
        `Invalid NotificationRecord at records[${index}]`,
        error.details?.field ? `records[${index}].${error.details.field}` : `records[${index}]`,
        { cause: error.code, message: error.message }
      );
    }

    if (ids.has(record.notificationId)) {
      throw snapshotError(
        'NOTIFICATION_STORE_SNAPSHOT_DUPLICATE_ID',
        `Duplicate notificationId in records[${index}]: ${record.notificationId}`,
        `records[${index}].notificationId`
      );
    }
    ids.add(record.notificationId);
  });

  return true;
}

export function createNotificationStoreSnapshot(records, { updatedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(records)) {
    throw snapshotError(
      'NOTIFICATION_STORE_SNAPSHOT_RECORDS_INVALID',
      'Notification Store snapshot records must be an array',
      'records'
    );
  }

  const snapshot = {
    notificationStoreVersion: NOTIFICATION_STORE_VERSION,
    updatedAt,
    records: records.map((record) => createNotificationRecord(cloneDeep(record)))
  };

  validateNotificationStoreSnapshot(snapshot);
  return freezeDeep(snapshot);
}

export function serializeNotificationStoreSnapshot(snapshot) {
  validateNotificationStoreSnapshot(snapshot);
  return `${JSON.stringify(snapshot)}\n`;
}

export function parseNotificationStoreSnapshot(text) {
  if (typeof text !== 'string') {
    throw snapshotError(
      'NOTIFICATION_STORE_SNAPSHOT_INVALID',
      'Notification Store snapshot text must be a string',
      'json'
    );
  }

  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch (error) {
    throw snapshotError(
      'NOTIFICATION_STORE_SNAPSHOT_INVALID',
      'Notification Store snapshot contains invalid JSON',
      'json',
      { cause: error.message }
    );
  }

  validateNotificationStoreSnapshot(snapshot);
  return freezeDeep(cloneDeep(snapshot));
}
