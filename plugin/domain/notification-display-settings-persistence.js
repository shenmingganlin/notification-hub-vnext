import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

import {
  createNotificationDisplaySettings,
  validateNotificationDisplaySettings
} from './notification-display-settings.js';

export const NOTIFICATION_DISPLAY_SETTINGS_PERSISTENCE_DEFAULTS = Object.freeze({
  relativePath: 'notification-display-settings.json'
});

function persistenceError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function resolvePath(dataDir, configuredPath) {
  if (typeof configuredPath !== 'string' || configuredPath.trim().length === 0) {
    throw persistenceError(
      'NOTIFICATION_DISPLAY_SETTINGS_PATH_INVALID',
      'Notification display settings path must be a non-empty string'
    );
  }
  if (path.isAbsolute(configuredPath)) return path.normalize(configuredPath);
  if (typeof dataDir !== 'string' || dataDir.trim().length === 0) {
    throw persistenceError(
      'NOTIFICATION_DISPLAY_SETTINGS_DATA_DIR_INVALID',
      'A non-empty dataDir is required for notification display settings'
    );
  }
  return path.resolve(dataDir, configuredPath);
}

export function resolveNotificationDisplaySettingsPersistenceConfig({ dataDir, config = {}, overrides = {} } = {}) {
  const source = typeof config?.getAll === 'function'
    ? config.getAll() || {}
    : (typeof config?.get === 'function' ? config.get() || {} : config || {});
  const rawPath = overrides.notificationDisplaySettingsPath
    ?? source.notificationDisplaySettingsPath
    ?? NOTIFICATION_DISPLAY_SETTINGS_PERSISTENCE_DEFAULTS.relativePath;
  return { filePath: resolvePath(dataDir, rawPath) };
}

export function createNotificationDisplaySettingsPersistence({ dataDir, config, overrides } = {}) {
  const { filePath } = resolveNotificationDisplaySettingsPersistenceConfig({ dataDir, config, overrides });

  return {
    filePath,
    async restore() {
      try {
        const parsed = JSON.parse(await readFile(filePath, 'utf8'));
        validateNotificationDisplaySettings(parsed);
        return createNotificationDisplaySettings(parsed);
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        if (error.code?.startsWith('NOTIFICATION_DISPLAY_SETTINGS_')) throw error;
        throw persistenceError(
          'NOTIFICATION_DISPLAY_SETTINGS_LOAD_FAILED',
          'Failed to restore notification display settings',
          { path: filePath, cause: error.message, code: error.code }
        );
      }
    },
    async save(settings) {
      const normalized = createNotificationDisplaySettings(settings);
      const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
      try {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(temporaryPath, `${JSON.stringify(normalized)}\n`, { encoding: 'utf8', flag: 'wx' });
        await rename(temporaryPath, filePath);
        return filePath;
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => {});
        if (error.code?.startsWith('NOTIFICATION_DISPLAY_SETTINGS_')) throw error;
        throw persistenceError(
          'NOTIFICATION_DISPLAY_SETTINGS_SAVE_FAILED',
          'Failed to persist notification display settings',
          { path: filePath, cause: error.message, code: error.code }
        );
      }
    }
  };
}
