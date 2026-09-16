export const LEXICON_CODE_ALIASES = Object.freeze({
  VISUAL_BEHAVIOR_LAYOUT_FAILED: 'FLIGHT_LAYOUT_FAILED',
  VISUAL_BEHAVIOR_UNAVAILABLE: 'FLIGHT_UNAVAILABLE',
  VISUAL_BEHAVIOR_ID_INVALID: 'FLIGHT_ID_INVALID',
  VISUAL_BEHAVIOR_FIELD_INVALID: 'FLIGHT_FIELD_INVALID',
  VISUAL_BEHAVIOR_FIELD_UNKNOWN: 'FLIGHT_FIELD_UNKNOWN',
  VISUAL_BEHAVIOR_INVALID: 'FLIGHT_INVALID',
  VISUAL_BEHAVIOR_LIFECYCLE_INVALID: 'LIFE_INVALID',
  VISUAL_BEHAVIOR_PROPERTIES_INVALID: 'FLIGHT_PROPERTIES_INVALID'
});

export function lexiconCodeFor(code) {
  return LEXICON_CODE_ALIASES[code] ?? code;
}

export function withLexiconCode(error) {
  if (!error || typeof error !== 'object') return error;
  const mapped = LEXICON_CODE_ALIASES[error.code];
  if (mapped && error.lexiconCode === undefined) error.lexiconCode = mapped;
  return error;
}

export const LEXICON_KEY_ALIASES = Object.freeze([
  Object.freeze({ used: 'behaviorId', canonical: 'flight' }),
  Object.freeze({ used: 'behaviorProfileId', canonical: 'flight' }),
  Object.freeze({ used: 'behaviorChannelId', canonical: 'flightChannelId' }),
  Object.freeze({ used: 'behaviorChannels', canonical: 'flightChannels' })
]);

export function lexiconAliasesUsed(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
  const notes = [];
  for (const { used, canonical } of LEXICON_KEY_ALIASES) {
    if (!Object.prototype.hasOwnProperty.call(input, used)) continue;
    if (Object.prototype.hasOwnProperty.call(input, canonical)) continue;
    notes.push(Object.freeze({
      code: 'LEXICON_ALIAS_USED',
      field: used,
      expected: canonical,
      actual: used
    }));
  }
  return notes;
}
