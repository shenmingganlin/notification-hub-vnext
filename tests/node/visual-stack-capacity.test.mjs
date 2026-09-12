import assert from 'node:assert/strict';
import test from 'node:test';

import { createChannelRuntime } from '../../plugin/runtime/channel-runtime.js';
import { createStackLayout } from '../../plugin/runtime/stack-layout.js';
import { createRuntimeRegistry } from '../../plugin/runtime/runtime-registry.js';

test('Stack queue overflow preserves cards and promotes in insertion order', () => {
  const channel = createChannelRuntime({
    channelId: 'stack.queue', behaviorId: 'stack',
    policy: { maxVisible: 2, maxActive: 4, overflow: 'queue' },
    layoutStrategy: createStackLayout({ anchor: 'bottom-left' }),
    workArea: { left: 0, top: 0, width: 800, height: 600 }
  });
  for (const id of ['a', 'b', 'c', 'd']) channel.enqueue({ cardId: id, notificationId: id, width: 200, height: 80 });
  for (const id of ['a', 'b', 'c', 'd']) channel.start(id, 0);
  assert.deepEqual(channel.snapshot().visibleCardIds, ['a', 'b']);
  assert.deepEqual(channel.snapshot().queuedCardIds, ['c', 'd']);
  channel.close('a', 'user-dismissed', 10);
  channel.reclaim('a', 20);
  assert.deepEqual(channel.snapshot().visibleCardIds, ['b', 'c']);
  assert.deepEqual(channel.snapshot().queuedCardIds, ['d']);
});

test('Stack drop-oldest explicitly reclaims the oldest card and keeps the newest card', () => {
  const events = [];
  const channel = createChannelRuntime({
    channelId: 'stack.drop', behaviorId: 'stack',
    policy: { maxVisible: 2, maxActive: 3, overflow: 'drop-oldest' },
    onEvent: (event) => events.push(event)
  });
  channel.enqueue({ cardId: 'old', notificationId: 'old' });
  channel.start('old', 0);
  channel.enqueue({ cardId: 'new', notificationId: 'new' });
  channel.start('new', 1);
  assert.deepEqual(channel.snapshot().visibleCardIds, ['old', 'new']);
  channel.enqueue({ cardId: 'overflow', notificationId: 'overflow' });
  channel.start('overflow', 2);
  assert.deepEqual(channel.snapshot().visibleCardIds, ['new', 'overflow']);
  assert.equal(events.some((event) => event.type === 'card.reclaimed' && event.cardId === 'old'), true);
  assert.equal(channel.snapshot().metrics.suppressedCardCount, 1);
});

test('Stack channels remain isolated during a burst of mixed events', () => {
  const registry = createRuntimeRegistry();
  const reply = registry.getOrCreateChannel({ channelId: 'stack.reply', behaviorId: 'stack', policy: { maxVisible: 100, maxActive: 100, overflow: 'allow' } });
  const tool = registry.getOrCreateChannel({ channelId: 'stack.tool', behaviorId: 'stack', policy: { maxVisible: 100, maxActive: 100, overflow: 'allow' } });
  for (let index = 0; index < 50; index += 1) {
    reply.enqueue({ cardId: `reply-${index}`, notificationId: `reply-${index}` });
    tool.enqueue({ cardId: `tool-${index}`, notificationId: `tool-${index}` });
    reply.start(`reply-${index}`, index);
    tool.start(`tool-${index}`, index);
  }
  assert.equal(reply.snapshot().visibleCardIds.length, 50);
  assert.equal(tool.snapshot().visibleCardIds.length, 50);
  assert.deepEqual(registry.metrics(), { channelCount: 2, activeCardCount: 100, visibleCardCount: 100, queuedCardCount: 0, suppressedCardCount: 0 });
});
