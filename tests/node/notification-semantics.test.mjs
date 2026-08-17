import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalEventFromLegacy,
  createCanonicalEvent,
  getCanonicalEventId,
  validateCanonicalEvent
} from '../../plugin/domain/notification-semantics.js';

test('CanonicalEvent uses one category and one event type as its identity', () => {
  const event = createCanonicalEvent({
    eventId: 'tool.execution.failed',
    traceId: 'trace-1',
    occurredAt: '2026-08-16T00:00:00.000Z',
    origin: { source: 'hana.tool' },
    semantic: { action: 'execution', outcome: 'failure', reason: 'execution_error' },
    rawType: 'tool_execution_end'
  });

  assert.equal(event.eventId, 'tool.execution.failed');
  assert.equal(event.categoryId, 'tool');
  assert.equal(event.eventTypeId, 'execution.failed');
  assert.equal(event.severity, 'error');
  assert.equal(getCanonicalEventId(event), 'tool.execution.failed');
  assert.equal(validateCanonicalEvent(event), true);
  assert.equal(Object.isFrozen(event), true);
});

test('CanonicalEvent rejects mismatched identity and unsupported carrier', () => {
  assert.throws(
    () => createCanonicalEvent({ eventId: 'tool.execution.failed', categoryId: 'channel', traceId: 'trace-1', origin: { source: 'test' } }),
    (error) => error.code === 'CANONICAL_EVENT_ID_MISMATCH'
  );
  assert.throws(
    () => createCanonicalEvent({ eventId: 'tool.execution.failed', traceId: 'trace-1', origin: { source: 'test' }, carrier: 'notification_store' }),
    (error) => error.code === 'CANONICAL_EVENT_CARRIER_INVALID'
  );
});

test('CanonicalEvent can be derived from confirmed legacy event boundaries', () => {
  const event = canonicalEventFromLegacy({
    event: { type: 'tool_execution_end', isError: false, traceId: 'legacy-trace' },
    record: { type: 'tool_result', source: 'hana.tool', traceId: 'legacy-trace', createdAt: '2026-08-16T00:00:00.000Z' }
  });

  assert.equal(event.eventId, 'tool.execution.succeeded');
  assert.equal(event.categoryId, 'tool');
  assert.equal(event.semantic.outcome, 'success');
  assert.equal(event.rawType, 'tool_execution_end');
});
