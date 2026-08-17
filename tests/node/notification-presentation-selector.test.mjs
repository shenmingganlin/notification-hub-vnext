import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPresentationSelector,
  projectBehaviorInput,
  projectSoundInput,
  projectVisualInput,
  validatePresentationSelector
} from '../../plugin/domain/notification-presentation-selector.js';

test('selector gives sound, visual, and behavior the same event identity', () => {
  const selector = createPresentationSelector({
    record: { notificationId: 'notification-1', importance: 'normal' },
    canonicalEvent: {
      eventId: 'tool.execution.failed',
      traceId: 'trace-1',
      occurredAt: '2026-08-16T00:00:00.000Z',
      origin: { source: 'hana.tool' },
      semantic: { action: 'execution', outcome: 'failure', reason: 'execution_error' }
    },
    profile: {
      global: {
        soundProfileId: 'sound.global',
        visualProfileId: 'visual.global',
        behaviorProfileId: 'stack',
        behaviorChannelId: 'stack.main'
      },
      events: {
        'tool.execution.failed': {
          soundProfileId: 'sound.warning',
          visualProfileId: 'visual.error',
          behaviorProfileId: 'popup',
          behaviorChannelId: 'popup.alert'
        }
      }
    }
  });

  assert.equal(selector.eventId, 'tool.execution.failed');
  assert.equal(selector.categoryId, 'tool');
  assert.equal(selector.sound.soundProfileId, 'sound.warning');
  assert.equal(selector.visual.visualProfileId, 'visual.error');
  assert.equal(selector.behavior.channelId, 'popup.alert');
  assert.equal(projectSoundInput(selector).eventId, selector.eventId);
  assert.equal(projectVisualInput(selector).eventId, selector.eventId);
  assert.equal(projectBehaviorInput(selector).behaviorChannelId, 'popup.alert');
  assert.equal(validatePresentationSelector(selector), true);
});

test('selector derives legacy records without using multi-label category priority', () => {
  const selector = createPresentationSelector({
    record: {
      notificationId: 'notification-2',
      type: 'tool_error',
      source: 'hana.tool',
      status: 'failed',
      importance: 'high',
      createdAt: '2026-08-16T00:00:00.000Z',
      traceId: 'trace-2',
      metadata: { eventClassification: { event: 'tool_error' } }
    },
    classification: { event: 'tool_error' }
  });

  assert.equal(selector.eventId, 'tool.execution.failed');
  assert.equal(selector.categoryId, 'tool');
  assert.equal(selector.importance, 'important');
});
