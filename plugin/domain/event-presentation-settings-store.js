import { EventEmitter } from 'node:events';
import { createEventPresentationSettings } from './event-presentation-settings.js';

export const EVENT_PRESENTATION_SETTINGS_STORE_VERSION = 1;
export const EVENT_PRESENTATION_SETTINGS_STATUSES = Object.freeze({ SAVED: 'saved', APPLIED: 'applied', APPLY_FAILED: 'apply-failed' });

const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const clone = (value) => Array.isArray(value) ? value.map(clone) : plain(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const error = (code, message, details = {}) => Object.assign(new Error(message), { code, details });

export function createEventPresentationSettingsStoreSnapshot(settings, revision, { updatedAt = new Date().toISOString() } = {}) {
  if (!Number.isInteger(revision) || revision < 1) throw error('EVENT_PRESENTATION_STORE_SNAPSHOT_INVALID', 'revision must be a positive integer', { field: 'revision' });
  if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) throw error('EVENT_PRESENTATION_STORE_SNAPSHOT_INVALID', 'updatedAt must be a valid timestamp', { field: 'updatedAt' });
  let normalized;
  try { normalized = createEventPresentationSettings(clone(settings)); } catch (cause) { throw error('EVENT_PRESENTATION_STORE_SNAPSHOT_INVALID', 'settings are invalid', { field: 'settings', cause: cause.code }); }
  return freeze({ version: EVENT_PRESENTATION_SETTINGS_STORE_VERSION, revision, updatedAt, settings: normalized });
}

export class EventPresentationSettingsStore extends EventEmitter {
  #snapshot;
  constructor({ initialSettings = {} } = {}) {
    super();
    this.#snapshot = this.#state(createEventPresentationSettings(initialSettings), 1, 1, 0, EVENT_PRESENTATION_SETTINGS_STATUSES.SAVED, null);
  }
  #state(settings, revision, savedRevision, appliedRevision, status, applyError) {
    return freeze({ version: EVENT_PRESENTATION_SETTINGS_STORE_VERSION, settings, revision, savedRevision, appliedRevision, status, applyError });
  }
  getSnapshot() { return this.#snapshot; }
  replaceSettings(settings = {}) {
    const next = createEventPresentationSettings(clone(settings));
    this.#snapshot = this.#state(next, this.#snapshot.revision + 1, this.#snapshot.revision + 1, this.#snapshot.appliedRevision, EVENT_PRESENTATION_SETTINGS_STATUSES.SAVED, null);
    this.emit('change', this.#snapshot);
    return this.#snapshot;
  }
  updateSettings(patch = {}) {
    if (!plain(patch)) throw error('EVENT_PRESENTATION_STORE_PATCH_INVALID', 'patch must be a plain object');
    const current = this.#snapshot.settings;
    const next = createEventPresentationSettings({
      ...clone(current),
      ...(patch.global === undefined ? {} : { global: patch.global }),
      ...(patch.categories === undefined ? {} : { categories: { ...clone(current.categories), ...clone(patch.categories) } }),
      ...(patch.events === undefined ? {} : { events: { ...clone(current.events), ...clone(patch.events) } }),
      ...(patch.importanceKeywords === undefined ? {} : { importanceKeywords: patch.importanceKeywords }),
      ...(patch.channelPolicies === undefined ? {} : { channelPolicies: patch.channelPolicies }),
      ...(patch.channels === undefined ? {} : { channels: patch.channels }),
      ...(patch.visualRules === undefined ? {} : { visualRules: patch.visualRules })
    });
    this.#snapshot = this.#state(next, this.#snapshot.revision + 1, this.#snapshot.revision + 1, this.#snapshot.appliedRevision, EVENT_PRESENTATION_SETTINGS_STATUSES.SAVED, null);
    this.emit('change', this.#snapshot);
    return this.#snapshot;
  }
  restoreSnapshot(snapshot) {
    const normalized = createEventPresentationSettingsStoreSnapshot(snapshot?.settings, snapshot?.revision, { updatedAt: snapshot?.updatedAt });
    this.#snapshot = this.#state(normalized.settings, normalized.revision, normalized.revision, 0, EVENT_PRESENTATION_SETTINGS_STATUSES.SAVED, null);
    this.emit('restore', this.#snapshot);
    return this.#snapshot;
  }
  markApplied(revision) {
    if (revision !== this.#snapshot.revision) throw error('EVENT_PRESENTATION_STORE_REVISION_STALE', 'settings revision is stale');
    this.#snapshot = this.#state(this.#snapshot.settings, this.#snapshot.revision, this.#snapshot.savedRevision, revision, EVENT_PRESENTATION_SETTINGS_STATUSES.APPLIED, null);
    return this.#snapshot;
  }
  markApplyFailed(revision, applyError) {
    if (revision !== this.#snapshot.revision) throw error('EVENT_PRESENTATION_STORE_REVISION_STALE', 'settings revision is stale');
    this.#snapshot = this.#state(this.#snapshot.settings, this.#snapshot.revision, this.#snapshot.savedRevision, this.#snapshot.appliedRevision, EVENT_PRESENTATION_SETTINGS_STATUSES.APPLY_FAILED, freeze({ code: applyError?.code ?? 'EVENT_PRESENTATION_APPLY_FAILED', message: applyError?.message ?? 'event presentation settings apply failed' }));
    return this.#snapshot;
  }
}
