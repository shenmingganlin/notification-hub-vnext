import {
  createNotificationRecord,
  NOTIFICATION_STATUSES,
  transitionNotificationStatus,
  updateNotificationRecord
} from './notification-record.js';

function storeError(code, message, fieldOrDetails) {
  const error = new Error(message);
  error.code = code;
  error.details = typeof fieldOrDetails === 'object'
    ? fieldOrDetails
    : (fieldOrDetails ? { field: fieldOrDetails } : {});
  return error;
}

const ERROR_CLASSIFICATIONS = new Set([
  'tool_error',
  'provider_error',
  'model_unavailable',
  'model_service',
  'model_service_error',
  'timeout',
  'rate_limited',
  'aborted',
  'cancelled',
  'interrupted',
  'limit_reached'
]);
const ERROR_TYPES = new Set(['error', 'tool_error', 'provider_error', 'model_service_error']);
const TOOL_TYPES = new Set(['tool_use', 'tool_result', 'tool_error']);

function isToolRecord(record) {
  return TOOL_TYPES.has(record.type) || record.source === 'hana.tool';
}

function isErrorRecord(record) {
  return record.status === 'failed'
    || ERROR_TYPES.has(record.type)
    || ERROR_CLASSIFICATIONS.has(record.metadata?.eventClassification?.classification);
}

function isConversationRecord(record) {
  return record.type === 'assistant_message';
}

function isExternalChannelRecord(record) {
  return Boolean(record.channel?.kind && record.channel.kind !== 'chat');
}

function isSystemRecord(record) {
  return record.type === 'system_notification'
    || record.type === 'model_service_error'
    || record.source === 'hana.system'
    || record.source === 'hana.model'
    || record.metadata?.eventClassification?.classification === 'model_service';
}

function isApiProducerRecord(record) {
  return record.producer?.kind === 'api';
}

export class NotificationStore {
  #records = new Map();
  #subscribers = new Set();

  get size() {
    return this.#records.size;
  }

