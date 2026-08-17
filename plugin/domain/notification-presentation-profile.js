import { createEffectRules, resolveEffectRule } from './effect-rules.js';

export const BEHAVIOR_PROFILE_IDS = Object.freeze(['stack', 'ticker', 'popup']);

function presentationProfileError(code, message, field, details = {}) {
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

function requiredText(field, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw presentationProfileError('NOTIFICATION_PRESENTATION_PROFILE_FIELD_INVALID', `${field} must be a non-empty string`, field);
  }
  return value.trim();
}

function normalizeBinding(input = {}, field = 'binding') {
  if (!isPlainObject(input)) {
    throw presentationProfileError('NOTIFICATION_PRESENTATION_BINDING_INVALID', `${field} must be a plain object`, field);
  }
  const result = {
    soundProfileId: requiredText(`${field}.soundProfileId`, input.soundProfileId),
    visualProfileId: requiredText(`${field}.visualProfileId`, input.visualProfileId),
    behaviorProfileId: requiredText(`${field}.behaviorProfileId`, input.behaviorProfileId),
    behaviorChannelId: validateBehaviorChannelId(input.behaviorChannelId ?? `${input.behaviorProfileId}.main`)
  };
  if (!BEHAVIOR_PROFILE_IDS.includes(result.behaviorProfileId) && input.allowCustomBehavior !== true) {
    throw presentationProfileError('NOTIFICATION_PRESENTATION_BEHAVIOR_UNKNOWN', `Unknown behavior profile: ${result.behaviorProfileId}`, `${field}.behaviorProfileId`);
  }
  return result;
}

export function validateBehaviorChannelId(value) {
  const channelId = requiredText('behaviorChannelId', value);
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(channelId)) {
    throw presentationProfileError('NOTIFICATION_PRESENTATION_BEHAVIOR_CHANNEL_INVALID', 'behaviorChannelId contains unsupported characters', 'behaviorChannelId');
  }
  return channelId;
}

export function createPresentationBinding(input = {}) {
  return freezeDeep(normalizeBinding(input));
}

export function createPresentationProfile(input = {}) {
  if (!isPlainObject(input)) {
    throw presentationProfileError('NOTIFICATION_PRESENTATION_PROFILE_INVALID', 'presentation profile must be a plain object', 'profile');
  }
  const global = normalizeBinding(input.global ?? {
    soundProfileId: 'sound.default',
    visualProfileId: 'visual.default',
    behaviorProfileId: 'stack',
    behaviorChannelId: 'stack.main'
  }, 'global');
  const categories = {};
  for (const [categoryId, binding] of Object.entries(input.categories ?? {})) {
    categories[requiredText('categoryId', categoryId)] = normalizeBinding(binding, `categories.${categoryId}`);
  }
  const events = {};
  for (const [eventId, binding] of Object.entries(input.events ?? {})) {
    events[requiredText('eventId', eventId)] = normalizeBinding(binding, `events.${eventId}`);
  }
  const visualRules = createEffectRules(input.visualRules ?? [], 'visual');
  return freezeDeep({ version: 'v1', global, categories, events, visualRules });
}

export function resolvePresentationBinding({ eventId, categoryId, profile, defaults } = {}) {
  const resolvedProfile = createPresentationProfile(profile ?? defaults ?? {});
  const id = requiredText('eventId', eventId);
  const category = requiredText('categoryId', categoryId);
  const binding = resolvedProfile.events[id] ?? resolvedProfile.categories[category] ?? resolvedProfile.global;
  const visualRule = resolveEffectRule(resolvedProfile.visualRules, id, 'visual');
  return freezeDeep({
    ...clone(binding),
    ...(visualRule ? { visualProfileId: visualRule.effect.preset, visualRuleId: visualRule.id, visualRulePreset: visualRule.effect.preset, visualRuleIntensity: visualRule.effect.intensity } : {}),
    eventId: id,
    categoryId: category,
    matchedBy: resolvedProfile.events[id] ? 'event' : (resolvedProfile.categories[category] ? 'category' : 'global')
  });
}
