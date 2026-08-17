import { createSoundSettings, validateSoundSettings } from './sound-settings.js';

export const SETTINGS_STORE_VERSION = 1;

function snapshotError(code, message, field, details = {}) {
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

function validateTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validateShape(snapshot) {
  if (!isPlainObject(snapshot)) {
    throw snapshotError(
      'SETTINGS_STORE_SNAPSHOT_INVALID',
      'Settings Store snapshot must be a plain object'
    );
  }
  if (snapshot.version !== SETTINGS_STORE_VERSION) {
    throw snapshotError(
      'SETTINGS_STORE_SNAPSHOT_VERSION_UNSUPPORTED',
      `Unsupported Settings Store snapshot version: ${snapshot.version}`,
      'version'
    );
  }
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) {
    throw snapshotError(
      'SETTINGS_STORE_SNAPSHOT_INVALID',
      'Settings Store snapshot revision must be a positive integer',
      'revision'
    );
  }
  if (!isPlainObject(snapshot.settings)) {
    throw snapshotError(
      'SETTINGS_STORE_SNAPSHOT_INVALID',
      'Settings Store snapshot settings must be a plain object',
      'settings'
    );
  }
  if (!validateTimestamp(snapshot.updatedAt)) {
    throw snapshotError(
      'SETTINGS_STORE_SNAPSHOT_INVALID',
      'Settings Store snapshot updatedAt must be a valid timestamp',
      'updatedAt'
    );
  }
  const fields = Object.keys(snapshot);
  for (const field of fields) {
    if (!['version', 'revision', 'settings', 'updatedAt'].includes(field)) {
      throw snapshotError(
        'SETTINGS_STORE_SNAPSHOT_INVALID',
        `Unknown Settings Store snapshot field: ${field}`,
        field
      );
    }
  }
  try {
    validateSoundSettings(snapshot.settings);
  } catch (error) {
    throw snapshotError(
      'SETTINGS_STORE_SNAPSHOT_INVALID',
      'Settings Store snapshot contains invalid sound settings',
      'settings',
      { cause: error.code, message: error.message }
    );
  }
}

export function validateSettingsStoreSnapshot(snapshot) {
  validateShape(snapshot);
  return true;
}

export function createSettingsStoreSnapshot(
  settings,
  revision,
  { updatedAt = new Date().toISOString() } = {}
) {
  const normalizedSettings = createSoundSettings(cloneDeep(settings));
  const snapshot = {
    version: SETTINGS_STORE_VERSION,
    revision,
    settings: normalizedSettings,
    updatedAt
  };
  validateSettingsStoreSnapshot(snapshot);
  return freezeDeep(snapshot);
}

export function serializeSettingsStoreSnapshot(snapshot) {
  validateSettingsStoreSnapshot(snapshot);
  return `${JSON.stringify(snapshot)}\n`;
}

export function parseSettingsStoreSnapshot(text) {
  if (typeof text !== 'string') {
    throw snapshotError(
      'SETTINGS_STORE_SNAPSHOT_PARSE_FAILED',
      'Settings Store snapshot text must be a string',
      'json'
    );
  }
  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch (error) {
    throw snapshotError(
      'SETTINGS_STORE_SNAPSHOT_PARSE_FAILED',
      'Settings Store snapshot contains invalid JSON',
      'json',
      { cause: error.message }
    );
  }
  validateSettingsStoreSnapshot(snapshot);
  return freezeDeep(cloneDeep(snapshot));
}
