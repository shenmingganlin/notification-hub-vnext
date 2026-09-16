import assert from 'node:assert/strict';
import test from 'node:test';

import { createStackLayout } from '../../plugin/runtime/stack-layout.js';
import { createChannelRuntime } from '../../plugin/runtime/channel-runtime.js';

test('stack layout places newest card at the bottom and uses actual card sizes', () => {
  const layout = createStackLayout({ anchor: 'bottom-right', spacing: 12, margin: 20 });
  const result = layout({
    workArea: { left: 0, top: 0, width: 1000, height: 800 },
    cards: [
      { cardId: 'old', width: 240, height: 80 },
      { cardId: 'new', width: 320, height: 120 }
    ]
  });

  assert.deepEqual(result.map(({ cardId, x, y, width, height }) => ({ cardId, x, y, width, height })), [
    { cardId: 'old', x: 740, y: 568, width: 240, height: 80 },
    { cardId: 'new', x: 660, y: 660, width: 320, height: 120 }
  ]);
});

test('stack layout wraps to a second column toward the interior when the primary axis is full', () => {
  const layout = createStackLayout({ anchor: 'bottom-right', spacing: 0, margin: 0, grow: 'up' });
  const result = layout({
    workArea: { left: 0, top: 0, width: 200, height: 80 },
    cards: [
      { cardId: 'a', width: 80, height: 40 },
      { cardId: 'b', width: 80, height: 40 },
      { cardId: 'c', width: 80, height: 40 }
    ]
  });
  assert.deepEqual(result.map(({ cardId, x, y }) => ({ cardId, x, y })), [
    { cardId: 'a', x: 40, y: 40 },
    { cardId: 'b', x: 120, y: 0 },
    { cardId: 'c', x: 120, y: 40 }
  ]);
});

test('stack layout grows left from bottom-right with newest on the corner', () => {
  const layout = createStackLayout({ anchor: 'bottom-right', spacing: 0, margin: 0, grow: 'left' });
  const result = layout({
    workArea: { left: 0, top: 0, width: 200, height: 80 },
    cards: [
      { cardId: 'old', width: 80, height: 40 },
      { cardId: 'new', width: 80, height: 40 }
    ]
  });
  assert.deepEqual(result.map(({ cardId, x, y }) => ({ cardId, x, y })), [
    { cardId: 'old', x: 40, y: 40 },
    { cardId: 'new', x: 120, y: 40 }
  ]);
});

test('stack layout wrap off stays on one strip and rejects overflow instead of opening a column', () => {
  const layout = createStackLayout({ anchor: 'bottom-right', spacing: 0, margin: 0, grow: 'up', wrap: 'off' });
  const two = layout({
    workArea: { left: 0, top: 0, width: 200, height: 80 },
    cards: [
      { cardId: 'a', width: 80, height: 40 },
      { cardId: 'b', width: 80, height: 40 }
    ]
  });
  assert.deepEqual(two.map(({ cardId, x, y }) => ({ cardId, x, y })), [
    { cardId: 'a', x: 120, y: 0 },
    { cardId: 'b', x: 120, y: 40 }
  ]);
  assert.throws(() => layout({
    workArea: { left: 0, top: 0, width: 200, height: 80 },
    cards: [
      { cardId: 'a', width: 80, height: 40 },
      { cardId: 'b', width: 80, height: 40 },
      { cardId: 'c', width: 80, height: 40 }
    ]
  }), (error) => error.code === 'VISUAL_BEHAVIOR_LAYOUT_FAILED');
});

test('snake layout fills oldest-first then reverses the next run', () => {
  const layout = createStackLayout({ anchor: 'top-left', spacing: 0, margin: 0, grow: 'right', wrap: 'snake' });
  const ids = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const result = layout({
    workArea: { left: 0, top: 0, width: 320, height: 80 },
    cards: ids.map((cardId) => ({ cardId, width: 80, height: 40 }))
  });
  assert.deepEqual(result.map(({ cardId, x, y }) => ({ cardId, x, y })), [
    { cardId: '1', x: 0, y: 0 },
    { cardId: '2', x: 80, y: 0 },
    { cardId: '3', x: 160, y: 0 },
    { cardId: '4', x: 240, y: 0 },
    { cardId: '5', x: 240, y: 40 },
    { cardId: '6', x: 160, y: 40 },
    { cardId: '7', x: 80, y: 40 },
    { cardId: '8', x: 0, y: 40 }
  ]);
});

test('snake layout leaves the hole on the reverse-run start after dropping the oldest', () => {
  const layout = createStackLayout({ anchor: 'top-left', spacing: 0, margin: 0, grow: 'right', wrap: 'snake' });
  const result = layout({
    workArea: { left: 0, top: 0, width: 320, height: 80 },
    cards: ['2', '3', '4', '5', '6', '7', '8'].map((cardId) => ({ cardId, width: 80, height: 40 }))
  });
  assert.deepEqual(result.map(({ cardId, x, y }) => ({ cardId, x, y })), [
    { cardId: '2', x: 0, y: 0 },
    { cardId: '3', x: 80, y: 0 },
    { cardId: '4', x: 160, y: 0 },
    { cardId: '5', x: 240, y: 0 },
    { cardId: '6', x: 240, y: 40 },
    { cardId: '7', x: 160, y: 40 },
    { cardId: '8', x: 80, y: 40 }
  ]);
});

