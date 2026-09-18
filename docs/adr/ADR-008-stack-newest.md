# ADR-008：堆叠新位（占角 / 新位）

- 状态：Accepted
- 日期：2026-09-17
- 范围：堆叠通道 `newest`；Native packing 方向映射；工作室新卡芯片
- 关联：ADR-006（规约户口）、ADR-007（落点 follow）
- 产品版本：0.1.8（不升号）

## 背景

09-16 往哪长把 Native `direction` 与用户 `grow` 反向，好让最新一张占停靠角。蛇形走线故意不反向，于是同一座池有时占角、有时开新位。测试里两种手感都成立，但这是走线偷改通道法律，不是选项。

## 决策

1. **`newest: dock | next`。默认 `dock`（占角）。** 用户词：占角 / 新位。不要顶部、底部、长边。
2. **占角**：新卡占停靠角，旧卡沿往哪长让位。JS 仍把 Native `direction` 设成 `grow` 的反面。
3. **新位**：旧卡不动，新卡沿往哪长开下一格。Native `direction` = `grow`。
4. **走线不再决定新位。** 蛇形以前等于新位，是漏洞。要旧蛇形手感就显式选新位。
5. **旧管道没带 `newest` 当 dock。** Native 不根据 newest 再反向一次，只吃 JS 映射后的 direction。
6. **配置包仍不含规约。** 满了仍掀最旧。落点 follow 让占角时旧卡追槽。

## 后果

- 钉死包 `dist/notification-hub-vnext-0.1.8.zip` 不准覆盖。试包打 `dist/notification-hub-vnext-0.1.8-newest.zip`。
- Native 新字段垫在 `StackLayoutOptions` 末尾。
