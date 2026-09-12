import { EventEmitter } from 'node:events';

import { loadNotificationStoreSnapshot, saveNotificationStoreSnapshot } from './notification-store-store.js';
import { createNotificationStoreSnapshot } from './notification-store-snapshot.js';

function persistenceError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function cloneSnapshot(snapshot) {
  return createNotificationStoreSnapshot(snapshot.records, {
    updatedAt: snapshot.updatedAt
  });
}

export class NotificationStorePersistenceCoordinator extends EventEmitter {
  constructor({
    store,
    filePath,
    debounceMs = 100,
    save = saveNotificationStoreSnapshot,
    load = loadNotificationStoreSnapshot,
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = (timer) => clearTimeout(timer)
  } = {}) {
    super();
    if (!store || typeof store.subscribe !== 'function' || typeof store.getSnapshotRecords !== 'function'
      || typeof store.replaceAll !== 'function') {
      throw persistenceError(
        'NOTIFICATION_STORE_PERSISTENCE_INVALID',
        'Notification Store persistence requires a compatible store'
      );
    }
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
      throw persistenceError(
        'NOTIFICATION_STORE_PATH_INVALID',
        'Notification Store persistence filePath must be a non-empty string'
      );
    }
    if (!Number.isFinite(debounceMs) || debounceMs < 0) {
      throw persistenceError(
        'NOTIFICATION_STORE_DEBOUNCE_INVALID',
        'Notification Store persistence debounceMs must be a non-negative finite number'
      );
    }
    if (typeof save !== 'function' || typeof load !== 'function'
      || typeof schedule !== 'function' || typeof cancel !== 'function') {
      throw persistenceError(
        'NOTIFICATION_STORE_PERSISTENCE_INVALID',
        'Notification Store persistence save, load, schedule, and cancel must be functions'
      );
    }

    this.store = store;
    this.filePath = filePath;
    this.debounceMs = debounceMs;
    this.save = save;
    this.load = load;
    this.schedule = schedule;
    this.cancel = cancel;
    this.unsubscribe = null;
    this.timer = null;
    this.pendingSnapshot = null;
    this.flushPromise = null;
    this.restoring = false;
    this.applyingRestore = false;
    this.localRevision = 0;
  }

  observe() {
    if (!this.unsubscribe) {
      this.unsubscribe = this.store.subscribe(() => {
        if (!this.applyingRestore) this.localRevision += 1;
        if (!this.applyingRestore) this.queueCurrentSnapshot();
      });
    }
    return this.unsubscribe;
  }

  stopObserving() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
  }

  async restore() {
    const revisionBeforeLoad = this.localRevision;
    let snapshot;
    this.restoring = true;
    try {
      snapshot = await this.load(this.filePath);
      if (this.localRevision === revisionBeforeLoad) {
        this.applyingRestore = true;
        try {
          this.store.replaceAll(snapshot?.records ?? []);
        } finally {
          this.applyingRestore = false;
        }
      } else {
        // A local mutation won the race with disk restore. Preserve it and persist it.
        this.queueCurrentSnapshot();
      }
      return snapshot;
    } catch (error) {
      const wrapped = error.code?.startsWith('NOTIFICATION_STORE_')
        ? error
        : persistenceError(
          'NOTIFICATION_STORE_LOAD_FAILED',
          'Failed to restore Notification Store',
          { path: this.filePath, cause: error.code ?? error.message }
        );
      if (this.localRevision !== revisionBeforeLoad) this.queueCurrentSnapshot();
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
          const wrapped = error.code?.startsWith('NOTIFICATION_STORE_')
            ? error
            : persistenceError(
              'NOTIFICATION_STORE_PERSIST_FAILED',
              'Failed to persist observed Notification Store',
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
      code: error.code ?? 'NOTIFICATION_STORE_PERSIST_FAILED',
      message: error.message,
      details: { path: this.filePath, ...(error.details ?? {}) },
      timestamp: new Date().toISOString()
    });
  }

  queueCurrentSnapshot() {
    const snapshot = createNotificationStoreSnapshot(this.store.getSnapshotRecords());
    this.pendingSnapshot = snapshot;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = this.schedule(() => {
      this.timer = null;
      this.flush().catch(() => {});
    }, this.debounceMs);
    return snapshot;
  }
}
