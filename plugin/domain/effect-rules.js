import { getEventDefinition, listEventDefinitions } from './notification-event-catalog.js';
import { VISUAL_INTENSITIES, VISUAL_PRESETS } from './visual-settings.js';
import { normalizeSoundId } from './custom-sound-asset.js';

const RULE_KINDS = Object.freeze(['sound', 'visual']);

function fail(code, message, field) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field } : {};
  return error;
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
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

function requireKind(kind) {
  if (!RULE_KINDS.includes(kind)) throw fail('EFFECT_RULE_KIND_INVALID', `Unsupported effect rule kind: ${kind}`, 'kind');
  return kind;
}

function requireText(field, value) {
  if (typeof value !== 'string' || !value.trim()) throw fail('EFFECT_RULE_FIELD_INVALID', `${field} must be a non-empty string`, field);
  return value.trim();
}

function normalizeTargets(eventIds) {
  if (!Array.isArray(eventIds) || eventIds.length === 0) throw fail('EFFECT_RULE_TARGET_INVALID', 'eventIds must be a non-empty array', 'eventIds');
  const normalized = [...new Set(eventIds.map((eventId) => requireText('eventIds[]', eventId)))];
  normalized.forEach((eventId) => {
    const definition = getEventDefinition(eventId);
    if (!definition.presentationEligible) throw fail('EFFECT_RULE_TARGET_NOT_PRESENTATION_ELIGIBLE', `Event cannot receive a presentation rule: ${eventId}`, 'eventIds');
  });
  return normalized;
}

function normalizeEffect(effect, kind) {
  if (!plain(effect)) throw fail('EFFECT_RULE_EFFECT_INVALID', 'effect must be a plain object', 'effect');
  if (kind === 'sound') {
    const soundId = normalizeSoundId(requireText('effect.soundId', effect.soundId));
    const volume = effect.volume === undefined ? 1 : effect.volume;
    if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 1) throw fail('EFFECT_RULE_VOLUME_INVALID', 'effect.volume must be between 0 and 1', 'effect.volume');
    return { soundId, volume };
  }
  if (!VISUAL_PRESETS.includes(effect.preset)) throw fail('EFFECT_RULE_PRESET_INVALID', 'effect.preset is unsupported', 'effect.preset');
  const intensity = effect.intensity === undefined ? 'balanced' : effect.intensity;
  if (!VISUAL_INTENSITIES.includes(intensity)) throw fail('EFFECT_RULE_INTENSITY_INVALID', 'effect.intensity is unsupported', 'effect.intensity');
  return { preset: effect.preset, intensity };
}

export function createEffectRule(input = {}, kind) {
  requireKind(kind);
  if (!plain(input)) throw fail('EFFECT_RULE_INVALID', 'rule must be a plain object', 'rule');
  const id = requireText('id', input.id);
  const name = requireText('name', input.name);
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw fail('EFFECT_RULE_FIELD_INVALID', 'enabled must be boolean', 'enabled');
  return freeze({ id, name, enabled: input.enabled !== false, eventIds: normalizeTargets(input.eventIds), effect: freeze(normalizeEffect(input.effect, kind)) });
}

export function createEffectRules(input = [], kind) {
  requireKind(kind);
  if (!Array.isArray(input)) throw fail('EFFECT_RULES_INVALID', 'rules must be an array', 'rules');
  const ids = new Set();
  const rules = input.map((rule) => {
    const normalized = createEffectRule(rule, kind);
    if (ids.has(normalized.id)) throw fail('EFFECT_RULE_DUPLICATE', `duplicate effect rule id: ${normalized.id}`, 'id');
    ids.add(normalized.id);
    return normalized;
  });
  return freeze(rules);
}

export function upsertEffectRule(rules, rule, kind) {
  const normalized = createEffectRule(rule, kind);
  const current = createEffectRules(rules, kind);
  const index = current.findIndex((item) => item.id === normalized.id);
  const next = [...current];
  if (index < 0) next.push(normalized);
  else next[index] = normalized;
  return createEffectRules(next, kind);
}

export function removeEffectRule(rules, ruleId, kind) {
  const current = createEffectRules(rules, kind);
  const id = requireText('ruleId', ruleId);
  return createEffectRules(current.filter((rule) => rule.id !== id), kind);
}

export function resolveEffectRule(rules, eventId, kind) {
  requireKind(kind);
  const id = requireText('eventId', eventId);
  getEventDefinition(id);
  return createEffectRules(rules, kind).find((rule) => rule.enabled && rule.eventIds.includes(id)) ?? null;
}

export function listEffectRuleTargets() {
  return Object.freeze(listEventDefinitions({ presentationEligible: true }).map((definition) => ({
    eventId: definition.eventId,
    categoryId: definition.categoryId,
    label: definition.label
  })));
}

export { RULE_KINDS };
