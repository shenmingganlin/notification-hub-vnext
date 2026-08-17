import { createSoundProfile } from './sound-profile.js';
import { parseSoundComboPackage } from './sound-combo-package.js';

const POLICIES = new Set(['reject', 'replace', 'keep-existing']);
function error(code, message, details = {}) { return Object.assign(new Error(message), { code, details }); }

export async function importSoundComboPackage({ packageText, assetRoot, registry, profile = {}, conflict = 'reject', bindingConflict = 'reject', bindingConflictByEventId = {}, commitProfile, rollbackProfile } = {}) {
  if (!POLICIES.has(bindingConflict) && (!bindingConflictByEventId || typeof bindingConflictByEventId !== 'object' || Array.isArray(bindingConflictByEventId))) throw error('SOUND_COMBO_PACKAGE_BINDING_CONFLICT_POLICY_INVALID', `Unsupported binding conflict policy: ${bindingConflict}`);
  for (const [eventId, policy] of Object.entries(bindingConflictByEventId || {})) if (!POLICIES.has(policy) || policy === 'reject') throw error('SOUND_COMBO_PACKAGE_BINDING_CONFLICT_POLICY_INVALID', `Unsupported binding conflict policy for ${eventId}: ${policy}`);
  const policyFor = (eventId) => Object.prototype.hasOwnProperty.call(bindingConflictByEventId || {}, eventId) ? bindingConflictByEventId[eventId] : bindingConflict;
  const combo = parseSoundComboPackage(packageText);
  const current = createSoundProfile(profile);
  const incoming = combo.profile.soundOverrides ?? [];
  const missingSoundIds = [...new Set(incoming.map((binding) => binding.soundId).filter((soundId) => !registry?.get?.(soundId)))];
  if (missingSoundIds.length) throw error('SOUND_COMBO_PACKAGE_SOUND_ASSET_MISSING', 'Combo package references sound assets that are not installed; import the .nhsound audio package first', { soundIds: missingSoundIds });
  const currentByEvent = new Map((current.soundOverrides ?? []).map((binding) => [binding.eventId, binding]));
  const conflicts = incoming.filter((binding) => currentByEvent.has(binding.eventId)).map((binding) => ({ eventId: binding.eventId, soundId: binding.soundId, policy: policyFor(binding.eventId) }));
  const rejected = conflicts.filter((item) => item.policy === 'reject');
  if (rejected.length) throw error('SOUND_COMBO_PACKAGE_BINDING_CONFLICT', 'Combo package contains existing event binding conflicts', { eventIds: rejected.map((item) => item.eventId), conflicts });
  const mergedOverrides = [...(current.soundOverrides ?? [])];
  for (const binding of incoming) {
    const index = mergedOverrides.findIndex((entry) => entry.eventId === binding.eventId);
    if (index >= 0) {
      if (policyFor(binding.eventId) === 'keep-existing') continue;
      mergedOverrides[index] = binding;
    } else mergedOverrides.push(binding);
  }
  const mergedProfile = { ...current, soundOverrides: mergedOverrides };
  let committed = false;
  try {
    if (typeof commitProfile === 'function') { await commitProfile(mergedProfile); committed = true; }
    return Object.freeze({ name: combo.name, profile: mergedProfile, importedAssets: 0, importedBindings: incoming.length - conflicts.filter((item) => item.policy === 'keep-existing').length, replacedBindings: conflicts.filter((item) => item.policy === 'replace').length, bindingConflicts: conflicts });
  } catch (cause) {
    if (committed && typeof rollbackProfile === 'function') await rollbackProfile().catch(() => {});
    throw cause;
  }
}

export { POLICIES as SOUND_COMBO_CONFLICT_POLICIES };
