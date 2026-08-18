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
