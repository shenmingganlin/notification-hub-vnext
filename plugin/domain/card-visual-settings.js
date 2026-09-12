// 卡片种类 = 内容结构轴，与 card-composition-contract.js 的 CARD_TYPE_IDS 对齐。
// 完整词表为未来种类预留；本轮已实现的只有内容结构 minimal。
// 「出现方式」不再属于卡片种类，已独立为视觉方案的 behaviorId 轴（见 ADR-002）。
export const CARD_TYPES = Object.freeze(['minimal', 'message', 'detail', 'progress', 'character', 'system']);
export const IMPLEMENTED_CARD_TYPES = Object.freeze(['minimal']);
export const CARD_LAYOUTS = Object.freeze(['simple']);
export const CARD_BOUNDARIES = Object.freeze(['work-area']);
export const CARD_ANCHORS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
export const CARD_SIZES = Object.freeze(['small', 'medium', 'large']);
export const CARD_ASPECT_RATIOS = Object.freeze(['default', 'square', 'wide']);
export const CARD_FITS = Object.freeze(['fill', 'contain', 'cover']);
export const CARD_SHADOWS = Object.freeze(['none', 'soft', 'medium', 'strong']);
export const CARD_DENSITIES = Object.freeze(['compact', 'standard', 'relaxed']);
export const CARD_TEXT_OVERFLOWS = Object.freeze(['ellipsis', 'fade', 'clip']);
export const CARD_DISMISS_MODES = Object.freeze(['closeButton', 'anywhere', 'timeout', 'buttonOnly']);
export const CARD_CLOSE_POSITIONS = Object.freeze(['top-right', 'top-left', 'bottom-right', 'bottom-left']);
export const CARD_OVERFLOW_STRATEGIES = Object.freeze(['allow', 'queue', 'dropOldest', 'aggregate', 'replace']);
export const EFFECT_IDS = Object.freeze(['fade', 'scale', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'bounce', 'none']);
export const PARTICLE_EFFECT_IDS = Object.freeze(['star', 'circle', 'heart', 'petal', 'sparkle', 'none']);
export const EFFECT_SLOTS = Object.freeze(['enter', 'idle', 'exit', 'enterParticles', 'idleParticles', 'exitParticles']);

