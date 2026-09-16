// 卡片种类词表留在 CARD_TYPES。卡面走零件树（ADR-005）；种类轴不再作为用户轴。
// 完整词表为未来种类预留；本轮已实现的只有 minimal。
// 「出现方式」是视觉方案的 behaviorId / 通道飞法，不属于卡片种类。
export const CARD_TYPES = Object.freeze(['minimal', 'message', 'detail', 'progress', 'character', 'system']);
export const IMPLEMENTED_CARD_TYPES = Object.freeze(['minimal']);
export const CARD_LAYOUTS = Object.freeze(['simple']);
export const CARD_BOUNDARIES = Object.freeze(['work-area']);
export const CARD_ANCHORS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
export const CARD_GROWS = Object.freeze(['up', 'down', 'left', 'right']);
export const CARD_WRAPS = Object.freeze(['off', 'parallel', 'snake']);
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
const TYPE_FIELDS = Object.freeze(['appearance', 'properties', 'skin', 'effects', 'parts', 'glossary']);
const PART_IDS = Object.freeze(['title', 'body', 'close', 'icon', 'assistantName']);
const PART_PAINT_FIELDS = Object.freeze(['fill', 'stroke', 'strokeWidth', 'strokePaint', 'x', 'y', 'w', 'h', 'show', 'radius', 'background', 'opacity', 'backgroundAssetId', 'backgroundFit', 'backgroundScale', 'backgroundX', 'backgroundY']);
const TEXT_PART_PAINT_FIELDS = Object.freeze(['fontSize', 'fontFamily', 'fontAssetId', 'textPaint', 'fontBold', 'fontItalic', 'fontUnderline', 'fontStrike', 'textStroke', 'textStrokeColor', 'textStrokeWidth', 'textStrokePaint']);
const ICON_PART_PAINT_FIELDS = Object.freeze(['source', 'assetId', 'backgroundScale', 'backgroundX', 'backgroundY']);
const CLOSE_PART_PAINT_FIELDS = Object.freeze(['closeIcon', 'closeIconColor']);
const TEXT_PART_IDS = Object.freeze(['title', 'body', 'assistantName']);
const ICON_SOURCES = Object.freeze(['assistant', 'custom']);
const FONT_FAMILIES = Object.freeze(['yahei', 'heiti', 'songti', 'segoe']);
const TEXT_PAINTS = Object.freeze(['solid', 'rainbow']);
const STROKE_PAINTS = Object.freeze(['solid', 'gradient']);
const TEXT_STROKE_PAINTS = Object.freeze(['solid', 'rainbow']);
const CLOSE_ICONS = Object.freeze(['x', 'none', 'circle', 'minus', 'star', 'plus', 'disc']);
const APPEARANCE_FIELDS = Object.freeze(['size', 'aspectRatio', 'width', 'height', 'backgroundColor', 'backgroundAssetId', 'backgroundFit', 'backgroundPadding', 'backgroundScale', 'backgroundX', 'backgroundY', 'borderRadius', 'opacity', 'borderWidth', 'borderColor', 'borderPaint', 'paintOverflow']);
const PROPERTIES_FIELDS = Object.freeze(['space', 'shape', 'typography', 'lifecycle', 'interaction', 'resource']);
const SPACE_FIELDS = Object.freeze(['size', 'anchor', 'aspectRatio', 'gap', 'grow', 'wrap', 'margin', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom', 'layout', 'offset', 'screenPadding', 'zIndex']);
const SHAPE_FIELDS = Object.freeze(['borderRadius', 'opacity', 'blur', 'shadow', 'borderWidth', 'borderColor']);
const TYPOGRAPHY_FIELDS = Object.freeze(['titleLines', 'bodyLines', 'fontScale', 'lineHeight', 'textOverflow']);
const LIFECYCLE_FIELDS = Object.freeze(['durationMs', 'enterDurationMs', 'holdDurationMs', 'exitDurationMs']);
const INTERACTION_FIELDS = Object.freeze(['dismissMode', 'closeButtonPosition', 'timeoutMs', 'hoverPause', 'hoverHighlight', 'autoDismiss', 'pauseOnFocus', 'expandable', 'clickable']);
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
  space: Object.freeze({ size: 'medium', anchor: 'bottom-right', aspectRatio: 'default', gap: 8, margin: 18, layout: 'simple', offset: 0, screenPadding: 0, zIndex: 0 }),
  shape: Object.freeze({ borderRadius: 16, opacity: 0.96, blur: 0, shadow: 'none', borderWidth: 0, borderColor: '#0e1916' }),
  typography: Object.freeze({ titleLines: 1, bodyLines: 4, fontScale: 1.0, lineHeight: 1.55, textOverflow: 'ellipsis' }),
  lifecycle: Object.freeze({ durationMs: 30000, enterDurationMs: 260, holdDurationMs: 30000, exitDurationMs: 200 }),
  interaction: Object.freeze({ dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 30000, hoverPause: 'off', hoverHighlight: 'off', autoDismiss: 'off', pauseOnFocus: 'off', expandable: 'off', clickable: 'off' }),
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
  if (!Number.isInteger(value) || value < min || (max != null && value > max)) {
    throw fail('CARD_VISUAL_FIELD_INVALID', max == null ? `${field} must be an integer >= ${min}` : `${field} must be an integer from ${min} to ${max}`, { field });
  }
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
  for (const key of ['width', 'height']) if (key in value && (!Number.isInteger(value[key]) || value[key] < 1 || value[key] > (key === 'width' ? 1920 : 1080))) throw fail('CARD_VISUAL_DIMENSION_INVALID', `${field}.${key} is out of range`, { field: `${field}.${key}` });
  if ('backgroundColor' in value) validateColor(value.backgroundColor, `${field}.backgroundColor`);
  if ('backgroundAssetId' in value) validateNullableAssetId(value.backgroundAssetId, `${field}.backgroundAssetId`);
  if ('backgroundFit' in value && !CARD_FITS.includes(value.backgroundFit)) throw fail('CARD_VISUAL_FIT_INVALID', `${field}.backgroundFit must be one of: fill, contain, cover`, { field: `${field}.backgroundFit` });
  if ('backgroundPadding' in value) validateInt(value.backgroundPadding, `${field}.backgroundPadding`, 0, 40);
  if ('backgroundScale' in value) validateFloat(value.backgroundScale, `${field}.backgroundScale`, 0.2, 8);
  if ('backgroundX' in value) validateFloat(value.backgroundX, `${field}.backgroundX`, 0, 1);
  if ('backgroundY' in value) validateFloat(value.backgroundY, `${field}.backgroundY`, 0, 1);
  if ('borderRadius' in value) validateInt(value.borderRadius, `${field}.borderRadius`, 0, 480);
  if ('opacity' in value) validateFloat(value.opacity, `${field}.opacity`, 0, 1);
  if ('borderWidth' in value) validateInt(value.borderWidth, `${field}.borderWidth`, 0, 32);
  if ('borderColor' in value) validateColor(value.borderColor, `${field}.borderColor`);
  if ('borderPaint' in value) {
    if (typeof value.borderPaint !== 'string' || !STROKE_PAINTS.includes(value.borderPaint)) {
      throw fail('CARD_VISUAL_FIELD_INVALID', `${field}.borderPaint is invalid`, { field: `${field}.borderPaint` });
    }
  }
  if ('paintOverflow' in value) validateInt(value.paintOverflow, `${field}.paintOverflow`, 0, 240);
}

// ── Properties ──

function validateSpace(value, field) {
  assertKnownFields(value, SPACE_FIELDS, field);
  if ('size' in value && !CARD_SIZES.includes(value.size)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.size is unsupported`, { field: `${field}.size` });
  if ('anchor' in value && !CARD_ANCHORS.includes(value.anchor)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.anchor is unsupported`, { field: `${field}.anchor` });
  if ('grow' in value && !CARD_GROWS.includes(value.grow)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.grow is unsupported`, { field: `${field}.grow` });
  if ('wrap' in value && !CARD_WRAPS.includes(value.wrap)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.wrap is unsupported`, { field: `${field}.wrap` });
  if ('aspectRatio' in value && !CARD_ASPECT_RATIOS.includes(value.aspectRatio)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.aspectRatio is unsupported`, { field: `${field}.aspectRatio` });
  if ('layout' in value && !CARD_LAYOUTS.includes(value.layout)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.layout is unsupported`, { field: `${field}.layout` });
  if ('gap' in value) validateInt(value.gap, `${field}.gap`, 0);
  for (const key of ['margin', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom']) if (key in value) validateInt(value[key], `${field}.${key}`, 0);
  if ('offset' in value) validateInt(value.offset, `${field}.offset`, 0, 200);
  if ('screenPadding' in value) validateInt(value.screenPadding, `${field}.screenPadding`, 0, 96);
  if ('zIndex' in value) validateInt(value.zIndex, `${field}.zIndex`, 0, 9999);
}

function validateShape(value, field) {
  assertKnownFields(value, SHAPE_FIELDS, field);
  if ('borderRadius' in value) validateInt(value.borderRadius, `${field}.borderRadius`, 0, 480);
  if ('opacity' in value) validateFloat(value.opacity, `${field}.opacity`, 0, 1);
  if ('blur' in value) validateFloat(value.blur, `${field}.blur`, 0, 24);
  if ('shadow' in value && !CARD_SHADOWS.includes(value.shadow)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.shadow is unsupported`, { field: `${field}.shadow` });
  if ('borderWidth' in value) validateInt(value.borderWidth, `${field}.borderWidth`, 0, 32);
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
  if ('holdDurationMs' in value) validateInt(value.holdDurationMs, `${field}.holdDurationMs`, 1000, 120000);
  if ('exitDurationMs' in value) validateInt(value.exitDurationMs, `${field}.exitDurationMs`, 50, 2000);
}

function validateInteraction(value, field) {
  assertKnownFields(value, INTERACTION_FIELDS, field);
  if ('dismissMode' in value && !CARD_DISMISS_MODES.includes(value.dismissMode)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.dismissMode is unsupported`, { field: `${field}.dismissMode` });
  if ('closeButtonPosition' in value && !CARD_CLOSE_POSITIONS.includes(value.closeButtonPosition)) throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.closeButtonPosition is unsupported`, { field: `${field}.closeButtonPosition` });
  if ('timeoutMs' in value) validateInt(value.timeoutMs, `${field}.timeoutMs`, 1000, 120000);
  for (const key of ['hoverPause', 'hoverHighlight', 'autoDismiss', 'pauseOnFocus', 'expandable', 'clickable']) if (key in value && value[key] !== 'off' && value[key] !== 'on') throw fail('CARD_VISUAL_PROPERTY_INVALID', `${field}.${key} must be "off" or "on"`, { field: `${field}.${key}` });
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
    if ('borderRadius' in value.decoration) validateInt(value.decoration.borderRadius, `${field}.decoration.borderRadius`, 0, 480);
    if ('opacity' in value.decoration) validateFloat(value.decoration.opacity, `${field}.decoration.opacity`, 0, 1);
    if ('shadow' in value.decoration && !CARD_SHADOWS.includes(value.decoration.shadow)) throw fail('CARD_VISUAL_SKIN_INVALID', `${field}.decoration.shadow is unsupported`, { field: `${field}.decoration.shadow` });
    if ('borderWidth' in value.decoration) validateInt(value.decoration.borderWidth, `${field}.decoration.borderWidth`, 0, 32);
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

function isGlossaryName(name) {
  if (typeof name !== 'string') return false;
  if (name.trim() !== name) return false;
  if (name.length < 1 || name.length > 12) return false;
  if (name.startsWith('#') || HEX_COLOR.test(name)) return false;
  return true;
}
function validatePaintColor(value, field, glossary) {
  if (typeof value !== 'string' || value.length === 0) throw fail('CARD_VISUAL_COLOR_INVALID', `${field} must be a #RRGGBB color`, { field });
  if (HEX_COLOR.test(value)) return;
  if (isGlossaryName(value) && Object.prototype.hasOwnProperty.call(glossary, value) && HEX_COLOR.test(glossary[value])) return;
  throw fail('CARD_VISUAL_COLOR_INVALID', `${field} must be a #RRGGBB color`, { field });
}
function validatePartPaint(value, field, glossary, id) {
  const fitWidthAllowed = id === 'title' || id === 'assistantName';
  const known = TEXT_PART_IDS.includes(id)
    ? [...PART_PAINT_FIELDS, ...TEXT_PART_PAINT_FIELDS, ...(fitWidthAllowed ? ['fitWidth', 'fitCompensate'] : [])]
    : (id === 'icon'
      ? [...PART_PAINT_FIELDS, ...ICON_PART_PAINT_FIELDS]
      : (id === 'close' ? [...PART_PAINT_FIELDS, ...CLOSE_PART_PAINT_FIELDS] : PART_PAINT_FIELDS));
  assertKnownFields(value, known, field);
  if ('fill' in value) validatePaintColor(value.fill, `${field}.fill`, glossary);
  if ('background' in value) validatePaintColor(value.background, `${field}.background`, glossary);
  if ('opacity' in value) validateFloat(value.opacity, `${field}.opacity`, 0, 1);
  if ('stroke' in value) validatePaintColor(value.stroke, `${field}.stroke`, glossary);
  if ('strokeWidth' in value) validateInt(value.strokeWidth, `${field}.strokeWidth`, 0, 32);
  if ('strokePaint' in value) {
    if (typeof value.strokePaint !== 'string' || !STROKE_PAINTS.includes(value.strokePaint)) {
      throw fail('CARD_VISUAL_FIELD_INVALID', `${field}.strokePaint is invalid`, { field: `${field}.strokePaint` });
    }
  }
  if ('backgroundAssetId' in value) validateNullableAssetId(value.backgroundAssetId, `${field}.backgroundAssetId`);
  if ('backgroundFit' in value && !CARD_FITS.includes(value.backgroundFit)) throw fail('CARD_VISUAL_FIT_INVALID', `${field}.backgroundFit must be one of: fill, contain, cover`, { field: `${field}.backgroundFit` });
  if ('backgroundScale' in value) validateFloat(value.backgroundScale, `${field}.backgroundScale`, 0.2, 8);
  if ('backgroundX' in value) validateFloat(value.backgroundX, `${field}.backgroundX`, 0, 1);
  if ('backgroundY' in value) validateFloat(value.backgroundY, `${field}.backgroundY`, 0, 1);
  if ('show' in value) validateBoolean(value.show, `${field}.show`);
  if ('radius' in value) validateInt(value.radius, `${field}.radius`, 0, 240);
  if ('fitWidth' in value) validateBoolean(value.fitWidth, `${field}.fitWidth`);
  if ('fitCompensate' in value) validateBoolean(value.fitCompensate, `${field}.fitCompensate`);
  if (id === 'icon') {
    if ('source' in value && !ICON_SOURCES.includes(value.source)) {
      throw fail('CARD_VISUAL_FIELD_INVALID', `${field}.source is invalid`, { field: `${field}.source` });
    }
    if ('assetId' in value) validateNullableAssetId(value.assetId, `${field}.assetId`);
    if ('backgroundScale' in value) validateFloat(value.backgroundScale, `${field}.backgroundScale`, 0.2, 8);
    if ('backgroundX' in value) validateFloat(value.backgroundX, `${field}.backgroundX`, 0, 1);
    if ('backgroundY' in value) validateFloat(value.backgroundY, `${field}.backgroundY`, 0, 1);
  }
  if ('fontSize' in value) validateInt(value.fontSize, `${field}.fontSize`, 8, 72);
  if ('fontFamily' in value) {
    if (typeof value.fontFamily !== 'string' || !FONT_FAMILIES.includes(value.fontFamily)) {
      throw fail('CARD_VISUAL_FIELD_INVALID', `${field}.fontFamily is invalid`, { field: `${field}.fontFamily` });
    }
  }
  if ('fontAssetId' in value) validateNullableAssetId(value.fontAssetId, `${field}.fontAssetId`);
  if ('textPaint' in value) {
    if (typeof value.textPaint !== 'string' || !TEXT_PAINTS.includes(value.textPaint)) {
      throw fail('CARD_VISUAL_FIELD_INVALID', `${field}.textPaint is invalid`, { field: `${field}.textPaint` });
    }
  }
  for (const key of ['fontBold', 'fontItalic', 'fontUnderline', 'fontStrike']) {
    if (key in value) validateBoolean(value[key], `${field}.${key}`);
  }
  if ('textStroke' in value) validateBoolean(value.textStroke, `${field}.textStroke`);
  if ('textStrokeColor' in value) validateColor(value.textStrokeColor, `${field}.textStrokeColor`);
  if ('textStrokeWidth' in value) validateInt(value.textStrokeWidth, `${field}.textStrokeWidth`, 1, 16);
  if ('textStrokePaint' in value) {
    if (typeof value.textStrokePaint !== 'string' || !TEXT_STROKE_PAINTS.includes(value.textStrokePaint)) {
      throw fail('CARD_VISUAL_FIELD_INVALID', `${field}.textStrokePaint is invalid`, { field: `${field}.textStrokePaint` });
    }
  }
  if (id === 'close') {
    if ('closeIcon' in value && (typeof value.closeIcon !== 'string' || !CLOSE_ICONS.includes(value.closeIcon))) {
      throw fail('CARD_VISUAL_FIELD_INVALID', `${field}.closeIcon is invalid`, { field: `${field}.closeIcon` });
    }
    if ('closeIconColor' in value) validateColor(value.closeIconColor, `${field}.closeIconColor`);
  }
}
function normalizeGlossary(value, field) {
  if (value === undefined) return {};
  if (!plain(value)) throw fail('CARD_VISUAL_FIELD_INVALID', `${field} must be a plain object`, { field });
  const names = Object.keys(value);
  if (names.length > 8) throw fail('CARD_VISUAL_FIELD_INVALID', `${field} can have at most 8 names`, { field });
  const glossary = {};
  for (const name of names) {
    if (!isGlossaryName(name)) throw fail('CARD_VISUAL_FIELD_INVALID', `${field} name is invalid`, { field: `${field}.${name}` });
    validateColor(value[name], `${field}.${name}`);
    glossary[name] = value[name];
  }
  return glossary;
}
function normalizeParts(value, field, glossary = {}) {
  if (value === undefined) return {};
  if (!plain(value)) throw fail('CARD_VISUAL_FIELD_INVALID', `${field} must be a plain object`, { field });
  assertKnownFields(value, PART_IDS, field);
  const parts = {};
  for (const id of PART_IDS) {
    if (!(id in value)) continue;
    if (!plain(value[id])) throw fail('CARD_VISUAL_FIELD_INVALID', `${field}.${id} must be a plain object`, { field: `${field}.${id}` });
    validatePartPaint(value[id], `${field}.${id}`, glossary, id);
    const paint = {};
    if (typeof value[id].fill === 'string' && value[id].fill.length > 0) paint.fill = value[id].fill;
    if (typeof value[id].background === 'string' && value[id].background.length > 0) paint.background = value[id].background;
    if (typeof value[id].opacity === 'number') paint.opacity = value[id].opacity;
    if (typeof value[id].stroke === 'string' && value[id].stroke.length > 0) paint.stroke = value[id].stroke;
    if (Number.isInteger(value[id].strokeWidth) && value[id].strokeWidth >= 0) paint.strokeWidth = value[id].strokeWidth;
    if (value[id].strokePaint === 'gradient') paint.strokePaint = 'gradient';
    if ('x' in value[id]) {
      validateInt(value[id].x, `${field}.${id}.x`, 0, 1920);
      paint.x = value[id].x;
    }
    if ('y' in value[id]) {
      validateInt(value[id].y, `${field}.${id}.y`, 0, 1080);
      paint.y = value[id].y;
    }
    if ('w' in value[id]) {
      validateInt(value[id].w, `${field}.${id}.w`, 1, 1920);
      paint.w = value[id].w;
    }
    if ('h' in value[id]) {
      validateInt(value[id].h, `${field}.${id}.h`, 1, 1080);
      paint.h = value[id].h;
    }
    if (Number.isInteger(value[id].radius) && value[id].radius >= 0) paint.radius = value[id].radius;
    if (id === 'icon' || id === 'assistantName') {
      if (typeof value[id].show === 'boolean') paint.show = value[id].show;
    } else if (value[id].show === false) {
      paint.show = false;
    }
    if (id === 'icon') {
      const source = value[id].source === 'custom' ? 'custom' : 'assistant';
      paint.source = source;
      if (source === 'custom') paint.assetId = value[id].assetId ?? null;
      else paint.assetId = null;
      if (typeof value[id].backgroundScale === 'number') paint.backgroundScale = value[id].backgroundScale;
      if (typeof value[id].backgroundX === 'number') paint.backgroundX = value[id].backgroundX;
      if (typeof value[id].backgroundY === 'number') paint.backgroundY = value[id].backgroundY;
    }
    if (id !== 'icon') {
      if (typeof value[id].backgroundAssetId === 'string' && value[id].backgroundAssetId.length > 0) paint.backgroundAssetId = value[id].backgroundAssetId;
      if (typeof value[id].backgroundFit === 'string' && value[id].backgroundFit) paint.backgroundFit = value[id].backgroundFit;
      if (typeof value[id].backgroundScale === 'number') paint.backgroundScale = value[id].backgroundScale;
      if (typeof value[id].backgroundX === 'number') paint.backgroundX = value[id].backgroundX;
      if (typeof value[id].backgroundY === 'number') paint.backgroundY = value[id].backgroundY;
    }
    if (id === 'title' || id === 'assistantName') {
      if (value[id].fitWidth === true) paint.fitWidth = true;
      if (value[id].fitCompensate === true) paint.fitCompensate = true;
    }
    if (TEXT_PART_IDS.includes(id)) {
      if (Number.isInteger(value[id].fontSize)) paint.fontSize = value[id].fontSize;
      if (typeof value[id].fontFamily === 'string' && value[id].fontFamily) paint.fontFamily = value[id].fontFamily;
      if (typeof value[id].fontAssetId === 'string' && value[id].fontAssetId) paint.fontAssetId = value[id].fontAssetId;
      if (typeof value[id].textPaint === 'string' && value[id].textPaint) paint.textPaint = value[id].textPaint;
      for (const key of ['fontBold', 'fontItalic', 'fontUnderline', 'fontStrike']) {
        if (typeof value[id][key] === 'boolean') paint[key] = value[id][key];
      }
      if (value[id].textStroke === true) {
        paint.textStroke = true;
        if (typeof value[id].textStrokeColor === 'string' && HEX_COLOR.test(value[id].textStrokeColor)) {
          paint.textStrokeColor = value[id].textStrokeColor;
        }
        if (Number.isInteger(value[id].textStrokeWidth) && value[id].textStrokeWidth >= 1) {
          paint.textStrokeWidth = value[id].textStrokeWidth;
        }
        if (value[id].textStrokePaint === 'rainbow') paint.textStrokePaint = 'rainbow';
      }
    }
    if (id === 'close') {
      if (typeof value[id].closeIcon === 'string' && value[id].closeIcon && value[id].closeIcon !== 'x') {
        paint.closeIcon = value[id].closeIcon;
      }
      if (typeof value[id].closeIconColor === 'string' && HEX_COLOR.test(value[id].closeIconColor)) {
        paint.closeIconColor = value[id].closeIconColor;
      }
    }
    if (Object.keys(paint).length > 0) parts[id] = paint;
  }
  return parts;
}

// ── Normalize ──

function normalizeType(value, type) {
  assertKnownFields(value, TYPE_FIELDS, `card.types.${type}`);
  if ('appearance' in value) validateAppearance(value.appearance, `card.types.${type}.appearance`);
  if ('properties' in value) validatePropertiesSub(value.properties, `card.types.${type}.properties`);
  if ('skin' in value) validateSkin(value.skin, `card.types.${type}.skin`);
  if ('effects' in value) validateEffects(value.effects, `card.types.${type}.effects`);
  const glossary = normalizeGlossary(value.glossary, `card.types.${type}.glossary`);
  const parts = normalizeParts(value.parts, `card.types.${type}.parts`, glossary);
  const defaults = CARD_TYPE_DEFAULTS[type] ?? MINIMAL_CARD_DEFAULTS;
  const appearance = { ...clone(defaults.appearance), ...clone(value.appearance ?? {}) };
  const properties = { ...clone(PROPERTIES_DEFAULTS), ...clone(value.properties ?? {}) };
  const skin = { ...clone(SKIN_DEFAULTS), ...clone(value.skin ?? {}) };
  const effects = { ...clone(EFFECT_DEFAULTS), ...clone(value.effects ?? {}) };
  const next = { appearance, properties, skin, effects };
  if (Object.keys(parts).length > 0) next.parts = parts;
  if (Object.keys(glossary).length > 0) next.glossary = glossary;
  return next;
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