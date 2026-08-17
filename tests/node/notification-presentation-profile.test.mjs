import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPresentationBinding,
  createPresentationProfile,
  resolvePresentationBinding
} from '../../plugin/domain/notification-presentation-profile.js';

test('presentation binding resolves event over category over global defaults', () => {
  const profile = createPresentationProfile({
    global: {
      soundProfileId: 'sound.global',
      visualProfileId: 'visual.global',
      behaviorProfileId: 'stack',
      behaviorChannelId: 'stack.main'
    },
    categories: {
      tool: {
        soundProfileId: 'sound.tool',
        visualProfileId: 'visual.tool',
        behaviorProfileId: 'stack',
        behaviorChannelId: 'stack.tool'
      }
    },
    visualRules: [{ id: 'tool-fail-visual', name: '工具失败视觉', eventIds: ['tool.execution.failed'], effect: { preset: 'warning', intensity: 'expressive' } }],
    events: {
      'tool.execution.failed': {
        soundProfileId: 'sound.warning',
        visualProfileId: 'visual.error',
        behaviorProfileId: 'popup',
        behaviorChannelId: 'popup.alert'
      }
    }
  });

  const failed = resolvePresentationBinding({ eventId: 'tool.execution.failed', categoryId: 'tool', profile });
  assert.equal(failed.soundProfileId, 'sound.warning');
  assert.equal(failed.visualProfileId, 'warning');
  assert.equal(failed.visualRuleIntensity, 'expressive');
  assert.equal(resolvePresentationBinding({ eventId: 'tool.execution.succeeded', categoryId: 'tool', profile }).soundProfileId, 'sound.tool');
  assert.equal(resolvePresentationBinding({ eventId: 'chat.assistant_reply.completed', categoryId: 'chat', profile }).soundProfileId, 'sound.global');
});

test('behavior channels isolate same behavior profiles', () => {
  const stackMain = createPresentationBinding({ soundProfileId: 'sound.a', visualProfileId: 'visual.a', behaviorProfileId: 'stack', behaviorChannelId: 'stack.main' });
  const stackTool = createPresentationBinding({ soundProfileId: 'sound.b', visualProfileId: 'visual.b', behaviorProfileId: 'stack', behaviorChannelId: 'stack.tool' });
  assert.equal(stackMain.behaviorProfileId, stackTool.behaviorProfileId);
  assert.notEqual(stackMain.behaviorChannelId, stackTool.behaviorChannelId);
});

test('presentation binding rejects unknown behavior and unsafe channel ids', () => {
  assert.throws(
    () => createPresentationBinding({ soundProfileId: 'sound.a', visualProfileId: 'visual.a', behaviorProfileId: 'unknown', behaviorChannelId: 'stack.main' }),
    (error) => error.code === 'NOTIFICATION_PRESENTATION_BEHAVIOR_UNKNOWN'
  );
  assert.throws(
    () => createPresentationBinding({ soundProfileId: 'sound.a', visualProfileId: 'visual.a', behaviorProfileId: 'stack', behaviorChannelId: 'stack/main' }),
    (error) => error.code === 'NOTIFICATION_PRESENTATION_BEHAVIOR_CHANNEL_INVALID'
  );
});
