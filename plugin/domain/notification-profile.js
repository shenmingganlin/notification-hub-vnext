import { NOTIFICATION_IMPORTANCE } from './notification-record.js';
import { createImportanceSettings } from './notification-importance.js';

const DISPLAY_MODES = ['card', 'silent', 'deferred'];
const CONTENT_MODES = ['full', 'summary', 'redacted'];
const LAYOUTS = ['fixed', 'stack', 'shelf'];

export const NOTIFICATION_PROFILE_FIELDS = Object.freeze([
  'id', 'parentId', 'enabled', 'importance', 'displayMode',
  'soundPolicy', 'contentPolicy', 'historyPolicy', 'runtimeHints', 'importanceKeywords'
]);

export const NOTIFICATION_PROFILE_DEFAULTS = Object.freeze({
  id: 'default',
  parentId: null,
  enabled: true,
  importance: 'normal',
  displayMode: 'card',
  soundPolicy: Object.freeze({ enabled: false, cue: 'default', suppressDuplicates: true }),
  contentPolicy: Object.freeze({ mode: 'full', maxLength: 4000 }),
  historyPolicy: Object.freeze({ save: true, maxAgeMs: null }),
  runtimeHints: Object.freeze({ layout: 'stack', lifetimeMs: 120000 }),
  importanceKeywords: Object.freeze({ keywords: Object.freeze([]) })
});

function profileError(code, message, field, details = {}) {
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

function requireNonEmptyId(field, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw profileError('NOTIFICATION_PROFILE_ID_INVALID', `${field} must be a non-empty string`, field);
  }
}

function requireNonEmptyString(field, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw profileError('NOTIFICATION_PROFILE_FIELD_INVALID', `${field} must be a non-empty string`, field);
  }
}

function requirePlainObject(field, value) {
  if (!isPlainObject(value)) {
    throw profileError('NOTIFICATION_PROFILE_FIELD_INVALID', `${field} must be a plain object`, field);
  }
}

function requireBoolean(field, value) {
  if (typeof value !== 'boolean') {
    throw profileError('NOTIFICATION_PROFILE_FIELD_INVALID', `${field} must be a boolean`, field);
  }
}

function requireEnum(field, value, values) {
  if (!values.includes(value)) {
    throw profileError('NOTIFICATION_PROFILE_FIELD_INVALID', `${field} has an unsupported value`, field);
  }
}

function requirePositiveInteger(field, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw profileError('NOTIFICATION_PROFILE_FIELD_INVALID', `${field} must be a positive integer`, field);
  }
}

function requireNonNegativeIntegerOrNull(field, value) {
  if (value !== null && (!Number.isInteger(value) || value < 0)) {
    throw profileError('NOTIFICATION_PROFILE_FIELD_INVALID', `${field} must be null or a non-negative integer`, field);
  }
}

