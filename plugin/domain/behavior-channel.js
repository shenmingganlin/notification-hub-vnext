// 兼容旧 import。新代码走 event-lane.js。
export {
  DEFAULT_EVENT_LANE_ID,
  DEFAULT_BEHAVIOR_CHANNEL_ID,
  createEventLane,
  createEventLanes,
  resolveEventLane,
  createBehaviorChannel,
  createBehaviorChannels,
  resolveBehaviorChannel
} from './event-lane.js';
