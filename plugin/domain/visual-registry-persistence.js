import { createVisualProfileRegistry } from './visual-profile-registry.js';
import { createEventBindingRegistry } from './event-binding-registry.js';
import { resolveVisualEventNativeBehavior } from './visual-event-native-behavior.js';

export const VISUAL_REGISTRY_SNAPSHOT_VERSION = 1;
function error(code, message, field) { return Object.assign(new Error(message), { code, details: field ? { field } : {} }); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function clone(value) { if (Array.isArray(value)) return value.map(clone); if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])); return value; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function text(field, value) { if (typeof value !== 'string' || !value.trim()) throw error('VISUAL_REGISTRY_SNAPSHOT_INVALID', `${field} must be a non-empty string`, field); return value.trim(); }

export function createVisualRegistrySnapshot({ profileRegistry, bindingRegistry, revision = 1, updatedAt = new Date().toISOString() } = {}) {
  if (!profileRegistry || typeof profileRegistry.list !== 'function' || !bindingRegistry || typeof bindingRegistry.snapshot !== 'function') throw error('VISUAL_REGISTRY_SNAPSHOT_INVALID', 'registries are required');
  if (!Number.isInteger(revision) || revision < 1) throw error('VISUAL_REGISTRY_SNAPSHOT_INVALID', 'revision must be positive', 'revision');
  if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) throw error('VISUAL_REGISTRY_SNAPSHOT_INVALID', 'updatedAt must be ISO date-time', 'updatedAt');
  return freeze({ version: VISUAL_REGISTRY_SNAPSHOT_VERSION, revision, updatedAt, profiles: profileRegistry.list().map((id) => clone(profileRegistry.get(id))), bindings: clone(bindingRegistry.snapshot()) });
}

export function restoreVisualRegistrySnapshot(snapshot, { profileRegistry, bindingRegistry } = {}) {
  if (!plain(snapshot) || snapshot.version !== VISUAL_REGISTRY_SNAPSHOT_VERSION) throw error('VISUAL_REGISTRY_SNAPSHOT_VERSION_INVALID', 'unsupported visual registry snapshot version', 'version');
  if (!Array.isArray(snapshot.profiles) || !Array.isArray(snapshot.bindings)) throw error('VISUAL_REGISTRY_SNAPSHOT_INVALID', 'snapshot profiles and bindings must be arrays');
  if (!profileRegistry || !bindingRegistry) throw error('VISUAL_REGISTRY_SNAPSHOT_INVALID', 'target registries are required');
  // Validate the complete snapshot in isolated registries before mutating the targets.
  const checked = createVisualRegistries();
  for (const record of snapshot.profiles) {
    if (!plain(record)) throw error('VISUAL_REGISTRY_SNAPSHOT_INVALID', 'profile record must be an object');
    checked.profileRegistry.register(record);
  }
  for (const binding of snapshot.bindings) {
    if (!plain(binding) || typeof binding.eventId !== 'string' || typeof binding.visualProfileId !== 'string') throw error('VISUAL_REGISTRY_SNAPSHOT_INVALID', 'binding record is invalid');
    checked.bindingRegistry.apply({ profileId: binding.visualProfileId, eventIds: [binding.eventId], behaviorChannelId: binding.behaviorChannelId, source: binding.source ?? 'restored' });
  }
  for (const record of snapshot.profiles) if (!profileRegistry.has(record.profileId)) profileRegistry.register(record);
  for (const binding of snapshot.bindings) bindingRegistry.apply({ profileId: binding.visualProfileId, eventIds: [binding.eventId], behaviorChannelId: binding.behaviorChannelId, source: binding.source ?? 'restored' });
  return { revision: snapshot.revision, profileCount: snapshot.profiles.length, bindingCount: snapshot.bindings.length };
}

export function projectVisualRegistryToEventSettings({ settings, bindingRegistry, profileRegistry } = {}) {
  if (!plain(settings) || !bindingRegistry || typeof bindingRegistry.list !== 'function') throw error('VISUAL_REGISTRY_PROJECTION_INVALID', 'settings and bindingRegistry are required');
  const events = { ...(settings.events ?? {}) };
  for (const binding of bindingRegistry.list()) {
    const current = events[binding.eventId] ?? settings.global ?? {
      soundProfileId: 'sound.default',
      behaviorProfileId: 'stack',
      behaviorChannelId: 'stack.main'
    };
    const native = resolveVisualEventNativeBehavior(profileRegistry?.get?.(binding.visualProfileId)?.profile);
    events[binding.eventId] = {
      ...current,
      visualProfileId: text('visualProfileId', binding.visualProfileId),
      behaviorProfileId: native.behaviorProfileId,
      behaviorChannelId: binding.behaviorChannelId ?? native.behaviorChannelId
    };
  }
  return clone({ ...settings, events });
}

export function createVisualRegistries() {
  const profileRegistry = createVisualProfileRegistry();
  const bindingRegistry = createEventBindingRegistry({ profileRegistry });
  return { profileRegistry, bindingRegistry };
}
