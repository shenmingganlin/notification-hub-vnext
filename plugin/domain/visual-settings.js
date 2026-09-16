import { createCardVisualSettings, cardVisualDefaults, createCardProperties, createCardSkin, createCardEffect } from './card-visual-settings.js';
import { migrateVisualProfile } from './visual-profile-migration.js';

export const VISUAL_PROFILE_VERSION = 2;
// 出现方式（行为）轴词表。VISUAL_BEHAVIOR_IDS 是可表示的已知行为（含尚未实现者，用于载入旧数据）；
// IMPLEMENTED_VISUAL_BEHAVIOR_IDS 是当前真实可用的行为，UI 只允许选择它。
export const VISUAL_BEHAVIOR_IDS = Object.freeze(['stack', 'ticker', 'popup']);
export const IMPLEMENTED_VISUAL_BEHAVIOR_IDS = Object.freeze(['stack', 'ticker']);
export const DEFAULT_VISUAL_BEHAVIOR_ID = 'stack';

// Ticker（弹幕）行为参数（ticker 契约 §2，Lumen 定稿）。
// 参数归**行为轴**而非卡片种类，所以放在 profile 顶层，不放进 card.types。
export const TICKER_DEFAULTS = Object.freeze({
  speedPxPerSec: 400,
  band: 'top',
  bandRatio: 0.28,
  trackCount: 3, // 工作室默认显式条数；0 = 旧自动档（按 bandRatio）
  trackGapPx: 8, // 异轨纵向间距；缺省保持旧观感
  minGapPx: 64,
  speedRandom: false,
  clickThrough: true,
  hoverPause: false,
  overflow: 'avoid',
  direction: 'left'
});
export const TICKER_BANDS = Object.freeze(['top', 'bottom']);
export const TICKER_DIRECTIONS = Object.freeze(['left', 'right']);
export const TICKER_OVERFLOWS = Object.freeze(['avoid', 'queue']);
export const TICKER_SPEED_BOUNDS = Object.freeze({ min: 150, max: 800 });
export const TICKER_BAND_RATIO_BOUNDS = Object.freeze({ min: 0.15, max: 1 });
export const TICKER_MIN_GAP_BOUNDS = Object.freeze({ min: 24, max: 160 });
export const TICKER_TRACK_GAP_BOUNDS = Object.freeze({ min: 0, max: 48 });
const TICKER_FIELDS = Object.freeze(['speedPxPerSec', 'band', 'bandRatio', 'trackCount', 'trackGapPx', 'minGapPx', 'speedRandom', 'clickThrough', 'hoverPause', 'overflow', 'direction']);
export { createCardVisualSettings, cardVisualDefaults, createCardProperties, createCardSkin, createCardEffect } from './card-visual-settings.js';
export const VISUAL_CATEGORIES = Object.freeze(['chat', 'channel', 'tool', 'error', 'plugin', 'model_service']);
export const VISUAL_PRESETS = Object.freeze(['minimal', 'soft', 'accent', 'warning', 'critical']);
export const VISUAL_INTENSITIES = Object.freeze(['reduced', 'balanced', 'expressive']);

const PROFILE_FIELDS = Object.freeze(['version', 'global', 'categories', 'visualProfiles', 'rules', 'card', 'behaviorId', 'ticker', 'propertiesId', 'skinId', 'effectConfigId']);
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
export const VALID_DEFAULT_MODES = Object.freeze(['off', 'stack', 'ticker']);

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