test('snake layout packs mixed sizes tightly and starts the reverse run from the far edge', () => {
  const layout = createStackLayout({ anchor: 'top-left', spacing: 0, margin: 0, grow: 'right', wrap: 'snake' });
  const result = layout({
    workArea: { left: 0, top: 0, width: 200, height: 80 },
    cards: [
      { cardId: '1', width: 80, height: 40 },
      { cardId: '2', width: 40, height: 30 },
      { cardId: '3', width: 40, height: 30 },
      { cardId: '4', width: 80, height: 40 },
      { cardId: '5', width: 40, height: 30 }
    ]
  });
  assert.deepEqual(result.map(({ cardId, x, y, width, height }) => ({ cardId, x, y, width, height })), [
    { cardId: '1', x: 0, y: 0, width: 80, height: 40 },
    { cardId: '2', x: 80, y: 0, width: 40, height: 30 },
    { cardId: '3', x: 120, y: 0, width: 40, height: 30 },
    { cardId: '4', x: 120, y: 40, width: 80, height: 40 },
    { cardId: '5', x: 80, y: 40, width: 40, height: 30 }
  ]);
});

test('stack layout rejects cards that cannot fit the work area without silent degradation', () => {
  const layout = createStackLayout({ anchor: 'bottom-right', margin: 20 });
  assert.throws(() => layout({
    workArea: { left: 0, top: 0, width: 300, height: 200 },
    cards: [{ cardId: 'too-large', width: 400, height: 100 }]
  }), (error) => error.code === 'VISUAL_BEHAVIOR_LAYOUT_FAILED');
});

test('channel runtime integrates Stack strategy for mixed sources and preserves geometry', () => {
  const channel = createChannelRuntime({
    channelId: 'stack.mixed',
    behaviorId: 'stack',
    layoutStrategy: createStackLayout({ anchor: 'bottom-right', spacing: 10, margin: 20 }),
    workArea: { left: 0, top: 0, width: 800, height: 600 }
  });
  channel.enqueue({ cardId: 'reply', notificationId: 'reply', eventId: 'chat.assistant_reply.completed', width: 240, height: 80 });
  channel.enqueue({ cardId: 'tool', notificationId: 'tool', eventId: 'tool.execution.succeeded', width: 320, height: 100 });
  channel.start('reply', 0);
  channel.start('tool', 0);
  assert.deepEqual(channel.snapshot().layout.map(({ cardId, x, y, width, height }) => ({ cardId, x, y, width, height })), [
    { cardId: 'reply', x: 540, y: 390, width: 240, height: 80 },
    { cardId: 'tool', x: 460, y: 480, width: 320, height: 100 }
  ]);
});

test('closing a visible Stack card removes it from layout and reclaims space', () => {
  const channel = createChannelRuntime({
    channelId: 'stack.reflow',
    behaviorId: 'stack',
    layoutStrategy: createStackLayout({ anchor: 'bottom-left', spacing: 8, margin: 10 }),
    workArea: { left: 0, top: 0, width: 500, height: 400 }
  });
  channel.enqueue({ cardId: 'a', notificationId: 'a', width: 200, height: 80 });
  channel.enqueue({ cardId: 'b', notificationId: 'b', width: 200, height: 80 });
  channel.start('a', 0);
  channel.start('b', 0);
  channel.close('a', 'user-dismissed', 20);
  assert.deepEqual(channel.snapshot().layout.map((card) => card.cardId), ['b']);
  channel.reclaim('a', 30);
  assert.equal(channel.snapshot().metrics.activeCardCount, 1);
});

test('channel runtime emits lifecycle events and reflows after close/reclaim', () => {
  const events = [];
  const channel = createChannelRuntime({
    channelId: 'stack.main',
    behaviorId: 'stack',
    onEvent: (event) => events.push(event),
    layout: ({ cards }) => cards
  });
  channel.enqueue({ cardId: 'a', notificationId: 'a' });
  channel.start('a', 10);
  channel.close('a', 'user-dismissed', 20);
  channel.reclaim('a', 30);

  assert.deepEqual(events.filter((event) => event.type !== 'channel.reflow').map((event) => event.type), ['card.enqueued', 'card.started', 'card.closing', 'card.reclaimed']);
  assert.equal(events.filter((event) => event.type === 'channel.reflow').length, 4);
  assert.equal(events.find((event) => event.type === 'card.closing').reason, 'user-dismissed');
  assert.equal(events[0].channelId, 'stack.main');
  assert.ok(events.every((event) => Object.isFrozen(event)));
});
