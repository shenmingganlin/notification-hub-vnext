export const SOUND_CONFIG_DEFAULTS = Object.freeze({
  globalSoundEnabled: true
});

function readConfig(config) {
  try {
    if (config?.getAll) return { values: config.getAll() || {}, readFailed: false };
    if (config?.get) return { values: config.get() || {}, readFailed: false };
  } catch {
    return { values: {}, readFailed: true };
  }
  return {
    values: config && typeof config === 'object' ? config : {},
    readFailed: false
  };
}

function freezeResult(enabled, diagnostic) {
  return Object.freeze({ enabled, diagnostic });
}

export function resolveGlobalSoundConfig({ config, overrides = {} } = {}) {
  const { values, readFailed } = readConfig(config);
  if (readFailed) {
    return freezeResult(false, 'NOTIFICATION_SOUND_CONFIG_READ_FAILED');
  }

  const raw = {
    ...values,
    ...overrides
  };
  if (!Object.prototype.hasOwnProperty.call(raw, 'globalSoundEnabled')) {
    return freezeResult(SOUND_CONFIG_DEFAULTS.globalSoundEnabled, null);
  }
  if (typeof raw.globalSoundEnabled !== 'boolean') {
    return freezeResult(false, 'NOTIFICATION_SOUND_CONFIG_INVALID');
  }
  return freezeResult(raw.globalSoundEnabled, null);
}
