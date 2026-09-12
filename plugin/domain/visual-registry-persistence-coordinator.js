import { EventEmitter } from 'node:events';
import { createVisualRegistrySnapshot, restoreVisualRegistrySnapshot } from './visual-registry-persistence.js';
import { loadVisualRegistrySnapshot, saveVisualRegistrySnapshot } from './visual-registry-persistence-store.js';

function persistenceError(code, message, details = {}) { return Object.assign(new Error(message), { code, details }); }
function isVisualRestoreError(error) { return typeof error?.code === 'string' && (error.code.startsWith('VISUAL_REGISTRY_') || error.code.startsWith('VISUAL_PROFILE_') || error.code.startsWith('VISUAL_EVENT_')); }

export class VisualRegistryPersistenceCoordinator extends EventEmitter {
  constructor({ profileRegistry, bindingRegistry, filePath, revision = 1, debounceMs = 100, save = saveVisualRegistrySnapshot, load = loadVisualRegistrySnapshot, schedule = (callback, delay) => setTimeout(callback, delay), cancel = (timer) => clearTimeout(timer) } = {}) {
    super();
    if (!profileRegistry || typeof profileRegistry.list !== 'function' || !bindingRegistry || typeof bindingRegistry.snapshot !== 'function') throw persistenceError('VISUAL_REGISTRY_PERSISTENCE_INVALID', 'Visual registry persistence requires compatible registries');
    if (typeof filePath !== 'string' || !filePath.trim()) throw persistenceError('VISUAL_REGISTRY_PATH_INVALID', 'Visual registry filePath must be a non-empty string');
    this.profileRegistry = profileRegistry; this.bindingRegistry = bindingRegistry; this.filePath = filePath; this.revision = revision; this.debounceMs = debounceMs; this.save = save; this.load = load; this.schedule = schedule; this.cancel = cancel; this.timer = null; this.pendingSnapshot = null; this.flushPromise = null; this.restoring = false; this.lastError = null;
  }
  observe() { return () => this.dispose(); }
  dispose() { if (this.timer !== null) this.cancel(this.timer); this.timer = null; }
  queueCurrentSnapshot() { this.revision += 1; this.pendingSnapshot = createVisualRegistrySnapshot({ profileRegistry: this.profileRegistry, bindingRegistry: this.bindingRegistry, revision: this.revision }); if (this.timer !== null) this.cancel(this.timer); this.timer = this.schedule(() => { this.timer = null; this.flush().catch(() => {}); }, this.debounceMs); return this.pendingSnapshot; }
  getStatus() { return { enabled: true, pending: this.pendingSnapshot !== null, revision: this.revision, status: this.lastError ? 'error' : (this.pendingSnapshot ? 'pending' : 'saved'), ...(this.lastError ? { error: { code: this.lastError.code, message: this.lastError.message } } : {}) }; }
  async restore() { this.restoring = true; try { const snapshot = await this.load(this.filePath); if (snapshot) { restoreVisualRegistrySnapshot(snapshot, { profileRegistry: this.profileRegistry, bindingRegistry: this.bindingRegistry }); this.revision = snapshot.revision; } this.lastError = null; return snapshot; } catch (cause) { const wrapped = isVisualRestoreError(cause) ? cause : persistenceError('VISUAL_REGISTRY_LOAD_FAILED', 'Failed to restore visual registry', { path: this.filePath, cause: cause.message, causeCode: cause.code }); this.lastError = wrapped; this.reportFailure(wrapped); throw wrapped; } finally { this.restoring = false; } }
  async flush() { if (this.timer !== null) { this.cancel(this.timer); this.timer = null; } if (this.flushPromise) return this.flushPromise; if (!this.pendingSnapshot) return null; this.flushPromise = (async () => { while (this.pendingSnapshot) { const snapshot = this.pendingSnapshot; this.pendingSnapshot = null; try { await this.save(snapshot, this.filePath); } catch (cause) { if (!this.pendingSnapshot) this.pendingSnapshot = snapshot; const wrapped = cause.code?.startsWith('VISUAL_REGISTRY_') ? cause : persistenceError('VISUAL_REGISTRY_PERSIST_FAILED', 'Failed to persist visual registry', { path: this.filePath, cause: cause.message }); this.reportFailure(wrapped); this.scheduleRetry(); throw wrapped; } } return this.filePath; })().finally(() => { this.flushPromise = null; }); return this.flushPromise; }
  scheduleRetry() { if (!this.pendingSnapshot && this.timer === null) return; if (this.timer !== null) return; this.timer = this.schedule(() => { this.timer = null; this.flush().catch(() => {}); }, this.debounceMs); }
  reportFailure(error) { this.lastError = error; this.emit('diagnostic', { code: error.code, message: error.message, details: { path: this.filePath, ...(error.details ?? {}) }, timestamp: new Date().toISOString() }); }
}
