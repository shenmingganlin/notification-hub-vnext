import { basename, dirname, join } from 'node:path';
import { readFile, readdir, rename } from 'node:fs/promises';

import { replaceFileAtomically } from '../persistence/atomic-file-replace.js';
import {
  parseSceneState,
  serializeSceneState,
  validateSceneState
} from './scene-state.js';

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

export function serializePersistedSceneState(state) {
  return `${serializeSceneState(state)}\n`;
}

export async function saveSceneState(state, filePath, { fsOps = {} } = {}) {
  validateSceneState(state);
  validatePath(filePath);

  const snapshot = serializePersistedSceneState(state);
  try {
    return await replaceFileAtomically(filePath, snapshot, { fsOps });
  } catch (error) {
    if (error.code === 'ATOMIC_FILE_ROLLBACK_FAILED') {
      throw sceneStateStoreError(
        'RUNTIME_SCENE_STATE_ROLLBACK_FAILED',
        'Failed to replace SceneState and restore the previous snapshot',
        { path: filePath, ...(error.details ?? {}) }
      );
    }
    if (error.code?.startsWith('RUNTIME_SCENE_STATE_')) throw error;
    throw sceneStateStoreError(
      'RUNTIME_SCENE_STATE_PERSIST_FAILED',
      'Failed to persist SceneState',
      {
        path: filePath,
        cause: error.message,
        code: error.code,
        ...(error.details ?? {})
      }
    );
  }
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
