import assert from 'node:assert/strict';
import test from 'node:test';

import { createSceneBehaviorDiagnostics } from '../../plugin/domain/scene-behavior-diagnostics.js';

test('scene behavior diagnostics projects bounded card and channel metadata without content', () => {
  const result = createSceneBehaviorDiagnostics({
    version: 1,
    cardOrder: ['card-a', 'card-b'],
    cards: [
      {
        id: 'card-a', title: 'secret title', body: 'secret body', x: 0, y: 0, width: 320, height: 160,
        presentation: { eventId: 'tool.execution.succeeded', categoryId: 'tool', eventTypeId: 'execution.succeeded', visualProfileId: 'visual.tool.default' },
        behavior: { behaviorProfileId: 'stack', behaviorChannelId: 'tool.main' }
      },
      {
        id: 'card-b', title: 'another secret', body: 'another body', x: 600, y: 0, width: 320, height: 160,
        presentation: { eventId: 'chat.assistant_reply.completed', categoryId: 'chat', eventTypeId: 'assistant_reply.completed', visualProfileId: 'visual.chat.default' },
        behavior: { behaviorProfileId: 'stack', behaviorChannelId: 'chat.main' }
      }
    ],
    behaviorChannels: [
      { channelId: 'tool.main', profileId: 'stack', cardOrder: ['card-a'] },
      { channelId: 'chat.main', profileId: 'stack', cardOrder: ['card-b'] }
    ]
  });

  assert.deepEqual(result, {
    version: 'v1',
    cardCount: 2,
    channelCount: 2,
    truncated: false,
    cards: [
      {
        id: 'card-a', x: 0, y: 0, width: 320, height: 160,
        eventId: 'tool.execution.succeeded', categoryId: 'tool', eventTypeId: 'execution.succeeded', visualProfileId: 'visual.tool.default',
        behaviorProfileId: 'stack', behaviorChannelId: 'tool.main'
      },
      {
        id: 'card-b', x: 600, y: 0, width: 320, height: 160,
        eventId: 'chat.assistant_reply.completed', categoryId: 'chat', eventTypeId: 'assistant_reply.completed', visualProfileId: 'visual.chat.default',
        behaviorProfileId: 'stack', behaviorChannelId: 'chat.main'
      }
    ],
    channels: [
      { channelId: 'tool.main', profileId: 'stack', cardOrder: ['card-a'] },
      { channelId: 'chat.main', profileId: 'stack', cardOrder: ['card-b'] }
    ]
  });
});

test('scene behavior diagnostics caps entries and marks truncation', () => {
  const result = createSceneBehaviorDiagnostics({
    cards: Array.from({ length: 55 }, (_, index) => ({ id: `card-${index}`, x: index, y: 0, width: 1, height: 1 })),
    behaviorChannels: Array.from({ length: 55 }, (_, index) => ({ channelId: `channel-${index}`, profileId: 'stack', cardOrder: [] }))
  });
  assert.equal(result.cardCount, 55);
  assert.equal(result.channelCount, 55);
  assert.equal(result.cards.length, 50);
  assert.equal(result.channels.length, 50);
  assert.equal(result.truncated, true);
});
