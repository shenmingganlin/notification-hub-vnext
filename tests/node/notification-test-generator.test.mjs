import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOTIFICATION_TEST_EVENTS,
  createNotificationTestNotifications,
  normalizeNotificationTestInput,
  createParallelCardSample
} from '../../plugin/domain/notification-test-generator.js';

test('notification test generator normalizes bounded input and lists semantic events', () => {
  const input = normalizeNotificationTestInput({ count: 6, intervalMs: 50, events: NOTIFICATION_TEST_EVENTS, createCards: false, playSound: false, label: '声音测试' });
  assert.equal(input.count, 6);
  assert.equal(input.intervalMs, 50);
  assert.deepEqual(input.events, NOTIFICATION_TEST_EVENTS);
  assert.equal(input.createCards, false);
  assert.equal(input.playSound, false);
});

test('notification test generator defaults playSound to false and preserves explicit true', () => {
  assert.equal(normalizeNotificationTestInput({}).playSound, false);
  assert.equal(normalizeNotificationTestInput({ playSound: false }).playSound, false);
  assert.equal(normalizeNotificationTestInput({ playSound: true }).playSound, true);
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
  assert.deepEqual(notifications.map((item) => item.event.eventId), [
    'chat.assistant_reply.completed',
    'channel.message.received',
    'tool.execution.succeeded',
    'tool.execution.failed',
    'tool.execution.timed_out',
    'session.health.degraded'
  ]);
});

test('parallel card sample creates independent minimal, danmaku, and popup channels', () => {
  const sample = createParallelCardSample({ count: 3, idFactory: (index, kind) => `${kind}-${index}` });
  assert.equal(sample.length, 9);
  assert.deepEqual(sample.slice(0, 3).map((entry) => entry.metadata.channelId), ['stack.reply', 'stack.reply', 'stack.reply']);
  assert.deepEqual(sample.slice(3, 6).map((entry) => entry.metadata.channelId), ['danmaku.tool', 'danmaku.tool', 'danmaku.tool']);
  assert.deepEqual(sample.slice(6).map((entry) => entry.metadata.channelId), ['popup.alert', 'popup.alert', 'popup.alert']);
  assert.deepEqual(sample.map((entry) => entry.metadata.cardType), ['minimal', 'minimal', 'minimal', 'danmaku', 'danmaku', 'danmaku', 'popup', 'popup', 'popup']);
  assert.deepEqual(sample.filter((entry) => entry.title.startsWith('[M]')).length, 3);
  assert.equal(new Set(sample.map((entry) => entry.notificationId)).size, 9);
});

test('notification test generator annotates every card with event semantics and ordinal', () => {
  const notifications = createNotificationTestNotifications({ count: 6, events: NOTIFICATION_TEST_EVENTS, label: '多事件压力' }, { idFactory: (index) => `test-${index + 1}` });
  assert.equal(notifications.length, 6);
  assert.deepEqual(notifications.map((entry) => entry.eventName), [...NOTIFICATION_TEST_EVENTS]);
  for (const [index, entry] of notifications.entries()) {
    assert.equal(entry.event.eventId, entry.definition.eventId);
    assert.equal(entry.event.traceId, `test-${index + 1}:trace`);
    assert.match(entry.notification.title, /\[压力测试 \d+\/6\]/);
    assert.match(entry.notification.content, /事件：/);
    assert.match(entry.notification.content, /语义：/);
    assert.equal(entry.notification.metadata.test, true);
    assert.equal(entry.notification.metadata.testOrdinal, `${index + 1}/6`);
    assert.equal(entry.notification.producer.id, 'notification-hub-test');
  }
});
