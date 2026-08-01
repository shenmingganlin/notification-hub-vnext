/** Structured diagnostics shared by the Node.js plugin layer. */

export const DIAGNOSTIC_SEVERITIES = Object.freeze([
  'trace',
  'info',
  'warning',
  'error',
  'fatal'
]);

export const DIAGNOSTIC_STAGES = Object.freeze([
  'event-received',
  'classified',
  'profile-resolved',
  'content-formatted',
  'sound-resolved',
  'transport-sent',
  'runtime-accepted',
  'scene-queued',
  'layout-planned',
  'physics-started',
  'renderer-created',
  'shown',
  'hit-tested',
  'drag-started',
  'drag-ended',
  'clicked',
  'paused',
  'resumed',
  'dismissed',
  'expired',
  'fallback',
  'error'
]);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

function diagnosticError(message, details = {}) {
  return Object.assign(new Error(message), { code: 'DIAGNOSTIC_INVALID', details });
}

function createId(prefix) {
  const value = globalThis.crypto?.randomUUID?.();
  return value ? `${prefix}-${value}` : `${prefix}-${Date.now().toString(36)}`;
}

function normalizeRequiredString(name, value) {
  if (!isNonEmptyString(value)) {
    throw diagnosticError(`${name} must be a non-empty string`, { field: name });
  }
  return value;
}

export function createDiagnosticEvent({
  traceId,
  notificationId,
  stage,
  code,
  severity = 'info',
  recoverable = false,
  message,
  timestamp = new Date().toISOString(),
  context = {}
} = {}) {
  normalizeRequiredString('traceId', traceId);
  normalizeRequiredString('stage', stage);
  normalizeRequiredString('code', code);
  normalizeRequiredString('message', message);
  if (!DIAGNOSTIC_STAGES.includes(stage)) {
    throw diagnosticError(`Unknown diagnostic stage: ${stage}`, { stage });
  }
  if (!DIAGNOSTIC_SEVERITIES.includes(severity)) {
    throw diagnosticError(`Unknown diagnostic severity: ${severity}`, { severity });
  }
  if (notificationId !== undefined) normalizeRequiredString('notificationId', notificationId);
  if (!isRecord(context)) throw diagnosticError('context must be an object');
  if (!isNonEmptyString(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    throw diagnosticError('timestamp must be an ISO-8601 date-time string');
  }

  return Object.freeze({
    diagnosticId: createId('diag'),
    traceId,
    ...(notificationId === undefined ? {} : { notificationId }),
    stage,
    code,
    severity,
    recoverable: Boolean(recoverable),
    message,
    timestamp,
    context: Object.freeze({ ...context })
  });
}

export function diagnosticFingerprint(event) {
  if (!isRecord(event)) throw diagnosticError('Diagnostic event must be an object');
  return [event.code, event.stage, event.severity, event.message].map(String).join('|');
}

export function deduplicateDiagnostics(events, { maxEntries = 1000 } = {}) {
  if (!Array.isArray(events)) throw diagnosticError('events must be an array');
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw diagnosticError('maxEntries must be a positive integer');

  const seen = new Set();
  const result = [];
  for (const event of events) {
    const fingerprint = diagnosticFingerprint(event);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push(event);
    if (result.length >= maxEntries) break;
  }
  return result;
}

export function serializeDiagnosticEvent(event) {
  return `${JSON.stringify(event)}\n`;
}
