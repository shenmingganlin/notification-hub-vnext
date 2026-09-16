# 0.1.8 词表残留清单

对照 ADR-006。本刀**不删**协议旧键，只分类。删除旧键另开刀。

## 正名已立

| 正名 | 落点 |
|---|---|
| `flight` / `flightChannel` | `channel-charter.js`、`visual-event-native-flight.js`、`createFlightProfile` |
| `StackCharter.settle` | 现仅 `snap`；`follow` → `CHARTER_SETTLE_UNSUPPORTED` |
| `eventLane` | `event-lane.js` 正本；`behavior-channel.js` 只 re-export |
| 工作室可见文案 | 飞法 / 通道 / 这张卡 / 卡面；不再用「行为」当飞法 |

## 必须留下的兼容别名

| 旧名 | 实际是 | 为什么留 |
|---|---|---|
| `behaviorId` | 飞法门票 | 方案 JSON、发卡对象、工作室 collect 双写 |
| `behaviorProfileId` / `behaviorChannelId` | 飞法 / 飞法通道 | Native 协议、scene-state 快照 |
| `behaviorChannels` | 飞法通道数组 | scene-state JSON 未改键 |
| `createBehaviorProfile` | `createFlightProfile` | 旧 import |
| `VISUAL_BEHAVIOR_*` | `FLIGHT_*` / `LIFE_*` | 诊断旧码；并行 `lexiconCode` |
| `BEHAVIOR_MODES` | `FLIGHT_MODES` | 枚举别名 |
| `behavior-channel.js` | 事件巷 | 用户可命名的通知路由，不是飞法池 |

声音里的 `channel` / `quiet-mode` 是音频语义，不是飞法，不要改名。

## 业务层仍握旧名（已知，不本刀清）

- `plugin/index.js` 发卡路径仍组装 `behaviorProfileId` / `behaviorChannelId` 给协议
- `plugin/runtime/scene-state.js` 仍校验 `behaviorChannels`
- `plugin/runtime/card-runtime.js`、`channel-runtime.js` 字段名仍是 `behaviorId`
- `visual-settings.js` 内部仍读 `behaviorId`，写入时同时写 `flight`

下一主版本才删旧键。PID 刀不要借机改这些名字。
