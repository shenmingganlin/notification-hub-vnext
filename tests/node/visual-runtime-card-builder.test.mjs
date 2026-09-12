import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisualRuntimeCardBuilder } from '../../plugin/domain/visual-runtime-card-builder.js';

test('card builder validates promotion context and delegates construction', () => {
  const builder = createVisualRuntimeCardBuilder({ buildCard: ({ record }) => ({ id: record.notificationId }) });
  assert.deepEqual(builder.build({ record: { notificationId: 'n1' }, health: {}, layout: {} }), { id: 'n1' });
  assert.throws(() => builder.build({ record: {}, health: {}, layout: {} }), /notificationId/);
  assert.throws(() => builder.build({ record: { notificationId: 'n1' }, health: null, layout: {} }), /health and layout/);
});
