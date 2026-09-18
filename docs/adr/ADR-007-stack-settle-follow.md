# ADR-007：堆叠落点 follow（持续追槽）

- 状态：Accepted
- 日期：2026-09-17
- 范围：堆叠通道 `settle`；Native 追槽；工作室落点芯片
- 关联：ADR-004（stack 窗口路径）、ADR-006（词表 / 规约户口）
- 产品版本：0.1.8（不升号）

## 背景

ADR-006 把落点定为 `settle`，当时只承认 `snap`：槽一变，卡立刻 `SetWindowPos` 到新槽。连点试一条会掀旧卡、整列瞬移，看起来跳。用户词是「跟随 / 瞬移」，不是控件名 PID。

## 决策

1. **`settle: follow | snap`。默认 `follow`。** 旧 `scene.set-mode` 没带 `settle` 时 Native 仍当 `snap`，避免旧管道突然开始追。
2. **窗口路径不变（ADR-004）。** 堆叠仍一卡一 HWND。追随只挪窗口，不换渲染后端，不因追随 `paint()` / `UpdateLayeredWindow`，不因追随发 `scene.changed`。
3. **积分器是临界阻尼 PD，无积分项。** `runtime/scene/follow.hpp` header-only，避免 cmake 加 `.cpp`。出生在槽上；已有卡只更新目标，由 tick 追。拖着的卡暂停追随，松手从落点再追。到位（位移/速度阈值）停算、停心跳。
4. **本刀不做：** 路径飞、淡入淡出、粒子、入场出场位移、皮肤/裁切。图层动画不进本刀。
5. **工作室：** 通道区芯片「跟随 / 瞬移」。collect 写 `properties.space.settle`。弹幕区不出现落点。

## 后果

- 钉死包 `dist/notification-hub-vnext-0.1.8.zip` 不准覆盖。试包打 `dist/notification-hub-vnext-0.1.8-follow.zip`。
- Native 新字段只垫结构体末尾。不改 CMake `VERSION`。
- ADR-006「settle 仅 snap / 不实现 PID」以本记录为准。