const CARD_SETTINGS_FIELDS = Object.freeze(['activeType', 'types']);
const TYPE_FIELDS = Object.freeze(['appearance', 'properties', 'skin', 'effects']);
const APPEARANCE_FIELDS = Object.freeze(['size', 'aspectRatio', 'width', 'height', 'backgroundColor', 'backgroundAssetId', 'backgroundFit', 'backgroundPadding', 'borderRadius', 'opacity']);
const PROPERTIES_FIELDS = Object.freeze(['space', 'shape', 'typography', 'lifecycle', 'interaction', 'resource']);
const SPACE_FIELDS = Object.freeze(['size', 'anchor', 'aspectRatio', 'gap', 'margin', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom', 'layout', 'offset', 'screenPadding', 'zIndex']);
const SHAPE_FIELDS = Object.freeze(['borderRadius', 'opacity', 'blur', 'shadow', 'borderWidth', 'borderColor']);
const TYPOGRAPHY_FIELDS = Object.freeze(['titleLines', 'bodyLines', 'fontScale', 'lineHeight', 'textOverflow']);
const LIFECYCLE_FIELDS = Object.freeze(['durationMs', 'enterDurationMs', 'holdDurationMs', 'exitDurationMs']);
const INTERACTION_FIELDS = Object.freeze(['dismissMode', 'closeButtonPosition', 'timeoutMs', 'hoverPause', 'pauseOnFocus', 'expandable', 'clickable']);
const RESOURCE_FIELDS = Object.freeze(['maxVisible', 'maxActive', 'maxParticles', 'maxAnimationInstances', 'overflow']);
const SKIN_FIELDS = Object.freeze(['skinId', 'skinName', 'semanticColors', 'background', 'decoration']);
const SEMANTIC_COLOR_FIELDS = Object.freeze(['title', 'body', 'assistantName', 'metadata', 'status']);
const SKIN_BACKGROUND_FIELDS = Object.freeze(['color', 'assetId', 'fit', 'padding']);
const SKIN_DECORATION_FIELDS = Object.freeze(['borderRadius', 'opacity', 'shadow', 'borderWidth', 'borderColor', 'blur', 'density']);
const EFFECT_CONFIG_FIELDS = Object.freeze(['effectConfigId', 'slots']);
const EFFECT_SLOT_FIELDS = Object.freeze(['enabled', 'effectId', 'durationMs', 'maxParticles', 'assetId']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ASSET_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const SKIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const EFFECT_CONFIG_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

export const MINIMAL_CARD_DEFAULTS = Object.freeze({
  appearance: Object.freeze({
    size: 'medium',
    aspectRatio: 'default',
    backgroundColor: '#0e1916',
    backgroundFit: 'fill',
    backgroundPadding: 0,
    borderRadius: 16,
    opacity: 0.96
  })
});

export const CARD_TYPE_DEFAULTS = Object.freeze({
  minimal: MINIMAL_CARD_DEFAULTS
});

export const PROPERTIES_DEFAULTS = Object.freeze({
  space: Object.freeze({ size: 'medium', anchor: 'top-right', aspectRatio: 'default', gap: 8, margin: 18, layout: 'simple', offset: 0, screenPadding: 0, zIndex: 0 }),
  shape: Object.freeze({ borderRadius: 16, opacity: 0.96, blur: 0, shadow: 'none', borderWidth: 0, borderColor: '#0e1916' }),
  typography: Object.freeze({ titleLines: 1, bodyLines: 4, fontScale: 1.0, lineHeight: 1.55, textOverflow: 'ellipsis' }),
  lifecycle: Object.freeze({ durationMs: 30000, enterDurationMs: 260, holdDurationMs: 30000, exitDurationMs: 200 }),
  interaction: Object.freeze({ dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 30000, hoverPause: 'off', pauseOnFocus: 'off', expandable: 'off', clickable: 'off' }),
  resource: Object.freeze({ maxVisible: 0, maxActive: 0, maxParticles: 0, maxAnimationInstances: 0, overflow: 'allow' })
});

export const SKIN_DEFAULTS = Object.freeze({
  skinId: 'skin.default',
  skinName: '默认',
  semanticColors: Object.freeze({ title: '#F2FFF9', body: '#C5D8D0', assistantName: '#62D0A8', metadata: '#8EA69C', status: '#F1C77A' }),
  background: Object.freeze({ color: '#0e1916', assetId: null, fit: 'fill', padding: 0 }),
  decoration: Object.freeze({ borderRadius: 16, opacity: 0.96, shadow: 'none', borderWidth: 0, borderColor: '#0e1916', blur: 0, density: 'standard' })
});

export const EFFECT_DEFAULTS = Object.freeze({
  effectConfigId: 'effect.none',
  slots: Object.freeze({
    enter: Object.freeze({ enabled: true, effectId: 'fade', durationMs: 260, maxParticles: 0, assetId: null }),
    idle: Object.freeze({ enabled: false, effectId: 'none', durationMs: 0, maxParticles: 0, assetId: null }),
    exit: Object.freeze({ enabled: true, effectId: 'fade', durationMs: 200, maxParticles: 0, assetId: null }),
    enterParticles: Object.freeze({ enabled: true, effectId: 'star', durationMs: 0, maxParticles: 18, assetId: null }),
    idleParticles: Object.freeze({ enabled: false, effectId: 'none', durationMs: 0, maxParticles: 0, assetId: null }),
    exitParticles: Object.freeze({ enabled: true, effectId: 'star', durationMs: 0, maxParticles: 18, assetId: null })
  })
});

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
function assertKnownFields(value, fields, field) {
  if (!plain(value)) throw fail('CARD_VISUAL_FIELD_INVALID', `${field} must be a plain object`, { field });
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) throw fail('CARD_VISUAL_FIELD_UNKNOWN', `Unknown ${field} field: ${key}`, { field: `${field}.${key}` });
  }
}
function validateInt(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw fail('CARD_VISUAL_FIELD_INVALID', `${field} must be an integer from ${min} to ${max}`, { field });
}
function validateFloat(value, field, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw fail('CARD_VISUAL_FIELD_INVALID', `${field} must be a number from ${min} to ${max}`, { field });
}
function validateString(value, field, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) throw fail('CARD_VISUAL_FIELD_INVALID', `${field} is invalid`, { field });
}
function validateBoolean(value, field) {
  if (typeof value !== 'boolean') throw fail('CARD_VISUAL_FIELD_INVALID', `${field} must be a boolean`, { field });
}
function validateColor(value, field) {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) throw fail('CARD_VISUAL_COLOR_INVALID', `${field} must be a #RRGGBB color`, { field });
}
function validateNullableAssetId(value, field) {
  if (value !== null && (typeof value !== 'string' || !ASSET_ID.test(value))) throw fail('CARD_VISUAL_ASSET_ID_INVALID', `${field} is invalid`, { field });
}

