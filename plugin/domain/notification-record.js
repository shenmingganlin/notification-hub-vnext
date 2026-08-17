import { normalizeNotificationProducer } from './notification-classification.js';
import { legacyImportanceToClass, NOTIFICATION_IMPORTANCE_CLASS_VALUES } from './notification-importance.js';

const IMPORTANCE_VALUES = ['low', 'normal', 'high', 'critical'];
const STATUS_VALUES = [
  'received', 'classified', 'formatted', 'queued', 'shown', 'clicked',
  'paused', 'dismissed', 'expired', 'failed', 'fallback', 'read', 'unread'
];

export const NOTIFICATION_IMPORTANCE = Object.freeze([...IMPORTANCE_VALUES]);
export const NOTIFICATION_STATUSES = Object.freeze([...STATUS_VALUES]);

function createId(prefix) {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return randomUuid ? `${prefix}-${randomUuid}` : `${prefix}-${Date.now().toString(36)}`;
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

function notificationError(code, message, field) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field } : {};
  return error;
}

function requireNonEmptyString(field, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw notificationError('NOTIFICATION_RECORD_FIELD_INVALID', `${field} must be a non-empty string`, field);
  }
}

function requireTimestamp(field, value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw notificationError('NOTIFICATION_RECORD_TIMESTAMP_INVALID', `${field} must be a valid ISO timestamp`, field);
  }
}

function requireOptionalValue(field, value) {
  if (value === null || value === undefined || typeof value === 'string') return;
  if (!isPlainObject(value)) {
    throw notificationError('NOTIFICATION_RECORD_FIELD_INVALID', `${field} must be a string or plain object`, field);
  }
}

function normalizeChannel(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    if (value.trim().length === 0) {
      throw notificationError('NOTIFICATION_RECORD_CHANNEL_INVALID', 'channel must have a non-empty kind', 'channel');
    }
    return { kind: value.trim() };
  }
  if (!isPlainObject(value)) {
    throw notificationError('NOTIFICATION_RECORD_CHANNEL_INVALID', 'channel must be a plain object', 'channel');
  }
  if (typeof value.kind !== 'string' || value.kind.trim().length === 0) {
    throw notificationError('NOTIFICATION_RECORD_CHANNEL_INVALID', 'channel.kind must be a non-empty string', 'channel.kind');
  }
  if (value.id !== undefined && value.id !== null
    && (typeof value.id !== 'string' || value.id.trim().length === 0)) {
    throw notificationError('NOTIFICATION_RECORD_CHANNEL_INVALID', 'channel.id must be a non-empty string when provided', 'channel.id');
  }
  return {
    ...cloneDeep(value),
    kind: value.kind.trim(),
    ...(value.id === undefined || value.id === null ? {} : { id: value.id.trim() })
  };
}

function requirePlainObject(field, value) {
  if (!isPlainObject(value)) {
    throw notificationError('NOTIFICATION_RECORD_FIELD_INVALID', `${field} must be a plain object`, field);
  }
}

export function createNotificationRecord(input = {}) {
  if (!isPlainObject(input)) {
    throw notificationError('NOTIFICATION_RECORD_INVALID', 'NotificationRecord input must be a plain object');
  }

  const now = new Date().toISOString();
  const record = {
    notificationId: input.notificationId ?? createId('notification'),
    traceId: input.traceId ?? createId('trace'),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? input.createdAt ?? now,
    type: input.type,
    importance: input.importance ?? 'normal',
    importanceClass: input.importanceClass ?? legacyImportanceToClass(input.importance ?? 'normal'),
    source: input.source,
    agent: cloneDeep(input.agent ?? null),
    session: cloneDeep(input.session ?? null),
    channel: normalizeChannel(input.channel),
    ...(input.producer === undefined ? {} : { producer: normalizeNotificationProducer(input.producer) }),
    title: input.title,
    content: input.content,
    summary: cloneDeep(input.summary ?? null),
    metadata: cloneDeep(input.metadata ?? {}),
    contentPolicy: cloneDeep(input.contentPolicy ?? {}),
    profileRef: cloneDeep(input.profileRef ?? null),
    workMode: cloneDeep(input.workMode ?? null),
    status: input.status ?? 'received',
    historyPolicy: cloneDeep(input.historyPolicy ?? null),
    runtimeHints: cloneDeep(input.runtimeHints ?? {}),
    ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
    ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    ...(input.eventTypeId === undefined ? {} : { eventTypeId: input.eventTypeId }),
    ...(input.presentation === undefined ? {} : { presentation: cloneDeep(input.presentation) })
  };

  ['notificationId', 'traceId', 'type', 'source', 'title', 'content', 'status'].forEach((field) => {
    requireNonEmptyString(field, record[field]);
  });

  requireTimestamp('createdAt', record.createdAt);
  requireTimestamp('updatedAt', record.updatedAt);
  if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) {
    throw notificationError('NOTIFICATION_RECORD_TIMESTAMP_ORDER_INVALID', 'updatedAt must not be earlier than createdAt', 'updatedAt');
  }
  if (!IMPORTANCE_VALUES.includes(record.importance)) {
    throw notificationError('NOTIFICATION_RECORD_IMPORTANCE_INVALID', `Unsupported importance: ${record.importance}`, 'importance');
  }
  if (!NOTIFICATION_IMPORTANCE_CLASS_VALUES.includes(record.importanceClass)) {
    throw notificationError('NOTIFICATION_RECORD_IMPORTANCE_CLASS_INVALID', `Unsupported importanceClass: ${record.importanceClass}`, 'importanceClass');
  }
  if (!STATUS_VALUES.includes(record.status)) {
    throw notificationError('NOTIFICATION_RECORD_STATUS_INVALID', `Unsupported status: ${record.status}`, 'status');
  }
  ['agent', 'session', 'summary', 'profileRef', 'workMode', 'historyPolicy'].forEach((field) => {
    requireOptionalValue(field, record[field]);
  });
  ['metadata', 'contentPolicy', 'runtimeHints'].forEach((field) => {
    requirePlainObject(field, record[field]);
  });
  ['eventId', 'categoryId', 'eventTypeId'].forEach((field) => {
    if (record[field] !== undefined) requireNonEmptyString(field, record[field]);
  });
  if (record.presentation !== undefined) requirePlainObject('presentation', record.presentation);

  return freezeDeep(record);
}

export function validateNotificationRecord(record) {
  createNotificationRecord(record);
  return true;
}

export function updateNotificationRecord(record, patch = {}) {
  return createNotificationRecord({ ...record, ...patch, updatedAt: new Date().toISOString() });
}

export function transitionNotificationStatus(record, status) {
  return updateNotificationRecord(record, { status });
}
