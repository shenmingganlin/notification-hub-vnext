import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';

const saveQueues = new Map();

function atomicError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function withDetails(error, details) {
  error.details = { ...(error.details ?? {}), ...details };
  return error;
}

function validatePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw atomicError('ATOMIC_FILE_PATH_INVALID', 'Atomic replace path must be a non-empty string');
  }
}

function artifactPaths(filePath, { pid, now, randomId }) {
  const suffix = `${pid}-${now()}-${randomId()}`;
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

async function replaceInTwoStages(temporaryPath, filePath, backupPath, renameFile, removeFile) {
  let backedUp = false;

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
        throw atomicError(
          'ATOMIC_FILE_ROLLBACK_FAILED',
          'Failed to replace file and restore the previous snapshot',
          {
            path: filePath,
            temporaryPath,
            backupPath,
            replaceCause: replaceError.message,
            replaceCode: replaceError.code,
            rollbackCause: rollbackError.message,
            rollbackCode: rollbackError.code
          }
        );
      }
    }
    throw atomicError('ATOMIC_FILE_REPLACE_FAILED', 'Failed to replace file atomically', {
      path: filePath,
      temporaryPath,
      backupPath: backedUp ? backupPath : null,
      cause: replaceError.message,
      code: replaceError.code
    });
  }

  if (backedUp) await removeFile(backupPath, { force: true });
}

export async function replaceFileAtomically(filePath, contents, { encoding = 'utf8', fsOps = {} } = {}) {
  validatePath(filePath);

  const makeDirectory = fsOps.mkdir ?? mkdir;
  const writeSnapshot = fsOps.writeFile ?? writeFile;
  const renameFile = fsOps.renameFile ?? fsOps.rename ?? rename;
  const removeFile = fsOps.removeFile ?? fsOps.rm ?? rm;
  const pid = fsOps.pid ?? process.pid;
  const now = fsOps.now ?? Date.now;
  const randomId = fsOps.randomId ?? randomUUID;

  return enqueue(filePath, async () => {
    const { temporaryPath, backupPath } = artifactPaths(filePath, { pid, now, randomId });
    try {
      await makeDirectory(dirname(filePath), { recursive: true });
      await writeSnapshot(temporaryPath, contents, { encoding, flag: 'wx' });
      await replaceInTwoStages(temporaryPath, filePath, backupPath, renameFile, removeFile);
      return filePath;
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
      if (error.code?.startsWith('ATOMIC_FILE_')) {
        withDetails(error, { path: filePath, temporaryPath, backupPath });
        throw error;
      }
      throw atomicError('ATOMIC_FILE_REPLACE_FAILED', 'Failed to replace file atomically', {
        path: filePath,
        temporaryPath,
        backupPath,
        cause: error.message,
        code: error.code,
        ...(error.details ?? {})
      });
    }
  });
}
