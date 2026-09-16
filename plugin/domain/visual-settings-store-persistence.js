import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { replaceFileAtomically } from '../persistence/atomic-file-replace.js';
import { createVisualSettingsStoreSnapshot, VISUAL_SETTINGS_STORE_VERSION } from './visual-settings-store.js';

const fail = (code, message, details = {}) => Object.assign(new Error(message), { code, details });
const encode = (snapshot) => { if (snapshot.version !== VISUAL_SETTINGS_STORE_VERSION) throw fail('VISUAL_SETTINGS_SNAPSHOT_VERSION_UNSUPPORTED', 'Unsupported visual settings snapshot version'); return `${JSON.stringify(snapshot)}\n`; };
const decode = (text) => { let value; try { value = JSON.parse(text); } catch { throw fail('VISUAL_SETTINGS_SNAPSHOT_PARSE_FAILED', 'Visual settings snapshot contains invalid JSON'); } return createVisualSettingsStoreSnapshot(value.settings, value.revision, { updatedAt: value.updatedAt }); };

export async function saveVisualSettingsSnapshot(snapshot, filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw fail('VISUAL_SETTINGS_PATH_INVALID', 'Visual settings path must be non-empty');
  try { return await replaceFileAtomically(filePath, encode(snapshot)); }
  catch (cause) { if (cause.code?.startsWith('VISUAL_SETTINGS_')) throw cause; throw fail('VISUAL_SETTINGS_PERSIST_FAILED', 'Failed to persist visual settings', { path: filePath, cause: cause.message }); }
}
export async function loadVisualSettingsSnapshot(filePath) {
  try { return decode(await readFile(filePath, 'utf8')); }
  catch (cause) { if (cause.code === 'ENOENT') return null; throw fail('VISUAL_SETTINGS_LOAD_FAILED', 'Failed to load visual settings', { path: filePath, cause: cause.code ?? cause.message }); }
}

export class VisualSettingsPersistenceCoordinator extends EventEmitter {
  constructor({ store, filePath, debounceMs = 100, save = saveVisualSettingsSnapshot, load = loadVisualSettingsSnapshot, schedule = (fn, ms) => setTimeout(fn, ms), cancel = clearTimeout } = {}) {
    super(); if (!store?.on || !store?.getSnapshot || !store?.restoreSnapshot) throw fail('VISUAL_SETTINGS_PERSISTENCE_INVALID', 'Visual settings persistence requires a compatible store');
    this.store = store; this.filePath = filePath; this.debounceMs = debounceMs; this.save = save; this.load = load; this.schedule = schedule; this.cancel = cancel; this.pendingSnapshot = null; this.timer = null; this.flushPromise = null; this.restoring = false; this.listener = null;
  }
  observe() { if (!this.listener) { this.listener = () => { if (!this.restoring) this.requestSave(); }; this.store.on('change', this.listener); } return () => this.dispose(); }
  dispose() { if (this.listener) this.store.off('change', this.listener); this.listener = null; if (this.timer !== null) this.cancel(this.timer); this.timer = null; }
  requestSave() { const snapshot = this.store.getSnapshot(); this.pendingSnapshot = createVisualSettingsStoreSnapshot(snapshot.settings, snapshot.revision); if (this.timer !== null) this.cancel(this.timer); this.timer = this.schedule(() => { this.timer = null; this.flush().catch(() => {}); }, this.debounceMs); return this.pendingSnapshot; }
  async restore() { this.restoring = true; try { const snapshot = await this.load(this.filePath); if (snapshot) this.store.restoreSnapshot(snapshot); return snapshot; } finally { this.restoring = false; } }
  async flush() { if (this.timer !== null) { this.cancel(this.timer); this.timer = null; } if (this.flushPromise) return this.flushPromise; if (!this.pendingSnapshot) return null; this.flushPromise = (async () => { const snapshot = this.pendingSnapshot; this.pendingSnapshot = null; try { return await this.save(snapshot, this.filePath); } catch (cause) { this.pendingSnapshot = snapshot; throw cause; } })().finally(() => { this.flushPromise = null; }); return this.flushPromise; }
}
