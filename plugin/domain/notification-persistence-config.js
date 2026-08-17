import path from 'node:path';

import { NotificationStore } from './notification-store.js';
import { NotificationStorePersistenceCoordinator } from './notification-store-persistence.js';

export const NOTIFICATION_PERSISTENCE_DEFAULTS = Object.freeze({
  enabled: true,
  relativePath: 'notification-store.json',
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
      'NOTIFICATION_STORE_CONFIG_READ_FAILED',
      'Failed to read Notification Store persistence configuration',
      { cause: error.message }
    );
  }
  return config && typeof config === 'object' ? config : {};
}

function resolvePath(dataDir, configuredPath) {
  if (typeof configuredPath !== 'string' || configuredPath.trim().length === 0) {
    throw configError(
      'NOTIFICATION_STORE_PATH_INVALID',
      'Notification Store persistence path must be a non-empty string'
    );
  }
  if (path.isAbsolute(configuredPath)) return path.normalize(configuredPath);
  if (typeof dataDir !== 'string' || dataDir.trim().length === 0) {
    throw configError(
      'NOTIFICATION_STORE_DATA_DIR_INVALID',
      'A non-empty dataDir is required for a relative Notification Store persistence path'
    );
  }
  return path.resolve(dataDir, configuredPath);
}

export function resolveNotificationPersistenceConfig({ dataDir, config, overrides = {} } = {}) {
  const raw = { ...readConfig(config), ...overrides };
  const enabled = raw.notificationPersistenceEnabled
    ?? NOTIFICATION_PERSISTENCE_DEFAULTS.enabled;
  if (typeof enabled !== 'boolean') {
    throw configError(
      'NOTIFICATION_STORE_CONFIG_INVALID',
      'notificationPersistenceEnabled must be a boolean'
    );
  }
  if (!enabled) return { enabled: false, filePath: null, debounceMs: null };

  const configuredPath = raw.notificationPersistencePath
    ?? NOTIFICATION_PERSISTENCE_DEFAULTS.relativePath;
  const debounceMs = raw.notificationPersistenceDebounceMs
    ?? NOTIFICATION_PERSISTENCE_DEFAULTS.debounceMs;
  if (!Number.isFinite(debounceMs) || debounceMs < 0) {
    throw configError(
      'NOTIFICATION_STORE_DEBOUNCE_INVALID',
      'notificationPersistenceDebounceMs must be a non-negative finite number'
    );
  }
  return {
    enabled: true,
    filePath: resolvePath(dataDir, configuredPath),
    debounceMs
  };
}

export function createNotificationPersistenceFromHostContext(context, options = {}) {
  return createNotificationPersistence({
    dataDir: context?.dataDir,
    config: context?.config,
    ...options
  });
}

export function createNotificationPersistence({
  dataDir,
  config,
  overrides,
  store = new NotificationStore(),
  save,
  load,
  schedule,
  cancel
} = {}) {
  const resolved = resolveNotificationPersistenceConfig({ dataDir, config, overrides });
  if (!resolved.enabled) return null;
  return new NotificationStorePersistenceCoordinator({
    store,
    filePath: resolved.filePath,
    debounceMs: resolved.debounceMs,
    save,
    load,
    schedule,
    cancel
  });
}
