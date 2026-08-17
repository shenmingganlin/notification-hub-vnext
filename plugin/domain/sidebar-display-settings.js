const NUMERIC_PRESETS = Object.freeze([1, 3, 5, 10]);

export const SIDEBAR_DISPLAY_LIMIT_PRESETS = Object.freeze([
  ...NUMERIC_PRESETS,
  'custom'
]);
export const SIDEBAR_DISPLAY_LIMIT_DEFAULT = 3;
export const SIDEBAR_DISPLAY_LIMIT_MAX = 20;

function settingsError(code, message, field, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field, ...details } : { ...details };
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateMode(mode) {
  if (!['preset', 'custom'].includes(mode)) {
    throw settingsError(
      'SIDEBAR_DISPLAY_SETTINGS_MODE_INVALID',
      'Sidebar display settings mode is unsupported',
      'mode'
    );
  }
}

function validateLimit(mode, limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > SIDEBAR_DISPLAY_LIMIT_MAX) {
    throw settingsError(
      mode === 'custom'
        ? 'SIDEBAR_DISPLAY_SETTINGS_CUSTOM_INVALID'
        : 'SIDEBAR_DISPLAY_SETTINGS_PRESET_INVALID',
      'Sidebar display limit must be an integer from 1 to 20',
      'limit',
      { min: 1, max: SIDEBAR_DISPLAY_LIMIT_MAX }
    );
  }
  if (mode === 'preset' && !NUMERIC_PRESETS.includes(limit)) {
    throw settingsError(
      'SIDEBAR_DISPLAY_SETTINGS_PRESET_INVALID',
      'Sidebar display preset is unsupported',
      'limit',
      { presets: NUMERIC_PRESETS }
    );
  }
}

export function validateSidebarDisplaySettings(settings) {
  if (!isPlainObject(settings)) {
    throw settingsError(
      'SIDEBAR_DISPLAY_SETTINGS_INVALID',
      'Sidebar display settings must be a plain object'
    );
  }
  for (const field of Object.keys(settings)) {
    if (!['mode', 'limit'].includes(field)) {
      throw settingsError(
        'SIDEBAR_DISPLAY_SETTINGS_FIELD_UNKNOWN',
        `Unknown sidebar display settings field: ${field}`,
        field
      );
    }
  }
  const mode = settings.mode ?? 'preset';
  const limit = settings.limit ?? SIDEBAR_DISPLAY_LIMIT_DEFAULT;
  validateMode(mode);
  validateLimit(mode, limit);
  return true;
}

export function createSidebarDisplaySettings(input = {}) {
  if (!isPlainObject(input)) {
    throw settingsError(
      'SIDEBAR_DISPLAY_SETTINGS_INVALID',
      'Sidebar display settings must be a plain object'
    );
  }
  const mode = input.mode ?? 'preset';
  const settings = {
    mode,
    limit: input.limit ?? SIDEBAR_DISPLAY_LIMIT_DEFAULT
  };
  validateSidebarDisplaySettings(settings);
  return Object.freeze(settings);
}

export function resolveSidebarDisplayLimit(settings = {}) {
  return createSidebarDisplaySettings(settings).limit;
}
