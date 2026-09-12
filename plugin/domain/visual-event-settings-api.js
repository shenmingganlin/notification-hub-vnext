import { projectVisualRegistryToEventSettings } from './visual-registry-persistence.js';
import { listEventDefinitions } from './notification-event-catalog.js';

function apiError(code, message, field) { return Object.assign(new Error(message), { code, details: field ? { field } : {} }); }
function text(field, value) { if (typeof value !== 'string' || !value.trim()) throw apiError('VISUAL_EVENT_SETTINGS_API_INVALID', `${field} must be a non-empty string`, field); return value.trim(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function createVisualEventSettingsApi({ store, profileRegistry, bindingRegistry } = {}) {
  if (!store || typeof store.getSnapshot !== 'function' || typeof store.updateSettings !== 'function') throw apiError('VISUAL_EVENT_SETTINGS_API_INVALID', 'store is required', 'store');
  if (!profileRegistry || !bindingRegistry) throw apiError('VISUAL_EVENT_SETTINGS_API_INVALID', 'visual registries are required', 'registries');
  const originalBindings = new Map();
  const commit = () => {
    const settings = projectVisualRegistryToEventSettings({ settings: store.getSnapshot().settings, bindingRegistry });
    store.updateSettings({ events: settings.events });
    return store.getSnapshot();
  };
  return {
    previewApply(input) {
      const preview = bindingRegistry.previewApply(input);
      const settings = store.getSnapshot().settings;
      const eventIds = Array.isArray(input?.eventIds) ? input.eventIds : [];
      const legacyExisting = eventIds.filter((eventId) => !bindingRegistry.get(eventId) && settings.events?.[eventId]?.visualProfileId);
      return {
        ...preview,
        added: Math.max(0, preview.added - legacyExisting.length),
        replaced: preview.replaced + legacyExisting.length
      };
    },
    apply(input) {
      const eventIds = Array.isArray(input?.eventIds) ? input.eventIds : [];
      const current = store.getSnapshot().settings.events ?? {};
      for (const eventId of eventIds) if (!originalBindings.has(eventId) && current[eventId]) originalBindings.set(eventId, clone(current[eventId]));
      const result = bindingRegistry.apply(input); commit(); return result;
    },
    restoreDefault(eventId) {
      const id = text('eventId', eventId);
      const removed = bindingRegistry.restoreDefault(id);
      const original = originalBindings.get(id);
      if (original) {
        store.updateSettings({ events: { [id]: original } });
        originalBindings.delete(id);
      } else if (removed) commit();
      return Boolean(removed || original);
    },
    listCustomEvents() {
      const definitions = new Map(listEventDefinitions({ presentationEligible: true }).map((entry) => [entry.eventId, entry]));
      return bindingRegistry.list().map((binding) => ({
        eventId: binding.eventId,
        label: definitions.get(binding.eventId)?.label ?? binding.eventId,
        categoryId: binding.categoryId,
        visualProfileId: binding.visualProfileId,
        behaviorChannelId: binding.behaviorChannelId,
        source: binding.source
      }));
    },
    getSnapshot() { return { settings: clone(store.getSnapshot().settings), bindings: bindingRegistry.snapshot() }; }
  };
}
