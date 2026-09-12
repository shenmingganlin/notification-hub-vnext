const SOUND_SETTINGS_METHODS = Object.freeze([
  'getSoundSettingsStatus',
  'updateSoundSettings',
  'previewSoundSettings',
  'testSoundSettings',
  'explainSoundSettings',
  'runSoundWorkbench',
  'clearSoundDiagnostics',
  'exportSoundDiagnostics'
]);

function bindMethods(target, source) {
  for (const methodName of SOUND_SETTINGS_METHODS) {
    if (typeof source?.[methodName] === 'function') {
      target[methodName] = source[methodName].bind(source);
    }
  }
}

export function createSoundSettingsServices({ settingsApi } = {}) {
  const services = {};
  bindMethods(services, settingsApi);
  return Object.freeze(services);
}

export { SOUND_SETTINGS_METHODS };
