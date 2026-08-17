import { EventEmitter } from 'node:events';

import { RuntimeConfigApplier } from './runtime-config-applier.js';

function syncError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

export class SettingsRuntimeSync extends EventEmitter {
  constructor({ store, persistence, host, applierFactory = (options) => new RuntimeConfigApplier(options) } = {}) {
    super();
    if (!store || typeof store.on !== 'function' || typeof store.getSnapshot !== 'function') {
      throw syncError('SETTINGS_RUNTIME_SYNC_INVALID', 'Settings Runtime sync requires a compatible SettingsStore');
    }
    if (persistence !== null && persistence !== undefined
      && (typeof persistence.restore !== 'function'
        || typeof persistence.observe !== 'function' || typeof persistence.flush !== 'function')) {
      throw syncError('SETTINGS_RUNTIME_SYNC_INVALID', 'Settings Runtime sync requires a compatible persistence coordinator');
    }
    if (host !== null && host !== undefined && typeof host.on !== 'function') {
      throw syncError('SETTINGS_RUNTIME_SYNC_INVALID', 'Settings Runtime sync requires a compatible Runtime host');
    }
    this.store = store;
    this.persistence = persistence ?? {
      async restore() { return null; },
      observe() { return () => {}; },
      async flush() {}
    };
    this.host = host;
    this.applierFactory = applierFactory;
    this.applier = null;
    this.unsubscribePersistence = null;
    this.storeListener = null;
    this.hostListeners = [];
    this.applyPromise = null;
    this.applyQueued = false;
    this.stopping = false;
    this.started = false;
    this.idleWaiters = [];
  }

  setHost(host) {
    if (host !== null && host !== undefined && typeof host.on !== 'function') {
      throw syncError('SETTINGS_RUNTIME_SYNC_INVALID', 'Settings Runtime sync requires a compatible Runtime host');
    }
    for (const { event, listener } of this.hostListeners) this.host?.off?.(event, listener);
    this.hostListeners = [];
    this.host = host ?? null;
    if (this.started) {
      this.bindHostEvent('started');
      this.bindHostEvent('restarted');
      this.queueApply();
    }
    return this;
  }

  async start() {
    if (this.started) return this;
    this.stopping = false;
    try {
      const restored = await this.persistence.restore();
      if (restored && restored.revision !== this.store.getSnapshot().revision) {
        this.store.restoreSnapshot(restored);
      }
    } catch (error) {
      this.emitDiagnostic('SETTINGS_RUNTIME_RESTORE_FAILED', error);
    }
    this.unsubscribePersistence = this.persistence.observe();
    this.storeListener = () => {
      if (!this.stopping) this.queueApply();
    };
    this.store.on('change', this.storeListener);
    this.bindHostEvent('started');
    this.bindHostEvent('restarted');
    this.started = true;
    return this;
  }

  async stop() {
    this.stopping = true;
    this.started = false;
    if (this.storeListener) this.store.off('change', this.storeListener);
    this.storeListener = null;
    for (const { event, listener } of this.hostListeners) this.host.off?.(event, listener);
    this.hostListeners = [];
    if (this.unsubscribePersistence) this.unsubscribePersistence();
    this.unsubscribePersistence = null;
    await this.persistence.flush();
    await this.idle();
    this.applier = null;
  }

  bindHostEvent(event) {
    if (!this.host) return;
    const listener = () => {
      if (!this.stopping) this.queueApply();
    };
    this.host.on(event, listener);
    this.hostListeners.push({ event, listener });
  }

  isRuntimeReady() {
    if (!this.host) return false;
    const status = this.host.getRuntimeStatus?.();
    return status?.state === 'running'
      && this.host.client
      && typeof this.host.client.request === 'function';
  }

  getApplier() {
    if (!this.isRuntimeReady()) return null;
    if (!this.applier || this.applier.client !== this.host.client) {
      this.applier = this.applierFactory({ store: this.store, client: this.host.client });
      this.applier.on('diagnostic', (diagnostic) => this.emit('diagnostic', diagnostic));
    }
    return this.applier;
  }

  queueApply() {
    if (!this.started || this.stopping) return;
    this.applyQueued = true;
    this.runApplyQueue().catch((error) => this.emitDiagnostic('SETTINGS_RUNTIME_APPLY_FAILED', error));
  }

  async applyCurrent() {
    if (!this.started || this.stopping || !this.isRuntimeReady()) return null;
    const applier = this.getApplier();
    if (!applier) return null;
    try {
      return await applier.applyCurrent();
    } catch (error) {
      if (error.code !== 'SETTINGS_STORE_REVISION_STALE') throw error;
      this.applyQueued = true;
      return { applied: false, stale: true, revision: this.store.getSnapshot().revision };
    }
  }

  async runApplyQueue() {
    if (this.applyPromise) return this.applyPromise;
    this.applyPromise = (async () => {
      while (this.applyQueued && !this.stopping) {
        this.applyQueued = false;
        if (!this.isRuntimeReady()) break;
        await this.applyCurrent();
        if (this.isRuntimeReady() && this.store.getSnapshot().status === 'saved') {
          this.applyQueued = true;
        }
      }
    })().finally(() => {
      this.applyPromise = null;
      this.resolveIdleWaiters();
    });
    return this.applyPromise;
  }

  async idle() {
    if (!this.applyPromise && !this.applyQueued) return;
    await new Promise((resolve) => this.idleWaiters.push(resolve));
    return this.idle();
  }

  resolveIdleWaiters() {
    const waiters = this.idleWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  emitDiagnostic(code, error) {
    const diagnostic = {
      code,
      message: error?.message ?? String(error),
      details: { ...(error?.details ?? {}) },
      timestamp: new Date().toISOString()
    };
    this.emit('diagnostic', diagnostic);
    return diagnostic;
  }
}