function validateFields(input) {
  for (const field of Object.keys(input)) {
    if (!NOTIFICATION_PROFILE_FIELDS.includes(field)) {
      throw profileError('NOTIFICATION_PROFILE_FIELD_UNKNOWN', `Unknown NotificationProfile field: ${field}`, field);
    }
  }
  if ('id' in input) requireNonEmptyId('id', input.id);
  if ('parentId' in input && input.parentId !== null) requireNonEmptyId('parentId', input.parentId);
  if ('enabled' in input) requireBoolean('enabled', input.enabled);
  if ('importance' in input) requireEnum('importance', input.importance, NOTIFICATION_IMPORTANCE);
  if ('displayMode' in input) requireEnum('displayMode', input.displayMode, DISPLAY_MODES);

  if ('soundPolicy' in input) {
    requirePlainObject('soundPolicy', input.soundPolicy);
    for (const field of Object.keys(input.soundPolicy)) {
      if (!['enabled', 'cue', 'suppressDuplicates'].includes(field)) {
        throw profileError('NOTIFICATION_PROFILE_FIELD_UNKNOWN', `Unknown soundPolicy field: ${field}`, `soundPolicy.${field}`);
      }
    }
    if ('enabled' in input.soundPolicy) requireBoolean('soundPolicy.enabled', input.soundPolicy.enabled);
    if ('cue' in input.soundPolicy) requireNonEmptyString('soundPolicy.cue', input.soundPolicy.cue);
    if ('suppressDuplicates' in input.soundPolicy) requireBoolean('soundPolicy.suppressDuplicates', input.soundPolicy.suppressDuplicates);
  }

  if ('contentPolicy' in input) {
    requirePlainObject('contentPolicy', input.contentPolicy);
    for (const field of Object.keys(input.contentPolicy)) {
      if (!['mode', 'maxLength'].includes(field)) {
        throw profileError('NOTIFICATION_PROFILE_FIELD_UNKNOWN', `Unknown contentPolicy field: ${field}`, `contentPolicy.${field}`);
      }
    }
    if ('mode' in input.contentPolicy) requireEnum('contentPolicy.mode', input.contentPolicy.mode, CONTENT_MODES);
    if ('maxLength' in input.contentPolicy) requirePositiveInteger('contentPolicy.maxLength', input.contentPolicy.maxLength);
  }

  if ('historyPolicy' in input) {
    requirePlainObject('historyPolicy', input.historyPolicy);
    for (const field of Object.keys(input.historyPolicy)) {
      if (!['save', 'maxAgeMs'].includes(field)) {
        throw profileError('NOTIFICATION_PROFILE_FIELD_UNKNOWN', `Unknown historyPolicy field: ${field}`, `historyPolicy.${field}`);
      }
    }
    if ('save' in input.historyPolicy) requireBoolean('historyPolicy.save', input.historyPolicy.save);
    if ('maxAgeMs' in input.historyPolicy) requireNonNegativeIntegerOrNull('historyPolicy.maxAgeMs', input.historyPolicy.maxAgeMs);
  }

  if ('importanceKeywords' in input) {
    try {
      createImportanceSettings(input.importanceKeywords);
    } catch (cause) {
      throw profileError(cause.code ?? 'NOTIFICATION_PROFILE_IMPORTANCE_KEYWORDS_INVALID', cause.message, 'importanceKeywords', cause.details ?? {});
    }
  }

  if ('runtimeHints' in input) {
    requirePlainObject('runtimeHints', input.runtimeHints);
    for (const field of Object.keys(input.runtimeHints)) {
      if (!['layout', 'lifetimeMs'].includes(field)) {
        throw profileError('NOTIFICATION_PROFILE_FIELD_UNKNOWN', `Unknown runtimeHints field: ${field}`, `runtimeHints.${field}`);
      }
    }
    if ('layout' in input.runtimeHints) requireEnum('runtimeHints.layout', input.runtimeHints.layout, LAYOUTS);
    if ('lifetimeMs' in input.runtimeHints) requirePositiveInteger('runtimeHints.lifetimeMs', input.runtimeHints.lifetimeMs);
  }
}

export function createNotificationProfile(input = {}) {
  if (!isPlainObject(input)) {
    throw profileError('NOTIFICATION_PROFILE_INVALID', 'NotificationProfile input must be a plain object');
  }
  validateFields(input);
  const profile = {
    ...cloneDeep(NOTIFICATION_PROFILE_DEFAULTS),
    ...cloneDeep(input),
    soundPolicy: { ...NOTIFICATION_PROFILE_DEFAULTS.soundPolicy, ...cloneDeep(input.soundPolicy ?? {}) },
    contentPolicy: { ...NOTIFICATION_PROFILE_DEFAULTS.contentPolicy, ...cloneDeep(input.contentPolicy ?? {}) },
    historyPolicy: { ...NOTIFICATION_PROFILE_DEFAULTS.historyPolicy, ...cloneDeep(input.historyPolicy ?? {}) },
    runtimeHints: { ...NOTIFICATION_PROFILE_DEFAULTS.runtimeHints, ...cloneDeep(input.runtimeHints ?? {}) },
    importanceKeywords: createImportanceSettings(input.importanceKeywords ?? NOTIFICATION_PROFILE_DEFAULTS.importanceKeywords)
  };
  validateFields(profile);
  return freezeDeep(profile);
}

export function validateNotificationProfile(profile) {
  if (!isPlainObject(profile)) {
    throw profileError('NOTIFICATION_PROFILE_INVALID', 'NotificationProfile must be a plain object');
  }
  validateFields(profile);
  requireNonEmptyId('id', profile.id);
  if (!('parentId' in profile)) {
    throw profileError('NOTIFICATION_PROFILE_FIELD_INVALID', 'NotificationProfile parentId is required', 'parentId');
  }
  requireBoolean('enabled', profile.enabled);
  requireEnum('importance', profile.importance, NOTIFICATION_IMPORTANCE);
  requireEnum('displayMode', profile.displayMode, DISPLAY_MODES);
  requirePlainObject('soundPolicy', profile.soundPolicy);
  requirePlainObject('contentPolicy', profile.contentPolicy);
  requirePlainObject('historyPolicy', profile.historyPolicy);
  requirePlainObject('runtimeHints', profile.runtimeHints);
  validateFields({ soundPolicy: profile.soundPolicy, contentPolicy: profile.contentPolicy, historyPolicy: profile.historyPolicy, runtimeHints: profile.runtimeHints });
  return true;
}
