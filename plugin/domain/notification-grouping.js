const DEFAULT_POLICY = Object.freeze({
  mode: 'window',
  windowMs: 120000,
  maxMembers: 5,
  allowCritical: false,
  requireStableKey: true
});

export const GROUPING_MODES = Object.freeze(['off', 'window', 'session']);
export const GROUPING_DECISIONS = Object.freeze(['join', 'new_group', 'reject', 'indeterminate']);

function groupingError(code, message, field, details = {}) {
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
    throw groupingError(
      'NOTIFICATION_GROUPING_NOTIFICATION_INVALID',
      'notification must be a plain object',
      'notification'
    );
  }
  for (const field of ['source', 'type', 'title', 'content']) {
    if (notification[field] !== undefined && typeof notification[field] !== 'string') {
      throw groupingError(
        'NOTIFICATION_GROUPING_NOTIFICATION_INVALID',
        `notification.${field} must be a string`,
        `notification.${field}`
      );
    }
  }
  if (notification.session !== undefined && !isPlainObject(notification.session)) {
    throw groupingError(
      'NOTIFICATION_GROUPING_NOTIFICATION_INVALID',
      'notification.session must be a plain object',
      'notification.session'
    );
  }
  if (notification.importance !== undefined
    && !['low', 'normal', 'high', 'critical'].includes(notification.importance)) {
    throw groupingError(
      'NOTIFICATION_GROUPING_NOTIFICATION_INVALID',
      'notification.importance is invalid',
      'notification.importance'
    );
  }
}

function validateGroup(group) {
  if (!isPlainObject(group)) {
    throw groupingError(
      'NOTIFICATION_GROUPING_GROUP_INVALID',
      'group must be a plain object',
      'group'
    );
  }
  if (typeof group.groupKey !== 'string' || group.groupKey.length === 0) {
    throw groupingError(
      'NOTIFICATION_GROUPING_GROUP_INVALID',
      'group.groupKey must be a non-empty string',
      'group.groupKey'
    );
  }
  if (!Number.isInteger(group.memberCount) || group.memberCount < 0) {
    throw groupingError(
      'NOTIFICATION_GROUPING_GROUP_INVALID',
      'group.memberCount must be a non-negative integer',
      'group.memberCount'
    );
  }
  if (typeof group.containsCritical !== 'boolean') {
    throw groupingError(
      'NOTIFICATION_GROUPING_GROUP_INVALID',
      'group.containsCritical must be a boolean',
      'group.containsCritical'
    );
  }
}

function validatePolicy(policy) {
  if (!isPlainObject(policy)) {
    throw groupingError(
      'NOTIFICATION_GROUPING_POLICY_INVALID',
      'policy must be a plain object',
      'policy'
    );
  }
  if (!GROUPING_MODES.includes(policy.mode)) {
    throw groupingError(
      'NOTIFICATION_GROUPING_MODE_INVALID',
      `Unsupported grouping mode: ${policy.mode}`,
      'policy.mode'
    );
  }
  if (!Number.isInteger(policy.windowMs) || policy.windowMs <= 0 || policy.windowMs > 86400000) {
    throw groupingError(
      'NOTIFICATION_GROUPING_WINDOW_INVALID',
      'policy.windowMs must be an integer from 1 to 86400000',
      'policy.windowMs'
    );
  }
  if (!Number.isInteger(policy.maxMembers) || policy.maxMembers <= 0 || policy.maxMembers > 1000) {
    throw groupingError(
      'NOTIFICATION_GROUPING_MEMBER_LIMIT_INVALID',
      'policy.maxMembers must be an integer from 1 to 1000',
      'policy.maxMembers'
    );
  }
  if (typeof policy.allowCritical !== 'boolean' || typeof policy.requireStableKey !== 'boolean') {
    throw groupingError(
      'NOTIFICATION_GROUPING_POLICY_INVALID',
      'policy boolean fields are invalid',
      'policy'
    );
  }
}

