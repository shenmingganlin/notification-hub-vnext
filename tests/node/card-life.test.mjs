import assert from 'node:assert/strict';
import test from 'node:test';

import { createCardLife } from '../../plugin/domain/card-life.js';

test('card life defaults to a non-negative stay duration', () => {
  assert.deepEqual(createCardLife(), { durationMs: 5000 });
  assert.equal(createCardLife({ durationMs: 0 }).durationMs, 0);
});

test('card life rejects unknown fields and invalid duration', () => {
  assert.throws(() => createCardLife({ durationMs: -1 }), (error) => (
    error.code === 'LIFE_FIELD_INVALID'
    && error.details.field === 'life.durationMs'
    && error.details.expected === 'integer >= 0'
    && error.details.actual === -1
  ));
  assert.throws(() => createCardLife({ maxVisible: 8 }), (error) => (
    error.code === 'LIFE_FIELD_UNKNOWN'
    && error.details.field === 'life.maxVisible'
  ));
  assert.throws(() => createCardLife([]), (error) => error.code === 'LIFE_INVALID');
});
