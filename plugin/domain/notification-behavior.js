export const BEHAVIOR_MODES = Object.freeze(['stack', 'danmaku', 'ticker', 'popup']);

function behaviorError(code, message, field, details = {}) {
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

function text(field, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw behaviorError('NOTIFICATION_BEHAVIOR_FIELD_INVALID', `${field} must be a non-empty string`, field);
  }
  return value.trim();
}

export function createBehaviorProfile(input = {}) {
  if (!isPlainObject(input)) throw behaviorError('NOTIFICATION_BEHAVIOR_PROFILE_INVALID', 'behavior profile must be a plain object', 'profile');
  const mode = text('mode', input.mode ?? 'stack');
  if (!BEHAVIOR_MODES.includes(mode)) throw behaviorError('NOTIFICATION_BEHAVIOR_MODE_INVALID', `Unsupported behavior mode: ${mode}`, 'mode');
  const channelId = text('channelId', input.channelId ?? `${mode}.main`);
  const durationMs = input.durationMs ?? 5000;
  const maxVisible = input.maxVisible ?? 8;
  if (!Number.isInteger(durationMs) || durationMs < 0) throw behaviorError('NOTIFICATION_BEHAVIOR_DURATION_INVALID', 'durationMs must be a non-negative integer', 'durationMs');
  if (!Number.isInteger(maxVisible) || maxVisible < 1 || maxVisible > 100) throw behaviorError('NOTIFICATION_BEHAVIOR_MAX_VISIBLE_INVALID', 'maxVisible must be between 1 and 100', 'maxVisible');
  return freezeDeep({
    profileId: input.profileId ?? mode,
    mode,
    channelId,
    durationMs,
    maxVisible,
    aggregation: input.aggregation ?? 'none'
  });
}

export function createBehaviorCard(input = {}) {
  if (!isPlainObject(input)) throw behaviorError('NOTIFICATION_BEHAVIOR_CARD_INVALID', 'behavior card must be a plain object', 'card');
  return freezeDeep({
    cardId: text('cardId', input.cardId),
    notificationId: text('notificationId', input.notificationId ?? input.cardId),
    eventId: text('eventId', input.eventId),
    channelId: text('channelId', input.channelId),
    visualProfileId: text('visualProfileId', input.visualProfileId ?? 'visual.default'),
    createdAt: input.createdAt ?? new Date().toISOString(),
    payload: clone(input.payload ?? {})
  });
}
