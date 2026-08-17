import { EventEmitter } from 'node:events';

import {
  createSettingsStoreSnapshot,
  SETTINGS_STORE_VERSION
} from './settings-store-snapshot.js';
import {
  loadSettingsStoreSnapshot,
  saveSettingsStoreSnapshot
} from './settings-store-store.js';

function persistenceError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

export class SettingsStorePersistenceCoordinator extends EventEmitter {
  constructor({
    store,
    filePath,
    debounceMs = 100,
    save = saveSettingsStoreSnapshot,
    load = loadSettingsStoreSnapshot,
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = (timer) => clearTimeout(timer)
  } = {}) {
    super();
    if (!store || typeof store.on !== 'function' || typeof store.getSnapshot !== 'function'
      || typeof store.restoreSnapshot !== 'function') {
      throw persistenceError(
        'SETTINGS_STORE_PERSISTENCE_INVALID',
        'Settings Store persistence requires a compatible store'
      );
    }
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
      throw persistenceError('SETTINGS_STORE_PATH_INVALID', 'Settings Store persistence filePath must be a non-empty string');
    }
    if (!Number.isFinite(debounceMs) || debounceMs < 0) {
      throw persistenceError('SETTINGS_STORE_DEBOUNCE_INVALID', 'Settings Store persistence debounceMs must be non-negative');
    }
    if (typeof save !== 'function' || typeof load !== 'function'
      || typeof schedule !== 'function' || typeof cancel !== 'function') {
      throw persistenceError(
        'SETTINGS_STORE_PERSISTENCE_INVALID',
        'Settings Store persistence save, load, schedule, and cancel must be functions'
      );
    }

    this.store = store;
    this.filePath = filePath;
    this.debounceMs = debounceMs;
    this.save = save;
    this.load = load;
    this.schedule = schedule;
    this.cancel = cancel;
    this.listener = null;
    this.timer = null;
    this.pendingSnapshot = null;
    this.flushPromise = null;
    this.restoring = false;
  }

  observe() {
    if (!this.listener) {
      this.listener = () => {
        if (!this.restoring) this.queueCurrentSnapshot();
      };
      this.store.on('change', this.listener);
    }
    return () => this.stopObserving();
  }

  stopObserving() {
    if (this.listener) this.store.off('change', this.listener);
    this.listener = null;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
  }

  async restore() {
    this.restoring = true;
    try {
      const snapshot = await this.load(this.filePath);
      if (snapshot) this.store.restoreSnapshot(snapshot);
      return snapshot;
    } catch (error) {
      const wrapped = error.code?.startsWith('SETTINGS_STORE_')
        ? error
        : persistenceError('SETTINGS_STORE_LOAD_FAILED', 'Failed to restore Settings Store', {
          path: this.filePath,
          cause: error.message
        });
      this.reportFailure(wrapped);
      throw wrapped;
    } finally {
      this.restoring = false;
    }
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
          const wrapped = error.code?.startsWith('SETTINGS_STORE_')
            ? error
            : persistenceError('SETTINGS_STORE_PERSIST_FAILED', 'Failed to persist Settings Store', {
              path: this.filePath,
              cause: error.message
            });
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

  queueCurrentSnapshot() {
    const current = this.store.getSnapshot();
    this.pendingSnapshot = createSettingsStoreSnapshot(current.settings, current.revision);
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = this.schedule(() => {
      this.timer = null;
      this.flush().catch(() => {});
    }, this.debounceMs);
    return this.pendingSnapshot;
  }

  reportFailure(error) {
    this.emit('diagnostic', {
      code: error.code ?? 'SETTINGS_STORE_PERSIST_FAILED',
      message: error.message,
      details: { path: this.filePath, ...(error.details ?? {}) },
      timestamp: new Date().toISOString()
    });
  }
}