function selectGroupKey(notification) {
  const explicit = notification.groupKey;
  if (typeof explicit === 'string' && explicit.trim()) {
    return { key: `explicit:${explicit.trim()}`, basis: 'explicit', stable: true };
  }
  const incidentKey = notification.metadata?.incidentKey;
  if (typeof incidentKey === 'string' && incidentKey.trim()) {
    return { key: `incident:${incidentKey.trim()}`, basis: 'incident', stable: true };
  }
  const sessionId = notification.session?.id ?? notification.sessionId;
  if (typeof sessionId === 'string' && sessionId.trim()) {
    return { key: `session:${sessionId.trim()}`, basis: 'session', stable: true };
  }
  if (typeof notification.source === 'string' && notification.source.trim()
    && typeof notification.type === 'string' && notification.type.trim()) {
    return {
      key: `source-type:${notification.source.trim()}:${notification.type.trim()}`,
      basis: 'source-type',
      stable: true
    };
  }
  return { key: null, basis: 'none', stable: false };
}

export function createNotificationGroupKey(notification = {}, policy = {}) {
  validateNotification(notification);
  if (!isPlainObject(policy)) {
    throw groupingError(
      'NOTIFICATION_GROUPING_POLICY_INVALID',
      'policy must be a plain object',
      'policy'
    );
  }
  return freezeDeep(selectGroupKey(notification));
}

function validateTimestamp(field, value, recordName) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw groupingError(
      'NOTIFICATION_GROUPING_TIMESTAMP_INVALID',
      `${recordName}.${field} must be a valid timestamp`,
      `${recordName}.${field}`
    );
  }
}

export function evaluateNotificationGrouping({
  notification,
  group,
  policy = {}
} = {}) {
  validateNotification(notification);
  if (group !== undefined) validateGroup(group);
  if (!isPlainObject(policy)) {
    throw groupingError(
      'NOTIFICATION_GROUPING_POLICY_INVALID',
      'policy must be a plain object',
      'policy'
    );
  }
  const effectivePolicy = { ...DEFAULT_POLICY, ...cloneDeep(policy) };
  validatePolicy(effectivePolicy);
  const groupKey = createNotificationGroupKey(notification, effectivePolicy);
  let decision = 'new_group';
  let compatible = false;
  let withinWindow = false;
  let reason = 'no-group';

  if (effectivePolicy.mode === 'off') {
    reason = 'mode-off';
  } else if (!groupKey.stable && effectivePolicy.requireStableKey) {
    decision = 'indeterminate';
    reason = 'stable-key-required';
  } else if (group === undefined) {
    reason = 'no-group';
  } else if (effectivePolicy.mode === 'session'
    && !['session', 'incident'].includes(groupKey.basis)) {
    decision = 'reject';
    reason = 'session-key-required';
  } else if (groupKey.key !== group.groupKey) {
    decision = 'reject';
    reason = 'different-key';
  } else if (group.memberCount >= effectivePolicy.maxMembers) {
    decision = 'reject';
    reason = 'member-limit';
  } else if (notification.importance === 'critical' && !effectivePolicy.allowCritical) {
    decision = 'reject';
    reason = 'critical-isolated';
  } else if (group.containsCritical && !effectivePolicy.allowCritical) {
    decision = 'reject';
    reason = 'group-contains-critical';
  } else {
    validateTimestamp('createdAt', notification.createdAt, 'notification');
    validateTimestamp('lastActivityAt', group.lastActivityAt, 'group');
    const ageMs = Date.parse(notification.createdAt) - Date.parse(group.lastActivityAt);
    if (ageMs < 0) {
      decision = 'reject';
      reason = 'future-group-activity';
    } else if (ageMs <= effectivePolicy.windowMs) {
      decision = 'join';
      compatible = true;
      withinWindow = true;
      reason = 'same-key-within-window';
    } else {
      decision = 'reject';
      reason = 'outside-window';
    }
  }

  const ageMs = group === undefined || !group.lastActivityAt || !notification.createdAt
    ? null
    : Date.parse(notification.createdAt) - Date.parse(group.lastActivityAt);
  return freezeDeep({
    decision,
    key: groupKey.key,
    basis: groupKey.basis,
    compatible,
    withinWindow,
    memberCount: group?.memberCount ?? 0,
    maxMembers: effectivePolicy.maxMembers,
    windowMs: effectivePolicy.windowMs,
    ageMs: Number.isNaN(ageMs) ? null : ageMs,
    reason
  });
}
