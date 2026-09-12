import { listEventDefinitions, getEventDefinition } from './notification-event-catalog.js';
import { createVisualProfileRegistry } from './visual-profile-registry.js';

function bindingError(code, message, field) { return Object.assign(new Error(message), { code, details: field ? { field } : {} }); }
function text(field, value) { if (typeof value !== 'string' || !value.trim()) throw bindingError('VISUAL_EVENT_BINDING_INVALID', `${field} must be a non-empty string`, field); return value.trim(); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function createEventBindingRegistry({ profileRegistry } = {}) {
  if (!profileRegistry || typeof profileRegistry.has !== 'function') throw bindingError('VISUAL_EVENT_BINDING_REGISTRY_INVALID', 'profileRegistry is required', 'profileRegistry');
  const bindings = new Map();
  const targets = () => listEventDefinitions({ presentationEligible: true });
  const resolveTargets = ({ eventIds, categoryId } = {}) => {
    if (eventIds !== undefined) {
      if (!Array.isArray(eventIds) || eventIds.length === 0) throw bindingError('VISUAL_EVENT_BINDING_TARGET_INVALID', 'eventIds must be a non-empty array', 'eventIds');
      return [...new Set(eventIds.map((eventId) => {
        let definition;
        try { definition = getEventDefinition(text('eventId', eventId)); } catch (error) { if (error.code === 'NOTIFICATION_EVENT_UNKNOWN') throw bindingError('VISUAL_EVENT_NOT_FOUND', error.message, 'eventIds'); throw error; }
        if (!definition.presentationEligible) throw bindingError('VISUAL_EVENT_NOT_ELIGIBLE', `Event is not presentation eligible: ${eventId}`, 'eventIds');
        return definition;
      }))];
    }
    if (categoryId !== undefined) {
      const category = text('categoryId', categoryId);
      const result = targets().filter((definition) => definition.categoryId === category);
      if (result.length === 0) throw bindingError('VISUAL_EVENT_NOT_FOUND', `No presentation events in category: ${category}`, 'categoryId');
      return result;
    }
    throw bindingError('VISUAL_EVENT_BINDING_TARGET_INVALID', 'eventIds or categoryId is required', 'target');
  };
  const build = (definition, profileId, behaviorChannelId = null, source = 'local') => freeze({ eventId: definition.eventId, categoryId: definition.categoryId, visualProfileId: profileId, behaviorChannelId, source });
  const previewApply = (input = {}) => {
    const profileId = text('profileId', input.profileId);
    if (!profileRegistry.has(profileId)) throw bindingError('VISUAL_PROFILE_NOT_FOUND', `Unknown visual profile: ${profileId}`, 'profileId');
    const resolved = resolveTargets(input);
    let added = 0; let replaced = 0; let unchanged = 0;
    for (const definition of resolved) { const existing = bindings.get(definition.eventId); if (!existing) added += 1; else if (existing.visualProfileId === profileId && (input.behaviorChannelId ?? null) === existing.behaviorChannelId) unchanged += 1; else replaced += 1; }
    return { added, replaced, unchanged, missing: [] };
  };
  return {
    previewApply,
    apply(input = {}) {
      const profileId = text('profileId', input.profileId);
      if (!profileRegistry.has(profileId)) throw bindingError('VISUAL_PROFILE_NOT_FOUND', `Unknown visual profile: ${profileId}`, 'profileId');
      const resolved = resolveTargets(input); const added = []; const replaced = []; const unchanged = [];
      for (const definition of resolved) {
        const next = build(definition, profileId, input.behaviorChannelId ?? null, input.source ?? 'local');
        const existing = bindings.get(definition.eventId);
        if (!existing) added.push(definition.eventId); else if (existing.visualProfileId === next.visualProfileId && existing.behaviorChannelId === next.behaviorChannelId) unchanged.push(definition.eventId); else replaced.push(definition.eventId);
        if (existing) profileRegistry.removeReference(existing.visualProfileId, definition.eventId);
        bindings.set(definition.eventId, next); profileRegistry.addReference(profileId, definition.eventId);
      }
      return { added, replaced, unchanged, missing: [] };
    },
    get(eventId) { return bindings.get(eventId) ?? null; },
    list() { return [...bindings.values()]; },
    restoreDefault(eventId) {
      const existing = bindings.get(eventId); if (!existing) return false;
      bindings.delete(eventId); profileRegistry.removeReference(existing.visualProfileId, eventId); return true;
    },
    references(profileId) { return profileRegistry.references(profileId); },
    snapshot() { return clone([...bindings.values()]); },
    restoreSnapshot(snapshot = []) {
      if (!Array.isArray(snapshot)) throw bindingError('VISUAL_EVENT_BINDING_SNAPSHOT_INVALID', 'Binding registry snapshot must be an array');
      const checkedProfiles = createVisualProfileRegistry();
      for (const profileId of profileRegistry.list()) {
        const record = profileRegistry.get(profileId);
        checkedProfiles.register({ profileId: record.profileId, name: record.name, profile: record.profile, source: record.source });
      }
      const checkedBindings = createEventBindingRegistry({ profileRegistry: checkedProfiles });
      for (const binding of snapshot) {
        if (!binding || typeof binding !== 'object' || Array.isArray(binding)) throw bindingError('VISUAL_EVENT_BINDING_SNAPSHOT_INVALID', 'Binding record must be an object');
        checkedBindings.apply({
          profileId: binding.visualProfileId,
          eventIds: [binding.eventId],
          behaviorChannelId: binding.behaviorChannelId ?? null,
          source: binding.source ?? 'restored'
        });
      }
      for (const binding of [...bindings.values()]) {
        bindings.delete(binding.eventId);
        profileRegistry.removeReference(binding.visualProfileId, binding.eventId);
      }
      for (const binding of checkedBindings.snapshot()) {
        const next = build({ eventId: binding.eventId, categoryId: binding.categoryId }, binding.visualProfileId, binding.behaviorChannelId, binding.source);
        bindings.set(next.eventId, next);
        profileRegistry.addReference(next.visualProfileId, next.eventId);
      }
      return { bindingCount: bindings.size };
    }
  };
}
