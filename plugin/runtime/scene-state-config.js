import path from 'node:path';

import { SceneStatePersistenceCoordinator } from './scene-state-persistence.js';

export const SCENE_STATE_PERSISTENCE_DEFAULTS = Object.freeze({
  enabled: true,
  relativePath: 'scene-state.json',
  debounceMs: 100
});

function configError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function readConfig(config) {
  try {
    if (config?.getAll) return config.getAll() || {};
    if (config?.get) return config.get() || {};
  } catch (error) {
    throw configError(
      'RUNTIME_SCENE_STATE_CONFIG_READ_FAILED',
      'Failed to read SceneState persistence configuration',
      { cause: error.message }
    );
  }
  return config && typeof config === 'object' ? config : {};
}

function resolvePath(dataDir, configuredPath) {
  if (typeof configuredPath !== 'string' || configuredPath.trim().length === 0) {
    throw configError(
      'RUNTIME_SCENE_STATE_PATH_INVALID',
      'SceneState persistence path must be a non-empty string'
    );
  }
  if (path.isAbsolute(configuredPath)) return path.normalize(configuredPath);
  if (typeof dataDir !== 'string' || dataDir.trim().length === 0) {
    throw configError(
      'RUNTIME_SCENE_STATE_DATA_DIR_INVALID',
      'A non-empty dataDir is required for a relative SceneState persistence path'
    );
  }
  return path.resolve(dataDir, configuredPath);
}

export function resolveSceneStatePersistenceConfig({ dataDir, config, overrides = {} } = {}) {
  const raw = { ...readConfig(config), ...overrides };
  const enabled = raw.sceneStatePersistenceEnabled
    ?? SCENE_STATE_PERSISTENCE_DEFAULTS.enabled;
  if (typeof enabled !== 'boolean') {
    throw configError(
      'RUNTIME_SCENE_STATE_CONFIG_INVALID',
      'sceneStatePersistenceEnabled must be a boolean'
    );
  }
  if (!enabled) return { enabled: false, filePath: null, debounceMs: null };

  const configuredPath = raw.sceneStatePersistencePath
    ?? SCENE_STATE_PERSISTENCE_DEFAULTS.relativePath;
  const debounceMs = raw.sceneStatePersistenceDebounceMs
    ?? SCENE_STATE_PERSISTENCE_DEFAULTS.debounceMs;
  if (!Number.isFinite(debounceMs) || debounceMs < 0) {
    throw configError(
      'RUNTIME_SCENE_STATE_DEBOUNCE_INVALID',
      'sceneStatePersistenceDebounceMs must be a non-negative finite number'
    );
  }
  return {
    enabled: true,
    filePath: resolvePath(dataDir, configuredPath),
    debounceMs
  };
}

export function createSceneStatePersistenceFromHostContext(context, options = {}) {
  return createSceneStatePersistence({
    dataDir: context?.dataDir,
    config: context?.config,
    ...options
  });
}

export function createSceneStatePersistence({
  dataDir,
  config,
  overrides,
  save,
  schedule,
  cancel
} = {}) {
  const resolved = resolveSceneStatePersistenceConfig({ dataDir, config, overrides });
  if (!resolved.enabled) return null;
  return new SceneStatePersistenceCoordinator({
    filePath: resolved.filePath,
    debounceMs: resolved.debounceMs,
    save,
    schedule,
    cancel
  });
}
