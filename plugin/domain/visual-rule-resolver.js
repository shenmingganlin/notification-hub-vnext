import {
  createVisualProfile,
  VISUAL_CATEGORIES,
  VISUAL_INTENSITIES,
  VISUAL_PRESETS
} from './visual-settings.js';

export const VISUAL_CATEGORY_PRIORITY = Object.freeze(['model_service', 'error', 'tool', 'channel', 'chat', 'plugin']);
const IMPORTANCES = new Set(['low', 'normal', 'high', 'critical']);

function resolverError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function validateVisualInput(input) {
  if (!plain(input)) throw resolverError('VISUAL_RULE_INPUT_INVALID', 'visualInput must be a plain object');
  if (!Array.isArray(input.labels) || input.labels.some((label) => typeof label !== 'string')) {
    throw resolverError('VISUAL_RULE_INPUT_INVALID', 'visualInput.labels must be an array of strings');
  }
  if (typeof input.status !== 'string' || !input.status.trim()) {
    throw resolverError('VISUAL_RULE_INPUT_INVALID', 'visualInput.status must be a non-empty string');
  }
  if (!IMPORTANCES.has(input.importance)) {
    throw resolverError('VISUAL_RULE_INPUT_INVALID', 'visualInput.importance is unsupported');
  }
}

function cardDecision(profile, strategy = null) {
  const card = strategy?.card ?? profile.card;
  return {
    cardType: card.activeType,
    behavior: card.types[card.activeType].behavior,
    appearance: card.types[card.activeType].appearance
  };
}

function decision(profile, values, strategy = null) {
  return freeze({ ...values, ...cardDecision(profile, strategy) });
}

function fallbackDecision(reason = 'fallback-invalid-profile') {
  return freeze({
    enabled: true,
    preset: 'minimal',
    intensity: 'balanced',
    category: null,
    matchedBy: 'fallback',
    reason,
    cardType: 'minimal',
    behavior: { layout: 'simple', boundary: 'work-area' },
    appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0e1916', borderRadius: 16, opacity: 0.96 }
  });
}

function selectCategory(labels, categoryId = null) {
  const normalizedCategory = categoryId === 'external_call' || categoryId === 'external_integration'
    ? 'plugin'
    : categoryId;
  if (VISUAL_CATEGORIES.includes(normalizedCategory)) return normalizedCategory;
  return VISUAL_CATEGORY_PRIORITY.find((category) => labels.includes(category)) ?? null;
}

export function resolveVisualRule({ visualInput, profile, context = {} } = {}) {
  validateVisualInput(visualInput);
  if (!plain(context)) throw resolverError('VISUAL_RULE_CONTEXT_INVALID', 'context must be a plain object');
  if ('globalEnabled' in context && typeof context.globalEnabled !== 'boolean') {
    throw resolverError('VISUAL_RULE_CONTEXT_INVALID', 'context.globalEnabled must be boolean');
  }
  const normalizedProfile = createVisualProfile(profile ?? {});
  let visualProfileId = null;
  let profileFallbackReason = null;
  if (visualInput.visualProfileId !== undefined && visualInput.visualProfileId !== null) {
    if (typeof visualInput.visualProfileId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(visualInput.visualProfileId.trim())) {
      profileFallbackReason = 'invalid-visual-profile-id';
    } else {
      visualProfileId = visualInput.visualProfileId.trim();
      if (!normalizedProfile.visualProfiles[visualProfileId]) profileFallbackReason = 'unknown-visual-profile';
    }
  }
  const presentationStrategy = visualProfileId ? normalizedProfile.visualProfiles[visualProfileId] ?? null : null;
  const globalEnabled = context.globalEnabled !== false && normalizedProfile.global.enabled !== false;
  if (!globalEnabled) {
    return decision(normalizedProfile, { enabled: false, preset: 'minimal', intensity: 'reduced', category: null, matchedBy: 'global', reason: 'global-disabled' });
  }

  const category = selectCategory(visualInput.labels, visualInput.categoryId);
  const categoryPolicy = category ? normalizedProfile.categories[category] : null;
  const eventRule = visualInput.visualRulePreset ? { enabled: true, preset: visualInput.visualRulePreset, intensity: visualInput.visualRuleIntensity ?? normalizedProfile.global.intensity } : null;
  const policy = presentationStrategy ?? eventRule ?? categoryPolicy ?? normalizedProfile.global;
  const intensity = policy.intensity ?? normalizedProfile.global.intensity;
  const matchedBy = presentationStrategy ? 'presentation-profile' : (eventRule ? 'event-rule' : (category ? 'category' : 'global'));
  const fallback = profileFallbackReason ? { fallbackReason: profileFallbackReason } : {};
  if (visualInput.importance === 'critical') {
    return decision(normalizedProfile, {
      enabled: policy.enabled !== false,
      preset: 'critical',
      intensity,
      category,
      matchedBy: presentationStrategy ? 'presentation-profile' : (eventRule ? 'event-rule' : 'critical'),
      reason: presentationStrategy ? 'presentation-profile-critical' : (eventRule ? 'event-rule-critical' : 'critical-override'),
      ...fallback
    }, presentationStrategy);
  }
  if (policy.enabled === false) {
    return decision(normalizedProfile, { enabled: false, preset: 'minimal', intensity: 'reduced', category, matchedBy, reason: presentationStrategy ? 'presentation-profile-disabled' : (eventRule ? 'event-rule-disabled' : 'category-disabled'), ...fallback }, presentationStrategy);
  }
  return decision(normalizedProfile, {
    enabled: true,
    preset: policy.preset ?? normalizedProfile.global.preset,
    intensity,
    category,
    matchedBy,
    reason: presentationStrategy ? 'presentation-profile' : (eventRule ? 'event-rule' : (category ? 'category-policy' : 'global-policy')),
    ...fallback
  }, presentationStrategy);
}

export function resolveVisualRuleSafe(input = {}) {
  try {
    return resolveVisualRule(input);
  } catch {
    return fallbackDecision();
  }
}

export function validateVisualRuleDecision(decision) {
  if (!plain(decision) || typeof decision.enabled !== 'boolean'
    || !VISUAL_PRESETS.includes(decision.preset)
    || !VISUAL_INTENSITIES.includes(decision.intensity)
    || (decision.category !== null && !VISUAL_CATEGORIES.includes(decision.category))) {
    throw resolverError('VISUAL_RULE_DECISION_INVALID', 'visual rule decision is invalid');
  }
  return true;
}