  add(input) {
    const record = createNotificationRecord(input);
    if (this.#records.has(record.notificationId)) {
      throw storeError(
        'NOTIFICATION_STORE_DUPLICATE_ID',
        `Notification already exists: ${record.notificationId}`,
        'notificationId'
      );
    }
    this.#records.set(record.notificationId, record);
    this.#emitChange({ type: 'add', record });
    return record;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw storeError(
        'NOTIFICATION_STORE_SUBSCRIBER_INVALID',
        'Notification Store subscriber must be a function'
      );
    }
    this.#subscribers.add(listener);
    return () => this.#subscribers.delete(listener);
  }

  getSnapshotRecords() {
    return Object.freeze([...this.#records.values()]);
  }

  replaceAll(records) {
    if (!Array.isArray(records)) {
      throw storeError(
        'NOTIFICATION_STORE_RECORDS_INVALID',
        'Notification Store records must be an array',
        'records'
      );
    }

    const nextRecords = new Map();
    records.forEach((input) => {
      const record = createNotificationRecord(input);
      if (nextRecords.has(record.notificationId)) {
        throw storeError(
          'NOTIFICATION_STORE_DUPLICATE_ID',
          `Notification already exists: ${record.notificationId}`,
          'notificationId'
        );
      }
      nextRecords.set(record.notificationId, record);
    });

    this.#records = nextRecords;
    this.#emitChange({ type: 'replace', record: null });
    return this.getSnapshotRecords();
  }

  get(notificationId) {
    return this.#records.get(notificationId) ?? null;
  }

  list({ status, unread, important, error, conversation, source, channel, channelKind, producerKind, tool, system, limit } = {}) {
    if (status !== undefined && !NOTIFICATION_STATUSES.includes(status)) {
      throw storeError('NOTIFICATION_STORE_STATUS_INVALID', `Unsupported status: ${status}`, 'status');
    }
    if (unread !== undefined && typeof unread !== 'boolean') {
      throw storeError('NOTIFICATION_STORE_UNREAD_INVALID', 'unread must be a boolean', 'unread');
    }
    if (important !== undefined && typeof important !== 'boolean') {
      throw storeError('NOTIFICATION_STORE_IMPORTANT_INVALID', 'important must be a boolean', 'important');
    }
    if (error !== undefined && typeof error !== 'boolean') {
      throw storeError('NOTIFICATION_STORE_ERROR_INVALID', 'error must be a boolean', 'error');
    }
    if (conversation !== undefined && typeof conversation !== 'boolean') {
      throw storeError('NOTIFICATION_STORE_CONVERSATION_INVALID', 'conversation must be a boolean', 'conversation');
    }
    if (source !== undefined && (typeof source !== 'string' || source.trim().length === 0)) {
      throw storeError('NOTIFICATION_STORE_SOURCE_INVALID', 'source must be a non-empty string', 'source');
    }
    if (channel !== undefined && typeof channel !== 'boolean') {
      throw storeError('NOTIFICATION_STORE_CHANNEL_INVALID', 'channel must be a boolean', 'channel');
    }
    if (channelKind !== undefined && (typeof channelKind !== 'string' || channelKind.trim().length === 0)) {
      throw storeError('NOTIFICATION_STORE_CHANNEL_KIND_INVALID', 'channelKind must be a non-empty string', 'channelKind');
    }
    if (producerKind !== undefined && (typeof producerKind !== 'string' || producerKind.trim().length === 0)) {
      throw storeError('NOTIFICATION_STORE_PRODUCER_KIND_INVALID', 'producerKind must be a non-empty string', 'producerKind');
    }
    if (tool !== undefined && typeof tool !== 'boolean') {
      throw storeError('NOTIFICATION_STORE_TOOL_INVALID', 'tool must be a boolean', 'tool');
    }
    if (system !== undefined && typeof system !== 'boolean') {
      throw storeError('NOTIFICATION_STORE_SYSTEM_INVALID', 'system must be a boolean', 'system');
    }
    let records = [...this.#records.values()]
      .filter((record) => status === undefined || record.status === status)
      .filter((record) => unread === undefined || (unread ? record.status !== 'read' : record.status === 'read'))
      .filter((record) => important === undefined || (important
        ? ['high', 'critical'].includes(record.importance)
        : ['low', 'normal'].includes(record.importance)))
      .filter((record) => error === undefined || (error ? isErrorRecord(record) : !isErrorRecord(record)))
      .filter((record) => conversation === undefined || (conversation ? isConversationRecord(record) : !isConversationRecord(record)))
      .filter((record) => source === undefined || record.source === source)
      .filter((record) => channel === undefined || (channel ? isExternalChannelRecord(record) : !isExternalChannelRecord(record)))
      .filter((record) => channelKind === undefined || record.channel?.kind === channelKind)
      .filter((record) => producerKind === undefined || (producerKind === 'api' ? isApiProducerRecord(record) : record.producer?.kind === producerKind))
      .filter((record) => tool === undefined || (tool ? isToolRecord(record) : !isToolRecord(record)))
      .filter((record) => system === undefined || (system ? isSystemRecord(record) : !isSystemRecord(record)))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    if (limit !== undefined) {
      if (!Number.isInteger(limit) || limit < 0) {
        throw storeError('NOTIFICATION_STORE_LIMIT_INVALID', 'limit must be a non-negative integer', 'limit');
      }
      records = records.slice(0, limit);
    }
    return records;
  }

  update(notificationId, patch = {}) {
    const record = this.#require(notificationId);
    const updated = updateNotificationRecord(record, patch);
    this.#records.set(notificationId, updated);
    this.#emitChange({ type: 'update', record: updated });
    return updated;
  }

  setStatus(notificationId, status, options = {}) {
    const record = this.#require(notificationId);
    const updated = transitionNotificationStatus(record, status, options);
    this.#records.set(notificationId, updated);
    this.#emitChange({ type: 'status', record: updated });
    return updated;
  }

  setStatuses(notificationIds, status) {
    if (!Array.isArray(notificationIds)
      || notificationIds.some((notificationId) => typeof notificationId !== 'string' || notificationId.trim().length === 0)) {
      throw storeError(
        'NOTIFICATION_STORE_BATCH_IDS_INVALID',
        'notificationIds must be an array of non-empty strings',
        'notificationIds'
      );
    }
    if (status !== 'read') {
      throw storeError(
        'NOTIFICATION_STORE_BATCH_STATUS_INVALID',
        'Batch status update only supports read',
        'status'
      );
    }

    const uniqueIds = [...new Set(notificationIds)];
    if (uniqueIds.length === 0) return { updated: [], missing: [] };

    const missing = uniqueIds.filter((notificationId) => !this.#records.has(notificationId));
    if (missing.length > 0) {
      throw storeError(
        'NOTIFICATION_STORE_NOT_FOUND',
        `Notifications not found: ${missing.join(', ')}`,
        { field: 'notificationId', notificationIds: missing }
      );
    }

    const updatedRecords = [];
    const updated = uniqueIds.map((notificationId) => {
      const record = this.#records.get(notificationId);
      if (record.status === status) return record;
      const next = transitionNotificationStatus(record, status);
      updatedRecords.push(next);
      return next;
    });

    if (updatedRecords.length > 0) {
      const nextRecords = new Map(this.#records);
      updatedRecords.forEach((record) => nextRecords.set(record.notificationId, record));
      this.#records = nextRecords;
      this.#emitChange({ type: 'status-batch', record: null, updatedRecords });
    }

    return { updated, missing: [] };
  }

  remove(notificationId) {
    const record = this.#records.get(notificationId);
    if (!record) return false;
    this.#records.delete(notificationId);
    this.#emitChange({ type: 'remove', record: null });
    return true;
  }

  removeMany(notificationIds) {
    if (!Array.isArray(notificationIds)
      || notificationIds.some((notificationId) => typeof notificationId !== 'string' || notificationId.trim().length === 0)) {
      throw storeError(
        'NOTIFICATION_STORE_BATCH_IDS_INVALID',
        'notificationIds must be an array of non-empty strings',
        'notificationIds'
      );
    }
    const uniqueIds = [...new Set(notificationIds)];
    const missing = uniqueIds.filter((notificationId) => !this.#records.has(notificationId));
    if (missing.length > 0) {
      throw storeError(
        'NOTIFICATION_STORE_NOT_FOUND',
        `Notifications not found: ${missing.join(', ')}`,
        { field: 'notificationId', notificationIds: missing }
      );
    }
    const removed = uniqueIds.map((notificationId) => this.#records.get(notificationId));
    if (removed.length > 0) {
      const nextRecords = new Map(this.#records);
      removed.forEach((record) => nextRecords.delete(record.notificationId));
      this.#records = nextRecords;
      this.#emitChange({ type: 'remove-batch', record: null, updatedRecords: removed });
    }
    return { removed, missing: [] };
  }

  clear() {
    const count = this.#records.size;
    if (count === 0) return 0;
    this.#records.clear();
    this.#emitChange({ type: 'clear', record: null });
    return count;
  }

  #emitChange({ type, record, updatedRecords = [] }) {
    const change = Object.freeze({
      type,
      record,
      updatedRecords: Object.freeze([...updatedRecords]),
      records: this.getSnapshotRecords()
    });
    for (const subscriber of this.#subscribers) subscriber(change);
  }

  #require(notificationId) {
    const record = this.#records.get(notificationId);
    if (!record) {
      throw storeError(
        'NOTIFICATION_STORE_NOT_FOUND',
        `Notification not found: ${notificationId}`,
        'notificationId'
      );
    }
    return record;
  }
}
