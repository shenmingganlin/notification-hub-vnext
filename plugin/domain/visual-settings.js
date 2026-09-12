import { createCardVisualSettings, cardVisualDefaults, createCardProperties, createCardSkin, createCardEffect } from './card-visual-settings.js';
import { migrateVisualProfile } from './visual-profile-migration.js';

export const VISUAL_PROFILE_VERSION = 2;
// 出现方式（行为）轴词表。VISUAL_BEHAVIOR_IDS 是可表示的已知行为（含尚未实现者，用于载入旧数据）；
// IMPLEMENTED_VISUAL_BEHAVIOR_IDS 是当前真实可用的行为，UI 只允许选择它。
export const VISUAL_BEHAVIOR_IDS = Object.freeze(['stack', 'ticker', 'popup']);
export const IMPLEMENTED_VISUAL_BEHAVIOR_IDS = Object.freeze(['stack']);
export const DEFAULT_VISUAL_BEHAVIOR_ID = 'stack';
export { createCardVisualSettings, cardVisualDefaults, createCardProperties, createCardSkin, createCardEffect } from './card-visual-settings.js';
export const VISUAL_CATEGORIES = Object.freeze(['chat', 'channel', 'tool', 'error', 'plugin', 'model_service']);
export const VISUAL_PRESETS = Object.freeze(['minimal', 'soft', 'accent', 'warning', 'critical']);
export const VISUAL_INTENSITIES = Object.freeze(['reduced', 'balanced', 'expressive']);

const PROFILE_FIELDS = Object.freeze(['version', 'global', 'categories', 'visualProfiles', 'rules', 'card', 'behaviorId', 'propertiesId', 'skinId', 'effectConfigId']);
const POLICY_FIELDS = Object.freeze(['enabled', 'preset', 'intensity', 'defaultMode']);
const VISUAL_PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const CATEGORY_DEFAULTS = Object.freeze({
  chat: 'minimal',
  channel: 'soft',
  tool: 'accent',
  error: 'warning',
  plugin: 'soft',
  model_service: 'warning'
});
const DEFAULT_GLOBAL = Object.freeze({ enabled: true, preset: 'minimal', intensity: 'balanced', defaultMode: 'off' });

function fail(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}
function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
}
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function validateVisualProfileId(value, field) {
  if (typeof value !== 'string' || !VISUAL_PROFILE_ID_PATTERN.test(value.trim())) {
    throw fail('VISUAL_PROFILE_ID_INVALID', `${field} must be a safe visual profile id`, { field });
  }
  return value.trim();
}
function validatePolicy(value, field, { allowCard = false } = {}) {
  if (!plain(value)) throw fail('VISUAL_PROFILE_FIELD_INVALID', `${field} must be a plain object`, { field });
  for (const key of Object.keys(value)) {
    if (!POLICY_FIELDS.includes(key) && !(allowCard && key === 'card')) {
      throw fail('VISUAL_PROFILE_FIELD_UNKNOWN', `Unknown ${field} field: ${key}`, { field: `${field}.${key}` });
    }
  }
  if ('enabled' in value && typeof value.enabled !== 'boolean') throw fail('VISUAL_PROFILE_FIELD_INVALID', `${field}.enabled must be boolean`, { field: `${field}.enabled` });
  if ('preset' in value && !VISUAL_PRESETS.includes(value.preset)) throw fail('VISUAL_PROFILE_PRESET_INVALID', `${field}.preset is unsupported`, { field: `${field}.preset` });
  if ('intensity' in value && !VISUAL_INTENSITIES.includes(value.intensity)) throw fail('VISUAL_PROFILE_INTENSITY_INVALID', `${field}.intensity is unsupported`, { field: `${field}.intensity` });
  if (allowCard && 'card' in value) createCardVisualSettings(value.card);
}
function validateVisualProfiles(value) {
  if (!plain(value)) throw fail('VISUAL_PROFILE_FIELD_INVALID', 'visualProfiles must be a plain object', { field: 'visualProfiles' });
  return Object.fromEntries(Object.entries(value).map(([profileId, strategy]) => {
    const normalizedId = validateVisualProfileId(profileId, `visualProfiles.${profileId}`);
    validatePolicy(strategy, `visualProfiles.${profileId}`, { allowCard: true });
    return [normalizedId, {
      ...clone(strategy),
      ...(strategy.card ? { card: createCardVisualSettings(strategy.card) } : {})
    }];
  }));
}