// ── Appearance ──

function validateAppearance(value, field) {
  assertKnownFields(value, APPEARANCE_FIELDS, field);
  if ('size' in value && !CARD_SIZES.includes(value.size)) throw fail('CARD_VISUAL_SIZE_INVALID', `${field}.size is unsupported`, { field: `${field}.size` });
  if ('aspectRatio' in value && !CARD_ASPECT_RATIOS.includes(value.aspectRatio)) throw fail('CARD_VISUAL_ASPECT_RATIO_INVALID', `${field}.aspectRatio is unsupported`, { field: `${field}.aspectRatio` });
  for (const key of ['width', 'height']) if (key in value && (!Number.isInteger(value[key]) || value[key] < (key === 'width' ? 240 : 64) || value[key] > (key === 'width' ? 720 : 360))) throw fail('CARD_VISUAL_DIMENSION_INVALID', `${field}.${key} is out of range`, { field: `${field}.${key}` });
  if ('backgroundColor' in value) validateColor(value.backgroundColor, `${field}.backgroundColor`);
  if ('backgroundAssetId' in value) validateNullableAssetId(value.backgroundAssetId, `${field}.backgroundAssetId`);
  if ('backgroundFit' in value && !CARD_FITS.includes(value.backgroundFit)) throw fail('CARD_VISUAL_FIT_INVALID', `${field}.backgroundFit must be one of: fill, contain, cover`, { field: `${field}.backgroundFit` });
  if ('backgroundPadding' in value) validateInt(value.backgroundPadding, `${field}.backgroundPadding`, 0, 40);
  if ('borderRadius' in value) validateInt(value.borderRadius, `${field}.borderRadius`, 0, 48);
  if ('opacity' in value) validateFloat(value.opacity, `${field}.opacity`, 0, 1);
}

// ── Properties ──

