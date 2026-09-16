import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { replaceFileAtomically } from '../persistence/atomic-file-replace.js';
import {
  createSidebarDisplaySettings,
  validateSidebarDisplaySettings
} from './sidebar-display-settings.js';

export const SIDEBAR_DISPLAY_SETTINGS_PERSISTENCE_DEFAULTS = Object.freeze({
  relativePath: 'sidebar-display-settings.json'
});

function persistenceError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function resolvePath(dataDir, configuredPath) {
  if (typeof configuredPath !== 'string' || configuredPath.trim().length === 0) {
    throw persistenceError(
      'SIDEBAR_DISPLAY_SETTINGS_PATH_INVALID',
      'Sidebar display settings path must be a non-empty string'
    );
  }
  if (path.isAbsolute(configuredPath)) return path.normalize(configuredPath);
  if (typeof dataDir !== 'string' || dataDir.trim().length === 0) {
    throw persistenceError(
      'SIDEBAR_DISPLAY_SETTINGS_DATA_DIR_INVALID',
      'A non-empty dataDir is required for sidebar display settings'
    );
  }
  return path.resolve(dataDir, configuredPath);
}

export function resolveSidebarDisplaySettingsPersistenceConfig({ dataDir, config = {}, overrides = {} } = {}) {
  const source = typeof config?.getAll === 'function'
    ? config.getAll() || {}
    : (typeof config?.get === 'function' ? config.get() || {} : config || {});
  const rawPath = overrides.sidebarDisplaySettingsPath
    ?? source.sidebarDisplaySettingsPath
    ?? SIDEBAR_DISPLAY_SETTINGS_PERSISTENCE_DEFAULTS.relativePath;
  return { filePath: resolvePath(dataDir, rawPath) };
}

export function createSidebarDisplaySettingsPersistence({ dataDir, config, overrides } = {}) {
  const { filePath } = resolveSidebarDisplaySettingsPersistenceConfig({ dataDir, config, overrides });

  return {
    filePath,
    async restore() {
      try {
        const parsed = JSON.parse(await readFile(filePath, 'utf8'));
        validateSidebarDisplaySettings(parsed);
        return createSidebarDisplaySettings(parsed);
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        if (error.code?.startsWith('SIDEBAR_DISPLAY_SETTINGS_')) throw error;
        throw persistenceError(
          'SIDEBAR_DISPLAY_SETTINGS_LOAD_FAILED',
          'Failed to restore sidebar display settings',
          { path: filePath, cause: error.message, code: error.code }
        );
      }
    },
    async save(settings) {
      const normalized = createSidebarDisplaySettings(settings);
      try {
        return await replaceFileAtomically(filePath, `${JSON.stringify(normalized)}\n`);
      } catch (error) {
        if (error.code?.startsWith('SIDEBAR_DISPLAY_SETTINGS_')) throw error;
        throw persistenceError(
          'SIDEBAR_DISPLAY_SETTINGS_SAVE_FAILED',
          'Failed to persist sidebar display settings',
          { path: filePath, cause: error.message, code: error.code, ...(error.details ?? {}) }
        );
      }
    }
  };
}
