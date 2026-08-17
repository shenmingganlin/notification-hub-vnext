import { EventEmitter } from 'node:events';
import { createSoundSettings, validateSoundSettings } from './sound-settings.js';

export const SOUND_SETTINGS_STORE_VERSION = 1;
export const SOUND_SETTINGS_STORE_STATUSES = Object.freeze({ SAVED: 'saved', APPLIED: 'applied', APPLY_FAILED: 'apply-failed' });

const error = (code, message, details = {}) => Object.assign(new Error(message), { code, details });
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && ([Object.prototype, null].includes(Object.getPrototypeOf(v)));
const clone = (v) => Array.isArray(v) ? v.map(clone) : plain(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v;
const freeze = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const merge = (a, b) => plain(a) && plain(b) ? Object.fromEntries(new Set([...Object.keys(a), ...Object.keys(b)]).values().map((k) => [k, plain(a[k]) && plain(b[k]) ? merge(a[k], b[k]) : clone(k in b ? b[k] : a[k])])) : clone(b);

export function createSoundSettingsStoreSnapshot(settings, revision, { updatedAt = new Date().toISOString() } = {}) {
  if (!Number.isInteger(revision) || revision < 1) throw error('SOUND_SETTINGS_STORE_SNAPSHOT_INVALID', 'Sound settings snapshot revision must be a positive integer', { field: 'revision' });
  try { validateSoundSettings(settings); } catch (cause) { throw error('SOUND_SETTINGS_STORE_SNAPSHOT_INVALID', 'Sound settings snapshot contains invalid settings', { field: 'settings', cause: cause.code }); }
  if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) throw error('SOUND_SETTINGS_STORE_SNAPSHOT_INVALID', 'Sound settings snapshot updatedAt must be a valid timestamp', { field: 'updatedAt' });
  const normalized = createSoundSettings(clone(settings));
  return freeze({ version: SOUND_SETTINGS_STORE_VERSION, revision, updatedAt, profile: normalized.profile, settings: normalized });
}

export class SoundSettingsStore extends EventEmitter {
  #snapshot;
  constructor({ initialSettings = {} } = {}) { super(); this.#snapshot = this.#state(createSoundSettings(initialSettings), 1, 1, 0, SOUND_SETTINGS_STORE_STATUSES.SAVED, null); }
  #state(settings, revision, savedRevision, appliedRevision, status, applyError) { return freeze({ version: SOUND_SETTINGS_STORE_VERSION, settings, revision, savedRevision, appliedRevision, status, applyError }); }
  getSnapshot() { return this.#snapshot; }
  updateSoundSettings(patch = {}) { if (!plain(patch)) throw error('SOUND_SETTINGS_STORE_PATCH_INVALID', 'Sound settings patch must be a plain object'); const next = createSoundSettings(merge(this.#snapshot.settings, patch)); this.#snapshot = this.#state(next, this.#snapshot.revision + 1, this.#snapshot.revision + 1, this.#snapshot.appliedRevision, SOUND_SETTINGS_STORE_STATUSES.SAVED, null); this.emit('change', this.#snapshot); return this.#snapshot; }
  replaceSoundSettings(settings = {}) { if (!plain(settings)) throw error('SOUND_SETTINGS_STORE_SETTINGS_INVALID', 'Sound settings must be a plain object'); const next = createSoundSettings(clone(settings)); this.#snapshot = this.#state(next, this.#snapshot.revision + 1, this.#snapshot.revision + 1, this.#snapshot.appliedRevision, SOUND_SETTINGS_STORE_STATUSES.SAVED, null); this.emit('change', this.#snapshot); return this.#snapshot; }
  restoreSnapshot(snapshot) { if (!plain(snapshot)) throw error('SOUND_SETTINGS_STORE_SNAPSHOT_INVALID', 'Sound settings snapshot must be a plain object'); if (snapshot.version !== SOUND_SETTINGS_STORE_VERSION) throw error('SOUND_SETTINGS_STORE_SNAPSHOT_VERSION_UNSUPPORTED', `Unsupported sound settings snapshot version: ${snapshot.version}`); const normalized = createSoundSettingsStoreSnapshot(snapshot.settings, snapshot.revision, { updatedAt: snapshot.updatedAt }); this.#snapshot = this.#state(normalized.settings, normalized.revision, normalized.revision, 0, SOUND_SETTINGS_STORE_STATUSES.SAVED, null); return this.#snapshot; }
  markApplied(revision) { if (revision !== this.#snapshot.revision) throw error('SOUND_SETTINGS_STORE_REVISION_STALE', 'The sound settings revision is stale'); this.#snapshot = this.#state(this.#snapshot.settings, this.#snapshot.revision, this.#snapshot.savedRevision, revision, SOUND_SETTINGS_STORE_STATUSES.APPLIED, null); return this.#snapshot; }
  markApplyFailed(revision, applyError) { if (revision !== this.#snapshot.revision) throw error('SOUND_SETTINGS_STORE_REVISION_STALE', 'The sound settings revision is stale'); if (!plain(applyError)) throw error('SOUND_SETTINGS_STORE_APPLY_FAILED', 'apply error must be an object'); this.#snapshot = this.#state(this.#snapshot.settings, this.#snapshot.revision, this.#snapshot.savedRevision, this.#snapshot.appliedRevision, SOUND_SETTINGS_STORE_STATUSES.APPLY_FAILED, freeze({ code: applyError.code ?? 'SOUND_SETTINGS_STORE_APPLY_FAILED', message: applyError.message ?? 'Sound settings apply failed' })); return this.#snapshot; }
}
