# ADR-006：飞法、通道规约、卡片动态

- 状态：Accepted
- 日期：2026-09-16
- 范围：视觉后端词表与户口；Native 弹幕出生；配置包边界
- 关联：`docs/superpowers/plans/2026-09-16-lexicon-and-channel-charter.md`；补 ADR-005
- 产品版本：0.1.8

## 背景

ADR-005 把通道定为一种飞法一个池，但把速度、方向和外层法律写在一起，方案里又寄居停靠与弹幕带。`behavior` 同时指飞法门票、事件路由、弹幕参数和关闭方式。Native 重建通道时，最后一张带 ticker 的卡覆盖整池。

## 决策

1. **词表**（代码以此为准；协议旧键当别名）

   | 中文 | 英文 | 职责 |
   |---|---|---|
   | 飞法 | `flight` | `stack` / `ticker`（`popup`、`path` 以后） |
   | 飞法通道 | `flightChannel` | 一座池 |
   | 规约 | `charter` | 全池一份法律 |
   | 动态 | `motion` | 这张卡的速度、方向 |
   | 寿命 | `life` | 关闭、停留 |
   | 卡面 | `face` | 零件树 |
   | 事件巷 | `eventLane` | 通知路由，不是飞法池 |
   | 落点 | `settle` | 现仅 `snap`；`follow` 以后才是 PID |

2. **户口**：本机 `channels.stack` / `channels.ticker` 为规约权威。方案只保存飞法 + 动态 + 寿命 + 卡面。配置包不含规约。

3. **弹幕**：现行 ticker = 平动。方向、速度是卡片动态。带、轨、同轨净空、满轨、点穿是规约。函数路径以后新飞法新池。

4. **Native**：通道规约不得被后一张卡覆盖。出生方向、速度锁进该卡 `TickerMotion`。堆叠规约 `settle` 仅 `snap`。

5. **错误**：`FLIGHT_` / `CHARTER_` / `MOTION_` / `LIFE_` / `LANE_` / `LEXICON_`，带 `field`、`expected`、`actual`。

## 后果

- ADR-005「外层含速度」作废；速度归动态。
- 事件巷（原 `behavior-channel.js`）不得改名为飞法通道。
- 不实现 PID、路径、淡入。工作室 DOM 另刀。
