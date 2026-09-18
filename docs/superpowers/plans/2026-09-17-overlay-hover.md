# 幕布悬停加亮 / 悬停暂停 Implementation Plan

**Goal:** 弹幕在点穿关闭时，悬停加亮与悬停暂停各自可开。点穿开着两个控件禁用，幕布不吃鼠标。

**Architecture:** 加亮是卡片皮（`interaction.hoverHighlight`）。暂停是这张卡的弹幕动态（`ticker.hoverPause`）。通道法律只有点穿。幕布精灵没有独立 HWND，hover 必须在 overlay 上命中卡面矩形后：加亮重画该精灵表面（内容变才上传）；暂停只停那张卡的平动，到位逻辑不改。

## Global Constraints

- 产品仍 **0.1.8**。钉死包 `notification-hub-vnext-0.1.8.zip` SHA256 `CA8484EC76A32751CB4698A2F09CB7F7AB0FAF4BD0F93689B5BE32508E851B21` 不准覆盖。
- overlay / follow / newest / coil 历史试包不准覆盖。试包 `dist/notification-hub-vnext-0.1.8-hover.zip` SHA256 `DCD480E3931079902DA1777AE9323D3732F8997E09C3AB45278EC2269871A980`（3957205 字节）。
- 两个开关独立：只加亮、只暂停、两个都开都合法。默认都关。
- 点穿开着：工作室两颗芯片锁定；Native 即使配置为开也不 hover、不暂停。
- 点穿关着：空处仍不挡（`SetWindowRgn`）；只有卡面吃鼠标。
- 不做路径飞、淡入、粒子、入场出场、皮肤裁切。不热换。
- 堆叠悬停加亮维持原 HWND 路径，不把暂停搬去堆叠。

## 文件

- Modify: `plugin/routes/settings-visual.js` / `settings-visual-client.js`
- Modify: `plugin/domain/native-visual-payload.js` / `channel-charter.js`（暂停已在 TickerMotion，不升格进规约）
- Modify: `runtime/scene/window.cpp`（overlay `WM_MOUSEMOVE` / `WM_MOUSELEAVE`）
- Modify: `runtime/scene/controller.cpp`（命中哪张卡、加亮重画、暂停跳过位移）
- Modify: `docs/superpowers/specs/2026-09-16-studio-charter-card-layout.md`
- Test: 工作室 collect / 点穿锁定；Native overlay 自测 hover 命中与暂停

## 验收

1. 点穿开：两颗芯片灰，说明句共用「不挡点击开着时，弹幕吃不到鼠标」。
2. 点穿关 + 只加亮：鼠标在卡面上卡面变亮，飞法不停。
3. 点穿关 + 只暂停：卡面停住，移开继续飞，不加亮。
4. 点穿关 + 两个都开：停且亮。
5. 空桌面仍点得穿。卡顿不允许；加亮只在 hover 进入/离开时上传纹理。
