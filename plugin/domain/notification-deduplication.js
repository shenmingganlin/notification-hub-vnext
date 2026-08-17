const DEFAULT_POLICY = Object.freeze({
  mode: 'window',
  windowMs: 60000,
  requireStableKey: true,
  suppressCritical: false
});

export const DEDUPLICATION_MODES = Object.freeze(['off', 'window', 'content']);
export const DEDUPLICATION_DECISIONS = Object.freeze([
  'new',
  'duplicate',
  'outside_window',
  'indeterminate'
]);

function deduplicationError(code, message, field, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = { ...(field ? { field } : {}), ...details };
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

function validateNotification(notification) {
  if (!isPlainObject(notification)) {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_NOTIFICATION_INVALID',
      'notification must be a plain object',
      'notification'
    );
  }
  if (notification.type !== undefined && typeof notification.type !== 'string') {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_NOTIFICATION_INVALID',
      'notification.type must be a string',
      'notification.type'
    );
  }
  if (notification.title !== undefined && typeof notification.title !== 'string') {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_NOTIFICATION_INVALID',
      'notification.title must be a string',
      'notification.title'
    );
  }
  if (notification.content !== undefined && typeof notification.content !== 'string') {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_NOTIFICATION_INVALID',
      'notification.content must be a string',
      'notification.content'
    );
  }
  if (notification.metadata !== undefined && !isPlainObject(notification.metadata)) {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_NOTIFICATION_INVALID',
      'notification.metadata must be a plain object',
      'notification.metadata'
    );
  }
}

function validatePolicy(policy) {
  if (!isPlainObject(policy)) {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_POLICY_INVALID',
      'policy must be a plain object',
      'policy'
    );
  }
  if (!DEDUPLICATION_MODES.includes(policy.mode)) {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_MODE_INVALID',
      `Unsupported deduplication mode: ${policy.mode}`,
      'policy.mode'
    );
  }
  if (!Number.isInteger(policy.windowMs) || policy.windowMs <= 0 || policy.windowMs > 86400000) {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_WINDOW_INVALID',
      'policy.windowMs must be an integer from 1 to 86400000',
      'policy.windowMs'
    );
  }
  if (typeof policy.requireStableKey !== 'boolean') {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_POLICY_INVALID',
      'policy.requireStableKey must be a boolean',
      'policy.requireStableKey'
    );
  }
  if (typeof policy.suppressCritical !== 'boolean') {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_POLICY_INVALID',
      'policy.suppressCritical must be a boolean',
      'policy.suppressCritical'
    );
  }
}

function normalizeContent(notification) {
  return [notification.source, notification.type, notification.title, notification.content]
    .filter((value) => typeof value === 'string')
    .map((value) => value.replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim())
    .join('|');
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function selectBasis(notification, mode) {
  const explicit = notification.deduplicationKey;
  if (typeof explicit === 'string' && explicit.trim()) {
    return { key: `explicit:${explicit.trim()}`, basis: 'explicit', stable: true };
  }
  const incidentCycleKey = notification.metadata?.incidentCycleKey;
  if (typeof incidentCycleKey === 'string' && incidentCycleKey.trim()) {
    return { key: `incident-cycle:${incidentCycleKey.trim()}`, basis: 'incident-cycle', stable: true };
  }
  const incidentKey = notification.metadata?.incidentKey;
  if (typeof incidentKey === 'string' && incidentKey.trim()) {
    return { key: `incident:${incidentKey.trim()}`, basis: 'incident', stable: true };
  }
  if (typeof notification.eventId === 'string' && notification.eventId.trim()) {
    return { key: `event:${notification.eventId.trim()}`, basis: 'event', stable: true };
  }
  if (typeof notification.traceId === 'string' && notification.traceId.trim()) {
    return { key: `trace:${notification.traceId.trim()}`, basis: 'trace', stable: true };
  }
  const metadataEventId = notification.metadata?.eventId;
  if (typeof metadataEventId === 'string' && metadataEventId.trim()) {
    return { key: `metadata-event:${metadataEventId.trim()}`, basis: 'metadata-event', stable: true };
  }
  if (mode === 'content') {
    const content = normalizeContent(notification);
    if (content.length > 0) {
      const fingerprint = hashString(content);
      return { key: `content:${fingerprint}`, basis: 'content', stable: true };
    }
  }
  return { key: null, basis: 'none', stable: false };
}

function validateTimestamp(field, value, recordName) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_TIMESTAMP_INVALID',
      `${recordName}.${field} must be a valid timestamp`,
      `${recordName}.${field}`
    );
  }
}

export function createNotificationFingerprint(notification = {}, options = {}) {
  validateNotification(notification);
  const mode = options.mode ?? 'window';
  if (!DEDUPLICATION_MODES.includes(mode)) {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_MODE_INVALID',
      `Unsupported deduplication mode: ${mode}`,
      'options.mode'
    );
  }
  const selected = selectBasis(notification, mode);
  const fingerprintInput = selected.key ?? normalizeContent(notification);
  return freezeDeep({
    key: selected.key,
    fingerprint: fingerprintInput ? hashString(fingerprintInput) : null,
    basis: selected.basis,
    stable: selected.stable
  });
}

export function evaluateNotificationDuplicate({
  notification,
  previous,
  policy = {}
} = {}) {
  validateNotification(notification);
  if (previous !== undefined && !isPlainObject(previous)) {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_PREVIOUS_INVALID',
      'previous must be a plain object',
      'previous'
    );
  }
  if (!isPlainObject(policy)) {
    throw deduplicationError(
      'NOTIFICATION_DEDUPLICATION_POLICY_INVALID',
      'policy must be a plain object',
      'policy'
    );
  }
  const effectivePolicy = { ...DEFAULT_POLICY, ...cloneDeep(policy) };
  validatePolicy(effectivePolicy);
  const fingerprint = createNotificationFingerprint(notification, { mode: effectivePolicy.mode });
  let decision = 'new';
  let withinWindow = false;
  let ageMs = null;
  let reason = 'no-previous';

  if (effectivePolicy.mode === 'off') {
    reason = 'mode-off';
  } else if (!fingerprint.stable && effectivePolicy.requireStableKey) {
    decision = 'indeterminate';
    reason = 'stable-key-required';
  } else if (previous === undefined) {
    reason = 'no-previous';
  } else {
    const previousFingerprint = createNotificationFingerprint(previous, { mode: effectivePolicy.mode });
    if (fingerprint.key !== null && fingerprint.key === previousFingerprint.key) {
      validateTimestamp('createdAt', notification.createdAt, 'notification');
      validateTimestamp('createdAt', previous.createdAt, 'previous');
      ageMs = Date.parse(notification.createdAt) - Date.parse(previous.createdAt);
      if (ageMs >= 0 && ageMs <= effectivePolicy.windowMs) {
        decision = 'duplicate';
        withinWindow = true;
        reason = 'same-key-within-window';
      } else {
        decision = 'outside_window';
        reason = 'same-key-outside-window';
      }
    } else {
      reason = 'different-key';
    }
  }

  const suppress = decision === 'duplicate'
    && (notification.importance !== 'critical' || effectivePolicy.suppressCritical);
  return freezeDeep({
    decision,
    key: fingerprint.key,
    fingerprint: fingerprint.fingerprint,
    basis: fingerprint.basis,
    stable: fingerprint.stable,
    withinWindow,
    windowMs: effectivePolicy.windowMs,
    ageMs,
    suppress,
    reason
  });
}
