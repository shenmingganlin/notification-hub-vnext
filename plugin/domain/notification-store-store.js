import { randomUUID } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import {
  mkdir,
  readFile,
  readdir,
  rm,
  rename,
  writeFile as writeSnapshotFile
} from 'node:fs/promises';

import {
  parseNotificationStoreSnapshot,
  serializeNotificationStoreSnapshot,
  validateNotificationStoreSnapshot
} from './notification-store-snapshot.js';

const saveQueues = new Map();

function storeError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function validatePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw storeError(
      'NOTIFICATION_STORE_PATH_INVALID',
      'Notification Store path must be a non-empty string'
    );
  }
}

function artifactPaths(filePath) {
  const suffix = `${process.pid}-${Date.now()}-${randomUUID()}`;
  return {
    temporaryPath: `${filePath}.tmp-${suffix}`,
    backupPath: `${filePath}.bak-${suffix}`
  };
}

function withDetails(error, details) {
  error.details = { ...(error.details ?? {}), ...details };
  return error;
}

async function replaceFileInTwoStages(
  temporaryPath,
  filePath,
  {
    backupPath,
    renameFile = rename,
    removeFile = rm
  } = {}
) {
  const resolvedBackupPath = backupPath ?? artifactPaths(filePath).backupPath;
  let backedUp = false;

  try {
    try {
      await renameFile(filePath, resolvedBackupPath);
      backedUp = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    try {
      await renameFile(temporaryPath, filePath);
    } catch (replaceError) {
      if (backedUp) {
        try {
          await renameFile(resolvedBackupPath, filePath);
        } catch (rollbackError) {
          throw storeError(
            'NOTIFICATION_STORE_ROLLBACK_FAILED',
            'Failed to replace Notification Store and restore the previous snapshot',
            {
              path: filePath,
              temporaryPath,
              backupPath: resolvedBackupPath,
              replaceCause: replaceError.message,
              replaceCode: replaceError.code,
              rollbackCause: rollbackError.message,
              rollbackCode: rollbackError.code
            }
          );
        }
      }
      throw withDetails(replaceError, {
        path: filePath,
        temporaryPath,
        backupPath: backedUp ? resolvedBackupPath : null
      });
    }

    if (backedUp) {
      try {
        await removeFile(resolvedBackupPath, { force: true });
      } catch (cleanupError) {
        throw storeError(
          'NOTIFICATION_STORE_BACKUP_CLEANUP_FAILED',
          'Notification Store was persisted but the previous snapshot backup could not be removed',
          {
            path: filePath,
            backupPath: resolvedBackupPath,
            persisted: true,
            cleanupCause: cleanupError.message,
            cleanupCode: cleanupError.code
          }
        );
      }
    }
  } catch (error) {
    if (error.code?.startsWith('NOTIFICATION_STORE_')) throw error;
    throw withDetails(error, {
      path: filePath,
      temporaryPath,
      backupPath: resolvedBackupPath
    });
  }
}

function enqueueSave(filePath, task) {
  const key = resolve(filePath);
  const previous = saveQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  saveQueues.set(key, current);
  return current.finally(() => {
    if (saveQueues.get(key) === current) saveQueues.delete(key);
  });
}

async function recoverInterruptedWrite(filePath, fsOps = {}) {
  const {
    readFile: readSnapshot = readFile,
    readdir: readDirectory = readdir,
    renameFile = rename
  } = fsOps;
  const directory = dirname(filePath);
  const prefix = `${basename(filePath)}.bak-`;
  let names;

  try {
    names = await readDirectory(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }

  const candidates = names
    .filter((name) => name.startsWith(prefix))
    .sort()
    .reverse();

  for (const name of candidates) {
    const backupPath = join(directory, name);
    try {
      const snapshot = parseNotificationStoreSnapshot(
        await readSnapshot(backupPath, 'utf8')
      );
      await renameFile(backupPath, filePath);
      return snapshot;
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      if (error.code?.startsWith('NOTIFICATION_STORE_')) continue;
    }
  }
  return null;
}

export async function saveNotificationStoreSnapshot(snapshot, filePath, { fsOps = {} } = {}) {
  validateNotificationStoreSnapshot(snapshot);
  validatePath(filePath);

  const serialized = serializeNotificationStoreSnapshot(snapshot);
  const {
    mkdir: makeDirectory = mkdir,
    writeFile: writeSnapshot = writeSnapshotFile,
    renameFile = rename,
    removeFile = rm
  } = fsOps;

  return enqueueSave(filePath, async () => {
    const { temporaryPath, backupPath } = artifactPaths(filePath);
    try {
      await makeDirectory(dirname(filePath), { recursive: true });
      await writeSnapshot(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx' });
      await replaceFileInTwoStages(temporaryPath, filePath, {
        backupPath,
        renameFile,
        removeFile
      });
    } catch (error) {
      try {
        await removeFile(temporaryPath, { force: true });
      } catch (cleanupError) {
        withDetails(error, {
          temporaryPath,
          temporaryCleanupCause: cleanupError.message,
          temporaryCleanupCode: cleanupError.code
        });
      }
      if (error.code?.startsWith('NOTIFICATION_STORE_')) {
        withDetails(error, { path: filePath, temporaryPath, backupPath });
        throw error;
      }
      throw storeError(
        'NOTIFICATION_STORE_PERSIST_FAILED',
        'Failed to persist Notification Store',
        {
          path: filePath,
          temporaryPath,
          backupPath,
          cause: error.message,
          code: error.code,
          ...(error.details ?? {})
        }
      );
    }
    return filePath;
  });
}

export async function loadNotificationStoreSnapshot(filePath, { fsOps = {} } = {}) {
  validatePath(filePath);
  const { readFile: readSnapshot = readFile } = fsOps;

  try {
    return parseNotificationStoreSnapshot(await readSnapshot(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      try {
        const recovered = await recoverInterruptedWrite(filePath, fsOps);
        if (recovered) return recovered;
        return null;
      } catch (recoveryError) {
        throw storeError(
          'NOTIFICATION_STORE_LOAD_FAILED',
          'Failed to load Notification Store',
          {
            path: filePath,
            cause: error.code,
            code: error.code,
            recoveryCause: recoveryError.message,
            recoveryCode: recoveryError.code
          }
        );
      }
    }
    if (error.code?.startsWith('NOTIFICATION_STORE_')) {
      throw storeError(
        'NOTIFICATION_STORE_LOAD_FAILED',
        'Failed to load Notification Store',
        {
          path: filePath,
          ...(error.details ?? {}),
          cause: error.code,
          code: error.code
        }
      );
    }
    throw storeError(
      'NOTIFICATION_STORE_LOAD_FAILED',
      'Failed to load Notification Store',
      { path: filePath, cause: error.message, code: error.code }
    );
  }
}
