export const CARD_TYPE_IDS = Object.freeze(['minimal', 'message', 'detail', 'progress', 'character', 'system']);

const ROOT_FIELDS = Object.freeze(['cardTypeId', 'contentSlots', 'textLayout', 'interactionSlots', 'propertiesId', 'skinId', 'effectConfigId']);
const SLOT_FIELDS = Object.freeze(['assistantName', 'avatar', 'icon', 'title', 'body', 'metadata', 'actions', 'status', 'progress']);
const TEXT_FIELDS = Object.freeze(['titleMaxLines', 'bodyMaxLines', 'assistantNamePosition']);
const INTERACTION_FIELDS = Object.freeze(['closeButton', 'expandButton']);

function error(code, message, field) { return Object.assign(new Error(message), { code, details: field ? { field } : {} }); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function text(field, value) { if (typeof value !== 'string' || !value.trim()) throw error('CARD_COMPOSITION_FIELD_INVALID', `${field} must be a non-empty string`, field); return value.trim(); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function validateObject(value, fields, field) { if (!plain(value)) throw error('CARD_COMPOSITION_FIELD_INVALID', `${field} must be a plain object`, field); for (const key of Object.keys(value)) if (!fields.includes(key)) throw error('CARD_COMPOSITION_FIELD_UNKNOWN', `Unknown ${field} field: ${key}`, `${field}.${key}`); }

export function createCardCompositionContract(input = {}) {
  if (!plain(input)) throw error('CARD_COMPOSITION_INVALID', 'composition must be a plain object', 'composition');
  for (const key of Object.keys(input)) if (!ROOT_FIELDS.includes(key)) throw error('CARD_COMPOSITION_FIELD_UNKNOWN', `Unknown composition field: ${key}`, key);
  const cardTypeId = text('cardTypeId', input.cardTypeId ?? 'minimal');
  if (!CARD_TYPE_IDS.includes(cardTypeId)) throw error('CARD_COMPOSITION_TYPE_INVALID', `Unsupported card type: ${cardTypeId}`, 'cardTypeId');
  const contentSlots = input.contentSlots ?? {};
  validateObject(contentSlots, SLOT_FIELDS, 'contentSlots');
  for (const [key, value] of Object.entries(contentSlots)) if (typeof value !== 'boolean') throw error('CARD_COMPOSITION_SLOT_INVALID', `${key} must be boolean`, `contentSlots.${key}`);
  const textLayout = input.textLayout ?? {};
  validateObject(textLayout, TEXT_FIELDS, 'textLayout');
  const interactionSlots = input.interactionSlots ?? {};
  validateObject(interactionSlots, INTERACTION_FIELDS, 'interactionSlots');
  for (const [key, value] of Object.entries(interactionSlots)) if (typeof value !== 'boolean') throw error('CARD_COMPOSITION_SLOT_INVALID', `${key} must be boolean`, `interactionSlots.${key}`);
  return freeze({
    cardTypeId,
    contentSlots: { title: true, body: true, ...contentSlots },
    textLayout: { titleMaxLines: 1, bodyMaxLines: 4, assistantNamePosition: 'header', ...textLayout },
    interactionSlots: { closeButton: true, expandButton: false, ...interactionSlots },
    propertiesId: text('propertiesId', input.propertiesId ?? `${cardTypeId}.default`),
    skinId: text('skinId', input.skinId ?? 'skin.default'),
    effectConfigId: text('effectConfigId', input.effectConfigId ?? 'effect.none')
  });
}
