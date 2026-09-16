import { readFile } from 'node:fs/promises';

import { replaceFileAtomically } from '../persistence/atomic-file-replace.js';
import { VISUAL_REGISTRY_SNAPSHOT_VERSION } from './visual-registry-persistence.js';

function storeError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function validatePath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw storeError('VISUAL_REGISTRY_PATH_INVALID', 'Visual registry filePath must be a non-empty string');
  }
}

function validateSnapshot(snapshot) {
  if (
    !snapshot
    || snapshot.version !== VISUAL_REGISTRY_SNAPSHOT_VERSION
    || !Array.isArray(snapshot.profiles)
    || !Array.isArray(snapshot.bindings)
  ) {
    throw storeError('VISUAL_REGISTRY_SNAPSHOT_INVALID', 'Visual registry snapshot is invalid');
  }
  return snapshot;
}

export async function saveVisualRegistrySnapshot(snapshot, filePath) {
  validatePath(filePath);
  validateSnapshot(snapshot);
  try {
    return await replaceFileAtomically(filePath, `${JSON.stringify(snapshot)}\n`);
  } catch (cause) {
    if (cause.code?.startsWith('VISUAL_REGISTRY_')) throw cause;
    throw storeError('VISUAL_REGISTRY_PERSIST_FAILED', 'Failed to persist visual registry snapshot', {
      path: filePath,
      cause: cause.message,
      code: cause.code,
      ...(cause.details ?? {})
    });
  }
}

export async function loadVisualRegistrySnapshot(filePath) {
  validatePath(filePath);
  try {
    return validateSnapshot(JSON.parse(await readFile(filePath, 'utf8')));
  } catch (cause) {
    if (cause.code === 'ENOENT') return null;
    if (cause.code?.startsWith('VISUAL_REGISTRY_')) throw cause;
    throw storeError('VISUAL_REGISTRY_LOAD_FAILED', 'Failed to load visual registry snapshot', {
      path: filePath,
      cause: cause.message
    });
  }
}
