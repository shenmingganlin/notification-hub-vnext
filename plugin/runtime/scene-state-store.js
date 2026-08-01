import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile as writeSnapshotFile
} from 'node:fs/promises';

import {
  parseSceneState,
  serializeSceneState,
  validateSceneState
} from './scene-state.js';

const saveQueues = new Map();

function sceneStateStoreError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function validatePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw sceneStateStoreError(
      'RUNTIME_SCENE_STATE_PATH_INVALID',
      'SceneState path must be a non-empty string'
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
          throw sceneStateStoreError(
            'RUNTIME_SCENE_STATE_ROLLBACK_FAILED',
            'Failed to replace SceneState and restore the previous snapshot',
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
        throw sceneStateStoreError(
          'RUNTIME_SCENE_STATE_BACKUP_CLEANUP_FAILED',
          'SceneState was persisted but the previous snapshot backup could not be removed',
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
    if (error.code?.startsWith('RUNTIME_SCENE_STATE_')) throw error;
    throw withDetails(error, { path: filePath, temporaryPath, backupPath: resolvedBackupPath });
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

export function serializePersistedSceneState(state) {
  return `${serializeSceneState(state)}\n`;
}

export async function saveSceneState(state, filePath, { fsOps = {} } = {}) {
  validateSceneState(state);
  validatePath(filePath);

  const snapshot = serializePersistedSceneState(state);
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
      await writeSnapshot(temporaryPath, snapshot, { encoding: 'utf8', flag: 'wx' });
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
      if (error.code?.startsWith('RUNTIME_SCENE_STATE_')) {
        withDetails(error, { path: filePath, temporaryPath, backupPath });
        throw error;
      }
      throw sceneStateStoreError(
        'RUNTIME_SCENE_STATE_PERSIST_FAILED',
        'Failed to persist SceneState',
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

async function recoverInterruptedWrite(filePath) {
  const directory = dirname(filePath);
  const prefix = `${basename(filePath)}.bak-`;
  let names;
  try {
    names = await readdir(directory);
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
      const snapshot = parseSceneState(await readFile(backupPath, 'utf8'));
      await rename(backupPath, filePath);
      return snapshot;
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      if (error.code?.startsWith('RUNTIME_SCENE_STATE_')) continue;
    }
  }
  return null;
}

export async function loadSceneState(filePath) {
  validatePath(filePath);
  try {
    return parseSceneState(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      try {
        const recovered = await recoverInterruptedWrite(filePath);
        if (recovered) return recovered;
      } catch (recoveryError) {
        throw sceneStateStoreError(
          'RUNTIME_SCENE_STATE_LOAD_FAILED',
          'Failed to load SceneState',
          {
            path: filePath,
            cause: error.message,
            code: error.code,
            recoveryCause: recoveryError.message,
            recoveryCode: recoveryError.code
          }
        );
      }
    }
    if (error.code?.startsWith('RUNTIME_SCENE_STATE_')) throw error;
    throw sceneStateStoreError(
      'RUNTIME_SCENE_STATE_LOAD_FAILED',
      'Failed to load SceneState',
      { path: filePath, cause: error.message, code: error.code }
    );
  }
}
