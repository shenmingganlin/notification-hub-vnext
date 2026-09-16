# 2026-09-15 视觉工作室面板壳

## 目标

视觉设置页从「说明书底部分割线」改成与声音页 / 通知中心同一套功能板：细边、圆角、surface 底。用户原话：「他们的前端都有边框，功能分得很清晰，而我们目前的感觉像是文本排版。」

## 非目标

- 不改 collect()、控件 id、试一条 / 保存 / 实时预览逻辑
- 不改通道、皮肤、Native、协议、声音、历史
- 不重排字段、不把次要区默认展开
- 不另起配色；沿用现有 `--bg --surface --raised --line --accent`

## 块 → 板

| 现有 | 变成 |
|---|---|
| `.hero` | 留在板外（对声音页的 header） |
| `#visual-global-switch` | `.panel`，标题「全局视觉」；hint 进板内 |
| `.mode-block` | `.panel`，标题「出现方式」；保留芯片下那句「换堆叠或弹幕，外观不会另起一套。」 |
| `#stack-section` / `#ticker-section` / `#appearance-section` / `#visual-preview` | `details.fold.panel`（已有 summary，不再加 h2） |
| `.studio-secondary` 四个 fold | 同样 `.panel`；默认折着；去掉顶部分割线 |

隐藏的堆叠/弹幕板继续 `hidden`，不占缝。

## 视觉约束

从 `plugin/routes/settings-sound.js` 的 `.panel` 对齐，略收 padding 以免一屏被撑破：

- 板：`border: 1px solid var(--line); border-radius: 12px; background: var(--surface);`
- 板内边距：`16px 20px`（不要 24）
- 板与板：`.studio-main` / `.studio-secondary` `display:grid; gap:16px;`
- 控件圆角仍用 `--radius:7px`，不要把 chip/input 改成 12
- `.fold` 不再用 `border-bottom` 当房间
- `.studio-secondary` 去掉 `border-top`
- `.fold-body` 取消 `max-width:720px`（舞台吃满板宽）；`.fields` 仍 `max-width:720px`
- 窄屏 padding 跟着现有 820/560 断点收，不新造布局

## 验收

1. `node --test tests/node/settings-visual-route.test.mjs` 全绿；补一条：页面含 `mode-block panel`（或等价 class）且仍有「换堆叠或弹幕，外观不会另起一套」
2. 控件 id 与 `collect()` 字段不变
3. 打开弹幕时堆叠板不占位；次要四块默认闭合
4. 不打冻结包；试看包仍走 `scripts/pack-try-zip.py`
