import path from 'node:path';

import { EventPresentationSettingsStore } from './event-presentation-settings-store.js';
import { EventPresentationSettingsPersistenceCoordinator } from './event-presentation-settings-persistence.js';

export const EVENT_PRESENTATION_SETTINGS_PERSISTENCE_DEFAULTS = Object.freeze({
  enabled: true,
  relativePath: 'event-presentation-settings.json',
  debounceMs: 100
});

function fail(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function readConfig(config) {
  try {
    if (config?.getAll) return config.getAll() || {};
    if (config?.get) return config.get() || {};
  } catch (cause) {
    throw fail('EVENT_PRESENTATION_SETTINGS_CONFIG_READ_FAILED', 'Failed to read event presentation settings configuration', {
      cause: cause.message
    });
  }
  return config && typeof config === 'object' ? config : {};
}

function resolvePath(dataDir, configuredPath) {
  if (typeof configuredPath !== 'string' || !configuredPath.trim()) {
    throw fail('EVENT_PRESENTATION_SETTINGS_PATH_INVALID', 'Event presentation settings path must be non-empty');
  }
  if (path.isAbsolute(configuredPath)) return path.normalize(configuredPath);
  if (typeof dataDir !== 'string' || !dataDir.trim()) {
    throw fail('EVENT_PRESENTATION_SETTINGS_DATA_DIR_INVALID', 'A non-empty dataDir is required');
  }
  return path.resolve(dataDir, configuredPath);
}

export function resolveEventPresentationSettingsPersistenceConfig({ dataDir, config, overrides = {} } = {}) {
  const raw = { ...readConfig(config), ...overrides };
  const enabled = raw.eventPresentationSettingsPersistenceEnabled
    ?? EVENT_PRESENTATION_SETTINGS_PERSISTENCE_DEFAULTS.enabled;
  if (typeof enabled !== 'boolean') {
    throw fail('EVENT_PRESENTATION_SETTINGS_CONFIG_INVALID', 'eventPresentationSettingsPersistenceEnabled must be boolean');
  }
  if (!enabled) return { enabled: false, filePath: null, debounceMs: null };

  const debounceMs = raw.eventPresentationSettingsPersistenceDebounceMs
    ?? EVENT_PRESENTATION_SETTINGS_PERSISTENCE_DEFAULTS.debounceMs;
  if (!Number.isFinite(debounceMs) || debounceMs < 0) {
    throw fail('EVENT_PRESENTATION_SETTINGS_DEBOUNCE_INVALID', 'eventPresentationSettingsPersistenceDebounceMs must be non-negative');
  }
  return {
    enabled: true,
    filePath: resolvePath(
      dataDir,
      raw.eventPresentationSettingsPersistencePath
        ?? EVENT_PRESENTATION_SETTINGS_PERSISTENCE_DEFAULTS.relativePath
    ),
    debounceMs
  };
}

export function createEventPresentationSettingsPersistenceFromHostContext(context, options = {}) {
  return createEventPresentationSettingsPersistence({
    dataDir: context?.dataDir,
    config: context?.config,
    ...options
  });
}

export function createEventPresentationSettingsPersistence({
  dataDir,
  config,
  overrides,
  store = new EventPresentationSettingsStore(),
  save,
  load,
  schedule,
  cancel
} = {}) {
  const resolved = resolveEventPresentationSettingsPersistenceConfig({ dataDir, config, overrides });
  if (!resolved.enabled) return null;
  return new EventPresentationSettingsPersistenceCoordinator({
    store,
    filePath: resolved.filePath,
    debounceMs: resolved.debounceMs,
    save,
    load,
    schedule,
    cancel
  });
}
