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
