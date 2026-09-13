## 1. 这一块怎么读

从上到下一条竖流：落点（带子贴顶还是贴底）→ 流速（滑杆定速，随机另起一行）→ 分轨（几条道、同轨距、异轨距）→ 指针（过不过鼠标）。气质：安静克制的卡片工作室，像一条暗绿台面上的测流槽，先看见带子再动手，不把零件摊成一盘。

## 2. 结构

`tickerSection()` 完整替换稿。逻辑常量与现有函数相同；只改 DOM 顺序。禁止再用 `inline-pair` 把带子和速度并排，禁止 `slider-row with-action`。

```js
function tickerSection(ticker, behaviorId) {
  const config = ticker ?? {};
  const storedBandPercent = Math.round((config.bandRatio ?? TICKER_DEFAULTS.bandRatio) * 100);
  const band = config.band ?? TICKER_DEFAULTS.band;
  const speed = config.speedPxPerSec ?? TICKER_DEFAULTS.speedPxPerSec;
  const gap = config.minGapPx ?? TICKER_DEFAULTS.minGapPx;
  const trackGap = config.trackGapPx ?? TICKER_DEFAULTS.trackGapPx;
  const tracks = config.trackCount ?? TICKER_DEFAULTS.trackCount;
  const bandFillPercent = (!Number.isInteger(tracks) || tracks < 1)
    ? Math.max(15, Math.min(100, storedBandPercent))
    : Math.max(15, Math.min(100, Math.round(tracks * 84 / 1080 * 100)));
  const trackNote = tracks === 0
    ? '旧自动档，改数字即按条数主控'
    : '填几就是几行。带子高度跟着变，贴顶或贴底。';
  return '<details class="fold ticker-section" id="ticker-section"' + (behaviorId === 'ticker' ? ' open' : ' hidden') + ' aria-label="弹幕怎么流">'
    + '<summary>弹幕怎么流 <small>从右往左，看过即走</small></summary>'
    + '<div class="fold-body">'
    + '<p class="group-hint">卡片从右往左流过，看过即走，不占角落。</p>'
    + '<div class="ticker-flow-stage">'
    + '<div class="field"><span class="label">弹幕带位置</span>'
    + '<div class="band" id="ticker-band-control" data-side="' + escapeHtml(band) + '"><div class="band-fill" id="ticker-band-fill" style="height:' + bandFillPercent + '%"></div>'
    + '<button type="button" class="band-hit top" data-band="top">顶部</button>'
    + '<button type="button" class="band-hit bottom" data-band="bottom">底部</button></div>'
    + '<select id="ticker-band" class="mode-contract-select" aria-label="弹幕带位置" tabindex="-1" aria-hidden="true">'
    + '<option value="top"' + (band === 'top' ? ' selected' : '') + '>顶部</option>'
    + '<option value="bottom"' + (band === 'bottom' ? ' selected' : '') + '>底部</option></select>'
    + '<input id="ticker-band-ratio" type="hidden" value="' + bandFillPercent + '">'
    + '</div></div>'
    + '<div class="ticker-flow-pace">'
    + '<div class="field"><label for="ticker-speed">速度</label>'
    + '<div class="slider-row"><input id="ticker-speed" type="range" min="' + TICKER_SPEED_BOUNDS.min + '" max="' + TICKER_SPEED_BOUNDS.max + '" step="10" value="' + speed + '"' + (config.speedRandom ? ' disabled' : '') + '>'
    + '<div class="slider-val" id="ticker-speed-val">' + (config.speedRandom ? '随机' : speed) + '</div></div>'
    + '<div class="ticker-flow-random">'
    + '<button type="button" id="ticker-speed-random" class="chip' + (config.speedRandom ? ' is-on' : '') + '" aria-pressed="' + (config.speedRandom ? 'true' : 'false') + '">随机</button>'
    + '<p class="field-note">点随机：每条弹幕自己抽一个速度。滑杆是固定速度。</p>'
    + '</div></div></div>'
    + '<div class="ticker-flow-lanes">'
    + '<div class="field"><label for="ticker-track-count">轨道数</label>'
    + '<input id="ticker-track-count" type="number" min="0" step="1" value="' + escapeHtml(String(tracks)) + '">'
    + '<p class="field-note">' + trackNote + '</p></div>'
    + '<div class="ticker-flow-gaps">'
    + '<div class="field"><label for="ticker-min-gap">同轨间距</label>'
    + '<div class="slider-row"><input id="ticker-min-gap" type="range" min="' + TICKER_MIN_GAP_BOUNDS.min + '" max="' + TICKER_MIN_GAP_BOUNDS.max + '" value="' + gap + '">'
    + '<div class="slider-val" id="ticker-min-gap-val">' + gap + '</div></div></div>'
    + '<div class="field"><label for="ticker-track-gap">异轨间距</label>'
    + '<div class="slider-row"><input id="ticker-track-gap" type="range" min="' + TICKER_TRACK_GAP_BOUNDS.min + '" max="' + TICKER_TRACK_GAP_BOUNDS.max + '" value="' + trackGap + '">'
    + '<div class="slider-val" id="ticker-track-gap-val">' + trackGap + '</div></div></div>'
    + '</div></div>'
    + '<div class="ticker-flow-pointer">'
    + '<div class="field"><span class="label">指针</span>'
    + '<button type="button" id="ticker-click-through" class="chip' + (config.clickThrough !== false ? ' is-on' : '') + '" aria-pressed="' + (config.clickThrough !== false ? 'true' : 'false') + '">不挡点击</button>'
    + '<p class="field-note">开着：弹幕从鼠标上穿过，点不到、也拖不走。</p></div>'
    + '</div></div></details>';
}
```

