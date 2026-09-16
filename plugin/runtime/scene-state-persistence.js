import { EventEmitter } from 'node:events';
import path from 'node:path';

import { saveSceneState } from './scene-state-store.js';
import { validateSceneState } from './scene-state.js';

export const SCENE_STATE_PERSISTENCE_DEFAULTS = Object.freeze({
  enabled: true,
  relativePath: 'scene-state.json',
  debounceMs: 100
});

function persistenceError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function cloneSceneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function readConfig(config) {
  try {
    if (config?.getAll) return config.getAll() || {};
    if (config?.get) return config.get() || {};
  } catch (error) {
    throw persistenceError(
      'RUNTIME_SCENE_STATE_CONFIG_READ_FAILED',
      'Failed to read SceneState persistence configuration',
      { cause: error.message }
    );
  }
  return config && typeof config === 'object' ? config : {};
}

function resolvePath(dataDir, configuredPath) {
  if (typeof configuredPath !== 'string' || configuredPath.trim().length === 0) {
    throw persistenceError(
      'RUNTIME_SCENE_STATE_PATH_INVALID',
      'SceneState persistence path must be a non-empty string'
    );
  }
  if (path.isAbsolute(configuredPath)) return path.normalize(configuredPath);
  if (typeof dataDir !== 'string' || dataDir.trim().length === 0) {
    throw persistenceError(
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
    throw persistenceError(
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
    throw persistenceError(
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

export class SceneStatePersistenceCoordinator extends EventEmitter {
  constructor({
    filePath,
    debounceMs = 100,
    save = saveSceneState,
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = (timer) => clearTimeout(timer)
  } = {}) {
    super();
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
      throw persistenceError(
        'RUNTIME_SCENE_STATE_PATH_INVALID',
        'SceneState persistence filePath must be a non-empty string'
      );
    }
    if (!Number.isFinite(debounceMs) || debounceMs < 0) {
      throw persistenceError(
        'RUNTIME_SCENE_STATE_DEBOUNCE_INVALID',
        'SceneState persistence debounceMs must be a non-negative finite number'
      );
    }
    if (typeof save !== 'function' || typeof schedule !== 'function' || typeof cancel !== 'function') {
      throw persistenceError(
        'RUNTIME_SCENE_STATE_PERSISTENCE_INVALID',
        'SceneState persistence save, schedule, and cancel must be functions'
      );
    }
    this.filePath = filePath;
    this.debounceMs = debounceMs;
    this.save = save;
    this.schedule = schedule;
    this.cancel = cancel;
    this.pendingSnapshot = null;
    this.timer = null;
    this.flushPromise = null;
  }

  observe(snapshot) {
    validateSceneState(snapshot);
    this.pendingSnapshot = cloneSceneState(snapshot);
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = this.schedule(() => {
      this.timer = null;
      this.flush().catch(() => {});
    }, this.debounceMs);
    return snapshot;
  }

  async flush() {
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    if (this.flushPromise) return this.flushPromise;
    if (!this.pendingSnapshot) return null;

    this.flushPromise = (async () => {
      while (this.pendingSnapshot) {
        const snapshot = this.pendingSnapshot;
        this.pendingSnapshot = null;
        try {
          await this.save(snapshot, this.filePath);
        } catch (error) {
          if (!this.pendingSnapshot) this.pendingSnapshot = snapshot;
          const wrapped = error.code?.startsWith('RUNTIME_SCENE_STATE_')
            ? error
            : persistenceError(
              'RUNTIME_SCENE_STATE_PERSIST_FAILED',
              'Failed to persist observed SceneState',
              { path: this.filePath, cause: error.code ?? error.message }
            );
          this.reportFailure(wrapped);
          throw wrapped;
        }
      }
      return this.filePath;
    })().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  reportFailure(error) {
    this.emit('diagnostic', {
      code: error.code ?? 'RUNTIME_SCENE_STATE_PERSIST_FAILED',
      message: error.message,
      details: { path: this.filePath, ...(error.details ?? {}) },
      timestamp: new Date().toISOString()
    });
  }
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
