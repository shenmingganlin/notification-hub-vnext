import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

import {
  createEventPresentationSettingsStoreSnapshot,
  EVENT_PRESENTATION_SETTINGS_STORE_VERSION
} from './event-presentation-settings-store.js';

const saveQueues = new Map();

function storeError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function validatePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw storeError('EVENT_PRESENTATION_SETTINGS_PATH_INVALID', 'Event presentation settings path must be a non-empty string');
  }
}

function enqueue(filePath, task) {
  const key = resolve(filePath);
  const previous = saveQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  saveQueues.set(key, current);
  return current.finally(() => {
    if (saveQueues.get(key) === current) saveQueues.delete(key);
  });
}

function artifacts(filePath) {
  const suffix = `${process.pid}-${Date.now()}-${randomUUID()}`;
  return {
    temporaryPath: `${filePath}.tmp-${suffix}`,
    backupPath: `${filePath}.bak-${suffix}`
  };
}

function serialize(snapshot) {
  if (snapshot?.version !== EVENT_PRESENTATION_SETTINGS_STORE_VERSION) {
    throw storeError('EVENT_PRESENTATION_SETTINGS_SNAPSHOT_VERSION_UNSUPPORTED', 'Unsupported event presentation settings snapshot version');
  }
  return `${JSON.stringify(snapshot)}\n`;
}

function parse(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw storeError('EVENT_PRESENTATION_SETTINGS_SNAPSHOT_PARSE_FAILED', 'Event presentation settings snapshot contains invalid JSON');
  }
  if (value?.version !== EVENT_PRESENTATION_SETTINGS_STORE_VERSION) {
    throw storeError('EVENT_PRESENTATION_SETTINGS_SNAPSHOT_VERSION_UNSUPPORTED', 'Unsupported event presentation settings snapshot version');
  }
  try {
    return createEventPresentationSettingsStoreSnapshot(value.settings, value.revision, { updatedAt: value.updatedAt });
  } catch (cause) {
    throw storeError('EVENT_PRESENTATION_SETTINGS_SNAPSHOT_INVALID', 'Event presentation settings snapshot is invalid', {
      cause: cause.code ?? cause.message
    });
  }
}

async function replaceFile(temporaryPath, filePath, backupPath) {
  let backedUp = false;
  try {
    try {
      await rename(filePath, backupPath);
      backedUp = true;
    } catch (cause) {
      if (cause.code !== 'ENOENT') throw cause;
    }
    try {
      await rename(temporaryPath, filePath);
    } catch (cause) {
      if (backedUp) {
        try {
          await rename(backupPath, filePath);
        } catch (rollbackCause) {
          throw storeError('EVENT_PRESENTATION_SETTINGS_PERSIST_FAILED', 'Failed to restore the previous event presentation settings snapshot', {
            path: filePath,
            backupPath,
            replaceCause: cause.message,
            rollbackCause: rollbackCause.message
          });
        }
      }
      throw cause;
    }
    if (backedUp) await rm(backupPath, { force: true });
  } catch (cause) {
    if (cause.code?.startsWith('EVENT_PRESENTATION_SETTINGS_')) throw cause;
    throw storeError('EVENT_PRESENTATION_SETTINGS_PERSIST_FAILED', 'Failed to replace event presentation settings snapshot', {
      path: filePath,
      backupPath,
      cause: cause.message,
      code: cause.code
    });
  }
}

export async function saveEventPresentationSettingsSnapshot(snapshot, filePath) {
  validatePath(filePath);
  const serialized = serialize(snapshot);
  return enqueue(filePath, async () => {
    const { temporaryPath, backupPath } = artifacts(filePath);
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx' });
      await replaceFile(temporaryPath, filePath, backupPath);
    } catch (cause) {
      await rm(temporaryPath, { force: true }).catch(() => {});
      if (cause.code?.startsWith('EVENT_PRESENTATION_SETTINGS_')) throw cause;
      throw storeError('EVENT_PRESENTATION_SETTINGS_PERSIST_FAILED', 'Failed to persist event presentation settings snapshot', {
        path: filePath,
        cause: cause.message,
        code: cause.code
      });
    }
    return filePath;
  });
}

export async function loadEventPresentationSettingsSnapshot(filePath) {
  validatePath(filePath);
  try {
    return parse(await readFile(filePath, 'utf8'));
  } catch (cause) {
    if (cause.code === 'ENOENT') return null;
    if (cause.code?.startsWith('EVENT_PRESENTATION_SETTINGS_')) {
      throw storeError('EVENT_PRESENTATION_SETTINGS_LOAD_FAILED', 'Failed to load event presentation settings snapshot', {
        path: filePath,
        cause: cause.code,
        parseCause: cause.details?.cause
      });
    }
    throw storeError('EVENT_PRESENTATION_SETTINGS_LOAD_FAILED', 'Failed to load event presentation settings snapshot', {
      path: filePath,
      cause: cause.message,
      code: cause.code
    });
  }
}

export { parse as parseEventPresentationSettingsSnapshot, serialize as serializeEventPresentationSettingsSnapshot };
