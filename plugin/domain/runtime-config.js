import { validateSoundSettings } from './sound-settings.js';

function runtimeConfigError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

export function createRuntimeConfigUpdate(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw runtimeConfigError('RUNTIME_CONFIG_SNAPSHOT_INVALID', 'Settings snapshot must be an object');
  }
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) {
    throw runtimeConfigError('RUNTIME_CONFIG_REVISION_INVALID', 'Runtime config revision must be a positive integer', {
      revision: snapshot.revision
    });
  }
  try {
    validateSoundSettings(snapshot.settings);
  } catch (error) {
    throw runtimeConfigError('RUNTIME_CONFIG_SETTINGS_INVALID', 'Settings snapshot contains invalid sound settings', {
      cause: error.code,
      message: error.message
    });
  }
  const settings = snapshot.settings;
  const defaultVolume = settings.defaultPolicy?.volume;
  const volume = typeof defaultVolume === 'number' && Number.isFinite(defaultVolume)
    ? defaultVolume
    : 1;
  return Object.freeze({
    revision: snapshot.revision,
    audio: Object.freeze({
      enabled: settings.globalSoundEnabled === true && settings.workModeMuted !== true,
      volume
    })
  });
}
