import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_BEHAVIOR_CHANNEL_ID,
  createBehaviorChannel,
  createBehaviorChannels,
  resolveBehaviorChannel
} from '../../plugin/domain/behavior-channel.js';
import {
  DEFAULT_EVENT_LANE_ID,
  createEventLane,
  resolveEventLane
} from '../../plugin/domain/event-lane.js';

test('behavior channel is a user-named behavior unit with its own profile and policy', () => {
  const channel = createBehaviorChannel({
    channelId: 'danmaku-chaos',
    behaviorProfileId: 'ticker',
    visualProfileId: 'visual.danmaku',
    policy: { suppression: 'off', maxVisible: 1000, overflow: 'allow' }
  });
  assert.equal(channel.channelId, 'danmaku-chaos');
  assert.equal(channel.behaviorProfileId, 'ticker');
  assert.equal(channel.visualProfileId, 'visual.danmaku');
  assert.equal(channel.policy.suppression, 'off');
  assert.equal(channel.profile.channelId, 'danmaku-chaos');
});

test('behavior channels provide a default and resolve unknown names safely', () => {
  const channels = createBehaviorChannels({ 'deepseek-maid': { behaviorProfileId: 'popup' } });
  assert.ok(channels[DEFAULT_BEHAVIOR_CHANNEL_ID]);
  assert.equal(resolveBehaviorChannel({ channelId: 'missing', channels }).channelId, DEFAULT_BEHAVIOR_CHANNEL_ID);
  assert.equal(resolveBehaviorChannel({ channelId: 'deepseek-maid', channels }).behaviorProfileId, 'popup');
});

test('behavior channel rejects unsupported profile modes', () => {
  assert.throws(() => createBehaviorChannel({ channelId: 'bad', behaviorProfileId: 'unknown' }), (error) => error.code === 'BEHAVIOR_CHANNEL_PROFILE_INVALID');
});

test('event lane is the same routing unit under the new name', () => {
  assert.equal(DEFAULT_EVENT_LANE_ID, DEFAULT_BEHAVIOR_CHANNEL_ID);
  const lane = createEventLane({ channelId: 'mail', behaviorProfileId: 'stack' });
  assert.equal(lane.channelId, 'mail');
  assert.equal(resolveEventLane({ channelId: 'mail', channels: { mail: lane } }).channelId, 'mail');
});
