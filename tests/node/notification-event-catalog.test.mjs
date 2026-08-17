import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVENT_CATEGORIES,
  EVENT_DEFINITIONS,
  assertEventDefinition,
  getEventDefinition,
  listEventDefinitions,
  resolveEventId
} from '../../plugin/domain/notification-event-catalog.js';

test('event catalog exposes one stable identity per built-in event', () => {
  assert.ok(EVENT_CATEGORIES.includes('tool'));
  assert.equal(resolveEventId({ categoryId: 'tool', eventTypeId: 'execution.failed' }), 'tool.execution.failed');
  assert.equal(getEventDefinition('tool.execution.failed').categoryId, 'tool');
  assert.equal(getEventDefinition('tool.execution.failed').eventTypeId, 'execution.failed');
  assert.equal(EVENT_DEFINITIONS['chat.assistant_reply.completed'].presentationEligible, true);
});

test('event catalog rejects category-prefixed or unknown event types', () => {
  assert.throws(
    () => resolveEventId({ categoryId: 'tool', eventTypeId: 'tool.execution.failed' }),
    (error) => error.code === 'NOTIFICATION_EVENT_TYPE_NOT_RELATIVE'
  );
  assert.throws(
    () => resolveEventId({ categoryId: 'tool', eventTypeId: 'error.failed' }),
    (error) => error.code === 'NOTIFICATION_EVENT_UNKNOWN'
  );
  assert.throws(
    () => assertEventDefinition('tool.error.failed'),
    (error) => error.code === 'NOTIFICATION_EVENT_UNKNOWN'
  );
});

test('delivery and runtime events are not presentation eligible', () => {
  assert.equal(getEventDefinition('delivery.notification.shown').presentationEligible, false);
  assert.equal(getEventDefinition('runtime.transport.disconnected').carrier, 'diagnostic');
  assert.equal(listEventDefinitions({ presentationEligible: false }).every((item) => item.presentationEligible === false), true);
});
