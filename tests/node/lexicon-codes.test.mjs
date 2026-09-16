import assert from 'node:assert/strict';
import test from 'node:test';

import { lexiconAliasesUsed, lexiconCodeFor, withLexiconCode } from '../../plugin/domain/lexicon-codes.js';

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

test('old keys without the new name note LEXICON_ALIAS_USED', () => {
  const notes = lexiconAliasesUsed({ behaviorId: 'ticker', behaviorChannelId: 'visual.event.ticker' });
  assert.deepEqual(notes.map((note) => note.field), ['behaviorId', 'behaviorChannelId']);
  assert.equal(notes[0].code, 'LEXICON_ALIAS_USED');
  assert.equal(notes[0].expected, 'flight');
});

test('paired old and new keys are not logged as aliases', () => {
  assert.deepEqual(lexiconAliasesUsed({
    behaviorId: 'stack',
    flight: 'stack',
    behaviorChannelId: 'visual.event.stack',
    flightChannelId: 'visual.event.stack'
  }), []);
});
