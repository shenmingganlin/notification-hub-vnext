// 事件巷：通知路由单元。不是飞法通道（堆叠/弹幕池）。
import { createFlightProfile } from './notification-behavior.js';
import { createCardChannelPolicy } from './card-runtime-policy.js';
import { resolveFlightId } from './channel-charter.js';

function laneError(code, message, field) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field } : {};
  return error;
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function text(field, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw laneError('BEHAVIOR_CHANNEL_FIELD_INVALID', `${field} must be a non-empty string`, field);
  }
  return value.trim();
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const DEFAULT_EVENT_LANE_ID = 'default-stack';
export const DEFAULT_BEHAVIOR_CHANNEL_ID = DEFAULT_EVENT_LANE_ID;

export function createEventLane(input = {}) {
  if (!plain(input)) throw laneError('BEHAVIOR_CHANNEL_INVALID', 'event lane must be a plain object', 'channel');
  const channelId = text('channelId', input.channelId ?? input.eventLaneId);
  const ticket = input.behaviorProfileId ?? input.flight ?? 'stack';
  const behaviorProfileId = text('behaviorProfileId', ticket);
  let flight;
  try {
    flight = resolveFlightId(behaviorProfileId, 'behaviorProfileId');
  } catch {
    throw laneError('BEHAVIOR_CHANNEL_PROFILE_INVALID', `Unsupported behavior profile: ${behaviorProfileId}`, 'behaviorProfileId');
  }
  const visualProfileId = text('visualProfileId', input.visualProfileId ?? 'visual.default');
  const policy = createCardChannelPolicy({ ...(input.policy ?? {}), policyId: input.policy?.policyId ?? channelId });
  const profile = createFlightProfile({ flight, profileId: behaviorProfileId, channelId });
  return freeze({
    channelId,
    eventLaneId: channelId,
    behaviorProfileId,
    flight,
    visualProfileId,
    policy,
    profile
  });
}

export function createEventLanes(input = {}) {
  if (!plain(input)) throw laneError('BEHAVIOR_CHANNELS_INVALID', 'channels must be a plain object', 'channels');
  const channels = {};
  for (const [channelId, value] of Object.entries(input)) {
    channels[channelId] = createEventLane({ ...value, channelId });
  }
  if (!channels[DEFAULT_EVENT_LANE_ID]) {
    channels[DEFAULT_EVENT_LANE_ID] = createEventLane({ channelId: DEFAULT_EVENT_LANE_ID });
  }
  return freeze(channels);
}

export function resolveEventLane({
  channelId,
  eventLaneId,
  channels = {},
  fallbackChannelId = DEFAULT_EVENT_LANE_ID
} = {}) {
  const normalized = createEventLanes(channels);
  const requested = typeof (channelId ?? eventLaneId) === 'string' && String(channelId ?? eventLaneId).trim()
    ? String(channelId ?? eventLaneId).trim()
    : fallbackChannelId;
  return normalized[requested] ?? normalized[fallbackChannelId] ?? normalized[DEFAULT_EVENT_LANE_ID];
}

export const createBehaviorChannel = createEventLane;
export const createBehaviorChannels = createEventLanes;
export const resolveBehaviorChannel = resolveEventLane;
