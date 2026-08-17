export const CARD_TYPES = Object.freeze(['minimal', 'danmaku', 'popup']);
export const IMPLEMENTED_CARD_TYPES = Object.freeze(['minimal']);
export const CARD_LAYOUTS = Object.freeze(['simple']);
export const CARD_BOUNDARIES = Object.freeze(['work-area']);
export const CARD_SIZES = Object.freeze(['small', 'medium', 'large']);
export const CARD_ASPECT_RATIOS = Object.freeze(['default', 'square', 'wide']);

const CARD_SETTINGS_FIELDS = Object.freeze(['activeType', 'types']);
const TYPE_FIELDS = Object.freeze(['behavior', 'appearance']);
const BEHAVIOR_FIELDS = Object.freeze(['layout', 'boundary']);
const APPEARANCE_FIELDS = Object.freeze(['size', 'aspectRatio', 'backgroundColor', 'borderRadius', 'opacity']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const MINIMAL_CARD_DEFAULTS = Object.freeze({
  behavior: Object.freeze({ layout: 'simple', boundary: 'work-area' }),
  appearance: Object.freeze({
    size: 'medium',
    aspectRatio: 'default',
    backgroundColor: '#0e1916',
    borderRadius: 16,
    opacity: 0.96
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
function validateBehavior(value, field) {
  assertKnownFields(value, BEHAVIOR_FIELDS, field);
  if ('layout' in value && !CARD_LAYOUTS.includes(value.layout)) throw fail('CARD_VISUAL_LAYOUT_INVALID', `${field}.layout is unsupported`, { field: `${field}.layout` });
  if ('boundary' in value && !CARD_BOUNDARIES.includes(value.boundary)) throw fail('CARD_VISUAL_BOUNDARY_INVALID', `${field}.boundary is unsupported`, { field: `${field}.boundary` });
}
function validateAppearance(value, field) {
  assertKnownFields(value, APPEARANCE_FIELDS, field);
  if ('size' in value && !CARD_SIZES.includes(value.size)) throw fail('CARD_VISUAL_SIZE_INVALID', `${field}.size is unsupported`, { field: `${field}.size` });
  if ('aspectRatio' in value && !CARD_ASPECT_RATIOS.includes(value.aspectRatio)) throw fail('CARD_VISUAL_ASPECT_RATIO_INVALID', `${field}.aspectRatio is unsupported`, { field: `${field}.aspectRatio` });
  if ('backgroundColor' in value && (typeof value.backgroundColor !== 'string' || !HEX_COLOR.test(value.backgroundColor))) throw fail('CARD_VISUAL_COLOR_INVALID', `${field}.backgroundColor must be a #RRGGBB color`, { field: `${field}.backgroundColor` });
  if ('borderRadius' in value && (!Number.isInteger(value.borderRadius) || value.borderRadius < 0 || value.borderRadius > 48)) throw fail('CARD_VISUAL_RADIUS_INVALID', `${field}.borderRadius must be an integer from 0 to 48`, { field: `${field}.borderRadius` });
  if ('opacity' in value && (typeof value.opacity !== 'number' || !Number.isFinite(value.opacity) || value.opacity < 0.3 || value.opacity > 1)) throw fail('CARD_VISUAL_OPACITY_INVALID', `${field}.opacity must be between 0.3 and 1`, { field: `${field}.opacity` });
}

function normalizeType(value, type) {
  assertKnownFields(value, TYPE_FIELDS, `card.types.${type}`);
  if ('behavior' in value) validateBehavior(value.behavior, `card.types.${type}.behavior`);
  if ('appearance' in value) validateAppearance(value.appearance, `card.types.${type}.appearance`);
  if (type !== 'minimal' && Object.keys(value).length > 0) throw fail('CARD_VISUAL_TYPE_NOT_IMPLEMENTED', `Card type ${type} is not implemented`, { field: `card.types.${type}` });
  return {
    behavior: { ...clone(MINIMAL_CARD_DEFAULTS.behavior), ...clone(value.behavior ?? {}) },
    appearance: { ...clone(MINIMAL_CARD_DEFAULTS.appearance), ...clone(value.appearance ?? {}) }
  };
}

export function createCardVisualSettings(input = {}) {
  if (!plain(input)) throw fail('CARD_VISUAL_FIELD_INVALID', 'card must be a plain object', { field: 'card' });
  assertKnownFields(input, CARD_SETTINGS_FIELDS, 'card');
  const activeType = input.activeType ?? 'minimal';
  if (!CARD_TYPES.includes(activeType)) throw fail('CARD_VISUAL_TYPE_INVALID', `Unknown card type: ${activeType}`, { field: 'card.activeType' });
  if (activeType !== 'minimal') throw fail('CARD_VISUAL_TYPE_NOT_IMPLEMENTED', `Card type ${activeType} is not implemented`, { field: 'card.activeType' });
  if ('types' in input) {
    if (!plain(input.types)) throw fail('CARD_VISUAL_FIELD_INVALID', 'card.types must be a plain object', { field: 'card.types' });
    for (const type of Object.keys(input.types)) {
      if (!CARD_TYPES.includes(type)) throw fail('CARD_VISUAL_TYPE_INVALID', `Unknown card type: ${type}`, { field: `card.types.${type}` });
      normalizeType(input.types[type], type);
    }
  }
  const minimal = normalizeType(input.types?.minimal ?? {}, 'minimal');
  return freeze({ activeType: 'minimal', types: { minimal } });
}

export function cardVisualDefaults() {
  return createCardVisualSettings();
}
