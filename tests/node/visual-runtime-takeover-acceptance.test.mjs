import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeRegistry } from '../../plugin/runtime/runtime-registry.js';

function card(cardId, notificationId) {
  return { cardId, notificationId, eventId: `event.${cardId}`, width: 320, height: 160 };
}

test('takeover acceptance: queue promotion and dismiss reclaim stay isolated per channel', () => {
  const registry = createRuntimeRegistry();
  const tool = registry.getOrCreateChannel({ channelId: 'stack.tool', behaviorId: 'stack', policy: { overflow: 'queue', maxVisible: 1 } });
  const chat = registry.getOrCreateChannel({ channelId: 'stack.chat', behaviorId: 'stack', policy: { overflow: 'allow', maxVisible: 2 } });

  tool.enqueue(card('tool-1', 'notification-tool-1'));
  tool.enqueue(card('tool-2', 'notification-tool-2'));
  chat.enqueue(card('chat-1', 'notification-chat-1'));
  tool.start('tool-1', 10);
  chat.start('chat-1', 10);

  assert.deepEqual(tool.snapshot().visibleCardIds, ['tool-1']);
  assert.deepEqual(tool.snapshot().queuedCardIds, ['tool-2']);
  assert.deepEqual(chat.snapshot().visibleCardIds, ['chat-1']);

  tool.close('tool-1', 'native-dismiss', 20);
  tool.reclaim('tool-1', 21);
  assert.deepEqual(tool.snapshot().visibleCardIds, ['tool-2']);
  assert.deepEqual(tool.snapshot().queuedCardIds, []);
  assert.deepEqual(chat.snapshot().visibleCardIds, ['chat-1']);
});

test('takeover acceptance: drop-oldest keeps the newest card and reports suppression', () => {
  const registry = createRuntimeRegistry();
  const channel = registry.getOrCreateChannel({ channelId: 'stack.system', behaviorId: 'stack', policy: { overflow: 'drop-oldest', maxVisible: 2 } });
  channel.enqueue(card('system-1', 'notification-system-1'));
  channel.enqueue(card('system-2', 'notification-system-2'));
  channel.start('system-1', 0);
  channel.start('system-2', 1);
  channel.enqueue(card('system-3', 'notification-system-3'));
  channel.start('system-3', 2);
  const snapshot = channel.snapshot();
  assert.deepEqual(snapshot.visibleCardIds, ['system-2', 'system-3']);
  assert.equal(snapshot.metrics.suppressedCardCount, 1);
});

test('takeover acceptance: rollback leaves no runtime-owned card behind', () => {
  const registry = createRuntimeRegistry();
  const channel = registry.getOrCreateChannel({ channelId: 'stack.rollback', behaviorId: 'stack', policy: { overflow: 'allow', maxVisible: 2 } });
  channel.enqueue(card('rollback-1', 'notification-rollback-1'));
  channel.start('rollback-1', 0);
  channel.close('rollback-1', 'native-create-failed', 1);
  channel.reclaim('rollback-1', 2);
  assert.deepEqual(channel.snapshot().visibleCardIds, []);
  assert.deepEqual(channel.snapshot().queuedCardIds, []);
});
