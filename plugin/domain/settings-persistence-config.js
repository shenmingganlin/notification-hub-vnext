import path from 'node:path';

import { SettingsStore } from './settings-store.js';
import { SettingsStorePersistenceCoordinator } from './settings-store-persistence.js';

export const SETTINGS_PERSISTENCE_DEFAULTS = Object.freeze({
  enabled: true,
  relativePath: 'settings.json',
  debounceMs: 100
});

function configError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function readConfig(config) {
  try {
    if (config?.getAll) return config.getAll() || {};
    if (config?.get) return config.get() || {};
  } catch (error) {
    throw configError(
      'SETTINGS_STORE_CONFIG_READ_FAILED',
      'Failed to read Settings Store persistence configuration',
      { cause: error.message }
    );
  }
  return config && typeof config === 'object' ? config : {};
}

function resolvePath(dataDir, configuredPath) {
  if (typeof configuredPath !== 'string' || configuredPath.trim().length === 0) {
    throw configError('SETTINGS_STORE_PATH_INVALID', 'Settings Store persistence path must be a non-empty string');
  }
  if (path.isAbsolute(configuredPath)) return path.normalize(configuredPath);
  if (typeof dataDir !== 'string' || dataDir.trim().length === 0) {
    throw configError(
      'SETTINGS_STORE_DATA_DIR_INVALID',
      'A non-empty dataDir is required for a relative Settings Store persistence path'
    );
  }
  return path.resolve(dataDir, configuredPath);
}

export function resolveSettingsPersistenceConfig({ dataDir, config, overrides = {} } = {}) {
  const raw = { ...readConfig(config), ...overrides };
  const enabled = raw.settingsPersistenceEnabled ?? SETTINGS_PERSISTENCE_DEFAULTS.enabled;
  if (typeof enabled !== 'boolean') {
    throw configError('SETTINGS_STORE_CONFIG_INVALID', 'settingsPersistenceEnabled must be a boolean');
  }
  if (!enabled) return { enabled: false, filePath: null, debounceMs: null };
  const configuredPath = raw.settingsPersistencePath ?? SETTINGS_PERSISTENCE_DEFAULTS.relativePath;
  const debounceMs = raw.settingsPersistenceDebounceMs ?? SETTINGS_PERSISTENCE_DEFAULTS.debounceMs;
  if (!Number.isFinite(debounceMs) || debounceMs < 0) {
    throw configError(
      'SETTINGS_STORE_DEBOUNCE_INVALID',
      'settingsPersistenceDebounceMs must be a non-negative finite number'
    );
  }
  return { enabled: true, filePath: resolvePath(dataDir, configuredPath), debounceMs };
}

export function createSettingsPersistenceFromHostContext(context, options = {}) {
  return createSettingsPersistence({
    dataDir: context?.dataDir,
    config: context?.config,
    ...options
  });
}

export function createSettingsPersistence({
  dataDir,
  config,
  overrides,
  store = new SettingsStore(),
  save,
  load,
  schedule,
  cancel
} = {}) {
  const resolved = resolveSettingsPersistenceConfig({ dataDir, config, overrides });
  if (!resolved.enabled) return null;
  return new SettingsStorePersistenceCoordinator({
    store,
    filePath: resolved.filePath,
    debounceMs: resolved.debounceMs,
    save,
    load,
    schedule,
    cancel
  });
}
