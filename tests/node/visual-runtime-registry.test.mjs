import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeRegistry } from '../../plugin/runtime/runtime-registry.js';
import { createRuntimeClock } from '../../plugin/runtime/runtime-clock.js';
import { projectRuntimeToSceneState } from '../../plugin/runtime/scene-state-projection.js';
import { validateSceneState } from '../../plugin/runtime/scene-state.js';

test('runtime registry creates isolated channels and aggregates metrics', () => {
  const registry = createRuntimeRegistry();
  const reply = registry.getOrCreateChannel({ channelId: 'stack.reply', behaviorId: 'stack' });
  const tool = registry.getOrCreateChannel({ channelId: 'stack.tool', behaviorId: 'stack' });
  reply.enqueue({ cardId: 'reply-1', notificationId: 'reply-1', createdAt: 0 });
  tool.enqueue({ cardId: 'tool-1', notificationId: 'tool-1', createdAt: 0 });
  reply.start('reply-1', 10);
  tool.start('tool-1', 10);

  assert.equal(registry.size, 2);
  assert.deepEqual(registry.listChannelIds(), ['stack.reply', 'stack.tool']);
  assert.deepEqual(registry.metrics(), {
    channelCount: 2,
    activeCardCount: 2,
    visibleCardCount: 2,
    queuedCardCount: 0,
    suppressedCardCount: 0
  });
});

test('three behavior channels keep one card each without cross-channel eviction', () => {
  const registry = createRuntimeRegistry();
  const channels = [
    registry.getOrCreateChannel({ channelId: 'stack.main', behaviorId: 'stack', policy: { maxVisible: 1, overflow: 'drop-oldest' } }),
    registry.getOrCreateChannel({ channelId: 'danmaku.main', behaviorId: 'danmaku', policy: { maxVisible: 1, overflow: 'drop-oldest' } }),
    registry.getOrCreateChannel({ channelId: 'popup.main', behaviorId: 'popup', policy: { maxVisible: 1, overflow: 'drop-oldest' } })
  ];
  channels.forEach((channel, index) => {
    const id = ['M-card', 'D-card', 'P-card'][index];
    channel.enqueue({ cardId: id, notificationId: id, createdAt: index });
    channel.start(id, index + 1);
  });
  const cards = channels.flatMap((channel) => channel.snapshot().cards.filter((card) => card.state === 'active'));
  assert.deepEqual(cards.map((card) => card.cardId), ['M-card', 'D-card', 'P-card']);
  assert.deepEqual(channels.map((channel) => channel.channelId), ['stack.main', 'danmaku.main', 'popup.main']);
  assert.equal(new Set(cards.map((card) => card.channelId)).size, 3);
  assert.equal(registry.metrics().visibleCardCount, 3);
});

test('runtime registry removes empty channels without touching another channel', () => {
  const registry = createRuntimeRegistry();
  const first = registry.getOrCreateChannel({ channelId: 'first', behaviorId: 'stack' });
  const second = registry.getOrCreateChannel({ channelId: 'second', behaviorId: 'stack' });
  first.enqueue({ cardId: 'one', notificationId: 'one' });
  first.start('one', 0);
  first.close('one', 'done', 10);
  first.reclaim('one', 20);
  assert.equal(registry.removeIfEmpty('first'), true);
  assert.equal(registry.removeIfEmpty('second'), true);
  assert.equal(registry.size, 0);
});

test('runtime clock expires active cards and leaves queued cards alone', () => {
  const registry = createRuntimeRegistry();
  const channel = registry.getOrCreateChannel({ channelId: 'stack.main', behaviorId: 'stack', policy: { maxVisible: 1, overflow: 'queue' } });
  channel.enqueue({ cardId: 'visible', notificationId: 'visible', createdAt: 0, durationMs: 100 });
  channel.enqueue({ cardId: 'queued', notificationId: 'queued', createdAt: 0, durationMs: 100 });
  channel.start('visible', 0);
  channel.start('queued', 0);
  const clock = createRuntimeClock({ registry });
  assert.deepEqual(clock.tick(99), { expired: [], reclaimed: [] });
  assert.deepEqual(clock.tick(100), { expired: ['visible'], reclaimed: ['visible'] });
  assert.deepEqual(channel.snapshot().visibleCardIds, ['queued']);
  assert.deepEqual(channel.snapshot().queuedCardIds, []);
});

test('scene state projection is read-only and passes the existing SceneState validator', () => {
  const registry = createRuntimeRegistry();
  const channel = registry.getOrCreateChannel({ channelId: 'stack.main', behaviorId: 'stack' });
  channel.enqueue({ cardId: 'card-1', notificationId: 'notice-1', createdAt: 0 });
  channel.start('card-1', 10);
  const state = projectRuntimeToSceneState(registry, {
    updatedAt: new Date(100).toISOString(),
    workArea: { left: 0, top: 0, width: 1280, height: 720, dpiScale: 1, source: 'test' }
  });
  validateSceneState(state);
  assert.deepEqual(state.cardOrder, ['card-1']);
  assert.deepEqual(state.behaviorChannels[0].cardOrder, ['card-1']);
  assert.equal(state.cards[0].behavior.behaviorChannelId, 'stack.main');
  assert.equal(Object.isFrozen(state), true);
});
