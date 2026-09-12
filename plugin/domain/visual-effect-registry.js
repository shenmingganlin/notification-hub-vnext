import { createCardEffect, EFFECT_DEFAULTS } from './card-visual-settings.js';

const EFFECT_CONFIG_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

function registryError(code, message, details = {}) { return Object.assign(new Error(message), { code, details }); }
function text(value, field) { if (typeof value !== 'string' || !EFFECT_CONFIG_ID_PATTERN.test(value.trim())) throw registryError('VISUAL_EFFECT_ID_INVALID', `${field} must be a safe effect config id`, { field }); return value.trim(); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function clone(value) { return Array.isArray(value) ? value.map(clone) : plain(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export function createEffectRegistry(initial = {}) {
  const effects = new Map();
  if (plain(initial)) {
    for (const [id, effectData] of Object.entries(initial)) {
      const normalized = register(id, effectData);
      effects.set(id, normalized);
    }
  }
  if (!effects.has('effect.none')) {
    effects.set('effect.none', freeze(createCardEffect()));
  }

  function register(effectConfigId, effectData) {
    const id = text(effectConfigId, 'effectConfigId');
    if (!plain(effectData)) throw registryError('VISUAL_EFFECT_INVALID', 'effect data must be a plain object', { field: 'effect' });
    const normalized = createCardEffect({ ...clone(effectData), effectConfigId: id });
    effects.set(id, freeze(normalized));
    return normalized;
  }

  function get(effectConfigId) {
    if (effectConfigId === null || effectConfigId === undefined) return effects.get('effect.none') ?? null;
    return effects.get(effectConfigId) ?? null;
  }

  function has(effectConfigId) {
    return typeof effectConfigId === 'string' && effects.has(effectConfigId);
  }

  function remove(effectConfigId) {
    if (effectConfigId === 'effect.none') throw registryError('VISUAL_EFFECT_DEFAULT_PROTECTED', 'Cannot remove the default effect config', { effectConfigId });
    if (!effects.has(effectConfigId)) throw registryError('VISUAL_EFFECT_NOT_FOUND', `Unknown effect config: ${effectConfigId}`, { effectConfigId });
    const removed = effects.get(effectConfigId);
    effects.delete(effectConfigId);
    return freeze(clone(removed));
  }

  function list() {
    return freeze([...effects.entries()].map(([id, effect]) => ({ id, ...clone(effect) })));
  }

  function snapshot() {
    const result = {};
    for (const [id, effect] of effects) {
      result[id] = clone(effect);
    }
    return result;
  }

  function restore(snapshot) {
    if (!plain(snapshot)) throw registryError('VISUAL_EFFECT_SNAPSHOT_INVALID', 'snapshot must be a plain object');
    effects.clear();
    for (const [id, effectData] of Object.entries(snapshot)) {
      const normalized = createCardEffect({ ...clone(effectData), effectConfigId: id });
      effects.set(id, freeze(normalized));
    }
    if (!effects.has('effect.none')) {
      effects.set('effect.none', freeze(createCardEffect()));
    }
  }

  return freeze({ register, get, has, remove, list, snapshot, restore });
}

export const EFFECT_REGISTRY_DEFAULTS = createEffectRegistry();