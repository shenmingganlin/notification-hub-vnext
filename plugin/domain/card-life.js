import { lexiconError } from './lexicon-error.js';

const LIFE_FIELDS = Object.freeze(['durationMs']);

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const CARD_LIFE_DEFAULTS = Object.freeze({
  durationMs: 5000
});

export function createCardLife(input = {}) {
  if (!plain(input)) {
    throw lexiconError('LIFE_INVALID', 'card life must be a plain object', { field: 'life', actual: input });
  }
  for (const key of Object.keys(input)) {
    if (!LIFE_FIELDS.includes(key)) {
      throw lexiconError('LIFE_FIELD_UNKNOWN', `Unknown card life field: ${key}`, {
        field: `life.${key}`,
        expected: LIFE_FIELDS.join('|'),
        actual: key
      });
    }
  }
  const durationMs = input.durationMs === undefined ? CARD_LIFE_DEFAULTS.durationMs : input.durationMs;
  if (!Number.isInteger(durationMs) || durationMs < 0) {
    throw lexiconError('LIFE_FIELD_INVALID', 'durationMs must be a non-negative integer', {
      field: 'life.durationMs',
      expected: 'integer >= 0',
      actual: input.durationMs
    });
  }
  return freeze({ durationMs });
}
