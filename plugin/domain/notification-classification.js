const PRODUCER_KIND_VALUES = ['hana', 'api'];

export const NOTIFICATION_CLASSIFICATION_TYPES = Object.freeze(['type', 'source', 'channel', 'producer']);
export const NOTIFICATION_PRODUCER_KINDS = Object.freeze([...PRODUCER_KIND_VALUES]);
export const NOTIFICATION_CATEGORY_LABELS = Object.freeze(['chat', 'channel', 'tool', 'error', 'external_call', 'system', 'model_service']);
export const NOTIFICATION_EVENT_LABELS = Object.freeze([
  'assistant_reply', 'tool', 'tool_success', 'tool_error', 'error', 'timeout', 'model_service_error'
]);
export const NOTIFICATION_CATEGORY_VERSION = 'v1';

function classificationError(code, message, field) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field } : {};
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function requireText(field, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw classificationError('NOTIFICATION_PRODUCER_INVALID', `${field} must be a non-empty string`, field);
  }
  return value.trim();
}

export function normalizeNotificationProducer(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    throw classificationError('NOTIFICATION_PRODUCER_INVALID', 'producer must be a plain object', 'producer');
  }
  const kind = requireText('producer.kind', value.kind);
  if (!NOTIFICATION_PRODUCER_KINDS.includes(kind)) {
    throw classificationError('NOTIFICATION_PRODUCER_KIND_INVALID', `Unsupported producer kind: ${kind}`, 'producer.kind');
  }
  const id = value.id === undefined || value.id === null ? null : requireText('producer.id', value.id);
  if (kind === 'api' && !id) {
    throw classificationError('NOTIFICATION_PRODUCER_ID_INVALID', 'API producer must have a non-empty id', 'producer.id');
  }
  const unknownKeys = Object.keys(value).filter((key) => !['kind', 'id', 'label'].includes(key));
  if (unknownKeys.length > 0) {
    throw classificationError('NOTIFICATION_PRODUCER_FIELD_UNKNOWN', `Unsupported producer field: ${unknownKeys[0]}`, `producer.${unknownKeys[0]}`);
  }
  const label = value.label === undefined || value.label === null ? null : requireText('producer.label', value.label);
  return Object.freeze({
    ...clone(value),
    kind,
    ...(id ? { id } : {}),
    ...(label ? { label } : {})
  });
}

export function getNotificationClassification(record) {
  return Object.freeze({
    type: record?.type ?? null,
    source: record?.source ?? null,
    channel: record?.channel ?? null,
    producer: record?.producer ?? null
  });
}

export function isApiProducedNotification(record) {
  return record?.producer?.kind === 'api';
}

const CHAT_TYPES = new Set(['assistant_message', 'message', 'chat_message']);
const TOOL_TYPES = new Set(['tool_use', 'tool_result', 'tool_error', 'tool_execution', 'tool_completed']);
const ERROR_TYPES = new Set(['error', 'failed', 'timeout', 'rate_limit', 'rate_limited', 'provider_error', 'tool_error', 'model_service_error']);
function categoryEvidence(category, rule, field, value) {
  return { category, rule, field, value: clone(value) };
}

export function normalizeNotificationCategory(category) {
  if (category === 'plugin') return 'external_call';
  return category;
}

export function projectNotificationCategories(record = {}) {
  const channelKind = typeof record?.channel?.kind === 'string' ? record.channel.kind : null;
  const type = typeof record?.type === 'string' ? record.type : null;
  const labels = [];
  const evidence = [];
  const event = [];

  if (channelKind === 'chat' || (!channelKind && CHAT_TYPES.has(type))) {
    labels.push('chat');
    event.push('assistant_reply');
    evidence.push(categoryEvidence(
      'chat',
      channelKind === 'chat' ? 'channel.kind=chat' : 'type=assistant_message',
      channelKind === 'chat' ? 'channel.kind' : 'type',
      channelKind === 'chat' ? channelKind : type
    ));
  } else if (channelKind) {
    labels.push('channel');
    evidence.push(categoryEvidence('channel', 'channel.kind=external', 'channel.kind', channelKind));
  }

  if (type === 'model_service_error' || record?.metadata?.eventClassification?.classification === 'model_service') {
    labels.push('model_service', 'system', 'error');
    if (!event.includes('model_service_error')) event.push('model_service_error');
    if (!event.includes('error')) event.push('error');
    evidence.push(categoryEvidence('model_service', 'type=model_service_error', 'type', type));
    evidence.push(categoryEvidence('system', 'model_service projection', 'classification', 'model_service'));
    evidence.push(categoryEvidence('error', 'model_service projection', 'classification', 'model_service'));
  }

  if (type === 'system_notification' || record?.source === 'hana.system') {
    labels.push('system');
    evidence.push(categoryEvidence('system', 'system notification', 'source', record?.source ?? type));
  }

  if (TOOL_TYPES.has(type)) {
    labels.push('tool');
    // `tool` remains the broad, backwards-compatible event; the detailed
    // event distinguishes a successful result from a failed execution.
    event.push('tool');
    event.push(type === 'tool_error' ? 'tool_error' : 'tool_success');
    evidence.push(categoryEvidence('tool', `type=${type}`, 'type', type));
  }

  const explicitFailedStatus = record?.status === 'failed';
  if (ERROR_TYPES.has(type) || explicitFailedStatus) {
    labels.push('error');
    if (type === 'timeout' && !event.includes('timeout')) event.push('timeout');
    if (type === 'rate_limit' || type === 'rate_limited') event.push('timeout');
    if (type === 'model_service_error' && !event.includes('model_service_error')) event.push('model_service_error');
    if (!event.includes('error')) event.push('error');
    evidence.push(categoryEvidence(
      'error',
      explicitFailedStatus && !ERROR_TYPES.has(type) ? 'status=failed' : `type=${type}`,
      explicitFailedStatus && !ERROR_TYPES.has(type) ? 'status' : 'type',
      explicitFailedStatus && !ERROR_TYPES.has(type) ? record.status : type
    ));
  }

  if (record?.producer?.kind === 'api') {
    labels.push('external_call');
    evidence.push(categoryEvidence('external_call', 'producer.kind=api', 'producer.kind', 'api'));
  }

  return freezeDeep({
    version: NOTIFICATION_CATEGORY_VERSION,
    labels: [...new Set(labels)],
    facets: {
      communication: labels.includes('chat') ? 'chat' : (labels.includes('channel') ? 'channel' : null),
      event: [...new Set(event)],
      producer: record?.producer ? clone(record.producer) : null
    },
    status: labels.length > 0 || event.length > 0 ? 'classified' : 'unknown',
    evidence,
    origin: 'system'
  });
}
