# 2026-09-15 刀一：填充透明度

## 目标

`appearance.opacity` 只乘填充（卡板纯色），不乘底图、不乘描边、不乘字。JSON 字段名仍是 `opacity`，界面改叫「填充透明度」。底图 PNG/WebP 自己的 alpha 原样画。

用户原话：「卡片透明度竟然会影响我们的底图！我建议只影响我们的填充，名字改为填充透明度。」

## 非目标

- 不改协议字段名、不改取值范围 0–1
- 不改底图圆角裁切
- 不加字体/字号/彩色字
- 不打冻结包

## Native

`runtime/scene/renderer.cpp`

- 卡板：继续 `hex_color(plate_fill, visual.opacity)`
- 底图：`wallpaper_brush->SetOpacity(1.0f)`（或删掉 SetOpacity，默认 1）。PNG alpha 仍走 WIC。
- 根描边：`hex_color(stroke_color, 1.0f)`，不要再乘 `visual.opacity`

`runtime/app/main.cpp` 的 `--visual-asset-opacity-self-test`：

- 仍用半透明红 PNG
- 把 `visual.opacity` 调到 **0.15**（若仍乘到图上，采样 alpha 会被压到很低）
- 断言采样点 **alpha > 80** 且红色仍明显，证明底图没被 0.15 抹掉
- 同步 `tests/node/native-visual-asset-opacity.test.mjs` 的说明/期望

编 Release（VS2022 BuildTools，目录 `build/vs2022-fill-fix` 或已有可用生成器），拷到 `plugin/runtime/notification-hub-runtime.exe`。

## 工作室

- 标签：`透明度（0–1）` → `填充透明度（0–1）`，id 仍 `prop-opacity`
- `settings-visual-client.js` 预览：不要给 `.stack-card` / `.ticker-card` 整卡 `opacity`
- 背景色改成带 alpha 的 `rgba(...)`（由 hex + opacity 算）
- 字、关闭钮、底图 `<img.studio-bg>` 保持不透明

## 测试

- `node --test tests/node/settings-visual-route.test.mjs`：断言「填充透明度」
- 相关 Native opacity 自测 / node 包装测绿
- collect / 字段名不变

不要打 zip。
