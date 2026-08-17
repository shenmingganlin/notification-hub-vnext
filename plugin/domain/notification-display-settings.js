const NUMERIC_PRESETS = Object.freeze([30, 100, 500, 1000]);
export const NOTIFICATION_CARD_LIFETIME_SECONDS_DEFAULT = 120;
export const NOTIFICATION_CARD_LIFETIME_SECONDS_MIN = 0;
export const NOTIFICATION_CARD_LIFETIME_SECONDS_MAX = 3600;

export const NOTIFICATION_DISPLAY_LIMIT_PRESETS = Object.freeze([
  ...NUMERIC_PRESETS,
  'unlimited',
  'custom'
]);
export const NOTIFICATION_DISPLAY_LIMIT_DEFAULT = 100;
export const NOTIFICATION_DISPLAY_LIMIT_MAX = 10000;

function displaySettingsError(code, message, field, details = {}) {
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
  if (!['preset', 'unlimited', 'custom'].includes(mode)) {
    throw displaySettingsError(
      'NOTIFICATION_DISPLAY_SETTINGS_MODE_INVALID',
      'Notification display settings mode is unsupported',
      'mode'
    );
  }
}

function validateCardLifetimeSeconds(value) {
  if (!Number.isInteger(value)
    || value < NOTIFICATION_CARD_LIFETIME_SECONDS_MIN
    || value > NOTIFICATION_CARD_LIFETIME_SECONDS_MAX) {
    throw displaySettingsError(
      'NOTIFICATION_CARD_LIFETIME_INVALID',
      'Notification card lifetime must be an integer from 0 to 3600 seconds',
      'cardLifetimeSeconds',
      { min: NOTIFICATION_CARD_LIFETIME_SECONDS_MIN, max: NOTIFICATION_CARD_LIFETIME_SECONDS_MAX }
    );
  }
}

function validateLimit(mode, limit) {
  if (mode === 'unlimited') return;
  if (!Number.isInteger(limit) || limit < 1 || limit > NOTIFICATION_DISPLAY_LIMIT_MAX) {
    throw displaySettingsError(
      mode === 'custom'
        ? 'NOTIFICATION_DISPLAY_SETTINGS_CUSTOM_INVALID'
        : 'NOTIFICATION_DISPLAY_SETTINGS_PRESET_INVALID',
      'Notification display limit must be a positive integer within the supported range',
      'limit',
      { min: 1, max: NOTIFICATION_DISPLAY_LIMIT_MAX }
    );
  }
  if (mode === 'preset' && !NUMERIC_PRESETS.includes(limit)) {
    throw displaySettingsError(
      'NOTIFICATION_DISPLAY_SETTINGS_PRESET_INVALID',
      'Notification display preset is unsupported',
      'limit',
      { presets: NUMERIC_PRESETS }
    );
  }
}

export function validateNotificationDisplaySettings(settings) {
  if (!isPlainObject(settings)) {
    throw displaySettingsError(
      'NOTIFICATION_DISPLAY_SETTINGS_INVALID',
      'Notification display settings must be a plain object'
    );
  }
  const fields = Object.keys(settings);
  for (const field of fields) {
    if (!['mode', 'limit', 'cardLifetimeSeconds'].includes(field)) {
      throw displaySettingsError(
        'NOTIFICATION_DISPLAY_SETTINGS_FIELD_UNKNOWN',
        `Unknown notification display settings field: ${field}`,
        field
      );
    }
  }
  const mode = settings.mode ?? 'preset';
  const limit = 'limit' in settings ? settings.limit : NOTIFICATION_DISPLAY_LIMIT_DEFAULT;
  const cardLifetimeSeconds = 'cardLifetimeSeconds' in settings
    ? settings.cardLifetimeSeconds
    : NOTIFICATION_CARD_LIFETIME_SECONDS_DEFAULT;
  validateMode(mode);
  validateLimit(mode, limit);
  validateCardLifetimeSeconds(cardLifetimeSeconds);
  if (mode === 'unlimited' && limit !== null && limit !== undefined) {
    throw displaySettingsError(
      'NOTIFICATION_DISPLAY_SETTINGS_UNLIMITED_INVALID',
      'Unlimited notification display settings must not include a limit',
      'limit'
    );
  }
  return true;
}

export function createNotificationDisplaySettings(input = {}) {
  if (!isPlainObject(input)) {
    throw displaySettingsError(
      'NOTIFICATION_DISPLAY_SETTINGS_INVALID',
      'Notification display settings must be a plain object'
    );
  }
  const mode = input.mode ?? 'preset';
  const limit = mode === 'unlimited'
    ? null
    : ('limit' in input ? input.limit : NOTIFICATION_DISPLAY_LIMIT_DEFAULT);
  const cardLifetimeSeconds = 'cardLifetimeSeconds' in input
    ? input.cardLifetimeSeconds
    : NOTIFICATION_CARD_LIFETIME_SECONDS_DEFAULT;
  const settings = { mode, limit, cardLifetimeSeconds };
  validateNotificationDisplaySettings(settings);
  return Object.freeze(settings);
}

export function resolveNotificationDisplayLimit(settings = {}) {
  const normalized = createNotificationDisplaySettings(settings);
  return normalized.mode === 'unlimited' ? null : normalized.limit;
}
