import { EventEmitter } from 'node:events';

import {
  createEventPresentationSettingsStoreSnapshot
} from './event-presentation-settings-store.js';
import {
  loadEventPresentationSettingsSnapshot,
  saveEventPresentationSettingsSnapshot
} from './event-presentation-settings-store-store.js';

function persistenceError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

export class EventPresentationSettingsPersistenceCoordinator extends EventEmitter {
  constructor({
    store,
    filePath,
    debounceMs = 100,
    save = saveEventPresentationSettingsSnapshot,
    load = loadEventPresentationSettingsSnapshot,
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = (timer) => clearTimeout(timer)
  } = {}) {
    super();
    if (!store || typeof store.on !== 'function' || typeof store.getSnapshot !== 'function'
      || typeof store.restoreSnapshot !== 'function') {
      throw persistenceError(
        'EVENT_PRESENTATION_SETTINGS_PERSISTENCE_INVALID',
        'Event presentation settings persistence requires a compatible store'
      );
    }
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
      throw persistenceError('EVENT_PRESENTATION_SETTINGS_PATH_INVALID', 'Event presentation settings filePath must be a non-empty string');
    }
    if (!Number.isFinite(debounceMs) || debounceMs < 0) {
      throw persistenceError('EVENT_PRESENTATION_SETTINGS_DEBOUNCE_INVALID', 'Event presentation settings debounceMs must be non-negative');
    }
    if (typeof save !== 'function' || typeof load !== 'function'
      || typeof schedule !== 'function' || typeof cancel !== 'function') {
      throw persistenceError(
        'EVENT_PRESENTATION_SETTINGS_PERSISTENCE_INVALID',
        'Event presentation settings persistence save, load, schedule, and cancel must be functions'
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
    return () => this.dispose();
  }

  dispose() {
    if (this.listener) this.store.off('change', this.listener);
    this.listener = null;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
  }

  queueCurrentSnapshot() {
    const current = this.store.getSnapshot();
    this.pendingSnapshot = createEventPresentationSettingsStoreSnapshot(current.settings, current.revision);
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = this.schedule(() => {
      this.timer = null;
      this.flush().catch(() => {});
    }, this.debounceMs);
    return this.pendingSnapshot;
  }

  async restore() {
    const revisionBeforeLoad = this.store.getSnapshot().revision;
    this.restoring = true;
    try {
      const snapshot = await this.load(this.filePath);
      const localSnapshot = this.store.getSnapshot();
      if (snapshot && localSnapshot.revision === revisionBeforeLoad) {
        this.store.restoreSnapshot(snapshot);
      } else if (localSnapshot.revision !== revisionBeforeLoad) {
        // A local update won the race with disk restore. Never overwrite it with stale data.
        this.queueCurrentSnapshot();
      }
      return snapshot;
    } catch (cause) {
      const wrapped = cause.code?.startsWith('EVENT_PRESENTATION_SETTINGS_')
        ? cause
        : persistenceError('EVENT_PRESENTATION_SETTINGS_LOAD_FAILED', 'Failed to restore event presentation settings', {
          path: this.filePath,
          cause: cause.message
        });
      if (this.store.getSnapshot().revision !== revisionBeforeLoad) this.queueCurrentSnapshot();
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
        } catch (cause) {
          if (!this.pendingSnapshot) this.pendingSnapshot = snapshot;
          const wrapped = cause.code?.startsWith('EVENT_PRESENTATION_SETTINGS_')
            ? cause
            : persistenceError('EVENT_PRESENTATION_SETTINGS_PERSIST_FAILED', 'Failed to persist event presentation settings', {
              path: this.filePath,
              cause: cause.message
            });
          this.reportFailure(wrapped);
          this.scheduleRetry();
          throw wrapped;
        }
      }
      return this.filePath;
    })().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  scheduleRetry() {
    if (!this.pendingSnapshot || this.timer !== null) return;
    this.timer = this.schedule(() => {
      this.timer = null;
      this.flush().catch(() => {});
    }, this.debounceMs);
  }

  reportFailure(error) {
    this.emit('diagnostic', {
      code: error.code ?? 'EVENT_PRESENTATION_SETTINGS_PERSIST_FAILED',
      message: error.message,
      details: { path: this.filePath, ...(error.details ?? {}) },
      timestamp: new Date().toISOString()
    });
  }
}
