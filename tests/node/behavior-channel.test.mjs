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
  createEventLanes,
  resolveEventLane
} from '../../plugin/domain/event-lane.js';

test('event lane is a user-named routing unit with flight ticket and policy', () => {
  const lane = createEventLane({
    channelId: 'danmaku-chaos',
    behaviorProfileId: 'ticker',
    visualProfileId: 'visual.danmaku',
    policy: { suppression: 'off', maxVisible: 1000, overflow: 'allow' }
  });
  assert.equal(lane.channelId, 'danmaku-chaos');
  assert.equal(lane.eventLaneId, 'danmaku-chaos');
  assert.equal(lane.behaviorProfileId, 'ticker');
  assert.equal(lane.flight, 'ticker');
  assert.equal(lane.visualProfileId, 'visual.danmaku');
  assert.equal(lane.policy.suppression, 'off');
  assert.equal(lane.profile.channelId, 'danmaku-chaos');
});

test('event lane accepts flight and eventLaneId aliases', () => {
  const lane = createEventLane({ eventLaneId: 'mail', flight: 'danmaku' });
  assert.equal(lane.channelId, 'mail');
  assert.equal(lane.eventLaneId, 'mail');
  assert.equal(lane.flight, 'ticker');
  assert.equal(lane.behaviorProfileId, 'danmaku');
});

test('event lanes provide a default and resolve unknown names safely', () => {
  const lanes = createEventLanes({ 'deepseek-maid': { behaviorProfileId: 'popup' } });
  assert.ok(lanes[DEFAULT_EVENT_LANE_ID]);
  assert.equal(resolveEventLane({ channelId: 'missing', channels: lanes }).channelId, DEFAULT_EVENT_LANE_ID);
  assert.equal(resolveEventLane({ eventLaneId: 'deepseek-maid', channels: lanes }).behaviorProfileId, 'popup');
});

test('event lane rejects unsupported flight tickets', () => {
  assert.throws(() => createEventLane({ channelId: 'bad', behaviorProfileId: 'unknown' }), (error) => error.code === 'BEHAVIOR_CHANNEL_PROFILE_INVALID');
});

test('old behavior-channel file is a shim of the event lane', () => {
  assert.equal(DEFAULT_EVENT_LANE_ID, DEFAULT_BEHAVIOR_CHANNEL_ID);
  assert.equal(createBehaviorChannel, createEventLane);
  assert.equal(createBehaviorChannels, createEventLanes);
  assert.equal(resolveBehaviorChannel, resolveEventLane);
  const channel = createBehaviorChannel({ channelId: 'legacy', behaviorProfileId: 'stack' });
  assert.equal(channel.eventLaneId, 'legacy');
  assert.equal(resolveBehaviorChannel({ channelId: 'missing', channels: {} }).channelId, DEFAULT_BEHAVIOR_CHANNEL_ID);
});
