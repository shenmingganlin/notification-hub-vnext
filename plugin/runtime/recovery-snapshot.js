import { PROTOCOL_VERSION } from '../protocol/index.js';

export const RECOVERY_SNAPSHOT_VERSION = 1;
export const RECOVERABLE_COMMAND_TYPES = Object.freeze([
  'config.update',
  'scene.set-mode'
]);

const RECOVERABLE_COMMAND_SET = new Set(RECOVERABLE_COMMAND_TYPES);

function recoveryError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw recoveryError('RUNTIME_RECOVERY_INVALID_PAYLOAD', 'Recovery payload must be JSON serializable', {
      cause: error.message
    });
  }
}

export function createRecoverySnapshot({ updatedAt = new Date().toISOString(), entries = [] } = {}) {
  const snapshot = {
    recoveryVersion: RECOVERY_SNAPSHOT_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    updatedAt,
    entries: []
  };
  for (const entry of entries) addRecoveryEntry(snapshot, entry);
  return snapshot;
}

export function addRecoveryEntry(snapshot, { type, payload = {}, key = type } = {}) {
  validateRecoverySnapshot(snapshot);
  if (!RECOVERABLE_COMMAND_SET.has(type)) {
    throw recoveryError('RUNTIME_RECOVERY_TYPE_UNSUPPORTED', `Command type is not recoverable: ${String(type)}`, { type });
  }
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw recoveryError('RUNTIME_RECOVERY_KEY_INVALID', 'Recovery entry key must be a non-empty string');
  }
  if (!isRecord(payload)) {
    throw recoveryError('RUNTIME_RECOVERY_INVALID_PAYLOAD', 'Recovery payload must be an object');
  }

  const entry = Object.freeze({ key, type, payload: Object.freeze(cloneJson(payload)) });
  const existingIndex = snapshot.entries.findIndex((candidate) => candidate.key === key);
  if (existingIndex >= 0) snapshot.entries.splice(existingIndex, 1, entry);
  else snapshot.entries.push(entry);
  snapshot.updatedAt = new Date().toISOString();
  return snapshot;
}

export function validateRecoverySnapshot(snapshot) {
  if (!isRecord(snapshot)) {
    throw recoveryError('RUNTIME_RECOVERY_INVALID_SNAPSHOT', 'Recovery snapshot must be an object');
  }
  if (snapshot.recoveryVersion !== RECOVERY_SNAPSHOT_VERSION || snapshot.protocolVersion !== PROTOCOL_VERSION) {
    throw recoveryError('RUNTIME_RECOVERY_VERSION_UNSUPPORTED', 'Recovery snapshot version is unsupported', {
      recoveryVersion: snapshot.recoveryVersion,
      protocolVersion: snapshot.protocolVersion
    });
  }
  if (typeof snapshot.updatedAt !== 'string' || Number.isNaN(Date.parse(snapshot.updatedAt))) {
    throw recoveryError('RUNTIME_RECOVERY_INVALID_SNAPSHOT', 'Recovery snapshot updatedAt must be an ISO date-time');
  }
  if (!Array.isArray(snapshot.entries)) {
    throw recoveryError('RUNTIME_RECOVERY_INVALID_SNAPSHOT', 'Recovery snapshot entries must be an array');
  }
  for (const entry of snapshot.entries) {
    if (!isRecord(entry) || typeof entry.key !== 'string' || !RECOVERABLE_COMMAND_SET.has(entry.type) || !isRecord(entry.payload)) {
      throw recoveryError('RUNTIME_RECOVERY_INVALID_SNAPSHOT', 'Recovery snapshot contains an invalid entry');
    }
  }
  return snapshot;
}

export function serializeRecoverySnapshot(snapshot) {
  validateRecoverySnapshot(snapshot);
  return JSON.stringify(snapshot);
}

export function parseRecoverySnapshot(serialized) {
  if (typeof serialized !== 'string') {
    throw recoveryError('RUNTIME_RECOVERY_INVALID_SNAPSHOT', 'Serialized recovery snapshot must be a string');
  }
  let snapshot;
  try {
    snapshot = JSON.parse(serialized);
  } catch (error) {
    throw recoveryError('RUNTIME_RECOVERY_INVALID_SNAPSHOT', 'Serialized recovery snapshot is not valid JSON', {
      cause: error.message
    });
  }
  return validateRecoverySnapshot(snapshot);
}
