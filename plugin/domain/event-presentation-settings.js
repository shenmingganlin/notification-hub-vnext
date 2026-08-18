import { EVENT_CATEGORIES, listEventDefinitions, getEventDefinition } from './notification-event-catalog.js';
import { createImportanceSettings } from './notification-importance.js';
import { createEffectRules } from './effect-rules.js';
import { createPresentationBinding, createPresentationProfile } from './notification-presentation-profile.js';
import { createCardChannelPolicies } from './card-runtime-policy.js';

export const EVENT_PRESENTATION_SETTINGS_VERSION = 1;

function settingsError(code, message, field, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field, ...details } : { ...details };
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function text(field, value) {
  if (typeof value !== 'string' || !value.trim()) throw settingsError('EVENT_PRESENTATION_FIELD_INVALID', `${field} must be a non-empty string`, field);
  return value.trim();
}

function normalizeBinding(binding, field) {
  try {
    return createPresentationBinding(binding);
  } catch (error) {
    throw settingsError(error.code ?? 'EVENT_PRESENTATION_BINDING_INVALID', error.message, field, error.details);
  }
}

export function createEventPresentationSettings(input = {}) {
  if (!isPlainObject(input)) throw settingsError('EVENT_PRESENTATION_SETTINGS_INVALID', 'settings must be a plain object', 'settings');
  if (input.version !== undefined && input.version !== EVENT_PRESENTATION_SETTINGS_VERSION) {
    throw settingsError('EVENT_PRESENTATION_VERSION_INVALID', 'unsupported event presentation settings version', 'version');
  }
  const global = normalizeBinding(input.global ?? {
    soundProfileId: 'sound.default',
    visualProfileId: 'visual.default',
    behaviorProfileId: 'stack',
    behaviorChannelId: 'stack.main'
  }, 'global');
  const categories = {};
  for (const categoryId of EVENT_CATEGORIES) {
    if (input.categories?.[categoryId] !== undefined) categories[categoryId] = normalizeBinding(input.categories[categoryId], `categories.${categoryId}`);
  }
  const events = {};
  for (const [eventId, binding] of Object.entries(input.events ?? {})) {
    getEventDefinition(text('events.eventId', eventId));
    events[eventId] = normalizeBinding(binding, `events.${eventId}`);
  }
  const importanceKeywords = createImportanceSettings(input.importanceKeywords ?? {});
  const visualRules = createEffectRules(input.visualRules ?? [], 'visual');
  const channelPolicies = createCardChannelPolicies(input.channelPolicies ?? {});
  const settings = {
    version: EVENT_PRESENTATION_SETTINGS_VERSION,
    global,
    categories,
    events,
    channelPolicies,
    visualRules,
    importanceKeywords
  };
  return freezeDeep(settings);
}

export function updateEventPresentationSettings(settings, patch = {}) {
  const current = createEventPresentationSettings(settings);
  if (!isPlainObject(patch)) throw settingsError('EVENT_PRESENTATION_PATCH_INVALID', 'patch must be a plain object', 'patch');
  const next = {
    ...clone(current),
    ...(patch.global === undefined ? {} : { global: normalizeBinding(patch.global, 'global') }),
    ...(patch.categories === undefined ? {} : {
      categories: {
        ...clone(current.categories),
        ...Object.fromEntries(Object.entries(patch.categories).map(([categoryId, binding]) => {
          if (!EVENT_CATEGORIES.includes(categoryId)) throw settingsError('EVENT_PRESENTATION_CATEGORY_UNKNOWN', `unknown category: ${categoryId}`, `categories.${categoryId}`);
          return [categoryId, normalizeBinding(binding, `categories.${categoryId}`)];
        }))
      }
    }),
    ...(patch.events === undefined ? {} : {
      events: {
        ...clone(current.events),
        ...Object.fromEntries(Object.entries(patch.events).map(([eventId, binding]) => {
          getEventDefinition(text('events.eventId', eventId));
          return [eventId, normalizeBinding(binding, `events.${eventId}`)];
        }))
      }
    }),
    ...(patch.channelPolicies === undefined ? {} : { channelPolicies: createCardChannelPolicies(patch.channelPolicies) }),
    ...(patch.visualRules === undefined ? {} : { visualRules: createEffectRules(patch.visualRules, 'visual') }),
    ...(patch.importanceKeywords === undefined ? {} : { importanceKeywords: createImportanceSettings(patch.importanceKeywords) })
  };
  return createEventPresentationSettings(next);
}

export function setEventPresentationBinding(settings, eventId, binding) {
  const id = text('eventId', eventId);
  getEventDefinition(id);
  return updateEventPresentationSettings(settings, { events: { [id]: binding } });
}

export function removeEventPresentationBinding(settings, eventId) {
  const id = text('eventId', eventId);
  getEventDefinition(id);
  const current = createEventPresentationSettings(settings);
  const events = { ...current.events };
  delete events[id];
  return createEventPresentationSettings({ ...clone(current), events });
}

export function listEventPresentationRows(settings) {
  const current = createEventPresentationSettings(settings);
  return freezeDeep(listEventDefinitions({ presentationEligible: true }).map((definition) => ({
    eventId: definition.eventId,
    categoryId: definition.categoryId,
    eventTypeId: definition.eventTypeId,
    label: definition.label,
    binding: current.events[definition.eventId] ?? current.categories[definition.categoryId] ?? current.global,
    matchedBy: current.events[definition.eventId] ? 'event' : (current.categories[definition.categoryId] ? 'category' : 'global')
  })));
}

export function createPresentationProfileFromSettings(settings) {
  const current = createEventPresentationSettings(settings);
  return createPresentationProfile(current);
}
