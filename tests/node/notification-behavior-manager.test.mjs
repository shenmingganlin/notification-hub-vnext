import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBehaviorManager,
  restoreBehaviorManager,
  snapshotBehaviorManager
} from '../../plugin/domain/notification-behavior-manager.js';

test('queue capacity is independent from visual suppression', () => {
  const manager = createBehaviorManager({ channelId: 'stack.queue', profile: { mode: 'stack' }, policy: { policyId: 'queue', suppression: 'off', maxVisible: 1, overflow: 'queue' } });
  manager.enqueue({ cardId: 'visible', notificationId: 'visible', eventId: 'event' });
  manager.enqueue({ cardId: 'queued', notificationId: 'queued', eventId: 'event' });
  assert.deepEqual(manager.snapshot().cards.map((card) => card.cardId), ['visible']);
  assert.deepEqual(manager.snapshot().pending.map((card) => card.cardId), ['queued']);
});

test('removeWithPromotion returns the promoted card without re-enqueueing it', () => {
  const manager = createBehaviorManager({ channelId: 'stack.promote', profile: { mode: 'stack' }, policy: { policyId: 'promote', suppression: 'off', maxVisible: 1, overflow: 'queue' } });
  manager.enqueue({ cardId: 'visible', notificationId: 'visible', eventId: 'event' });
  manager.enqueue({ cardId: 'queued', notificationId: 'queued', eventId: 'event' });
  const result = manager.removeWithPromotion('visible');
  assert.equal(result.removed.notificationId, 'visible');
  assert.equal(result.promoted.notificationId, 'queued');
  assert.deepEqual(manager.snapshot().cards.map((card) => card.notificationId), ['queued']);
  assert.deepEqual(manager.snapshot().pending, []);
});

test('removeByNotificationId resolves cardId and promotes the queued card', () => {
  const manager = createBehaviorManager({ channelId: 'stack.notification-id', profile: { mode: 'stack' }, policy: { policyId: 'notification-id', suppression: 'off', maxVisible: 1, overflow: 'queue' } });
  manager.enqueue({ cardId: 'internal-card-1', notificationId: 'notification-1', eventId: 'event' });
  manager.enqueue({ cardId: 'internal-card-2', notificationId: 'notification-2', eventId: 'event' });
  const result = manager.removeByNotificationId('notification-1');
  assert.equal(result.removed.cardId, 'internal-card-1');
  assert.equal(result.promoted.notificationId, 'notification-2');
  assert.deepEqual(manager.snapshot().cards.map((card) => card.notificationId), ['notification-2']);
});

test('removeByNotificationId is idempotent for an unknown notification', () => {
  const manager = createBehaviorManager({ channelId: 'stack.notification-id-missing', profile: { mode: 'stack' }, policy: { policyId: 'notification-id-missing', suppression: 'off', maxVisible: 1, overflow: 'queue' } });
  assert.deepEqual(manager.removeByNotificationId('missing'), { removed: null, promoted: null });
});

test('behavior snapshot restore keeps cards and pending order without adapter side effects', () => {
  const source = createBehaviorManager({ channelId: 'stack.restore', profile: { mode: 'stack' }, policy: { policyId: 'restore', suppression: 'off', maxVisible: 1, overflow: 'queue' } });
  source.enqueue({ cardId: 'visible', notificationId: 'visible', eventId: 'event' });
  source.enqueue({ cardId: 'pending-1', notificationId: 'pending-1', eventId: 'event-1' });
  source.enqueue({ cardId: 'pending-2', notificationId: 'pending-2', eventId: 'event-2' });
  const snapshot = snapshotBehaviorManager(source);
  const calls = [];
  const target = createBehaviorManager({
    channelId: 'stack.restore',
    profile: { mode: 'stack' },
    policy: { policyId: 'restore', suppression: 'off', maxVisible: 1, overflow: 'queue' },
    adapter: { enqueue: (card) => calls.push(`enqueue:${card.cardId}`), remove: (card) => calls.push(`remove:${card.cardId}`) }
  });

  const restored = restoreBehaviorManager(target, snapshot);
  assert.deepEqual(restored.cards.map((card) => card.cardId), ['visible']);
  assert.deepEqual(restored.pending.map((card) => card.cardId), ['pending-1', 'pending-2']);
  assert.deepEqual(calls, []);

  restoreBehaviorManager(target, snapshot);
  assert.deepEqual(target.snapshot().pending.map((card) => card.cardId), ['pending-1', 'pending-2']);
  assert.deepEqual(calls, []);
});

test('behavior snapshot restore rejects invalid pending state', () => {
  const manager = createBehaviorManager({ channelId: 'stack.invalid', profile: { mode: 'stack' } });
  assert.throws(
    () => restoreBehaviorManager(manager, { channelId: 'stack.invalid', cards: [], pending: {} }),
    (error) => error.code === 'NOTIFICATION_BEHAVIOR_SNAPSHOT_INVALID'
  );
});

test('drop-oldest capacity is independent from visual suppression', () => {
  const manager = createBehaviorManager({ channelId: 'stack.drop', profile: { mode: 'stack' }, policy: { policyId: 'drop', suppression: 'off', maxVisible: 1, overflow: 'drop-oldest' } });
  manager.enqueue({ cardId: 'old', notificationId: 'old', eventId: 'event' });
  manager.enqueue({ cardId: 'new', notificationId: 'new', eventId: 'event' });
  assert.deepEqual(manager.snapshot().cards.map((card) => card.cardId), ['new']);
  assert.equal(manager.snapshot().metrics.suppressedCardCount, 1);
});
