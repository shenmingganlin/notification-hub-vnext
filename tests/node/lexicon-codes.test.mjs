import assert from 'node:assert/strict';
import test from 'node:test';

import { lexiconCodeFor, withLexiconCode } from '../../plugin/domain/lexicon-codes.js';

test('old VISUAL_BEHAVIOR codes map to flight lexicon codes', () => {
  assert.equal(lexiconCodeFor('VISUAL_BEHAVIOR_LAYOUT_FAILED'), 'FLIGHT_LAYOUT_FAILED');
  assert.equal(lexiconCodeFor('VISUAL_BEHAVIOR_UNAVAILABLE'), 'FLIGHT_UNAVAILABLE');
  assert.equal(lexiconCodeFor('CHARTER_FIELD_INVALID'), 'CHARTER_FIELD_INVALID');
});

test('withLexiconCode stamps the new code without replacing the old one', () => {
  const error = withLexiconCode(Object.assign(new Error('layout failed'), { code: 'VISUAL_BEHAVIOR_LAYOUT_FAILED' }));
  assert.equal(error.code, 'VISUAL_BEHAVIOR_LAYOUT_FAILED');
  assert.equal(error.lexiconCode, 'FLIGHT_LAYOUT_FAILED');
});
