import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEventPresentationSettings,
  listEventPresentationRows,
  removeEventPresentationBinding,
  setEventPresentationBinding,
  updateEventPresentationSettings
} from '../../plugin/domain/event-presentation-settings.js';

const base = {
  global: {
    soundProfileId: 'sound.global',
    visualProfileId: 'visual.global',
    behaviorProfileId: 'stack',
    behaviorChannelId: 'stack.main'
  }
};

test('event presentation settings accept global, category, event, and keyword layers', () => {
  const settings = createEventPresentationSettings({
    ...base,
    visualRules: [{ id: 'visual-failure', name: '工具失败强调', eventIds: ['tool.execution.failed'], effect: { preset: 'warning', intensity: 'balanced' } }],
    categories: { tool: { soundProfileId: 'sound.tool', visualProfileId: 'visual.tool', behaviorProfileId: 'stack', behaviorChannelId: 'stack.tool' } },
    events: { 'tool.execution.failed': { soundProfileId: 'sound.error', visualProfileId: 'visual.error', behaviorProfileId: 'popup', behaviorChannelId: 'popup.alert' } },
    importanceKeywords: { keywords: ['验证码'] }
  });
  assert.equal(settings.events['tool.execution.failed'].behaviorChannelId, 'popup.alert');
  assert.equal(settings.visualRules[0].effect.preset, 'warning');
  assert.deepEqual(settings.importanceKeywords, { keywords: ['验证码'] });
  assert.equal(listEventPresentationRows(settings).some((row) => row.eventId === 'tool.execution.failed'), true);
});

test('event presentation settings reject unknown event and category ids', () => {
  assert.throws(() => createEventPresentationSettings({ ...base, events: { 'tool.unknown': base.global } }), (error) => error.code === 'NOTIFICATION_EVENT_UNKNOWN');
  assert.throws(() => updateEventPresentationSettings(createEventPresentationSettings(base), { categories: { unknown: base.global } }), (error) => error.code === 'EVENT_PRESENTATION_CATEGORY_UNKNOWN');
});

test('event presentation bindings can be set and removed without affecting other events', () => {
  const initial = createEventPresentationSettings(base);
  const updated = setEventPresentationBinding(initial, 'chat.assistant_reply.completed', {
    soundProfileId: 'sound.chat', visualProfileId: 'visual.chat', behaviorProfileId: 'ticker', behaviorChannelId: 'ticker.chat'
  });
  assert.equal(updated.events['chat.assistant_reply.completed'].soundProfileId, 'sound.chat');
  const removed = removeEventPresentationBinding(updated, 'chat.assistant_reply.completed');
  assert.equal(removed.events['chat.assistant_reply.completed'], undefined);
});
