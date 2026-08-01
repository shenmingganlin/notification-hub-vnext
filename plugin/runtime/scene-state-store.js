import { dirname } from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

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

async function replaceFileAtomically(temporaryPath, filePath) {
  const backupPath = `${filePath}.bak-${process.pid}-${Date.now()}`;
  let backedUp = false;
  try {
    try {
      await rename(filePath, backupPath);
      backedUp = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await rename(temporaryPath, filePath);
    } catch (error) {
      if (backedUp) {
        await rename(backupPath, filePath).catch(() => {});
      }
      throw error;
    }
    if (backedUp) await rm(backupPath, { force: true }).catch(() => {});
  } catch (error) {
    throw error;
  }
}

export function serializePersistedSceneState(state) {
  return `${serializeSceneState(state)}\n`;
}

export async function saveSceneState(state, filePath) {
  validateSceneState(state);
  validatePath(filePath);

  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(temporaryPath, serializePersistedSceneState(state), 'utf8');
    await replaceFileAtomically(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    if (error.code?.startsWith('RUNTIME_SCENE_STATE_')) throw error;
    throw sceneStateStoreError(
      'RUNTIME_SCENE_STATE_PERSIST_FAILED',
      'Failed to persist SceneState',
      { path: filePath, cause: error.message, code: error.code }
    );
  }
  return filePath;
}

export async function loadSceneState(filePath) {
  validatePath(filePath);
  try {
    return parseSceneState(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code?.startsWith('RUNTIME_SCENE_STATE_')) throw error;
    throw sceneStateStoreError(
      'RUNTIME_SCENE_STATE_LOAD_FAILED',
      'Failed to load SceneState',
      { path: filePath, cause: error.message, code: error.code }
    );
  }
}
