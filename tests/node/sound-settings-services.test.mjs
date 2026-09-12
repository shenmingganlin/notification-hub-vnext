import assert from 'node:assert/strict';
import test from 'node:test';

import { createSoundSettingsServices, SOUND_SETTINGS_METHODS } from '../../plugin/services/sound-settings-services.js';

const EXPECTED_METHODS = [
  'getSoundSettingsStatus',
  'updateSoundSettings',
  'previewSoundSettings',
  'testSoundSettings',
  'explainSoundSettings',
  'runSoundWorkbench',
  'clearSoundDiagnostics',
  'exportSoundDiagnostics'
];
const ASSET_METHODS = [
  'getSoundAssetStatus',
  'importSoundComboPackage',
  'importSoundPackage',
  'updateSoundAssetConfiguration',
  'removeSoundBindingConfiguration',
  'deleteSoundAsset',
  'importSoundAsset',
  'exportSoundComboPackage',
  'exportSoundPackage',
  'testSoundAsset'
];

function createSource() {
  return Object.fromEntries([...EXPECTED_METHODS, ...ASSET_METHODS].map((name) => [name, function () { return this; }]));
}

test('sound settings services expose only the frozen rule and diagnostics interface', () => {
  assert.deepEqual([...SOUND_SETTINGS_METHODS], EXPECTED_METHODS);
  const source = createSource();
  const services = createSoundSettingsServices({ settingsApi: source });

  assert.deepEqual(Object.keys(services), EXPECTED_METHODS);
  assert.equal(Object.isFrozen(services), true);
  for (const methodName of EXPECTED_METHODS) assert.equal(services[methodName](), source);
  for (const forbidden of [...ASSET_METHODS, 'getVisualSettingsStatus', 'getRuntimeTestStatus']) {
    assert.equal(forbidden in services, false, forbidden);
  }
});

test('sound settings services tolerate a partial source without widening the interface', () => {
  const services = createSoundSettingsServices({ settingsApi: { getSoundSettingsStatus() { return { ok: true }; } } });
  assert.deepEqual(Object.keys(services), ['getSoundSettingsStatus']);
  assert.equal(services.getSoundSettingsStatus().ok, true);
  assert.equal(Object.isExtensible(services), false);
});
