import { createVisualProfile } from './visual-settings.js';

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
function registryError(code, message, field) { return Object.assign(new Error(message), { code, details: field ? { field } : {} }); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function text(field, value) { if (typeof value !== 'string' || !value.trim()) throw registryError('VISUAL_PROFILE_REGISTRY_FIELD_INVALID', `${field} must be a non-empty string`, field); return value.trim(); }
function clone(value) { if (Array.isArray(value)) return value.map(clone); if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])); return value; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export function createVisualProfileRegistry() {
  const profiles = new Map();
  const references = new Map();
  const normalizeId = (value) => {
    const id = text('profileId', value);
    if (!ID_PATTERN.test(id)) throw registryError('VISUAL_PROFILE_REGISTRY_ID_INVALID', 'profileId contains unsupported characters', 'profileId');
    return id;
  };
  return {
    register(input = {}) {
      if (!plain(input)) throw registryError('VISUAL_PROFILE_REGISTRY_INVALID', 'profile registration must be an object', 'profile');
      const profileId = normalizeId(input.profileId);
      if (profiles.has(profileId)) throw registryError('VISUAL_PROFILE_REGISTRY_DUPLICATE', `Profile already exists: ${profileId}`, 'profileId');
      const name = text('name', input.name ?? profileId);
      const profile = createVisualProfile(input.profile ?? {});
      const record = freeze({ profileId, name, profile, source: input.source ?? 'local' });
      profiles.set(profileId, record);
      references.set(profileId, new Set());
      return record;
    },
    get(profileId) { return profiles.get(profileId) ?? null; },
    has(profileId) { return profiles.has(profileId); },
    list() { return [...profiles.keys()]; },
    snapshot() {
      return clone({
        version: 1,
        profiles: [...profiles.values()],
        references: Object.fromEntries([...references].map(([profileId, events]) => [profileId, [...events]]))
      });
    },
    restoreSnapshot(snapshot = {}) {
      if (!plain(snapshot) || snapshot.version !== 1 || !Array.isArray(snapshot.profiles) || !plain(snapshot.references)) {
        throw registryError('VISUAL_PROFILE_REGISTRY_SNAPSHOT_INVALID', 'Profile registry snapshot is invalid');
      }
      const checked = createVisualProfileRegistry();
      for (const record of snapshot.profiles) {
        if (!plain(record)) throw registryError('VISUAL_PROFILE_REGISTRY_SNAPSHOT_INVALID', 'Profile record must be an object');
        checked.register({ profileId: record.profileId, name: record.name, profile: record.profile, source: record.source });
      }
      const nextReferences = new Map();
      for (const profileId of checked.list()) {
        const events = snapshot.references[profileId] ?? [];
        if (!Array.isArray(events) || events.some((eventId) => typeof eventId !== 'string' || !eventId.trim())) {
          throw registryError('VISUAL_PROFILE_REGISTRY_SNAPSHOT_INVALID', 'Profile references are invalid', 'references');
        }
        nextReferences.set(profileId, new Set(events));
      }
      for (const profileId of Object.keys(snapshot.references)) {
        if (!checked.has(profileId)) throw registryError('VISUAL_PROFILE_REGISTRY_SNAPSHOT_INVALID', `Unknown profile reference: ${profileId}`, 'references');
      }
      profiles.clear();
      references.clear();
      for (const profileId of checked.list()) {
        profiles.set(profileId, checked.get(profileId));
        references.set(profileId, nextReferences.get(profileId));
      }
      return { profileCount: profiles.size };
    },
    replace(profileId, input = {}) {
      const id = normalizeId(profileId);
      if (!profiles.has(id)) throw registryError('VISUAL_PROFILE_REGISTRY_NOT_FOUND', `Unknown profile: ${id}`, 'profileId');
      if (!plain(input)) throw registryError('VISUAL_PROFILE_REGISTRY_INVALID', 'profile replacement must be an object', 'profile');
      const name = text('name', input.name ?? id);
      const profile = createVisualProfile(input.profile ?? {});
      const record = freeze({ profileId: id, name, profile, source: input.source ?? 'local' });
      profiles.set(id, record);
      return record;
    },
    copy(sourceId, targetId) {
      const source = profiles.get(sourceId);
      if (!source) throw registryError('VISUAL_PROFILE_REGISTRY_NOT_FOUND', `Unknown profile: ${sourceId}`, 'sourceId');
      const id = normalizeId(targetId);
      if (profiles.has(id)) throw registryError('VISUAL_PROFILE_REGISTRY_DUPLICATE', `Profile already exists: ${id}`, 'targetId');
      return this.register({ profileId: id, name: `${source.name} 副本`, profile: clone(source.profile), source: 'copy' });
    },
    references(profileId) { return [...(references.get(profileId) ?? [])]; },
    addReference(profileId, eventId) { if (!profiles.has(profileId)) throw registryError('VISUAL_PROFILE_REGISTRY_NOT_FOUND', `Unknown profile: ${profileId}`, 'profileId'); references.get(profileId).add(eventId); },
    removeReference(profileId, eventId) { references.get(profileId)?.delete(eventId); },
    remove(profileId) {
      if (!profiles.has(profileId)) return false;
      if ((references.get(profileId)?.size ?? 0) > 0) throw registryError('VISUAL_PROFILE_REGISTRY_IN_USE', `Profile is still referenced: ${profileId}`, 'profileId');
      profiles.delete(profileId); references.delete(profileId); return true;
    }
  };
}
