import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBehaviorManager,
  enqueueBehaviorCard,
  removeBehaviorCard,
  restoreBehaviorManager,
  snapshotBehaviorManager
} from '../../plugin/domain/notification-behavior-manager.js';

test('behavior managers isolate channels while sharing cards within one channel', () => {
  const stackMain = createBehaviorManager({ channelId: 'stack.main', profile: { mode: 'stack' } });
  const tickerMain = createBehaviorManager({ channelId: 'ticker.main', profile: { mode: 'ticker' } });
  const stackTool = createBehaviorManager({ channelId: 'stack.tool', profile: { mode: 'stack' } });

  enqueueBehaviorCard(stackMain, { cardId: 'a', notificationId: 'n-a', eventId: 'chat.assistant_reply.completed', visualProfileId: 'visual.a' });
  enqueueBehaviorCard(tickerMain, { cardId: 'b', notificationId: 'n-b', eventId: 'tool.execution.succeeded', visualProfileId: 'visual.b' });
  enqueueBehaviorCard(stackMain, { cardId: 'c', notificationId: 'n-c', eventId: 'channel.message.received', visualProfileId: 'visual.c' });
  enqueueBehaviorCard(stackTool, { cardId: 'd', notificationId: 'n-d', eventId: 'tool.execution.failed', visualProfileId: 'visual.d' });

  assert.deepEqual(snapshotBehaviorManager(stackMain).cards.map((card) => card.cardId), ['a', 'c']);
  assert.deepEqual(snapshotBehaviorManager(tickerMain).cards.map((card) => card.cardId), ['b']);
  assert.deepEqual(snapshotBehaviorManager(stackTool).cards.map((card) => card.cardId), ['d']);

  removeBehaviorCard(stackMain, 'a');
  assert.deepEqual(snapshotBehaviorManager(stackMain).cards.map((card) => card.cardId), ['c']);
});

test('behavior manager exposes independent storm policy metrics without discarding cards', () => {
  const manager = createBehaviorManager({ channelId: 'stack.tool', profile: { mode: 'stack' }, policy: { policyId: 'storm', suppression: 'off', maxVisible: 1000, overflow: 'allow' } });
  manager.enqueue({ cardId: 'storm-1', notificationId: 'storm-1', eventId: 'tool.execution.started' });
  manager.enqueue({ cardId: 'storm-2', notificationId: 'storm-2', eventId: 'tool.execution.started' });
  const snapshot = manager.snapshot();
  assert.equal(snapshot.policy.suppression, 'off');
  assert.equal(snapshot.metrics.activeCardCount, 2);
  assert.equal(snapshot.metrics.suppressedCardCount, 0);
});

test('soft policy queues cards and promotes them when a visible card is removed', () => {
  const manager = createBehaviorManager({ channelId: 'stack.reply', profile: { mode: 'stack' }, policy: { policyId: 'soft', suppression: 'soft', maxVisible: 1, overflow: 'queue' } });
  manager.enqueue({ cardId: 'visible', notificationId: 'visible', eventId: 'reply' });
  manager.enqueue({ cardId: 'queued', notificationId: 'queued', eventId: 'reply' });
  assert.deepEqual(manager.snapshot().cards.map((card) => card.cardId), ['visible']);
  assert.deepEqual(manager.snapshot().pending.map((card) => card.cardId), ['queued']);
  manager.remove('visible');
  assert.deepEqual(manager.snapshot().cards.map((card) => card.cardId), ['queued']);
  assert.equal(manager.snapshot().metrics.queuedCardCount, 0);
});

test('aggressive policy suppresses repeated event display work and exposes the count', () => {
  const manager = createBehaviorManager({ channelId: 'stack.tool', profile: { mode: 'stack' }, policy: { policyId: 'aggressive', suppression: 'aggressive', maxVisible: 10, overflow: 'aggregate' } });
  manager.enqueue({ cardId: 'one', notificationId: 'one', eventId: 'tool.execution.started' });
  manager.enqueue({ cardId: 'two', notificationId: 'two', eventId: 'tool.execution.started' });
  const snapshot = manager.snapshot();
  assert.deepEqual(snapshot.cards.map((card) => card.cardId), ['one']);
  assert.equal(snapshot.metrics.suppressedCardCount, 1);
});

test('behavior manager snapshots restore only into the same channel', () => {
  const source = createBehaviorManager({ channelId: 'popup.alert', profile: { mode: 'popup' } });
  enqueueBehaviorCard(source, { cardId: 'p1', notificationId: 'n-p1', eventId: 'tool.execution.failed' });
  const snapshot = snapshotBehaviorManager(source);
  const target = createBehaviorManager({ channelId: 'popup.alert', profile: { mode: 'popup' } });
  restoreBehaviorManager(target, snapshot);
  assert.equal(snapshotBehaviorManager(target).cards[0].cardId, 'p1');
  const wrong = createBehaviorManager({ channelId: 'stack.main', profile: { mode: 'stack' } });
  assert.throws(() => restoreBehaviorManager(wrong, snapshot), (error) => error.code === 'NOTIFICATION_BEHAVIOR_SNAPSHOT_INVALID');
});
