export { resolveSoundRule } from './sound-rule-resolver.js';

const IMPORTANCE_VALUES = Object.freeze(['low', 'normal', 'high', 'critical']);
const IMPORTANCE_RANK = Object.freeze({ low: 0, normal: 1, high: 2, critical: 3 });

export const SOUND_POLICY_DEFAULTS = Object.freeze({
  enabled: false,
  cue: 'default',
  volume: 1,
  minImportance: 'low',
  suppressDuplicates: true,
  quietMode: false,
  criticalBypass: true
});

export const SOUND_POLICY_CONTEXT_DEFAULTS = Object.freeze({
  isDuplicate: false,
  globalEnabled: true
});

function soundPolicyError(code, message, field, details = {}) {
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

function requireBoolean(code, field, value) {
  if (typeof value !== 'boolean') {
    throw soundPolicyError(code, `${field} must be a boolean`, field);
  }
}

function requireNonEmptyString(code, field, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw soundPolicyError(code, `${field} must be a non-empty string`, field);
  }
}

function validateImportance(value, field = 'importance') {
  if (!IMPORTANCE_VALUES.includes(value)) {
    throw soundPolicyError('SOUND_POLICY_IMPORTANCE_INVALID', `${field} has an unsupported value`, field);
  }
}

function validateNotification(notification) {
  if (!isPlainObject(notification)) {
    throw soundPolicyError('SOUND_POLICY_NOTIFICATION_INVALID', 'notification must be a plain object');
  }
  for (const field of ['notificationId', 'type', 'source']) {
    requireNonEmptyString('SOUND_POLICY_NOTIFICATION_INVALID', `notification.${field}`, notification[field]);
  }
  validateImportance(notification.importance, 'notification.importance');
}

function validatePolicy(policy) {
  if (!isPlainObject(policy)) {
    throw soundPolicyError('SOUND_POLICY_POLICY_INVALID', 'policy must be a plain object');
  }
  if ('enabled' in policy) requireBoolean('SOUND_POLICY_POLICY_INVALID', 'policy.enabled', policy.enabled);
  if ('suppressDuplicates' in policy) requireBoolean('SOUND_POLICY_POLICY_INVALID', 'policy.suppressDuplicates', policy.suppressDuplicates);
  if ('quietMode' in policy) requireBoolean('SOUND_POLICY_POLICY_INVALID', 'policy.quietMode', policy.quietMode);
  if ('criticalBypass' in policy) requireBoolean('SOUND_POLICY_POLICY_INVALID', 'policy.criticalBypass', policy.criticalBypass);
  if ('cue' in policy) requireNonEmptyString('SOUND_POLICY_CUE_INVALID', 'policy.cue', policy.cue);
  if ('minImportance' in policy) {
    try {
      validateImportance(policy.minImportance, 'policy.minImportance');
    } catch (error) {
      error.code = 'SOUND_POLICY_IMPORTANCE_INVALID';
      throw error;
    }
  }
  if ('volume' in policy && (typeof policy.volume !== 'number' || !Number.isFinite(policy.volume) || policy.volume < 0 || policy.volume > 1)) {
    throw soundPolicyError('SOUND_POLICY_VOLUME_INVALID', 'policy.volume must be a finite number between 0 and 1', 'policy.volume');
  }
}

function validateContext(context) {
  if (!isPlainObject(context)) {
    throw soundPolicyError('SOUND_POLICY_CONTEXT_INVALID', 'context must be a plain object');
  }
  if ('isDuplicate' in context) requireBoolean('SOUND_POLICY_CONTEXT_INVALID', 'context.isDuplicate', context.isDuplicate);
  if ('globalEnabled' in context) requireBoolean('SOUND_POLICY_CONTEXT_INVALID', 'context.globalEnabled', context.globalEnabled);
}

function createDecision({ notification, policy, context, play, reason, bypassed }) {
  return freezeDeep({
    play,
    cue: policy.cue,
    volume: policy.volume,
    importance: notification.importance,
    reason,
    bypassed,
    isDuplicate: context.isDuplicate,
    suppressDuplicates: policy.suppressDuplicates
  });
}

export function resolveNotificationSound({ notification, policy = {}, context = {} } = {}) {
  validateNotification(notification);
  validatePolicy(policy);
  validateContext(context);

  const effectivePolicy = {
    ...SOUND_POLICY_DEFAULTS,
    ...cloneDeep(policy)
  };
  const effectiveContext = {
    ...SOUND_POLICY_CONTEXT_DEFAULTS,
    ...cloneDeep(context)
  };
  const isCritical = notification.importance === 'critical';
  let bypassed = false;

  if (!effectiveContext.globalEnabled) {
    return createDecision({ notification, policy: effectivePolicy, context: effectiveContext, play: false, reason: 'global-disabled', bypassed });
  }
  if (IMPORTANCE_RANK[notification.importance] < IMPORTANCE_RANK[effectivePolicy.minImportance]) {
    return createDecision({ notification, policy: effectivePolicy, context: effectiveContext, play: false, reason: 'below-threshold', bypassed });
  }
  if (effectivePolicy.quietMode) {
    if (!isCritical || !effectivePolicy.criticalBypass) {
      return createDecision({ notification, policy: effectivePolicy, context: effectiveContext, play: false, reason: 'quiet-mode', bypassed });
    }
    bypassed = true;
  }
  if (!effectivePolicy.enabled) {
    return createDecision({ notification, policy: effectivePolicy, context: effectiveContext, play: false, reason: 'policy-disabled', bypassed });
  }
  if (effectiveContext.isDuplicate && effectivePolicy.suppressDuplicates) {
    if (!isCritical || !effectivePolicy.criticalBypass) {
      return createDecision({ notification, policy: effectivePolicy, context: effectiveContext, play: false, reason: 'duplicate-suppressed', bypassed });
    }
    bypassed = true;
  }
  return createDecision({ notification, policy: effectivePolicy, context: effectiveContext, play: true, reason: 'allowed', bypassed });
}

export function validateSoundPolicy(policy) {
  validatePolicy(policy);
  return true;
}

export function validateSoundPolicyContext(context) {
  validateContext(context);
  return true;
}
