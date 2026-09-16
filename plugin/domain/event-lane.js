// 事件巷：通知路由单元。不是飞法通道（堆叠/弹幕池）。
// 旧名 behavior-channel 仍可用；新代码走这里。

export {
  DEFAULT_BEHAVIOR_CHANNEL_ID as DEFAULT_EVENT_LANE_ID,
  createBehaviorChannel as createEventLane,
  createBehaviorChannels as createEventLanes,
  resolveBehaviorChannel as resolveEventLane
} from './behavior-channel.js';

export {
  DEFAULT_BEHAVIOR_CHANNEL_ID,
  createBehaviorChannel,
  createBehaviorChannels,
  resolveBehaviorChannel
} from './behavior-channel.js';
