import { randomUUID } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import {
  mkdir,
  readFile,
  readdir,
  rm,
  rename,
  writeFile
} from 'node:fs/promises';

import {
  parseSettingsStoreSnapshot,
  serializeSettingsStoreSnapshot
} from './settings-store-snapshot.js';

const saveQueues = new Map();

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

function artifacts(filePath) {
  const suffix = `${process.pid}-${Date.now()}-${randomUUID()}`;
  return {
    temporaryPath: `${filePath}.tmp-${suffix}`,
    backupPath: `${filePath}.bak-${suffix}`
  };
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

async function replaceFile(temporaryPath, filePath, backupPath, fsOps) {
  const renameFile = fsOps.renameFile ?? rename;
  const removeFile = fsOps.removeFile ?? rm;
  let backedUp = false;

  try {
    try {
      await renameFile(filePath, backupPath);
      backedUp = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await renameFile(temporaryPath, filePath);
    } catch (replaceError) {
      if (backedUp) {
        try {
          await renameFile(backupPath, filePath);
        } catch (rollbackError) {
          throw storeError(
            'SETTINGS_STORE_PERSIST_FAILED',
            'Failed to replace Settings Store snapshot and restore the previous file',
            {
              path: filePath,
              backupPath,
              replaceCause: replaceError.message,
              rollbackCause: rollbackError.message
            }
          );
        }
      }
      throw replaceError;
    }
    if (backedUp) await removeFile(backupPath, { force: true });
  } catch (error) {
    if (error.code?.startsWith('SETTINGS_STORE_')) throw error;
    throw storeError('SETTINGS_STORE_PERSIST_FAILED', 'Failed to replace Settings Store snapshot', {
      path: filePath,
      backupPath,
      cause: error.message,
      code: error.code
    });
  }
}

export async function saveSettingsStoreSnapshot(snapshot, filePath, { fsOps = {} } = {}) {
  const serialized = serializeSettingsStoreSnapshot(snapshot);
  validatePath(filePath);
  const makeDirectory = fsOps.mkdir ?? mkdir;
  const writeSnapshot = fsOps.writeFile ?? writeFile;
  const removeFile = fsOps.removeFile ?? rm;

  return enqueue(filePath, async () => {
    const { temporaryPath, backupPath } = artifacts(filePath);
    try {
      await makeDirectory(dirname(filePath), { recursive: true });
      await writeSnapshot(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx' });
      await replaceFile(temporaryPath, filePath, backupPath, fsOps);
    } catch (error) {
      await removeFile(temporaryPath, { force: true }).catch(() => {});
      if (error.code?.startsWith('SETTINGS_STORE_')) throw error;
      throw storeError('SETTINGS_STORE_PERSIST_FAILED', 'Failed to persist Settings Store snapshot', {
        path: filePath,
        cause: error.message,
        code: error.code
      });
    }
    return filePath;
  });
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
