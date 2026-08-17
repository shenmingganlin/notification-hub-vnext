import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOTIFICATION_TEST_EVENTS,
  createNotificationTestNotifications,
  normalizeNotificationTestInput
} from '../../plugin/domain/notification-test-generator.js';

test('notification test generator normalizes bounded input and lists semantic events', () => {
  const input = normalizeNotificationTestInput({ count: 6, intervalMs: 50, events: NOTIFICATION_TEST_EVENTS, createCards: false, playSound: false, label: '声音测试' });
  assert.equal(input.count, 6);
  assert.equal(input.intervalMs, 50);
  assert.deepEqual(input.events, NOTIFICATION_TEST_EVENTS);
  assert.equal(input.createCards, false);
  assert.equal(input.playSound, false);
});

test('notification test generator rejects unsafe or unbounded input', () => {
  assert.throws(() => normalizeNotificationTestInput({ count: 0 }), (error) => error.code === 'NOTIFICATION_TEST_COUNT_INVALID');
  assert.throws(() => normalizeNotificationTestInput({ count: 101 }), (error) => error.code === 'NOTIFICATION_TEST_COUNT_INVALID');
  assert.throws(() => normalizeNotificationTestInput({ intervalMs: -1 }), (error) => error.code === 'NOTIFICATION_TEST_INTERVAL_INVALID');
  assert.throws(() => normalizeNotificationTestInput({ events: ['unknown'] }), (error) => error.code === 'NOTIFICATION_TEST_EVENTS_INVALID');
});

test('notification test generator emits valid source events and user-facing notification types', () => {
  const notifications = createNotificationTestNotifications({ count: 6, events: NOTIFICATION_TEST_EVENTS }, { idFactory: (index) => `source-${index}` });
  assert.equal(notifications[0].event.type, 'message_end');
  assert.equal(notifications[0].notification.type, 'chat_message');
  assert.equal(notifications[1].event.type, 'message_end');
  assert.equal(notifications[1].notification.type, 'channel_message');
  assert.equal(notifications[2].event.type, 'message_end');
  assert.equal(notifications[2].event.stopReason, 'tool_result');
  assert.equal(notifications[3].event.stopReason, 'tool_error');
  assert.equal(notifications[4].event.stopReason, 'timeout');
  assert.equal(notifications[5].event.type, 'session_unhealthy_warning');
});

test('notification test generator annotates every card with event semantics and ordinal', () => {
  const notifications = createNotificationTestNotifications({ count: 6, events: NOTIFICATION_TEST_EVENTS, label: '多事件压力' }, { idFactory: (index) => `test-${index + 1}` });
  assert.equal(notifications.length, 6);
  assert.deepEqual(notifications.map((entry) => entry.eventName), [...NOTIFICATION_TEST_EVENTS]);
  for (const [index, entry] of notifications.entries()) {
    assert.equal(entry.event.eventId, `test-${index + 1}`);
    assert.match(entry.notification.title, /\[压力测试 \d+\/6\]/);
    assert.match(entry.notification.content, /事件：/);
    assert.match(entry.notification.content, /语义：/);
    assert.equal(entry.notification.metadata.test, true);
    assert.equal(entry.notification.metadata.testOrdinal, `${index + 1}/6`);
    assert.equal(entry.notification.producer.id, 'notification-hub-test');
  }
});
