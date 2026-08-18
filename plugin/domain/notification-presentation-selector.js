import { getEventDefinition } from './notification-event-catalog.js';
import { createCanonicalEvent, canonicalEventFromLegacy } from './notification-semantics.js';
import { resolvePresentationBinding } from './notification-presentation-profile.js';
import { resolveCardChannelPolicy } from './card-runtime-policy.js';

function selectorError(code, message, field, details = {}) {
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

export function createPresentationSelector({ record = {}, canonicalEvent = null, classification = null, profile = null } = {}) {
  const event = canonicalEvent ?? (record?.metadata?.semantic ?? null) ?? canonicalEventFromLegacy({ record, classification });
  const normalizedEvent = createCanonicalEvent(event);
  const definition = getEventDefinition(normalizedEvent.eventId);
  const binding = resolvePresentationBinding({
    eventId: normalizedEvent.eventId,
    categoryId: normalizedEvent.categoryId,
    profile: profile ?? { global: definition.defaultPresentation }
  });
  const importance = record?.importance === 'high' || record?.importance === 'critical' || record?.importance === 'important'
    ? 'important'
    : (record?.importance === true ? 'important' : 'normal');
  const channelPolicy = resolveCardChannelPolicy({ eventId: normalizedEvent.eventId, categoryId: normalizedEvent.categoryId, binding, profile: profile ?? {} });
  return freezeDeep({
    version: 'v1',
    notificationId: record?.notificationId ?? null,
    eventId: normalizedEvent.eventId,
    categoryId: normalizedEvent.categoryId,
    eventTypeId: normalizedEvent.eventTypeId,
    importance,
    semantic: clone(normalizedEvent.semantic),
    severity: normalizedEvent.severity,
    sound: {
      eventId: normalizedEvent.eventId,
      categoryId: normalizedEvent.categoryId,
      eventTypeId: normalizedEvent.eventTypeId,
      soundProfileId: binding.soundProfileId
    },
    visual: {
      eventId: normalizedEvent.eventId,
      categoryId: normalizedEvent.categoryId,
      eventTypeId: normalizedEvent.eventTypeId,
      visualProfileId: binding.visualProfileId
    },
    behavior: {
      eventId: normalizedEvent.eventId,
      categoryId: normalizedEvent.categoryId,
      eventTypeId: normalizedEvent.eventTypeId,
      behaviorProfileId: binding.behaviorProfileId,
      channelId: binding.behaviorChannelId,
      channelPolicyId: channelPolicy.policyId,
      channelPolicy
    },
    binding: clone(binding)
  });
}

export function validatePresentationSelector(selector) {
  if (!isPlainObject(selector) || typeof selector.eventId !== 'string' || typeof selector.categoryId !== 'string'
    || typeof selector.eventTypeId !== 'string' || !isPlainObject(selector.sound)
    || !isPlainObject(selector.visual) || !isPlainObject(selector.behavior)) {
    throw selectorError('NOTIFICATION_PRESENTATION_SELECTOR_INVALID', 'PresentationSelector is incomplete', 'selector');
  }
  getEventDefinition(selector.eventId);
  if (selector.sound.eventId !== selector.eventId || selector.visual.eventId !== selector.eventId || selector.behavior.eventId !== selector.eventId) {
    throw selectorError('NOTIFICATION_PRESENTATION_SELECTOR_ID_MISMATCH', 'PresentationSelector projections must use the same eventId', 'selector');
  }
  return true;
}

export function projectSoundInput(selector) {
  validatePresentationSelector(selector);
  return Object.freeze({
    eventId: selector.eventId,
    categoryId: selector.categoryId,
    eventTypeId: selector.eventTypeId,
    event: selector.eventTypeId,
    category: selector.categoryId,
    importance: selector.importance,
    soundProfileId: selector.sound.soundProfileId
  });
}

export function projectVisualInput(selector) {
  validatePresentationSelector(selector);
  return Object.freeze({
    eventId: selector.eventId,
    categoryId: selector.categoryId,
    eventTypeId: selector.eventTypeId,
    category: selector.categoryId,
    importance: selector.importance,
    visualProfileId: selector.visual.visualProfileId,
    ...(selector.binding.visualRulePreset ? { visualRulePreset: selector.binding.visualRulePreset } : {}),
    ...(selector.binding.visualRuleIntensity ? { visualRuleIntensity: selector.binding.visualRuleIntensity } : {})
  });
}

export function projectBehaviorInput(selector) {
  validatePresentationSelector(selector);
  return Object.freeze({
    eventId: selector.eventId,
    behaviorProfileId: selector.behavior.behaviorProfileId,
    behaviorChannelId: selector.behavior.channelId,
    channelPolicyId: selector.behavior.channelPolicyId,
    importance: selector.importance
  });
}
