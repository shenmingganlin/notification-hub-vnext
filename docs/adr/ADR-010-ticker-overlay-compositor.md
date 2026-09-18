# ADR-010：弹幕幕布走合成器精灵

- 状态：Accepted
- 日期：2026-09-17
- 范围：弹幕渲染后端；一座池一块幕布 HWND；每张弹幕卡一个 DirectComposition visual
- 关联：ADR-004（覆盖层后端，本记录把「按帧重绘整张表面」升成合成器偏移）、ADR-003（stack 红线）、ADR-007（堆叠仍一卡一窗）
- 产品版本：0.1.8（不升号）

## 背景

ADR-004 要把弹幕从一卡一窗换成覆盖层，好让打满不跟 HWND 数线性涨。当时写的是「一块画布，按帧重绘」。持久刀已经钉死：不准用 `UpdateLayeredWindow` 当移动。若幕布每帧把整条带子 ULW/Present，就是用上传当移动，中等密度都可能比现在更卡。

现行分层窗底层已是 DWM visual。这一刀把 visual 树拿到进程里，不再为每张弹幕开 HWND。

## 决策

1. **新铁律：位移是合成器的事。卡面是纹理。上传只发生在内容变时。**
2. **一座弹幕池一块幕布 HWND**（`WS_EX_NOREDIRECTIONBITMAP`），工作区大小。无弹幕卡时拆掉，空闲零开销。
3. **每张弹幕卡一个 DComp visual。** 内容变才重画卡面并写 surface；平移只 `SetOffset` + 一次 `Commit`。禁止每帧整带 ULW/Present 当主路径。
4. **堆叠仍一卡一 HWND。** 幕布 TOPMOST，堆叠窗压在幕布之上。
5. **点穿是通道法律，语义不变。幕布只是背景。** USER 命中区是卡面并集（`SetWindowRgn`），空处不在窗里。开着时再加 `WS_EX_TRANSPARENT`，连卡面也不吃鼠标。关着时只有卡面矩形 `HTCLIENT`。弹幕仍不拖。
6. **`scene.*` 语义不变。** 弹幕卡仍 create/update/dismiss；Native 内部不再为它建卡窗。
7. **图集 + 一次 Present、WinRT Composition、D3D 自定义粒子、路径飞、淡入，都不进本刀。** 风暴密度若把 visual 数量打穿，另开刀。

## 后果

- 钉死包已是 overlay 验收包 `dist/notification-hub-vnext-0.1.8.zip` SHA256 `CA8484EC76A32751CB4698A2F09CB7F7AB0FAF4BD0F93689B5BE32508E851B21`。follow / newest / coil / overlay 历史试包不准覆盖。下一刀试包打 `dist/notification-hub-vnext-0.1.8-hover.zip`。
- 不改 CMake `VERSION`。DComp 实现进现有 `window.cpp` / `renderer.cpp` / `controller.cpp`，数学进 `runtime/scene/overlay.hpp`。vcxproj 补链 `dcomp.lib`。
- ADR-004 从 Proposed 收为 Accepted；「按帧重绘整张表面」以本记录为准。
