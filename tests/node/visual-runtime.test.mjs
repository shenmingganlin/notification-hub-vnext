import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CARD_RUNTIME_STATES,
  createCardRuntimeInstance
} from '../../plugin/runtime/card-runtime.js';
import {
  createChannelRuntime
} from '../../plugin/runtime/channel-runtime.js';

test('card runtime instance has explicit lifecycle and can be closed/reclaimed', () => {
  const card = createCardRuntimeInstance({
    cardId: 'card-1',
    notificationId: 'notification-1',
    channelId: 'stack.main',
    behaviorId: 'stack',
    cardTypeId: 'minimal',
    propertiesId: 'minimal.default',
    createdAt: 100
  });

  assert.equal(card.state, CARD_RUNTIME_STATES.CREATED);
  card.start(120);
  assert.equal(card.state, CARD_RUNTIME_STATES.ACTIVE);
  assert.equal(card.ageMs(500), 380);
  card.close('user-dismissed', 500);
  assert.equal(card.state, CARD_RUNTIME_STATES.EXITING);
  card.reclaim(760);
  assert.equal(card.state, CARD_RUNTIME_STATES.RECLAIMED);
  assert.equal(card.snapshot().closeReason, 'user-dismissed');
});

test('card runtime rejects invalid transitions and preserves identity', () => {
  const card = createCardRuntimeInstance({ cardId: 'card-2', notificationId: 'n-2', channelId: 'stack.main', behaviorId: 'stack' });
  assert.throws(() => card.reclaim(1), (error) => error.code === 'CARD_RUNTIME_TRANSITION_INVALID');
  card.start(10);
  assert.equal(card.snapshot().cardId, 'card-2');
  assert.equal(card.snapshot().notificationId, 'n-2');
});

test('channel runtime manages cards together and exposes lifecycle metrics', () => {
  const layouts = [];
  const channel = createChannelRuntime({
    channelId: 'stack.main',
    behaviorId: 'stack',
    policy: { maxVisible: 2, maxActive: 3, overflow: 'queue' },
    layout: ({ cards }) => layouts.push(cards.map((card) => card.cardId))
  });

  channel.enqueue({ cardId: 'a', notificationId: 'n-a', createdAt: 0 });
  channel.enqueue({ cardId: 'b', notificationId: 'n-b', createdAt: 1 });
  channel.enqueue({ cardId: 'c', notificationId: 'n-c', createdAt: 2 });
  channel.start('a', 10);
  channel.start('b', 10);
  channel.start('c', 10);

  assert.deepEqual(channel.snapshot().visibleCardIds, ['a', 'b']);
  assert.deepEqual(channel.snapshot().queuedCardIds, ['c']);
  assert.deepEqual(channel.metrics(), {
    channelCount: 1,
    activeCardCount: 3,
    visibleCardCount: 2,
    queuedCardCount: 1,
    suppressedCardCount: 0,
    layoutRecomputeCount: 5
  });
  assert.deepEqual(layouts.at(-1), ['a', 'b']);
});

test('channel runtime isolates adapter/layout failures from other channels', () => {
  const broken = createChannelRuntime({
    channelId: 'broken',
    behaviorId: 'stack',
    layout: () => { throw new Error('layout failed'); }
  });
  const healthy = createChannelRuntime({ channelId: 'healthy', behaviorId: 'stack' });

  broken.enqueue({ cardId: 'bad', notificationId: 'bad' });
  healthy.enqueue({ cardId: 'good', notificationId: 'good' });
  healthy.start('good', 0);
  assert.equal(broken.snapshot().diagnostics[0].code, 'VISUAL_BEHAVIOR_LAYOUT_FAILED');
  assert.deepEqual(healthy.snapshot().visibleCardIds, ['good']);
  assert.equal(healthy.snapshot().diagnostics.length, 0);
});

test('channel runtime close promotes queued card and reclaims resources', () => {
  const channel = createChannelRuntime({ channelId: 'stack.main', behaviorId: 'stack', policy: { maxVisible: 1, overflow: 'queue' } });
  channel.enqueue({ cardId: 'visible', notificationId: 'visible' });
  channel.enqueue({ cardId: 'queued', notificationId: 'queued' });
  channel.start('visible', 0);
  channel.start('queued', 0);
  channel.close('visible', 'timeout', 100);
  channel.reclaim('visible', 300);
  assert.deepEqual(channel.snapshot().visibleCardIds, ['queued']);
  assert.deepEqual(channel.snapshot().queuedCardIds, []);
  assert.equal(channel.snapshot().cards[0].state, CARD_RUNTIME_STATES.ACTIVE);
});
