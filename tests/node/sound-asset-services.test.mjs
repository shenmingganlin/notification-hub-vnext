import assert from 'node:assert/strict';
import test from 'node:test';

import { createSoundAssetServices, SOUND_ASSET_METHODS } from '../../plugin/services/sound-asset-services.js';

const EXPECTED_METHODS = [
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
];
const SETTINGS_METHODS = [
  'getSoundSettingsStatus',
  'updateSoundSettings',
  'previewSoundSettings',
  'testSoundSettings',
  'explainSoundSettings',
  'runSoundWorkbench',
  'clearSoundDiagnostics',
  'exportSoundDiagnostics'
];

test('sound asset services expose only the frozen asset, binding, and package interface', () => {
  assert.deepEqual([...SOUND_ASSET_METHODS], EXPECTED_METHODS);
  const source = Object.fromEntries([...EXPECTED_METHODS, ...SETTINGS_METHODS].map((name) => [name, function () { return this; }]));
  const services = createSoundAssetServices({ settingsApi: source });

  assert.deepEqual(Object.keys(services), EXPECTED_METHODS);
  assert.equal(Object.isFrozen(services), true);
  for (const methodName of EXPECTED_METHODS) assert.equal(services[methodName](), source);
  for (const forbidden of SETTINGS_METHODS) assert.equal(forbidden in services, false, forbidden);
});

test('sound asset services tolerate a partial source without widening the interface', () => {
  const services = createSoundAssetServices({ settingsApi: { getSoundAssetStatus() { return { assets: [] }; } } });
  assert.deepEqual(Object.keys(services), ['getSoundAssetStatus']);
  assert.deepEqual(services.getSoundAssetStatus(), { assets: [] });
  assert.equal(Object.isExtensible(services), false);
});
