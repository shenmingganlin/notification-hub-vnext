import { createSoundComboPackage, serializeSoundComboPackage } from './sound-combo-package.js';

function error(code, message, details = {}) { return Object.assign(new Error(message), { code, details }); }

export async function exportSoundComboPackage({ name, profile = {} } = {}) {
  const bindings = Array.isArray(profile.soundOverrides) ? profile.soundOverrides : [];
  if (!bindings.length) throw error('SOUND_COMBO_PACKAGE_EMPTY', 'There are no custom event sound bindings to export');
  const combo = createSoundComboPackage({ name, profile: { version: 1, soundOverrides: bindings } });
  return Object.freeze({ extension: '.nhcombo', name: combo.name, packageText: serializeSoundComboPackage(combo), assetCount: 0, profileBindingCount: combo.profile.soundOverrides.length });
}
