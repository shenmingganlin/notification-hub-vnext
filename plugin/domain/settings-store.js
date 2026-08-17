import { EventEmitter } from 'node:events';

import { createSoundSettings } from './sound-settings.js';
import { validateSettingsStoreSnapshot } from './settings-store-snapshot.js';

function storeError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneDeep(value) {
  if (Array.isArray(value)) return value.map(cloneDeep);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneDeep(entry)]));
  }
  return value;
}

function mergeDeep(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return cloneDeep(patch);
  const result = cloneDeep(base);
  for (const [key, value] of Object.entries(patch)) {
    result[key] = isPlainObject(result[key]) && isPlainObject(value)
      ? mergeDeep(result[key], value)
      : cloneDeep(value);
  }
  return result;
}

export const SETTINGS_STORE_STATUSES = Object.freeze({
  SAVED: 'saved',
  APPLIED: 'applied',
  APPLY_FAILED: 'apply-failed'
});

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function requireRevision(revision) {
  if (!Number.isInteger(revision) || revision < 1) {
    throw storeError(
      'SETTINGS_STORE_REVISION_INVALID',
      'revision must be a positive integer',
      { field: 'revision', revision }
    );
  }
}

function requireCurrentRevision(snapshot, revision) {
  requireRevision(revision);
  if (revision !== snapshot.revision) {
    throw storeError(
      'SETTINGS_STORE_REVISION_STALE',
      'The settings revision is stale',
      { expectedRevision: snapshot.revision, revision }
    );
  }
}

function normalizeApplyError(error) {
  if (!error || typeof error !== 'object') {
    throw storeError(
      'SETTINGS_STORE_APPLY_FAILED',
      'apply error must be an object',
      { field: 'error' }
    );
  }
  const code = typeof error.code === 'string' && error.code.trim() ? error.code : 'SETTINGS_STORE_APPLY_FAILED';
  const message = typeof error.message === 'string' && error.message.trim()
    ? error.message
    : 'Settings apply failed';
  return Object.freeze({ code, message });
}

function createSnapshot({ settings, revision, savedRevision, appliedRevision, status, applyError }) {
  return freezeDeep({
    settings,
    revision,
    savedRevision,
    appliedRevision,
    status,
    applyError
  });
}

export class SettingsStore extends EventEmitter {
  #snapshot;

  constructor({ initialSettings = {} } = {}) {
    super();
    const settings = createSoundSettings(initialSettings);
    this.#snapshot = createSnapshot({
      settings,
      revision: 1,
      savedRevision: 1,
      appliedRevision: 0,
      status: SETTINGS_STORE_STATUSES.SAVED,
      applyError: null
    });
  }

  getSnapshot() {
    return this.#snapshot;
  }

  restoreSnapshot(snapshot) {
    try {
      validateSettingsStoreSnapshot(snapshot);
    } catch (error) {
      throw storeError(
        error.code ?? 'SETTINGS_STORE_SNAPSHOT_INVALID',
        error.message,
        error.details ?? {}
      );
    }
    this.#snapshot = createSnapshot({
      settings: createSoundSettings(snapshot.settings),
      revision: snapshot.revision,
      savedRevision: snapshot.revision,
      appliedRevision: 0,
      status: SETTINGS_STORE_STATUSES.SAVED,
      applyError: null
    });
    return this.#snapshot;
  }

  updateSoundSettings(patch = {}) {
    if (!isPlainObject(patch)) {
      throw storeError(
        'SETTINGS_STORE_PATCH_INVALID',
        'Sound settings patch must be a plain object',
        { field: 'patch' }
      );
    }
    const settings = createSoundSettings(mergeDeep(this.#snapshot.settings, patch));
    this.#snapshot = createSnapshot({
      settings,
      revision: this.#snapshot.revision + 1,
      savedRevision: this.#snapshot.revision + 1,
      appliedRevision: this.#snapshot.appliedRevision,
      status: SETTINGS_STORE_STATUSES.SAVED,
      applyError: null
    });
    this.emit('change', this.#snapshot);
    return this.#snapshot;
  }

  markApplied(revision) {
    requireCurrentRevision(this.#snapshot, revision);
    this.#snapshot = createSnapshot({
      settings: this.#snapshot.settings,
      revision: this.#snapshot.revision,
      savedRevision: this.#snapshot.savedRevision,
      appliedRevision: revision,
      status: SETTINGS_STORE_STATUSES.APPLIED,
      applyError: null
    });
    return this.#snapshot;
  }

  markApplyFailed(revision, error) {
    requireCurrentRevision(this.#snapshot, revision);
    this.#snapshot = createSnapshot({
      settings: this.#snapshot.settings,
      revision: this.#snapshot.revision,
      savedRevision: this.#snapshot.savedRevision,
      appliedRevision: this.#snapshot.appliedRevision,
      status: SETTINGS_STORE_STATUSES.APPLY_FAILED,
      applyError: normalizeApplyError(error)
    });
    return this.#snapshot;
  }
}
