import { readFile } from 'node:fs/promises';

import { replaceFileAtomically } from '../persistence/atomic-file-replace.js';
import {
  parseSettingsStoreSnapshot,
  serializeSettingsStoreSnapshot
} from './settings-store-snapshot.js';

function storeError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function validatePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw storeError('SETTINGS_STORE_PATH_INVALID', 'Settings Store path must be a non-empty string');
  }
}

export async function saveSettingsStoreSnapshot(snapshot, filePath, { fsOps = {} } = {}) {
  const serialized = serializeSettingsStoreSnapshot(snapshot);
  validatePath(filePath);
  try {
    return await replaceFileAtomically(filePath, serialized, { fsOps });
  } catch (error) {
    if (error.code?.startsWith('SETTINGS_STORE_')) throw error;
    throw storeError('SETTINGS_STORE_PERSIST_FAILED', 'Failed to persist Settings Store snapshot', {
      path: filePath,
      cause: error.message,
      code: error.code,
      ...(error.details ?? {})
    });
  }
}

export async function loadSettingsStoreSnapshot(filePath, { fsOps = {} } = {}) {
  validatePath(filePath);
  const readSnapshot = fsOps.readFile ?? readFile;
  try {
    return parseSettingsStoreSnapshot(await readSnapshot(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.code?.startsWith('SETTINGS_STORE_SNAPSHOT_')) {
      throw storeError('SETTINGS_STORE_LOAD_FAILED', 'Failed to load Settings Store snapshot', {
        path: filePath,
        ...(error.details ?? {}),
        cause: error.code,
        parseCause: error.details?.cause
      });
    }
    throw storeError('SETTINGS_STORE_LOAD_FAILED', 'Failed to load Settings Store snapshot', {
      path: filePath,
      cause: error.message,
      code: error.code
    });
  }
}