export function createVisualProfile(input = {}) {
  if (!plain(input)) throw fail('VISUAL_PROFILE_FIELD_INVALID', 'profile must be a plain object', { field: 'profile' });
  // 旧版本（v1）先升级为两轴形态，再做严格校验。
  input = migrateVisualProfile(input, VISUAL_PROFILE_VERSION).profile;
  for (const key of Object.keys(input)) if (!PROFILE_FIELDS.includes(key)) throw fail('VISUAL_PROFILE_FIELD_UNKNOWN', `Unknown profile field: ${key}`, { field: key });
  if ('version' in input && input.version !== VISUAL_PROFILE_VERSION) throw fail('VISUAL_PROFILE_VERSION_INVALID', 'Unsupported visual profile version', { field: 'version' });
  const behaviorId = input.behaviorId ?? DEFAULT_VISUAL_BEHAVIOR_ID;
  if (!VISUAL_BEHAVIOR_IDS.includes(behaviorId)) throw fail('VISUAL_PROFILE_BEHAVIOR_INVALID', `Unknown visual behavior: ${behaviorId}`, { field: 'behaviorId' });
  if ('global' in input) validatePolicy(input.global, 'global');
  if ('categories' in input) {
    if (!plain(input.categories)) throw fail('VISUAL_PROFILE_FIELD_INVALID', 'categories must be a plain object', { field: 'categories' });
    for (const [category, policy] of Object.entries(input.categories)) {
      if (!VISUAL_CATEGORIES.includes(category)) throw fail('VISUAL_PROFILE_CATEGORY_INVALID', `Unknown category: ${category}`, { field: `categories.${category}` });
      validatePolicy(policy, `categories.${category}`);
    }
  }
  const visualProfiles = 'visualProfiles' in input ? validateVisualProfiles(input.visualProfiles) : {};
  if ('rules' in input && (!Array.isArray(input.rules) || input.rules.some((rule) => !plain(rule)))) throw fail('VISUAL_PROFILE_RULE_INVALID', 'rules must be an array of plain objects', { field: 'rules' });
  if ('propertiesId' in input && input.propertiesId !== null && typeof input.propertiesId !== 'string') throw fail('VISUAL_PROFILE_FIELD_INVALID', 'propertiesId must be a string or null', { field: 'propertiesId' });
  if ('skinId' in input && input.skinId !== null && typeof input.skinId !== 'string') throw fail('VISUAL_PROFILE_FIELD_INVALID', 'skinId must be a string or null', { field: 'skinId' });
  if ('effectConfigId' in input && input.effectConfigId !== null && typeof input.effectConfigId !== 'string') throw fail('VISUAL_PROFILE_FIELD_INVALID', 'effectConfigId must be a string or null', { field: 'effectConfigId' });
  const global = { ...DEFAULT_GLOBAL, ...clone(input.global ?? {}) };
  const VALID_DEFAULT_MODES = ['off', 'minimal'];
  if (global.defaultMode && !VALID_DEFAULT_MODES.includes(global.defaultMode)) {
    throw fail('VISUAL_PROFILE_FIELD_INVALID', 'global.defaultMode must be "off" or "minimal"', { field: 'global.defaultMode' });
  }
  const categories = Object.fromEntries(VISUAL_CATEGORIES.map((category) => [category, {
    enabled: true,
    preset: CATEGORY_DEFAULTS[category],
    intensity: 'balanced',
    ...clone(input.categories?.[category] ?? {})
  }]));
  return freeze({
    version: VISUAL_PROFILE_VERSION,
    global,
    categories,
    visualProfiles: freeze(visualProfiles),
    rules: clone(input.rules ?? []),
    behaviorId,
    card: createCardVisualSettings(input.card ?? {}),
    propertiesId: input.propertiesId ?? null,
    skinId: input.skinId ?? null,
    effectConfigId: input.effectConfigId ?? null
  });
}

export function createVisualSettings(input = {}) {
  if (!plain(input)) throw fail('VISUAL_SETTINGS_FIELD_INVALID', 'settings must be a plain object');
  for (const key of Object.keys(input)) if (!['profile'].includes(key)) throw fail('VISUAL_SETTINGS_FIELD_UNKNOWN', `Unknown settings field: ${key}`, { field: key });
  return freeze({ profile: createVisualProfile(input.profile ?? {}) });
}

export const VISUAL_SETTINGS_DEFAULTS = createVisualSettings();
export function validateVisualSettings(settings) { createVisualSettings(settings); return true; }