function validateSpace(value, field) {
  assertKnownFields(value, SPACE_FIELDS, field);
  if ('size' in value && !CARD_SIZES.includes(value.size)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.size is unsupported`, { field: `${field}.size` });
  if ('anchor' in value && !CARD_ANCHORS.includes(value.anchor)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.anchor is unsupported`, { field: `${field}.anchor` });
  if ('aspectRatio' in value && !CARD_ASPECT_RATIOS.includes(value.aspectRatio)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.aspectRatio is unsupported`, { field: `${field}.aspectRatio` });
  if ('layout' in value && !CARD_LAYOUTS.includes(value.layout)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.layout is unsupported`, { field: `${field}.layout` });
  if ('gap' in value) validateInt(value.gap, `${field}.gap`, 0, 48);
  for (const key of ['margin', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom']) if (key in value) validateInt(value[key], `${field}.${key}`, 0, 96);
  if ('offset' in value) validateInt(value.offset, `${field}.offset`, 0, 200);
  if ('screenPadding' in value) validateInt(value.screenPadding, `${field}.screenPadding`, 0, 96);
  if ('zIndex' in value) validateInt(value.zIndex, `${field}.zIndex`, 0, 9999);
}

function validateShape(value, field) {
  assertKnownFields(value, SHAPE_FIELDS, field);
  if ('borderRadius' in value) validateInt(value.borderRadius, `${field}.borderRadius`, 0, 48);
  if ('opacity' in value) validateFloat(value.opacity, `${field}.opacity`, 0, 1);
  if ('blur' in value) validateFloat(value.blur, `${field}.blur`, 0, 24);
  if ('shadow' in value && !CARD_SHADOWS.includes(value.shadow)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.shadow is unsupported`, { field: `${field}.shadow` });
  if ('borderWidth' in value) validateInt(value.borderWidth, `${field}.borderWidth`, 0, 8);
  if ('borderColor' in value) validateColor(value.borderColor, `${field}.borderColor`);
}

function validateTypography(value, field) {
  assertKnownFields(value, TYPOGRAPHY_FIELDS, field);
  if ('titleLines' in value) validateInt(value.titleLines, `${field}.titleLines`, 1, 3);
  if ('bodyLines' in value) validateInt(value.bodyLines, `${field}.bodyLines`, 1, 10);
  if ('fontScale' in value) validateFloat(value.fontScale, `${field}.fontScale`, 0.75, 1.5);
  if ('lineHeight' in value) validateFloat(value.lineHeight, `${field}.lineHeight`, 1.0, 2.0);
  if ('textOverflow' in value && !CARD_TEXT_OVERFLOWS.includes(value.textOverflow)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.textOverflow is unsupported`, { field: `${field}.textOverflow` });
}

function validateLifecycle(value, field) {
  assertKnownFields(value, LIFECYCLE_FIELDS, field);
  if ('durationMs' in value) validateInt(value.durationMs, `${field}.durationMs`, 1000, 60000);
  if ('enterDurationMs' in value) validateInt(value.enterDurationMs, `${field}.enterDurationMs`, 50, 2000);
  if ('holdDurationMs' in value) validateInt(value.holdDurationMs, `${field}.holdDurationMs`, 1000, 60000);
  if ('exitDurationMs' in value) validateInt(value.exitDurationMs, `${field}.exitDurationMs`, 50, 2000);
}

function validateInteraction(value, field) {
  assertKnownFields(value, INTERACTION_FIELDS, field);
  if ('dismissMode' in value && !CARD_DISMISS_MODES.includes(value.dismissMode)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.dismissMode is unsupported`, { field: `${field}.dismissMode` });
  if ('closeButtonPosition' in value && !CARD_CLOSE_POSITIONS.includes(value.closeButtonPosition)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.closeButtonPosition is unsupported`, { field: `${field}.closeButtonPosition` });
  if ('timeoutMs' in value) validateInt(value.timeoutMs, `${field}.timeoutMs`, 1000, 60000);
  for (const key of ['hoverPause', 'pauseOnFocus', 'expandable', 'clickable']) if (key in value && value[key] !== 'off' && value[key] !== 'on') throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.${key} must be "off" or "on"`, { field: `${field}.${key}` });
}

function validateResource(value, field) {
  assertKnownFields(value, RESOURCE_FIELDS, field);
  if ('maxVisible' in value) validateInt(value.maxVisible, `${field}.maxVisible`, 0, 100);
  if ('maxActive' in value) validateInt(value.maxActive, `${field}.maxActive`, 0, 100);
  if ('maxParticles' in value) validateInt(value.maxParticles, `${field}.maxParticles`, 0, 500);
  if ('maxAnimationInstances' in value) validateInt(value.maxAnimationInstances, `${field}.maxAnimationInstances`, 0, 100);
  if ('overflow' in value && !CARD_OVERFLOW_STRATEGIES.includes(value.overflow)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.overflow is unsupported`, { field: `${field}.overflow` });
}

function validatePropertiesSub(value, field) {
  assertKnownFields(value, PROPERTIES_FIELDS, field);
  if ('space' in value) validateSpace(value.space, `${field}.space`);
  if ('shape' in value) validateShape(value.shape, `${field}.shape`);
  if ('typography' in value) validateTypography(value.typography, `${field}.typography`);
  if ('lifecycle' in value) validateLifecycle(value.lifecycle, `${field}.lifecycle`);
  if ('interaction' in value) validateInteraction(value.interaction, `${field}.interaction`);
  if ('resource' in value) validateResource(value.resource, `${field}.resource`);
}

// ── Skin ──

function validateSkin(value, field) {
  assertKnownFields(value, SKIN_FIELDS, field);
  if ('skinId' in value) validateString(value.skinId, `${field}.skinId`, SKIN_ID_PATTERN);
  if ('skinName' in value && typeof value.skinName !== 'string') throw fail('CARD_VISUAL_SKIN_INVALID', `${field}.skinName must be a string`, { field: `${field}.skinName` });
  if ('semanticColors' in value) {
    assertKnownFields(value.semanticColors, SEMANTIC_COLOR_FIELDS, `${field}.semanticColors`);
    for (const key of SEMANTIC_COLOR_FIELDS) if (key in value.semanticColors) validateColor(value.semanticColors[key], `${field}.semanticColors.${key}`);
  }
  if ('background' in value) {
    assertKnownFields(value.background, SKIN_BACKGROUND_FIELDS, `${field}.background`);
    if ('color' in value.background) validateColor(value.background.color, `${field}.background.color`);
    if ('assetId' in value.background) validateNullableAssetId(value.background.assetId, `${field}.background.assetId`);
    if ('fit' in value.background && !CARD_FITS.includes(value.background.fit)) throw fail('CARD_VISUAL_SKIN_INVALID', `${field}.background.fit is unsupported`, { field: `${field}.background.fit` });
    if ('padding' in value.background) validateFloat(value.background.padding, `${field}.background.padding`, 0, 40);
  }
  if ('decoration' in value) {
    assertKnownFields(value.decoration, SKIN_DECORATION_FIELDS, `${field}.decoration`);
    if ('borderRadius' in value.decoration) validateInt(value.decoration.borderRadius, `${field}.decoration.borderRadius`, 0, 48);
    if ('opacity' in value.decoration) validateFloat(value.decoration.opacity, `${field}.decoration.opacity`, 0, 1);
    if ('shadow' in value.decoration && !CARD_SHADOWS.includes(value.decoration.shadow)) throw fail('CARD_VISUAL_SKIN_INVALID', `${field}.decoration.shadow is unsupported`, { field: `${field}.decoration.shadow` });
    if ('borderWidth' in value.decoration) validateInt(value.decoration.borderWidth, `${field}.decoration.borderWidth`, 0, 8);
    if ('borderColor' in value.decoration) validateColor(value.decoration.borderColor, `${field}.decoration.borderColor`);
    if ('blur' in value.decoration) validateFloat(value.decoration.blur, `${field}.decoration.blur`, 0, 24);
    if ('density' in value.decoration && !CARD_DENSITIES.includes(value.decoration.density)) throw fail('CARD_VISUAL_SKIN_INVALID', `${field}.decoration.density is unsupported`, { field: `${field}.decoration.density` });
  }
}

// ── Effects ──

function validateEffectSlot(value, field) {
  assertKnownFields(value, EFFECT_SLOT_FIELDS, field);
  if ('enabled' in value) validateBoolean(value.enabled, `${field}.enabled`);
  if ('effectId' in value) {
    const parent = field.includes('Particle') ? PARTICLE_EFFECT_IDS : EFFECT_IDS;
    if (!parent.includes(value.effectId)) throw fail('CARD_VISUAL_EFFECT_INVALID', `${field}.effectId is unsupported`, { field: `${field}.effectId` });
  }
  if ('durationMs' in value) validateInt(value.durationMs, `${field}.durationMs`, 0, 10000);
  if ('maxParticles' in value) validateInt(value.maxParticles, `${field}.maxParticles`, 0, 500);
  if ('assetId' in value) validateNullableAssetId(value.assetId, `${field}.assetId`);
}

function validateEffects(value, field) {
  assertKnownFields(value, EFFECT_CONFIG_FIELDS, field);
  if ('effectConfigId' in value) validateString(value.effectConfigId, `${field}.effectConfigId`, EFFECT_CONFIG_ID_PATTERN);
  if ('slots' in value) {
    assertKnownFields(value.slots, EFFECT_SLOTS, `${field}.slots`);
    for (const slot of EFFECT_SLOTS) {
      if (slot in value.slots) validateEffectSlot(value.slots[slot], `${field}.slots.${slot}`);
    }
  }
}

// ── Normalize ──

function normalizeType(value, type) {
  assertKnownFields(value, TYPE_FIELDS, `card.types.${type}`);
  if ('appearance' in value) validateAppearance(value.appearance, `card.types.${type}.appearance`);
  if ('properties' in value) validatePropertiesSub(value.properties, `card.types.${type}.properties`);
  if ('skin' in value) validateSkin(value.skin, `card.types.${type}.skin`);
  if ('effects' in value) validateEffects(value.effects, `card.types.${type}.effects`);
  const defaults = CARD_TYPE_DEFAULTS[type] ?? MINIMAL_CARD_DEFAULTS;
  const appearance = { ...clone(defaults.appearance), ...clone(value.appearance ?? {}) };
  const properties = { ...clone(PROPERTIES_DEFAULTS), ...clone(value.properties ?? {}) };
  const skin = { ...clone(SKIN_DEFAULTS), ...clone(value.skin ?? {}) };
  const effects = { ...clone(EFFECT_DEFAULTS), ...clone(value.effects ?? {}) };
  return { appearance, properties, skin, effects };
}

// ── Public API ──

export function createCardProperties(input = {}) {
  if (!plain(input)) throw fail('CARD_VISUAL_FIELD_INVALID', 'properties must be a plain object', { field: 'properties' });
  validatePropertiesSub(input, 'properties');
  const space = { ...clone(PROPERTIES_DEFAULTS.space), ...clone(input.space ?? {}) };
  const shape = { ...clone(PROPERTIES_DEFAULTS.shape), ...clone(input.shape ?? {}) };
  const typography = { ...clone(PROPERTIES_DEFAULTS.typography), ...clone(input.typography ?? {}) };
  const lifecycle = { ...clone(PROPERTIES_DEFAULTS.lifecycle), ...clone(input.lifecycle ?? {}) };
  const interaction = { ...clone(PROPERTIES_DEFAULTS.interaction), ...clone(input.interaction ?? {}) };
  const resource = { ...clone(PROPERTIES_DEFAULTS.resource), ...clone(input.resource ?? {}) };
  return freeze({ space, shape, typography, lifecycle, interaction, resource });
}

export function createCardSkin(input = {}) {
  if (!plain(input)) throw fail('CARD_VISUAL_FIELD_INVALID', 'skin must be a plain object', { field: 'skin' });
  validateSkin(input, 'skin');
  const semanticColors = { ...clone(SKIN_DEFAULTS.semanticColors), ...clone(input.semanticColors ?? {}) };
  const background = { ...clone(SKIN_DEFAULTS.background), ...clone(input.background ?? {}) };
  const decoration = { ...clone(SKIN_DEFAULTS.decoration), ...clone(input.decoration ?? {}) };
  return freeze({
    skinId: input.skinId ?? SKIN_DEFAULTS.skinId,
    skinName: input.skinName ?? SKIN_DEFAULTS.skinName,
    semanticColors,
    background,
    decoration
  });
}

export function createCardEffect(input = {}) {
  if (!plain(input)) throw fail('CARD_VISUAL_FIELD_INVALID', 'effects must be a plain object', { field: 'effects' });
  validateEffects(input, 'effects');
  const slots = {};
  for (const slot of EFFECT_SLOTS) {
    slots[slot] = { ...clone(EFFECT_DEFAULTS.slots[slot]), ...clone(input.slots?.[slot] ?? {}) };
  }
  return freeze({
    effectConfigId: input.effectConfigId ?? EFFECT_DEFAULTS.effectConfigId,
    slots: freeze(slots)
  });
}

export function createCardVisualSettings(input = {}) {
  if (!plain(input)) throw fail('CARD_VISUAL_FIELD_INVALID', 'card must be a plain object', { field: 'card' });
  assertKnownFields(input, CARD_SETTINGS_FIELDS, 'card');
  const activeType = input.activeType ?? 'minimal';
  if (!CARD_TYPES.includes(activeType)) throw fail('CARD_VISUAL_TYPE_INVALID', `Unknown card type: ${activeType}`, { field: 'card.activeType' });
  if (!IMPLEMENTED_CARD_TYPES.includes(activeType)) throw fail('CARD_VISUAL_TYPE_NOT_IMPLEMENTED', `Card type ${activeType} is not implemented`, { field: 'card.activeType' });
  if ('types' in input) {
    if (!plain(input.types)) throw fail('CARD_VISUAL_FIELD_INVALID', 'card.types must be a plain object', { field: 'card.types' });
    for (const type of Object.keys(input.types)) {
      if (!CARD_TYPES.includes(type)) throw fail('CARD_VISUAL_TYPE_INVALID', `Unknown card type: ${type}`, { field: `card.types.${type}` });
      normalizeType(input.types[type], type);
    }
  }
  const types = { minimal: normalizeType(input.types?.minimal ?? {}, 'minimal') };
  for (const type of IMPLEMENTED_CARD_TYPES) {
    if (type === 'minimal') continue;
    if (type === activeType || Object.prototype.hasOwnProperty.call(input.types ?? {}, type)) {
      types[type] = normalizeType(input.types?.[type] ?? {}, type);
    }
  }
  return freeze({ activeType, types });
}

export function cardVisualDefaults() {
  return createCardVisualSettings();
}