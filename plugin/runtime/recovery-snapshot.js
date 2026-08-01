import { dirname } from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

import { PROTOCOL_VERSION } from '../protocol/index.js';

export const RECOVERY_SNAPSHOT_VERSION = 1;
export const RECOVERABLE_COMMAND_TYPES = Object.freeze([
  'config.update',
  'scene.set-mode',
  'scene.create',
  'scene.update',
  'scene.dismiss'
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

function validateWindowGeometry(payload, type = 'scene.update') {
  const fields = ['x', 'y', 'width', 'height'];
  if (!fields.every((field) => Number.isInteger(payload[field]))) {
    throw recoveryError('RUNTIME_RECOVERY_INVALID_PAYLOAD', `${type} requires integer x, y, width, and height`);
  }
  if (payload.width <= 0 || payload.height <= 0 || payload.width > 10000 || payload.height > 10000) {
    throw recoveryError('RUNTIME_RECOVERY_INVALID_PAYLOAD', `${type} width and height are outside the supported range`);
  }
}

function validateSceneCardPayload(payload, type) {
  if (typeof payload.id !== 'string' || payload.id.trim().length === 0
    || typeof payload.title !== 'string' || payload.title.trim().length === 0) {
    throw recoveryError('RUNTIME_RECOVERY_INVALID_PAYLOAD', `${type} requires non-empty id and title`);
  }
  validateWindowGeometry(payload, type);
  return payload;
}

function validateSceneUpdatePayload(payload) {
  if ('id' in payload) return validateSceneCardPayload(payload, 'scene.update');
  validateWindowGeometry(payload);
  return payload;
}

function validateSceneDismissPayload(payload) {
  if (typeof payload.id !== 'string' || payload.id.trim().length === 0) {
    throw recoveryError('RUNTIME_RECOVERY_INVALID_PAYLOAD', 'scene.dismiss requires a non-empty id');
  }
  return payload;
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
  if (type === 'scene.create' || type === 'scene.update') {
    if (type === 'scene.create' || 'id' in payload) validateSceneCardPayload(payload, type);
    else validateSceneUpdatePayload(payload);
  }
  if (type === 'scene.dismiss') validateSceneDismissPayload(payload);

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
    if (entry.type === 'scene.create') validateSceneCardPayload(entry.payload, entry.type);
    if (entry.type === 'scene.update') validateSceneUpdatePayload(entry.payload);
    if (entry.type === 'scene.dismiss') validateSceneDismissPayload(entry.payload);
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

export async function saveRecoverySnapshot(snapshot, filePath) {
  validateRecoverySnapshot(snapshot);
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw recoveryError('RUNTIME_RECOVERY_PATH_INVALID', 'Recovery snapshot path must be a non-empty string');
  }

  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(temporaryPath, `${serializeRecoverySnapshot(snapshot)}\n`, 'utf8');
    try {
      await rename(temporaryPath, filePath);
    } catch (error) {
      if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error;
      await rm(filePath, { force: true });
      await rename(temporaryPath, filePath);
    }
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    if (error.code?.startsWith('RUNTIME_RECOVERY_')) throw error;
    throw recoveryError('RUNTIME_RECOVERY_PERSIST_FAILED', 'Failed to persist recovery snapshot', {
      path: filePath,
      cause: error.message,
      code: error.code
    });
  }
  return filePath;
}

export async function loadRecoverySnapshot(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw recoveryError('RUNTIME_RECOVERY_PATH_INVALID', 'Recovery snapshot path must be a non-empty string');
  }
  try {
    return parseRecoverySnapshot(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code?.startsWith('RUNTIME_RECOVERY_')) throw error;
    throw recoveryError('RUNTIME_RECOVERY_LOAD_FAILED', 'Failed to load recovery snapshot', {
      path: filePath,
      cause: error.message,
      code: error.code
    });
  }
}
