const SOUND_POLICY_FIELDS = Object.freeze([
  'enabled',
  'cue',
  'volume',
  'minImportance',
  'suppressDuplicates',
  'quietMode',
  'criticalBypass'
]);
const SOUND_SETTINGS_FIELDS = Object.freeze([
  'globalSoundEnabled',
  'profile',
  'defaultPolicy',
  'typePolicies',
  'importancePolicies',
  'workModeMuted',
  'fallback'
]);
const IMPORTANCE_VALUES = Object.freeze(['low', 'normal', 'high', 'critical']);
const FALLBACK_VALUES = Object.freeze(['builtin-default']);

import { createSoundProfile, SOUND_CUES } from './sound-profile.js';

const SOUND_PROFILE_DEFAULTS = createSoundProfile();

const SOUND_POLICY_DEFAULTS = Object.freeze({
  enabled: false,
  cue: 'chat-incoming',
  volume: 1,
  minImportance: 'low',
  suppressDuplicates: true,
  quietMode: false,
  criticalBypass: true
});

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

function settingsError(code, message, field, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field, ...details } : { ...details };
  return error;
}

function requirePlainObject(field, value) {
  if (!isPlainObject(value)) {
    throw settingsError('SOUND_SETTINGS_FIELD_INVALID', `${field} must be a plain object`, field);
  }
}

function requireBoolean(field, value) {
  if (typeof value !== 'boolean') {
    throw settingsError('SOUND_SETTINGS_FIELD_INVALID', `${field} must be a boolean`, field);
  }
}

function requireNonEmptyString(field, value, code = 'SOUND_SETTINGS_FIELD_INVALID') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw settingsError(code, `${field} must be a non-empty string`, field);
  }
}

function validatePolicy(policy, field) {
  requirePlainObject(field, policy);
  for (const key of Object.keys(policy)) {
    if (!SOUND_POLICY_FIELDS.includes(key)) {
      throw settingsError('SOUND_SETTINGS_FIELD_UNKNOWN', `Unknown ${field} field: ${key}`, `${field}.${key}`);
    }
  }
  if ('enabled' in policy) requireBoolean(`${field}.enabled`, policy.enabled);
  if ('cue' in policy) requireNonEmptyString(`${field}.cue`, policy.cue, 'SOUND_SETTINGS_CUE_INVALID');
  if ('volume' in policy && (typeof policy.volume !== 'number' || !Number.isFinite(policy.volume) || policy.volume < 0 || policy.volume > 1)) {
    throw settingsError('SOUND_SETTINGS_VOLUME_INVALID', `${field}.volume must be between 0 and 1`, `${field}.volume`);
  }
  if ('minImportance' in policy && !IMPORTANCE_VALUES.includes(policy.minImportance)) {
    throw settingsError('SOUND_SETTINGS_IMPORTANCE_INVALID', `${field}.minImportance has an unsupported value`, `${field}.minImportance`);
  }
  for (const key of ['suppressDuplicates', 'quietMode', 'criticalBypass']) {
    if (key in policy) requireBoolean(`${field}.${key}`, policy[key]);
  }
}

function validateSettings(input) {
  requirePlainObject('settings', input);
  for (const key of Object.keys(input)) {
    if (!SOUND_SETTINGS_FIELDS.includes(key)) {
      throw settingsError('SOUND_SETTINGS_FIELD_UNKNOWN', `Unknown sound settings field: ${key}`, key);
    }
  }
  if ('globalSoundEnabled' in input) requireBoolean('globalSoundEnabled', input.globalSoundEnabled);
  if ('profile' in input) migrateLegacyProfile(input);
  if ('workModeMuted' in input) requireBoolean('workModeMuted', input.workModeMuted);
  if ('fallback' in input) {
    if (!FALLBACK_VALUES.includes(input.fallback)) {
      throw settingsError('SOUND_SETTINGS_FALLBACK_INVALID', 'fallback has an unsupported value', 'fallback');
    }
  }
  if ('defaultPolicy' in input) validatePolicy(input.defaultPolicy, 'defaultPolicy');
  if ('typePolicies' in input) {
    requirePlainObject('typePolicies', input.typePolicies);
    for (const [key, policy] of Object.entries(input.typePolicies)) validatePolicy(policy, `typePolicies.${key}`);
  }
  if ('importancePolicies' in input) {
    requirePlainObject('importancePolicies', input.importancePolicies);
    for (const [key, policy] of Object.entries(input.importancePolicies)) {
      if (!IMPORTANCE_VALUES.includes(key)) {
        throw settingsError('SOUND_SETTINGS_IMPORTANCE_INVALID', `Unknown importance policy: ${key}`, `importancePolicies.${key}`);
      }
      validatePolicy(policy, `importancePolicies.${key}`);
    }
  }
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

export const SOUND_SETTINGS_DEFAULTS = freezeDeep({
  globalSoundEnabled: true,
  defaultPolicy: SOUND_POLICY_DEFAULTS,
  typePolicies: {},
  importancePolicies: {},
  workModeMuted: false,
  fallback: 'builtin-default',
  profile: SOUND_PROFILE_DEFAULTS
});

function migrateCue(cue, fallback = 'chat-incoming') {
  if (SOUND_CUES.includes(cue)) return cue;
  return { default: fallback, success: 'tool-complete', critical: 'critical-error' }[cue] ?? fallback;
}

function migrateLegacyProfile(input) {
  if (input.profile) {
    const legacy = input.profile;
    // Older snapshots used category/rules presentation fields. They belong to
    // the retired sound model and must not make the current settings snapshot
    // unloadable; preserve only fields understood by the event-based profile.
    const migrated = {
      ...(legacy.version === undefined ? {} : { version: legacy.version }),
      ...(legacy.global && typeof legacy.global === 'object' ? { global: legacy.global } : {}),
      ...(legacy.soundProfiles && typeof legacy.soundProfiles === 'object' ? { soundProfiles: legacy.soundProfiles } : {}),
      ...(Array.isArray(legacy.soundOverrides) ? { soundOverrides: legacy.soundOverrides } : {})
    };
    return createSoundProfile(migrated);
  }
  const defaultPolicy = cloneDeep(input.defaultPolicy ?? {});
  if ('cue' in defaultPolicy) defaultPolicy.cue = migrateCue(defaultPolicy.cue);
  return createSoundProfile({ global: defaultPolicy });
}

export function createSoundSettings(input = {}) {
  validateSettings(input);
  const result = {
    ...cloneDeep(SOUND_SETTINGS_DEFAULTS),
    ...cloneDeep(input),
    profile: migrateLegacyProfile(input),
    defaultPolicy: {
      ...cloneDeep(SOUND_POLICY_DEFAULTS),
      ...cloneDeep(input.defaultPolicy ?? {})
    },
    typePolicies: cloneDeep(input.typePolicies ?? {}),
    importancePolicies: cloneDeep(input.importancePolicies ?? {})
  };
  return freezeDeep(result);
}

export function validateSoundSettings(settings) {
  validateSettings(settings);
  return true;
}