export function createTickerSettings(input = {}) {
  if (!plain(input)) throw fail('VISUAL_PROFILE_FIELD_INVALID', 'ticker must be a plain object', { field: 'ticker' });
  for (const key of Object.keys(input)) {
    if (!TICKER_FIELDS.includes(key)) throw fail('VISUAL_PROFILE_FIELD_UNKNOWN', `Unknown ticker field: ${key}`, { field: `ticker.${key}` });
  }
  const band = input.band ?? TICKER_DEFAULTS.band;
  if (!TICKER_BANDS.includes(band)) throw fail('VISUAL_PROFILE_TICKER_INVALID', 'ticker.band must be "top" or "bottom"', { field: 'ticker.band' });
  const bandRatio = input.bandRatio ?? TICKER_DEFAULTS.bandRatio;
  if (typeof bandRatio !== 'number' || !Number.isFinite(bandRatio)
    || bandRatio < TICKER_BAND_RATIO_BOUNDS.min || bandRatio > TICKER_BAND_RATIO_BOUNDS.max) {
    throw fail('VISUAL_PROFILE_TICKER_INVALID', 'ticker.bandRatio must be a number between 0.15 and 1', { field: 'ticker.bandRatio' });
  }
  const speedPxPerSec = input.speedPxPerSec ?? TICKER_DEFAULTS.speedPxPerSec;
  if (!Number.isInteger(speedPxPerSec)
    || speedPxPerSec < TICKER_SPEED_BOUNDS.min || speedPxPerSec > TICKER_SPEED_BOUNDS.max) {
    throw fail('VISUAL_PROFILE_TICKER_INVALID', 'ticker.speedPxPerSec must be an integer between 150 and 800', { field: 'ticker.speedPxPerSec' });
  }
  const minGapPx = input.minGapPx ?? TICKER_DEFAULTS.minGapPx;
  if (!Number.isInteger(minGapPx)
    || minGapPx < TICKER_MIN_GAP_BOUNDS.min || minGapPx > TICKER_MIN_GAP_BOUNDS.max) {
    throw fail('VISUAL_PROFILE_TICKER_INVALID', 'ticker.minGapPx must be an integer between 24 and 160', { field: 'ticker.minGapPx' });
  }
  const trackGapPx = input.trackGapPx ?? TICKER_DEFAULTS.trackGapPx;
  if (!Number.isInteger(trackGapPx)
    || trackGapPx < TICKER_TRACK_GAP_BOUNDS.min || trackGapPx > TICKER_TRACK_GAP_BOUNDS.max) {
    throw fail('VISUAL_PROFILE_TICKER_INVALID', 'ticker.trackGapPx must be an integer between 0 and 48', { field: 'ticker.trackGapPx' });
  }
  // trackCount 只设下限：0 = 自动，显式条数**不设上限**（甘霖：不要上限，要满屏弹幕）。
  const trackCount = input.trackCount ?? TICKER_DEFAULTS.trackCount;
  if (!Number.isInteger(trackCount) || trackCount < 0) {
    throw fail('VISUAL_PROFILE_TICKER_INVALID', 'ticker.trackCount must be a non-negative integer (0 = auto)', { field: 'ticker.trackCount' });
  }
  const speedRandom = input.speedRandom ?? TICKER_DEFAULTS.speedRandom;
  if (typeof speedRandom !== 'boolean') throw fail('VISUAL_PROFILE_TICKER_INVALID', 'ticker.speedRandom must be boolean', { field: 'ticker.speedRandom' });
  const clickThrough = input.clickThrough ?? TICKER_DEFAULTS.clickThrough;
  if (typeof clickThrough !== 'boolean') throw fail('VISUAL_PROFILE_TICKER_INVALID', 'ticker.clickThrough must be boolean', { field: 'ticker.clickThrough' });
  const hoverPause = input.hoverPause ?? TICKER_DEFAULTS.hoverPause;
  if (typeof hoverPause !== 'boolean') throw fail('VISUAL_PROFILE_TICKER_INVALID', 'ticker.hoverPause must be boolean', { field: 'ticker.hoverPause' });
  const overflow = input.overflow ?? TICKER_DEFAULTS.overflow;
  if (!TICKER_OVERFLOWS.includes(overflow)) throw fail('VISUAL_PROFILE_TICKER_INVALID', 'ticker.overflow must be "avoid" or "queue"', { field: 'ticker.overflow' });
  const direction = input.direction ?? TICKER_DEFAULTS.direction;
  if (!TICKER_DIRECTIONS.includes(direction)) throw fail('VISUAL_PROFILE_TICKER_INVALID', 'ticker.direction must be "left" or "right"', { field: 'ticker.direction' });
  return freeze({ speedPxPerSec, band, bandRatio, trackCount, trackGapPx, minGapPx, speedRandom, clickThrough, hoverPause, overflow, direction });
}

export function rollTickerSpeed(random = Math.random) {
  const step = 10;
  const span = Math.floor((TICKER_SPEED_BOUNDS.max - TICKER_SPEED_BOUNDS.min) / step);
  return TICKER_SPEED_BOUNDS.min + Math.floor(random() * (span + 1)) * step;
}

export function resolveTickerMotion(ticker, random = Math.random) {
  if (!plain(ticker)) return ticker;
  if (ticker.speedRandom !== true) return ticker;
  return { ...ticker, speedPxPerSec: rollTickerSpeed(random) };
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
  if (global.defaultMode === 'minimal') global.defaultMode = 'stack';
  if (global.defaultMode && !VALID_DEFAULT_MODES.includes(global.defaultMode)) {
    throw fail('VISUAL_PROFILE_FIELD_INVALID', 'global.defaultMode must be "off", "stack" or "ticker"', { field: 'global.defaultMode' });
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
    // 仅在显式携带时出现：保持既有 profile 形状稳定，旧数据不受影响。
    ...(input.ticker === undefined ? {} : { ticker: createTickerSettings(input.ticker) }),
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
