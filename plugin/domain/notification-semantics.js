import {
  getEventDefinition,
  resolveEventId
} from './notification-event-catalog.js';

export const CANONICAL_EVENT_VERSION = 'v1';
export const CANONICAL_SEVERITIES = Object.freeze(['info', 'warning', 'error', 'critical']);

function semanticsError(code, message, field, details = {}) {
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

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function text(field, value, required = true) {
  if (value === undefined || value === null) {
    if (!required) return null;
    throw semanticsError('CANONICAL_EVENT_FIELD_INVALID', `${field} must be a non-empty string`, field);
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw semanticsError('CANONICAL_EVENT_FIELD_INVALID', `${field} must be a non-empty string`, field);
  }
  return value.trim();
}

function timestamp(field, value, fallback = new Date().toISOString()) {
  const result = value ?? fallback;
  if (typeof result !== 'string' || Number.isNaN(Date.parse(result))) {
    throw semanticsError('CANONICAL_EVENT_TIMESTAMP_INVALID', `${field} must be a valid ISO timestamp`, field);
  }
  return new Date(result).toISOString();
}

function normalizeOrigin(origin = {}) {
  if (!isPlainObject(origin)) throw semanticsError('CANONICAL_EVENT_ORIGIN_INVALID', 'origin must be a plain object', 'origin');
  const source = text('origin.source', origin.source);
  return {
    source,
    ...(origin.producer === undefined ? {} : { producer: clone(origin.producer) }),
    ...(origin.channel === undefined ? {} : { channel: clone(origin.channel) })
  };
}

function normalizeSemantic(semantic, definition) {
  if (!isPlainObject(semantic)) throw semanticsError('CANONICAL_EVENT_SEMANTIC_INVALID', 'semantic must be a plain object', 'semantic');
  const action = text('semantic.action', semantic.action ?? definition.semantic.action);
  const outcome = text('semantic.outcome', semantic.outcome ?? definition.semantic.outcome);
  const reason = semantic.reason ?? definition.semantic.reason ?? null;
  if (reason !== null && (typeof reason !== 'string' || !reason.trim())) {
    throw semanticsError('CANONICAL_EVENT_SEMANTIC_INVALID', 'semantic.reason must be null or a non-empty string', 'semantic.reason');
  }
  return { action, outcome, ...(reason === null ? { reason: null } : { reason: reason.trim() }) };
}

function resolveDefinition(input) {
  if (!isPlainObject(input)) throw semanticsError('CANONICAL_EVENT_INVALID', 'CanonicalEvent input must be a plain object', 'input');
  if (input.eventId !== undefined) {
    const eventId = text('eventId', input.eventId);
    const definition = getEventDefinition(eventId);
    if (input.categoryId !== undefined && input.categoryId !== definition.categoryId) {
      throw semanticsError('CANONICAL_EVENT_ID_MISMATCH', 'eventId and categoryId refer to different definitions', 'categoryId');
    }
    if (input.eventTypeId !== undefined && input.eventTypeId !== definition.eventTypeId) {
      throw semanticsError('CANONICAL_EVENT_ID_MISMATCH', 'eventId and eventTypeId refer to different definitions', 'eventTypeId');
    }
    return definition;
  }
  const eventId = resolveEventId({ categoryId: input.categoryId, eventTypeId: input.eventTypeId });
  return getEventDefinition(eventId);
}

export function createCanonicalEvent(input = {}) {
  const definition = resolveDefinition(input);
  const eventId = definition.eventId;
  const occurredAt = timestamp('occurredAt', input.occurredAt);
  const event = {
    version: CANONICAL_EVENT_VERSION,
    eventId,
    categoryId: definition.categoryId,
    eventTypeId: definition.eventTypeId,
    traceId: text('traceId', input.traceId ?? `trace-${Date.now().toString(36)}`),
    correlationId: text('correlationId', input.correlationId, false),
    occurredAt,
    origin: normalizeOrigin(input.origin ?? { source: definition.source }),
    semantic: normalizeSemantic(input.semantic ?? definition.semantic, definition),
    severity: input.severity ?? (definition.semantic.outcome === 'failure' ? 'error' : 'info'),
    rawType: text('rawType', input.rawType, false),
    presentationEligible: input.presentationEligible ?? definition.presentationEligible,
    carrier: input.carrier ?? definition.carrier,
    ...(input.raw === undefined ? {} : { raw: clone(input.raw) })
  };
  if (!CANONICAL_SEVERITIES.includes(event.severity)) {
    throw semanticsError('CANONICAL_EVENT_SEVERITY_INVALID', `Unsupported severity: ${event.severity}`, 'severity');
  }
  if (typeof event.presentationEligible !== 'boolean') {
    throw semanticsError('CANONICAL_EVENT_FIELD_INVALID', 'presentationEligible must be boolean', 'presentationEligible');
  }
  if (!['notification', 'diagnostic', 'internal'].includes(event.carrier)) {
    throw semanticsError('CANONICAL_EVENT_CARRIER_INVALID', `Unsupported carrier: ${event.carrier}`, 'carrier');
  }
  return freezeDeep(event);
}

export function normalizeCanonicalEvent(input = {}) {
  return createCanonicalEvent(input);
}

export function validateCanonicalEvent(event) {
  createCanonicalEvent(event);
  return true;
}

export function getCanonicalEventId(event) {
  return text('eventId', event?.eventId);
}

function legacyEventDefinition({ event, record, classification } = {}) {
  const explicitEventId = event?.eventId ?? record?.metadata?.eventId ?? record?.eventId;
  if (typeof explicitEventId === 'string' && explicitEventId.trim()) {
    try {
      return getEventDefinition(explicitEventId.trim()).eventId;
    } catch {
      // Unknown explicit ids continue through the legacy inference path.
    }
  }
  const type = event?.type ?? record?.type;
  const stopReason = event?.stopReason;
  if (type === 'tool_execution_end' || type === 'tool_result' || type === 'tool_completed' || type === 'tool_success' || type === 'tool_error') {
    if (event?.isError === true || type === 'tool_error' || stopReason === 'tool_error') return 'tool.execution.failed';
    return 'tool.execution.succeeded';
  }
  if (type === 'timeout' || stopReason === 'timeout') return 'tool.execution.timed_out';
  if (type === 'channel_new_message' || record?.type === 'channel_message') return 'channel.message.received';
  if (type === 'model_service_error' || classification?.classification === 'model_service') return 'model_service.request.failed';
  if (type === 'model_service_recovered') return 'model_service.incident.recovered';
  if (type === 'session_unhealthy_warning') return 'session.health.degraded';
  if (type === 'session_branch_persistence_warning') return 'session.persistence.failed';
  if (type === 'message_end' || type === 'assistant_message' || classification?.event === 'assistant_reply') {
    if (['aborted', 'cancelled'].includes(stopReason)) return 'chat.assistant_reply.cancelled';
    if (stopReason === 'interrupted') return 'chat.assistant_reply.interrupted';
    return 'chat.assistant_reply.completed';
  }
  throw semanticsError('CANONICAL_EVENT_LEGACY_UNKNOWN', `Cannot derive canonical event from legacy type: ${type ?? 'unknown'}`, 'event');
}

export function canonicalEventFromLegacy({ event = {}, record = {}, classification = {} } = {}) {
  const eventId = legacyEventDefinition({ event, record, classification });
  const definition = getEventDefinition(eventId);
  const candidateOccurredAt = record.createdAt ?? event.occurredAt ?? event.timestamp;
  const occurredAt = typeof candidateOccurredAt === 'string' && !Number.isNaN(Date.parse(candidateOccurredAt))
    ? candidateOccurredAt
    : undefined;
  return createCanonicalEvent({
    eventId,
    traceId: record.traceId ?? event.traceId,
    correlationId: record.session?.id ?? event.correlationId,
    ...(occurredAt ? { occurredAt } : {}),
    origin: {
      source: record.source ?? event.source ?? definition.source,
      producer: record.producer,
      channel: record.channel
    },
    semantic: { ...definition.semantic },
    severity: record.status === 'failed' || definition.semantic.outcome === 'failure' ? 'error' : 'info',
    rawType: event.type ?? record.type,
    raw: { type: event.type ?? record.type, stopReason: event.stopReason ?? classification?.stopReason ?? null }
  });
}
