import { EventEmitter } from 'node:events';
import { createFlightChannels } from './channel-charter.js';
import { createVisualProfile, createVisualSettings, validateVisualSettings } from './visual-settings.js';

export const VISUAL_SETTINGS_STORE_VERSION = 1;
export const VISUAL_SETTINGS_STATUSES = Object.freeze({ SAVED: 'saved', APPLIED: 'applied', APPLY_FAILED: 'apply-failed' });

const fail = (code, message, details = {}) => Object.assign(new Error(message), { code, details });
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const clone = (value) => Array.isArray(value) ? value.map(clone) : plain(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const merge = (left, right) => plain(left) && plain(right)
  ? Object.fromEntries([...new Set([...Object.keys(left), ...Object.keys(right)])].map((key) => [key, plain(left[key]) && plain(right[key]) ? merge(left[key], right[key]) : clone(key in right ? right[key] : left[key])]))
  : clone(right);

export function createVisualSettingsStoreSnapshot(settings, revision, { updatedAt = new Date().toISOString() } = {}) {
  if (!Number.isInteger(revision) || revision < 1) throw fail('VISUAL_SETTINGS_SNAPSHOT_INVALID', 'Visual settings revision must be a positive integer', { field: 'revision' });
  try { validateVisualSettings(settings); } catch (cause) { throw fail('VISUAL_SETTINGS_SNAPSHOT_INVALID', 'Visual settings snapshot is invalid', { field: 'settings', cause: cause.code }); }
  if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) throw fail('VISUAL_SETTINGS_SNAPSHOT_INVALID', 'Visual settings updatedAt must be a valid timestamp', { field: 'updatedAt' });
  const normalized = createVisualSettings(clone(settings));
  return freeze({ version: VISUAL_SETTINGS_STORE_VERSION, revision, updatedAt, settings: normalized });
}

export class VisualSettingsStore extends EventEmitter {
  #snapshot;
  constructor({ initialSettings = {} } = {}) { super(); this.#snapshot = this.#state(createVisualSettings(initialSettings), 1, 1, 0, VISUAL_SETTINGS_STATUSES.SAVED, null); }
  #state(settings, revision, savedRevision, appliedRevision, status, applyError) { return freeze({ version: VISUAL_SETTINGS_STORE_VERSION, settings, revision, savedRevision, appliedRevision, status, applyError }); }
  getSnapshot() { return this.#snapshot; }
  updateVisualSettings(patch = {}) {
    if (!plain(patch)) throw fail('VISUAL_SETTINGS_PATCH_INVALID', 'Visual settings patch must be a plain object');
    const merged = merge(this.#snapshot.settings, patch);
    // Studio still posts profile only. Re-copy charter from that profile so band/dock changes land on the machine-wide channels.
    if (plain(patch.profile) && patch.channels === undefined) {
      const profile = createVisualProfile(merged.profile);
      merged.channels = createFlightChannels({}, { profile });
    }
    const next = createVisualSettings(merged);
    this.#snapshot = this.#state(next, this.#snapshot.revision + 1, this.#snapshot.revision + 1, this.#snapshot.appliedRevision, VISUAL_SETTINGS_STATUSES.SAVED, null);
    this.emit('change', this.#snapshot);
    return this.#snapshot;
  }
  restoreSnapshot(snapshot) {
    if (!plain(snapshot) || snapshot.version !== VISUAL_SETTINGS_STORE_VERSION) throw fail('VISUAL_SETTINGS_SNAPSHOT_VERSION_UNSUPPORTED', 'Unsupported visual settings snapshot');
    const normalized = createVisualSettingsStoreSnapshot(snapshot.settings, snapshot.revision, { updatedAt: snapshot.updatedAt });
    this.#snapshot = this.#state(normalized.settings, normalized.revision, normalized.revision, 0, VISUAL_SETTINGS_STATUSES.SAVED, null);
    return this.#snapshot;
  }
  markApplied(revision) {
    if (revision !== this.#snapshot.revision) throw fail('VISUAL_SETTINGS_REVISION_STALE', 'Visual settings revision is stale');
    this.#snapshot = this.#state(this.#snapshot.settings, this.#snapshot.revision, this.#snapshot.savedRevision, revision, VISUAL_SETTINGS_STATUSES.APPLIED, null);
    return this.#snapshot;
  }
  markApplyFailed(revision, applyError) {
    if (revision !== this.#snapshot.revision) throw fail('VISUAL_SETTINGS_REVISION_STALE', 'Visual settings revision is stale');
    if (!plain(applyError)) throw fail('VISUAL_SETTINGS_APPLY_FAILED', 'applyError must be a plain object');
    this.#snapshot = this.#state(this.#snapshot.settings, this.#snapshot.revision, this.#snapshot.savedRevision, this.#snapshot.appliedRevision, VISUAL_SETTINGS_STATUSES.APPLY_FAILED, freeze({ code: applyError.code ?? 'VISUAL_SETTINGS_APPLY_FAILED', message: applyError.message ?? 'Visual settings apply failed' }));
    return this.#snapshot;
  }
}
