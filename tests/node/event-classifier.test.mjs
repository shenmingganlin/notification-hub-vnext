import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyEvent } from '../../plugin/domain/event-classifier.js';

test('EventClassifier recognizes normal message completion reasons', () => {
  for (const stopReason of ['end_turn', 'stop']) {
    const result = classifyEvent({ type: 'message_end', stopReason });

    assert.deepEqual(
      {
        eventType: result.eventType,
        stopReason: result.stopReason,
        classification: result.classification,
        action: result.action,
        successful: result.successful,
        abnormal: result.abnormal,
        diagnostic: result.diagnostic,
        source: result.source
      },
      {
        eventType: 'message_end',
        stopReason,
        classification: 'completed',
        action: 'notify',
        successful: true,
        abnormal: false,
        diagnostic: false,
        source: `message_end:${stopReason}`
      }
    );
  }
});

test('EventClassifier recognizes explicit tool and interruption events', () => {
  const cases = [
    ['toolUse', 'tool_use', 'tool_use', false],
    ['aborted', 'aborted', 'aborted', true],
    ['cancelled', 'cancelled', 'cancelled', true],
    ['interrupted', 'interrupted', 'interrupted', true]
  ];

  for (const [type, stopReason, classification, abnormal] of cases) {
    const result = classifyEvent({ type, stopReason });
    assert.equal(result.classification, classification);
    assert.equal(result.action, 'notify');
    assert.equal(result.successful, false);
    assert.equal(result.abnormal, abnormal);
    assert.equal(result.diagnostic, false);
  }
});

test('EventClassifier recognizes system warning events as high-importance notifications', () => {
  for (const type of ['session_unhealthy_warning', 'session_branch_persistence_warning']) {
    const result = classifyEvent({ type });
    assert.equal(result.classification, 'system_notification');
    assert.equal(result.action, 'notify');
    assert.equal(result.successful, false);
    assert.equal(result.abnormal, true);
    assert.equal(result.diagnostic, false);
  }
});

test('EventClassifier classifies model service errors as user notifications', () => {
  const result = classifyEvent({ type: 'model_service_error', status: 503, operation: 'memory_summary' });
  assert.equal(result.classification, 'model_service');
  assert.equal(result.action, 'notify');
  assert.equal(result.successful, false);
  assert.equal(result.abnormal, true);
  assert.equal(result.diagnostic, false);
});

test('EventClassifier keeps model service recovery diagnostic-only', () => {
  const result = classifyEvent({ type: 'model_service_recovered' });
  assert.equal(result.classification, 'model_service_recovered');
  assert.equal(result.action, 'diagnostic');
  assert.equal(result.successful, true);
});

test('EventClassifier never treats an unknown event as successful completion', () => {
  const result = classifyEvent({ type: 'future_provider_event', stopReason: 'end_turn' });

  assert.equal(result.eventType, 'future_provider_event');
  assert.equal(result.stopReason, 'end_turn');
  assert.equal(result.classification, 'unknown');
  assert.equal(result.action, 'diagnostic');
  assert.equal(result.successful, false);
  assert.equal(result.abnormal, true);
  assert.equal(result.diagnostic, true);
  assert.equal(result.source, 'future_provider_event:end_turn');
});

test('EventClassifier maps bounded, filtered, timeout, and rate-limit outcomes', () => {
  const cases = [
    ['max_tokens', 'limit_reached'],
    ['content_filter', 'content_filtered'],
    ['timeout', 'timeout'],
    ['rate_limit', 'rate_limited']
  ];

  for (const [stopReason, classification] of cases) {
    const result = classifyEvent({ type: 'message_end', stopReason });
    assert.equal(result.classification, classification);
    assert.equal(result.action, 'notify');
    assert.equal(result.successful, false);
    assert.equal(result.abnormal, true);
    assert.equal(result.diagnostic, false);
  }
});

test('EventClassifier exposes detailed event names and safely falls back for unknown events', () => {
  assert.equal(classifyEvent({ type: 'message_end', stopReason: 'end_turn' }).event, 'assistant_reply');
  assert.equal(classifyEvent({ type: 'toolUse', stopReason: 'tool_result' }).event, 'tool_success');
  assert.equal(classifyEvent({ type: 'toolUse', stopReason: 'tool_error' }).event, 'tool_error');
  assert.equal(classifyEvent({ type: 'future_event' }).event, 'unknown');
});

test('EventClassifier routes tool errors to notification and provider failures to diagnostics', () => {
  const toolError = classifyEvent({ type: 'toolUse', stopReason: 'tool_error' });
  assert.equal(toolError.classification, 'tool_error');
  assert.equal(toolError.action, 'notify');
  assert.equal(toolError.diagnostic, false);

  for (const stopReason of ['provider_error', 'model_unavailable']) {
    const result = classifyEvent({ type: 'message_end', stopReason });
    assert.equal(result.classification, stopReason);
    assert.equal(result.action, 'diagnostic');
    assert.equal(result.successful, false);
    assert.equal(result.abnormal, true);
    assert.equal(result.diagnostic, true);
  }
});

test('EventClassifier rejects message_end without stopReason instead of reporting success', () => {
  assert.throws(
    () => classifyEvent({ type: 'message_end' }),
    (error) => error.code === 'EVENT_CLASSIFIER_STOP_REASON_MISSING'
      && error.details.field === 'stopReason'
      && error.details.eventType === 'message_end'
  );
});

test('EventClassifier classifies unknown stopReason as diagnostic and preserves it', () => {
  const result = classifyEvent({ type: 'message_end', stopReason: 'future_reason' });

  assert.equal(result.stopReason, 'future_reason');
  assert.equal(result.classification, 'unknown');
  assert.equal(result.action, 'diagnostic');
  assert.equal(result.successful, false);
  assert.equal(result.abnormal, true);
  assert.equal(result.diagnostic, true);
});

test('EventClassifier preserves inputs and freezes only its result', () => {
  const event = {
    type: 'message_end',
    stopReason: 'end_turn',
    error: { message: 'caller-owned' },
    metadata: { source: 'caller-owned' }
  };
  const result = classifyEvent(event);

  assert.equal(Object.isFrozen(event), false);
  assert.equal(Object.isFrozen(event.error), false);
  assert.equal(Object.isFrozen(event.metadata), false);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(event, {
    type: 'message_end',
    stopReason: 'end_turn',
    error: { message: 'caller-owned' },
    metadata: { source: 'caller-owned' }
  });
});

test('EventClassifier returns stable errors for invalid event shapes', () => {
  assert.throws(
    () => classifyEvent(null),
    (error) => error.code === 'EVENT_CLASSIFIER_EVENT_INVALID'
  );
  assert.throws(
    () => classifyEvent({ type: '' }),
    (error) => error.code === 'EVENT_CLASSIFIER_TYPE_INVALID'
      && error.details.field === 'type'
  );
  assert.throws(
    () => classifyEvent({ type: 'message_end', stopReason: 42 }),
    (error) => error.code === 'EVENT_CLASSIFIER_STOP_REASON_INVALID'
      && error.details.field === 'stopReason'
  );
  assert.throws(
    () => classifyEvent({ type: 'error', stopReason: 'provider_error', error: [] }),
    (error) => error.code === 'EVENT_CLASSIFIER_ERROR_INVALID'
      && error.details.field === 'error'
  );
});
