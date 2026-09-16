# 弹幕方向 Implementation Plan

> **For agentic workers:** 按 TDD 垂直切片。先红测试，再最小实现。不要打 zip。

**Goal:** 弹幕池能选右→左或左→右。默认仍右→左。工作室文案、舞台影子、试一条、Native 进出屏一起改。

**Not this knife:** 竖向弹幕、进场淡入、弹幕清场、突脸、整页排版、冻结 zip、打包。

## Defaults

- `ticker.direction`: `"left"` = 飞向左 = 从右往左（现状）
- `"right"` = 飞向右 = 从左往右
- 整池统一，不按条随机
- 已在飞的卡锁出生时的方向，中途改设置不掉头

## Copy

| 位置 | left | right |
|---|---|---|
| `tickerSection` summary small | 从右往左，看过即走 | 从左往右，看过即走 |
| `#preview-copy` / `selectBehavior` | 只演弹幕：从右往左流过这条带。 | 只演弹幕：从左往右流过这条带。 |
| 试一条 ticker content | 弹幕从右往左流过。 | 弹幕从左往右流过。 |

控件：两枚 chip「右 → 左」「左 → 右」，外加隐藏 `<select id="ticker-direction">`（collect 走 value，测试切片能设）。

舞台：现 CSS `@keyframes ticker-flow{from{translateX(720px)}to{translateX(-260px)}}`。`direction=right` 时 `animation-direction: reverse`（或 `.ticker-card.is-right`）。

## Native math

现锁左飞：

- `x = spawn_left − speed × t`
- spawn `x = lane_right`
- 出屏 `card.right < lane.left − 24`
- 净空 `lane_right − ahead.right − minGap`

右飞镜像：

- `x = spawn_left + speed × t`
- spawn `x = lane_left − width`
- 出屏 `card.left > lane.right + 24`
- 净空 `ahead.left − lane_left − minGap`

`VisualStyle.ticker_direction` 垫结构体末尾（`ticker_overflow` 后）。`TickerChannelOptions` 新字段也垫末尾。不要跟 `StackDirection` 那条 layout `direction` 搅在一起（`controller.cpp` ~1055 别动）。

自检变量禁止叫 `near` / `far`。

CMake：`C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe`，目录 `build/vs2022-fill-fix`，target `notification-hub-runtime`。编完拷 exe 到 `plugin/runtime/`。跑 `--ticker-self-test`。

## Files

- `plugin/domain/visual-settings.js` — `TICKER_DEFAULTS` / `TICKER_FIELDS` / `createTickerSettings`
- `plugin/domain/native-visual-payload.js` — 下发 `direction`
- `plugin/routes/settings-visual.js` — chip + 文案 + CSS
- `plugin/routes/settings-visual-client.js` — collect / hydrate / 影子 / preview-copy
- `plugin/index.js` — 试一条正文跟当前 direction
- `docs/superpowers/specs/ticker-behavior-contract.md` §2 direction 解锁
- `runtime/scene/ticker.hpp` + `ticker.cpp`
- `runtime/scene/visual.hpp`
- `runtime/transport/named_pipe.cpp`
- `runtime/scene/controller.cpp` spawn / 净空 / 出屏
- `runtime/app/main.cpp` `--ticker-self-test`
- tests: `ticker-settings.test.mjs`、`settings-visual-route.test.mjs`（collect 默认 left；设 `ticker-direction=right` 能收回）、`native-visual-payload` 相关断言

`collect()` 被测试单独切片：方向用 `value("ticker-direction", "left")`，不要调外部 helper。

## Done when

- 默认 left，旧配置不跳
- 选 right 后舞台影子往右飞，summary/preview-copy 改字
- Native `--ticker-self-test` 左右都过
- Node ticker / visual-route / payload 测试过
- 不打 zip，不改 `dist/notification-hub-vnext-0.1.6.zip`
