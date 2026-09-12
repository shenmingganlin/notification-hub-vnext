import assert from 'node:assert/strict';
import test from 'node:test';

import { createBehaviorStateStore } from '../../plugin/domain/notification-behavior-state.js';

function card(cardId, notificationId = cardId, eventId = 'event') {
  return { cardId, notificationId, eventId, channelId: 'stack.state' };
}

test('behavior state store owns visible and pending order while applying capacity', () => {
  const state = createBehaviorStateStore({ channelId: 'stack.state' });
  assert.equal(state.place(card('visible'), { maxVisible: 1, overflow: 'queue' }).state, 'visible');
  assert.equal(state.place(card('pending'), { maxVisible: 1, overflow: 'queue' }).state, 'pending');
  assert.deepEqual([...state.cards.keys()], ['visible']);
  assert.deepEqual([...state.pending.keys()], ['pending']);
  assert.equal(state.snapshot().metrics.queuedCardCount, 1);
});

test('behavior state store promotes the oldest pending card exactly once', () => {
  const state = createBehaviorStateStore({ channelId: 'stack.state' });
  state.place(card('visible'), { maxVisible: 1, overflow: 'queue' });
  state.place(card('pending-1'), { maxVisible: 1, overflow: 'queue' });
  state.place(card('pending-2'), { maxVisible: 1, overflow: 'queue' });

  const result = state.remove('visible');
  assert.equal(result.removed.cardId, 'visible');
  assert.equal(result.promoted.cardId, 'pending-1');
  assert.deepEqual([...state.cards.keys()], ['pending-1']);
  assert.deepEqual([...state.pending.keys()], ['pending-2']);
});

test('behavior state store reports promotion without replaying adapter effects', () => {
  const state = createBehaviorStateStore({ channelId: 'stack.state' });
  const visible = card('visible');
  const pending = card('pending');
  state.place(visible, { maxVisible: 1, overflow: 'queue' });
  state.place(pending, { maxVisible: 1, overflow: 'queue' });

  const result = state.remove('visible');
  assert.equal(result.removed.cardId, 'visible');
  assert.equal(result.promoted.cardId, 'pending');
  assert.deepEqual([...state.cards.keys()], ['pending']);
  assert.deepEqual([...state.pending.keys()], []);
});

test('behavior state store tracks aggregate keys and suppression count', () => {
  const state = createBehaviorStateStore({ channelId: 'stack.state' });
  const first = card('first');
  state.rememberAggregate(first);
  assert.equal(state.isSuppressed(card('second')), true);
  state.markSuppressed();
  assert.equal(state.snapshot().metrics.suppressedCardCount, 1);
});

test('behavior state store rejects duplicate ids during restore', () => {
  const state = createBehaviorStateStore({ channelId: 'stack.state' });
  assert.throws(
    () => state.restore({ cards: [card('duplicate')], pending: [card('duplicate')] }),
    (error) => error.code === 'NOTIFICATION_BEHAVIOR_SNAPSHOT_INVALID'
  );
});