## 3. CSS

只挂这一块。沿用现有 token。不要渐变、不要紫色、不要大阴影。不要改全局 `.inline-pair` / `.fields`（堆叠区仍用它们）。

```css
.ticker-section .fold-body {
  gap: 20px;
  max-width: 560px;
}

.ticker-section .ticker-flow-stage,
.ticker-section .ticker-flow-pace,
.ticker-section .ticker-flow-lanes,
.ticker-section .ticker-flow-pointer {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.ticker-section .band {
  width: 100%;
  height: 96px;
}

.ticker-section .slider-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.ticker-section .slider-row input[type="range"] {
  width: 100%;
  min-width: 0;
  height: var(--ctrl-h);
  margin: 0;
}

.ticker-section .ticker-flow-random {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.ticker-section .ticker-flow-random #ticker-speed-random {
  flex: 0 0 auto;
}

.ticker-section .ticker-flow-random .field-note {
  margin: 0;
  flex: 1 1 200px;
}

.ticker-section .ticker-flow-lanes .field input[type="number"] {
  max-width: 160px;
}

.ticker-section .ticker-flow-gaps {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px 20px;
  min-width: 0;
}

.ticker-section .ticker-flow-pointer .chip {
  width: fit-content;
}

@media (max-width: 560px) {
  .ticker-section .fold-body {
    max-width: none;
  }
  .ticker-section .ticker-flow-gaps {
    grid-template-columns: minmax(0, 1fr);
  }
  .ticker-section .ticker-flow-random {
    flex-direction: column;
    align-items: flex-start;
  }
  .ticker-section .ticker-flow-lanes .field input[type="number"] {
    max-width: none;
  }
}
```

## 4. 验收

- 随机：`#ticker-speed-random` 不在 `.slider-row` 里；窄栏拖速度滑杆点不到它；`aria-pressed` 与 `.is-on` 仍由现有脚本切换。
- 轨道数：`#ticker-track-count` 仍是 `type="number"`，`min="0"`，无 `max`。
- 异轨间距：`#ticker-track-gap` 仍在，range 0–48，读数 `#ticker-track-gap-val` 仍在。
- 窄宽度（&lt;560）：带子 100% 宽不撑破；速度行只有「滑杆 + 64px 读数」两列；同轨/异轨改单列；随机单独一行可点；无横向溢出。
- 名实：`ticker-section` / `ticker-band-control` / `ticker-band` / `ticker-band-fill` / `ticker-band-ratio` / `ticker-speed` / `ticker-speed-val` / `ticker-speed-random` / `ticker-track-count` / `ticker-min-gap` / `ticker-track-gap` / `ticker-click-through` 一个不缺；summary 仍写「弹幕怎么流」。
