# 工作室松绑范围 + 字样式 + 应用后刷新

> 一刀三件事。不做字体导入、不改通道、不打冻结包。

**Goal:** 工作室数字上下限按拍板表松开；标题/正文加加粗、斜体、下划线、删除线；应用到事件后配置包列表的「N 个事件 / 未使用」立刻更新。

## 拍板表

| 项 | 新范围 |
|---|---|
| 卡宽 | 1–1920 |
| 卡高 | 1–1080 |
| 零件左 / 上 | 0–1920 / 0–1080 |
| 区域宽 / 高 | 1–1920 / 1–1080 |
| 圆角 | 0–480 |
| 描边宽（根和零件） | 0–32 |
| 绘制溢出 | 0–240 |

字号 8–72 不动。零件不钳在根内。卡/零件宽高不能为 0。

弹幕 `notificationCardDimensions` 里 240–720 / 56–120 的暗钳一并拆掉，默认仍 480×76。

## A. 数字范围

必须同步改，漏一处保存或建卡会失败：

- `plugin/domain/card-visual-settings.js`：appearance width/height、borderRadius、borderWidth、paintOverflow；parts 几何；`properties.shape` 与 `skin.decoration` 的圆角/描边（collect 会写这三处）
- `plugin/domain/card-part-tree.js`：x/y/w/h 钳位
- `plugin/index.js` `notificationCardDimensions`
- `plugin/routes/settings-visual.js`：标签和 input min/max
- `plugin/routes/settings-visual-client.js`：collect / 即时预览 / 零件 flush 的 min/max
- Native：`visual.hpp` `valid_visual_style`（radius 480、border 32、overflow 240）；`geometry.hpp` `clamp_paint_overflow` 240；`named_pipe.cpp` 零件 `strokeWidth` 0–32

测试：页面标签含新范围；collect 写出 width=1920、height=1、borderRadius=480、strokeWidth=32、paintOverflow=240 能过校验；旧值 420×220 仍合法。

## B. 字样式（仅 title/body）

字段（有值才进 profile；缺省=现状）：

- `fontBold` boolean：标题默认 true，正文默认 false
- `fontItalic` boolean 默认 false
- `fontUnderline` boolean 默认 false
- `fontStrike` boolean 默认 false

UI：四个独立芯片，可叠，可跟彩色字一起开。关闭钮/根没有。

Native：

- `CardPart` 四个 bool；named_pipe 必须认这四个 key，未知 key 会拒卡
- `format_for_part` 缓存键加上 weight + italic；bold → `DWRITE_FONT_WEIGHT_BOLD`，否则 `NORMAL`；italic → `DWRITE_FONT_STYLE_ITALIC`
- 画字走 `IDWriteTextLayout`：underline / strikethrough 用 `SetUnderline` / `SetStrikethrough`；彩虹路径同样套上。弹幕描边仍深色。

工作室预览：`font-weight` / `font-style` / `text-decoration`。

测试：芯片存在；collect 写出 body.fontItalic=true 等并保存后再读回来；`paintPartTree` 把样式写进 title/body，close 没有。

## C. 应用到事件后刷新配置包区

洞：`applyVisual()` 只 `loadBoundEvents()`，`state.profiles[].references` 和 `#visual-profile-list` 的「未使用 / N 个事件」不更新。

修：apply 成功后 `GET visual-profiles`，写入 `state.profiles`，再 `refreshProfiles()`，然后照旧 `loadBoundEvents()`。

测试：client 源码里 apply 成功路径会拉 `visual-profiles` 并 `refreshProfiles`。

## Native 编译

CMake 不在 PATH：

`& "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" --build "build/vs2022-fill-fix" --config Release --target notification-hub-runtime`

拷到 `plugin/runtime/notification-hub-runtime.exe`。不要打 zip。

## 不要动

字体导入、通道、协议其它字段、冻结 zip、填充透明度（wallpaper `SetOpacity(1)`、描边 alpha=1）。
