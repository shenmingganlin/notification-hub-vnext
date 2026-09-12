import { createCardSkin, SKIN_DEFAULTS } from './card-visual-settings.js';

const SKIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

function registryError(code, message, details = {}) { return Object.assign(new Error(message), { code, details }); }
function text(value, field) { if (typeof value !== 'string' || !SKIN_ID_PATTERN.test(value.trim())) throw registryError('VISUAL_SKIN_ID_INVALID', `${field} must be a safe skin id`, { field }); return value.trim(); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function clone(value) { return Array.isArray(value) ? value.map(clone) : plain(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export function createSkinRegistry(initial = {}) {
  const skins = new Map();
  if (plain(initial)) {
    for (const [id, skinData] of Object.entries(initial)) {
      const normalized = register(id, skinData);
      skins.set(id, normalized);
    }
  }
  if (!skins.has('skin.default')) {
    skins.set('skin.default', freeze(createCardSkin()));
  }

  function register(skinId, skinData) {
    const id = text(skinId, 'skinId');
    if (!plain(skinData)) throw registryError('VISUAL_SKIN_INVALID', 'skin data must be a plain object', { field: 'skin' });
    const normalized = createCardSkin({ ...clone(skinData), skinId: id });
    skins.set(id, freeze(normalized));
    return normalized;
  }

  function get(skinId) {
    if (skinId === null || skinId === undefined) return skins.get('skin.default') ?? null;
    return skins.get(skinId) ?? null;
  }

  function has(skinId) {
    return typeof skinId === 'string' && skins.has(skinId);
  }

  function remove(skinId) {
    if (skinId === 'skin.default') throw registryError('VISUAL_SKIN_DEFAULT_PROTECTED', 'Cannot remove the default skin', { skinId });
    if (!skins.has(skinId)) throw registryError('VISUAL_SKIN_NOT_FOUND', `Unknown skin: ${skinId}`, { skinId });
    const removed = skins.get(skinId);
    skins.delete(skinId);
    return freeze(clone(removed));
  }

  function list() {
    return freeze([...skins.entries()].map(([id, skin]) => ({ id, ...clone(skin) })));
  }

  function snapshot() {
    const result = {};
    for (const [id, skin] of skins) {
      result[id] = clone(skin);
    }
    return result;
  }

  function restore(snapshot) {
    if (!plain(snapshot)) throw registryError('VISUAL_SKIN_SNAPSHOT_INVALID', 'snapshot must be a plain object');
    skins.clear();
    for (const [id, skinData] of Object.entries(snapshot)) {
      const normalized = createCardSkin({ ...clone(skinData), skinId: id });
      skins.set(id, freeze(normalized));
    }
    if (!skins.has('skin.default')) {
      skins.set('skin.default', freeze(createCardSkin()));
    }
  }

  return freeze({ register, get, has, remove, list, snapshot, restore });
}

export const SKIN_REGISTRY_DEFAULTS = createSkinRegistry();