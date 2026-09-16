const SOUND_ASSET_METHODS = Object.freeze([
  'getSoundAssetStatus',
  'importSoundComboPackage',
  'importSoundPackage',
  'updateSoundAssetConfiguration',
  'removeSoundBindingConfiguration',
  'deleteSoundAsset',
  'importSoundAsset',
  'exportSoundComboPackage',
  'exportSoundPackage',
  'testSoundAsset',
  'syncSoundLibrary',
  'revealSoundLibrary'
]);

function bindMethods(target, source) {
  for (const methodName of SOUND_ASSET_METHODS) {
    if (typeof source?.[methodName] === 'function') {
      target[methodName] = source[methodName].bind(source);
    }
  }
}

export function createSoundAssetServices({ settingsApi } = {}) {
  const services = {};
  bindMethods(services, settingsApi);
  return Object.freeze(services);
}

export { SOUND_ASSET_METHODS };
