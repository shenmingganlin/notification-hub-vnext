import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { replaceFileAtomically } from '../persistence/atomic-file-replace.js';

export const FONT_ASSET_SNAPSHOT_VERSION = 1;

function fail(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function validate(snapshot) {
  if (!plain(snapshot) || snapshot.version !== FONT_ASSET_SNAPSHOT_VERSION || !Array.isArray(snapshot.assets) || !plain(snapshot.references)) {
    throw fail('FONT_ASSET_SNAPSHOT_INVALID', 'Font asset snapshot is invalid');
  }
  return snapshot;
}

export async function saveFontAssetSnapshot(snapshot, filePath) {
  validate(snapshot);
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw fail('FONT_ASSET_PATH_INVALID', 'filePath must be a non-empty string');
  }
  try {
    return await replaceFileAtomically(filePath, `${JSON.stringify(snapshot)}\n`);
  } catch (cause) {
    if (cause.code?.startsWith('FONT_ASSET_')) throw cause;
    throw fail('FONT_ASSET_PERSIST_FAILED', 'Failed to persist font asset snapshot', {
      path: filePath,
      cause: cause.message,
      code: cause.code,
      ...(cause.details ?? {})
    });
  }
}

export async function loadFontAssetSnapshot(filePath) {
  try {
    return validate(JSON.parse(await readFile(resolve(filePath), 'utf8')));
  } catch (cause) {
    if (cause.code === 'ENOENT') return null;
    if (cause.code?.startsWith('FONT_ASSET_')) throw cause;
    throw fail('FONT_ASSET_LOAD_FAILED', 'Failed to load font asset snapshot', {
      path: filePath,
      cause: cause.message
    });
  }
}
