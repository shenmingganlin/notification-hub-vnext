import { createFlightProfile } from './notification-behavior.js';
import { createCardChannelPolicy } from './card-runtime-policy.js';
import { resolveFlightId } from './channel-charter.js';

const CHANNEL_FIELDS = Object.freeze(['channelId', 'behaviorProfileId', 'visualProfileId', 'policy']);

function channelError(code, message, field) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field } : {};
  return error;
}
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function text(field, value) { if (typeof value !== 'string' || !value.trim()) throw channelError('BEHAVIOR_CHANNEL_FIELD_INVALID', `${field} must be a non-empty string`, field); return value.trim(); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export const DEFAULT_BEHAVIOR_CHANNEL_ID = 'default-stack';

export function createBehaviorChannel(input = {}) {
  if (!plain(input)) throw channelError('BEHAVIOR_CHANNEL_INVALID', 'behavior channel must be a plain object', 'channel');
  const channelId = text('channelId', input.channelId);
  const behaviorProfileId = text('behaviorProfileId', input.behaviorProfileId ?? 'stack');
  let flight;
  try {
    flight = resolveFlightId(behaviorProfileId, 'behaviorProfileId');
  } catch {
    throw channelError('BEHAVIOR_CHANNEL_PROFILE_INVALID', `Unsupported behavior profile: ${behaviorProfileId}`, 'behaviorProfileId');
  }
  const visualProfileId = text('visualProfileId', input.visualProfileId ?? 'visual.default');
  const policy = createCardChannelPolicy({ ...(input.policy ?? {}), policyId: input.policy?.policyId ?? channelId });
  const profile = createFlightProfile({ flight, profileId: behaviorProfileId, channelId });
  return freeze({ channelId, behaviorProfileId, visualProfileId, policy, profile });
}

export function createBehaviorChannels(input = {}) {
  if (!plain(input)) throw channelError('BEHAVIOR_CHANNELS_INVALID', 'channels must be a plain object', 'channels');
  const channels = {};
  for (const [channelId, value] of Object.entries(input)) channels[channelId] = createBehaviorChannel({ ...value, channelId });
  if (!channels[DEFAULT_BEHAVIOR_CHANNEL_ID]) channels[DEFAULT_BEHAVIOR_CHANNEL_ID] = createBehaviorChannel({ channelId: DEFAULT_BEHAVIOR_CHANNEL_ID });
  return freeze(channels);
}

export function resolveBehaviorChannel({ channelId, channels = {}, fallbackChannelId = DEFAULT_BEHAVIOR_CHANNEL_ID } = {}) {
  const normalized = createBehaviorChannels(channels);
  const requested = typeof channelId === 'string' && channelId.trim() ? channelId.trim() : fallbackChannelId;
  return normalized[requested] ?? normalized[fallbackChannelId] ?? normalized[DEFAULT_BEHAVIOR_CHANNEL_ID];
}
