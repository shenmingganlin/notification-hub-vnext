import { EventEmitter } from 'node:events';

import { saveSceneState } from './scene-state-store.js';
import { validateSceneState } from './scene-state.js';

function persistenceError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function cloneSceneState(state) {
  return JSON.parse(JSON.stringify(state));
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
