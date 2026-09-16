import assert from 'node:assert/strict';
import test from 'node:test';
import registerVisualSettingsRoute, { renderVisualSettingsPage, renderVisualSettingsFragment } from '../../plugin/routes/settings-visual.js';
import { VisualSettingsStore } from '../../plugin/domain/visual-settings-store.js';
import { createCardVisualSettings } from '../../plugin/domain/card-visual-settings.js';

function harness() {
  const routes = new Map();
  const app = { get(path, handler) { routes.set(`GET ${path}`, handler); }, post(path, handler) { routes.set(`POST ${path}`, handler); }, delete(path, handler) { routes.set(`DELETE ${path}`, handler); } };
  return { app, routes };
}

function extractFlushAndCollect(html) {
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function flushSelectedPartEditor('));
  const helpersStart = script.indexOf('function isTextPart(');
  const helpersEnd = script.indexOf('function selectedPart(', helpersStart);
  const flushStart = script.indexOf('function flushSelectedPartEditor(');
  const flushEnd = script.indexOf('function selectPart(', flushStart);
  const collectStart = script.indexOf('function collect(');
  const collectEnd = script.indexOf('var previewOpen', collectStart);
  return script.slice(helpersStart, helpersEnd) + script.slice(flushStart, flushEnd) + script.slice(collectStart, collectEnd);
}

test('ticker behavior renders live parameter controls only when selected', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 2, behaviorId: 'ticker', ticker: { speedPxPerSec: 800, band: 'bottom', bandRatio: 0.5, trackCount: 12, minGapPx: 24 }, global: { enabled: true } } },
    revision: 4,
    status: 'applied'
  });
  // 选中弹幕后参数区可见（不带 hidden），并按 profile 回填
  assert.match(html, /id="ticker-section"(?![^>]*hidden)/);
  assert.match(html, /id="ticker-speed"[^>]*value="800"/);
  assert.match(html, /<option value="bottom" selected>底部<\/option>/);
  assert.doesNotMatch(html, /id="ticker-band-ratio"[^>]*type="range"/);
  assert.doesNotMatch(html, /<input[^>]*type="range"[^>]*id="ticker-band-ratio"/);
  assert.doesNotMatch(html, /弹幕带高度/);
  assert.doesNotMatch(html, /按弹幕带高度来算/);
  assert.match(html, /填几就是几行。带子高度跟着变，贴顶或贴底。/);
  assert.match(html, /id="ticker-band-fill"[^>]*height:93%/);
  assert.doesNotMatch(html, /ticker-band-preview/);
  assert.doesNotMatch(html, /ticker-lane\{/);
  // 轨道数不设上限：不能带 max 属性
  assert.match(html, /id="ticker-track-count"[^>]*value="12"(?![^>]*max)/);
  assert.match(html, /id="ticker-min-gap"[^>]*value="24"/);
  assert.match(html, /id="ticker-track-gap"[^>]*value="8"/);
  assert.match(html, /异轨间距/);
  assert.match(html, /id="ticker-speed-random"[^>]*aria-pressed="false"/);
  assert.match(html, /class="ticker-flow-stage"/);
  assert.match(html, /class="ticker-flow-random"/);
  assert.match(html, /id="ticker-speed"[\s\S]*id="ticker-speed-val"[\s\S]*ticker-flow-random[\s\S]*id="ticker-speed-random"/);
  assert.doesNotMatch(html, /slider-row with-action/);
  assert.match(html, /id="ticker-click-through"[^>]*aria-pressed="true"/);
  assert.match(html, /id="ticker-charter"[\s\S]*id="ticker-click-through"/);
  assert.match(html, /id="ticker-card"[\s\S]*id="ticker-hover-highlight"/);
  assert.match(html, /id="ticker-hover-highlight"[^>]*is-locked/);
  assert.match(html, /id="ticker-hover-highlight"[^>]*aria-disabled="true"/);
  assert.match(html, /id="ticker-hover-highlight"[^>]*title="不挡点击开着时，弹幕吃不到鼠标，没法加亮。"/);
  assert.match(html, /id="ticker-hover-why"(?![^>]*hidden)/);
  assert.match(html, /data-axis="behavior" data-value="ticker"[^>]*aria-pressed="true"/);
  assert.match(html, /id="stack-section"[^>]*hidden/);
  assert.doesNotMatch(html, /id="ticker-hover-pause"|id="ticker-overflow"/);
});

test('ticker click-through off unlocks hover highlight', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: {
      profile: {
        version: 2,
        behaviorId: 'ticker',
        ticker: { speedPxPerSec: 400, band: 'top', bandRatio: 0.28, trackCount: 3, minGapPx: 64, clickThrough: false },
        global: { enabled: true },
        card: { activeType: 'minimal', types: { minimal: { properties: { interaction: { hoverHighlight: 'on' } } } } }
      }
    }
  });
  assert.match(html, /id="ticker-click-through"[^>]*aria-pressed="false"/);
  assert.match(html, /id="ticker-hover-highlight"[^>]*aria-pressed="true"/);
  assert.match(html, /id="ticker-hover-highlight"[^>]*aria-disabled="false"/);
  assert.doesNotMatch(html, /id="ticker-hover-highlight"[^>]*is-locked/);
  assert.match(html, /id="ticker-hover-why"[^>]*hidden/);
});

test('visual settings collect emits ticker speedRandom from the random button', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 2, behaviorId: 'ticker', ticker: { speedPxPerSec: 400, band: 'top', bandRatio: 0.28, trackCount: 0, minGapPx: 64, speedRandom: true }, global: { enabled: true } } }
  });
  assert.match(html, /id="ticker-speed-random"[^>]*aria-pressed="true"/);
  assert.match(html, /id="ticker-speed-val"[^>]*>400</);
  assert.doesNotMatch(html, /id="ticker-speed-val"[^>]*>随机</);
  assert.match(html, /studio \.ticker-section \.band-hit\{height:50%/);
  assert.match(html, /id="ticker-track-count"[^>]*value="0"/);
  assert.match(html, /旧自动档，改数字即按条数主控/);
  assert.doesNotMatch(html, /按弹幕带高度来算/);
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function collect('));
  const collectStart = script.indexOf('function collect(');
  const collectEnd = script.indexOf('var previewOpen', collectStart);
  const source = script.slice(collectStart, collectEnd);
  const values = new Map([
    ['global-visual-enabled', { checked: true, value: '' }],
    ['global-visual-default-mode', { value: 'off' }],
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'ticker' }],
    ['ticker-speed', { value: '520' }],
    ['ticker-band', { value: 'bottom' }],
    ['ticker-track-count', { value: '3' }],
    ['ticker-min-gap', { value: '48' }],
    ['ticker-speed-random', { getAttribute: (name) => name === 'aria-pressed' ? 'true' : null, value: '' }],
    ['ticker-click-through', { getAttribute: (name) => name === 'aria-pressed' ? 'false' : null, value: '' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.behaviorId, 'ticker');
  assert.equal(collect.ticker.speedPxPerSec, 520);
  assert.equal(collect.ticker.trackCount, 3);
  assert.equal(collect.ticker.bandRatio, 0.23);
  assert.equal(collect.ticker.speedRandom, true);
  assert.equal(collect.ticker.clickThrough, false);
  assert.equal(collect.ticker.trackGapPx, 8);
});

test('visual settings page renders card studio layout', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 1, global: { enabled: true, preset: 'soft' }, categories: { error: { preset: 'critical' } } } },
    revision: 3,
    status: 'applied'
  });
  assert.match(html, /通知视觉/);
  assert.match(html, /先定通道（全池一份法律）/);
  assert.match(html, /飞法/);
  assert.match(html, /mode-block panel/);
  assert.match(html, /换堆叠或弹幕，卡面不另起一套/);
  assert.match(html, /pipeline-behavior/);
  assert.match(html, /堆叠/);
  assert.match(html, /未实现/);
  assert.match(html, /pipeline-type/);
  assert.match(html, /极简/);
  assert.match(html, /卡面/);
  assert.match(html, /skin-bg-color/);
  assert.doesNotMatch(html, /管理视觉素材/);
  assert.doesNotMatch(html, /visual-assets-open/);
  assert.doesNotMatch(html, /背景素材/);
  assert.match(html, /visual-clear-cards/);
  assert.match(html, /清除屏幕上的视觉卡/);
  assert.match(html, /打开实时预览/);
  assert.match(html, /试一条/);
  assert.match(html, /visual-settings-save/);
  assert.match(html, /<details/);
  assert.match(html, /visual-diagnostics-list/);
  assert.match(html, /实时预览/);
  assert.match(html, /visual-preview/);
  // Convergence: no unbuilt or duplicated controls remain visible
  assert.doesNotMatch(html, /coming-badge/);
  assert.doesNotMatch(html, /后续加入/);
  assert.doesNotMatch(html, /第 1 阶段|已接通/);
  assert.doesNotMatch(html, /<(select|button)[^>]*\sdisabled/);
  assert.doesNotMatch(html, /<input(?![^>]*id="prop-margin-(?:left|right|top|bottom)")[^>]*\sdisabled/);
  assert.doesNotMatch(html, /visibility:hidden/);
  assert.doesNotMatch(html, /skin-radius|skin-opacity|skin-scheme|skin-color-|skin-shadow|skin-border-|skin-blur|skin-density/);
  assert.doesNotMatch(html, /effect-enter|effect-idle|effect-exit/);
  assert.match(html, /id="prop-border-width"/);
  assert.match(html, /id="prop-border-color"/);
  assert.match(html, /描边宽度/);
  assert.match(html, /id="prop-paint-overflow"/);
  assert.match(html, /绘制溢出（0–240）/);
  assert.match(html, /id="prop-paint-overflow"[^>]*max="240"/);
  assert.match(html, /圆角（0–480）/);
  assert.match(html, /id="prop-hover-highlight"/);
  assert.match(html, /悬停加亮/);
  assert.match(html, /id="part-chip-row"/);
  assert.match(html, /data-part="root"/);
  assert.match(html, /data-part="title"/);
  assert.match(html, /data-part="body"/);
  assert.match(html, /data-part="close"/);
  assert.match(html, /data-part="icon"/);
  assert.match(html, /data-part="assistantName"/);
  assert.match(html, /区域圆角（0–240）/);
  assert.match(html, /id="part-fields"[^>]*hidden/);
  assert.match(html, /id="root-fields"/);
  assert.match(html, /id="part-title-fill"/);
  assert.match(html, /id="part-paint-fill"/);
  assert.match(html, /id="part-paint-x"/);
  assert.match(html, /id="part-title-x"/);
  assert.match(html, /id="part-selected"[^>]*value="root"/);
  assert.match(html, /function flushSelectedPartEditor\(/);
  assert.match(html, /function applyModeEditor\(value, restorePart\)/);
  assert.match(html, /selectPart\(part, true\)/);
  assert.match(html, /class="studio"[^>]*data-mode=/);
  assert.doesNotMatch(html, /studio\[data-mode=ticker\] \[data-part=close\]/);
  const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  const mediaAt = css.lastIndexOf('@media(max-width:560px)');
  assert.ok(mediaAt >= 0);
  let depth = 0;
  let mediaEnd = -1;
  for (let i = mediaAt; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) { mediaEnd = i; break; }
    }
  }
  assert.ok(mediaEnd > mediaAt);
  const afterMedia = css.slice(mediaEnd + 1);
  assert.doesNotMatch(afterMedia, /button\.part-hit/);
  assert.doesNotMatch(afterMedia, /data-mode=ticker\] \[data-part=close\]/);
  assert.doesNotMatch(afterMedia, /studio:not\(\[data-mode=ticker\]\) \.stage\{overflow:visible\}/);
  assert.doesNotMatch(afterMedia, /data-close=off\] \[data-part=close\]/);
  assert.doesNotMatch(html, /\.stack-card\{/);
  assert.doesNotMatch(html, /\.ticker-card\{/);
  assert.match(html, /function closePartEnabled\(/);
  assert.match(html, /id="glossary-json"/);
  assert.match(html, />词表</);
  assert.match(html, /id="glossary-add"/);
  assert.match(html, /function readGlossary\(/);
  assert.match(html, /id="bg-adjust"/);
  assert.match(html, /id="bg-adjust-open"/);
  assert.match(html, /id="bg-asset-import"[\s\S]*id="bg-asset-library"[\s\S]*id="bg-adjust-open"/);
  assert.match(html, />素材库</);
  assert.doesNotMatch(html, /function attachStudioBg\(/);
  assert.doesNotMatch(html, /className = "studio-bg"/);
  assert.doesNotMatch(html, /\.studio-bg\{/);
  assert.doesNotMatch(html, /function fillRgba\(/);
  assert.doesNotMatch(html, /className = "stage-face"/);
  assert.doesNotMatch(html, /id="visual-preview-stage"/);
  assert.doesNotMatch(html, /这一屏怎么叠/);
  assert.match(html, /id="hero-preview-status"|class="hero-preview-status"/);
  assert.match(html, /id="visual-preview-state"/);
  assert.match(html, /id="open-visual-preview"/);
  assert.doesNotMatch(html, /card\.style\.opacity/);
  assert.doesNotMatch(html, /;opacity:' \+ opacity \+ ';border:/);
  assert.match(html, /调整底图/);
  assert.match(html, /提取自设置页面/);
  assert.match(html, /id="bg-adjust-legend"/);
  assert.match(html, /bg-adjust-swatch-draw[\s\S]*绘制框/);
  assert.match(html, /bg-adjust-swatch-hit[\s\S]*可点框/);
  assert.doesNotMatch(html, /id="bg-adjust-draw"><span>/);
  assert.doesNotMatch(html, /id="bg-adjust-hit"><span>/);
  assert.match(html, /id="bg-adjust-invert"/);
  assert.match(html, /function openBgAdjust\(/);
  assert.match(html, /function loadBgAdjustImage\(/);
  assert.match(html, /dataUrl/);
  assert.match(html, /id="skin-bg-scale"/);
  assert.match(html, /没有图 · 纯色/);
  assert.doesNotMatch(html, /id="bg-adjust-save"[^>]*class="primary"/);
  assert.match(html, /data-close="on"/);
  assert.doesNotMatch(html, /这一屏怎么叠/);
  assert.doesNotMatch(html, /var titles = \["工具执行完成", "频道新消息"\]/);
  assert.match(html, /function selectPart\(/);
  assert.match(html, /没选中孩子就是在编根/);
  assert.doesNotMatch(html, /prop-blur|prop-shadow/);
  assert.doesNotMatch(html, /prop-title-lines|prop-body-lines|prop-font-scale|prop-line-height|prop-text-overflow/);
  assert.doesNotMatch(html, /prop-max-visible|prop-max-active|prop-max-particles|prop-overflow/);
  assert.doesNotMatch(html, /prop-close-position|prop-hover-pause|prop-expandable|prop-clickable/);
  assert.doesNotMatch(html, /prop-enter-duration|prop-exit-duration/);
  assert.doesNotMatch(html, /if\(false/);
  assert.doesNotMatch(html, /\/\*function profileCard/);
  // One primary action in the normal flow
  assert.equal((html.match(/class="primary"/g) ?? []).length, 1);
  // No old flat structure
  assert.doesNotMatch(html, /scheme-panel/);
  assert.doesNotMatch(html, /workbench-side/);
  assert.doesNotMatch(html, /behavior-channel/);
  assert.doesNotMatch(html, /全部事件/);
  // Still has core elements
  assert.match(html, /visual-page-status/);
  assert.match(html, /已应用/);
  assert.match(html, /返回设置中心/);
  assert.match(html, /syncPreview/);
  assert.match(html, /previewPending/);
  assert.match(html, /function runPreviewUpdate/);
  assert.match(html, /正在发送\/更新/);
  assert.match(html, /visual-preview-confirmation/);
  assert.match(html, /后端已确认/);
  assert.match(html, /data-axis="behavior" data-value="stack"[^>]*aria-pressed="true"/);
  assert.match(html, /data-value="ticker" aria-pressed="false">弹幕<\/button>/);
  assert.doesNotMatch(html, /data-value="ticker"[^>]*aria-disabled/);
  assert.doesNotMatch(html, /axis-chip-code/);
  assert.match(html, /data-axis="behavior" data-value="popup"[^>]*aria-disabled="true"/);
  // 弹幕参数：轨道数是主旋钮；高度不再是可拧的 range
  assert.match(html, /id="ticker-section"/);
  assert.match(html, /id="ticker-band"/);
  assert.match(html, /id="ticker-speed"/);
  assert.doesNotMatch(html, /id="ticker-band-ratio"[^>]*type="range"/);
  assert.match(html, /id="ticker-track-count"/);
  assert.match(html, /id="ticker-min-gap"/);
  assert.doesNotMatch(html, /id="ticker-hover-pause"|id="ticker-overflow"/);
  assert.doesNotMatch(html, /起步预设|卡片外观编辑器|VISUAL WORKBENCH|stack\.main|Native preview/);
  assert.match(html, /id="stack-section"(?![^>]*hidden)/);
  assert.match(html, /class="stack-layout"/);
  assert.match(html, /\.stack-layout \.dock,\.stack-layout \.grow\{[^}]*height:160px/);
  assert.doesNotMatch(html, /class="inline-pair"/);
  assert.match(html, /id="ticker-section"[^>]*hidden/);
  assert.doesNotMatch(html, /data-visual-mode/);
  assert.match(html, /if\s*\(window.__notificationHubVisualDispose\)\s*window.__notificationHubVisualDispose\(\)/);
  assert.match(html, /previewGeneration/);
  assert.match(html, /previewPending\s*&&\s*previewOpen/);
  assert.match(html, /关闭实时预览/);
  assert.match(html, /visual-preview\/close/);
  assert.match(html, /document\.addEventListener\("input",\s*visualInputHandler\)/);
  assert.match(html, /document\.addEventListener\("change",\s*visualInputHandler\)/);
  assert.match(html, /__notificationHubVisualInputHandler/);
  assert.match(html, /function feedback\(id,\s*text,\s*kind\)/);
  assert.doesNotMatch(html, /var feedback=\$\("visual-feedback"\)/);
  assert.match(html, /profileFeedback\s*=\s*\$\("visual-feedback"\)/);
  assert.match(html, /visual-preview\/open/);
  assert.match(html, /visual-preview\/update/);
  assert.match(html, /JSON\.stringify\(studioNativeBody\(\)\)/);
  assert.doesNotMatch(html, /open-visual-workbench|workbench-phase|visual-workbench\/open|workbenchPayload/);
  // Script compilation
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.length >= 1);
  scripts.forEach((script) => assert.doesNotThrow(() => new Function(script)));
  // No open() or document.write
  assert.doesNotMatch(html, /document\.open\(\)/);
  assert.doesNotMatch(html, /overflow-x\s*:\s*hidden/);
  assert.doesNotMatch(html, /分类视觉预设/);
  assert.doesNotMatch(html, /视觉规则/);
  assert.doesNotMatch(html, /window\.confirm/);
});

test('visual studio keeps preview in document flow and contract fields', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    profile: { global: { enabled: true }, card: { activeType: 'popup', types: { popup: { appearance: { width: 480, height: 260 } } } } }
  });
  assert.match(html, /id="pipeline-behavior"[\s\S]*?value="popup" selected/);
  assert.match(html, /id="prop-width"[^>]*value="480"/);
  assert.match(html, /id="prop-height"[^>]*value="260"/);
  assert.doesNotMatch(html, /id="visual-preview-floating"/);
  assert.doesNotMatch(html, /id="visual-preview-stage"/);
  assert.match(html, /class="hero-preview-status"/);
  assert.match(html, /id="visual-preview-state"/);
  assert.match(html, /id="prop-margin-left"/);
  assert.match(html, /id="prop-margin-right"/);
  assert.match(html, /id="prop-margin-top"/);
  assert.match(html, /id="prop-margin-bottom"/);
  assert.match(html, /距左（≥0）/);
  assert.match(html, /距右（≥0）/);
  assert.match(html, /距上（≥0）/);
  assert.match(html, /距下（≥0）/);
  assert.match(html, /只改停靠那两面。另外两面灰色，不挤空间。/);
  assert.doesNotMatch(html, /id="prop-margin-left"[^>]*max=/);
  assert.match(html, /id="prop-margin-left"[^>]*disabled/);
  assert.match(html, /id="prop-margin-top"[^>]*disabled/);
  assert.doesNotMatch(html, /id="prop-margin-right"[^>]*disabled/);
  assert.doesNotMatch(html, /id="prop-margin-bottom"[^>]*disabled/);
  assert.match(html, /id="prop-opacity" type="number" min="0" max="1"/);
  assert.match(html, /背景透明度（0–1）/);
  assert.match(html, /id="part-paint-opacity"[^>]*min="0"/);
  assert.doesNotMatch(html, /背景透明度（0\.01–1）/);
  assert.match(html, /id="studio-sample-field"/);
  assert.match(html, /id="icon-adjust-open"/);
  assert.match(html, /区域宽（1–1920）/);
  assert.match(html, /区域高（1–1080）/);
  assert.match(html, /彩色字/);
  assert.doesNotMatch(html, /<label for="part-paint-w">宽（1–720）<\/label>/);
  assert.doesNotMatch(html, /<label for="prop-opacity">透明度（0–1）<\/label>/);
  assert.match(html, /id="prop-width"[^>]*value="480"(?![^>]*disabled)/);
  assert.doesNotMatch(html, /id="prop-aspect-ratio"/);
  assert.doesNotMatch(html, /grid-template-columns:190px/);
  assert.doesNotMatch(html, /visual-preview-column\{display:block;grid-area:preview;position:sticky/);
  assert.doesNotMatch(html, /stage-card stage-ticker|stage-card stage-popup|preview-channel-list/);
  assert.equal((html.match(/id="visual-preview-stage"/g) ?? []).length, 0);
  assert.doesNotMatch(html, /visual-preview-drag-handle|previewDragHandle/);
  assert.match(html, /setAttribute\("aria-pressed",\s*active\s*\?\s*"true"\s*:\s*"false"\)/);
  assert.doesNotMatch(html, /bindStageDrag/);
  assert.match(html, /pointerdown/);
  assert.doesNotMatch(html, /drag\.moved/);
  assert.match(html, /id="part-paint-fit-width"/);
  assert.match(html, />自适应</);
  assert.match(html, /id="part-paint-fit-compensate"/);
  assert.match(html, />补偿</);
  assert.doesNotMatch(html, /@keyframes ticker-flow/);
});

test('visual studio collect keeps fill opacity 0', () => {
  const html = renderVisualSettingsPage('/settings-visual', { profile: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function collect('));
  const collectStart = script.indexOf('function collect(');
  const collectEnd = script.indexOf('var previewOpen', collectStart);
  const source = script.slice(collectStart, collectEnd);
  const values = new Map([
    ['global-visual-enabled', { checked: true, value: '' }], ['global-visual-default-mode', { value: 'off' }], ['pipeline-type', { value: 'minimal' }], ['pipeline-behavior', { value: 'stack' }],
    ['prop-anchor', { value: 'bottom-right' }], ['prop-size', { value: 'medium' }], ['prop-width', { value: '420' }], ['prop-height', { value: '30' }],
    ['skin-bg-color', { value: '#0e1916' }], ['prop-border-radius', { value: '16' }], ['prop-opacity', { value: '0' }], ['prop-duration', { value: '30000' }], ['prop-hold-duration', { value: '30000' }], ['prop-dismiss-mode', { value: 'closeButton' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.appearance.opacity, 0);
  assert.equal(collect.card.types.minimal.properties.shape.opacity, 0);
  assert.equal(collect.card.types.minimal.skin.decoration.opacity, 0);
  assert.equal(collect.card.types.minimal.appearance.height, 30);
});

test('visual mode collection writes the edited type instead of always overwriting minimal', () => {
  const html = renderVisualSettingsPage('/settings-visual', { profile: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function collect('));
  const collectStart = script.indexOf('function collect(');
  const collectEnd = script.indexOf('var previewOpen', collectStart);
  const source = script.slice(collectStart, collectEnd);
  const values = new Map([
    ['global-visual-enabled', { checked: true, value: '' }], ['global-visual-default-mode', { value: 'off' }], ['pipeline-type', { value: 'popup' }], ['pipeline-behavior', { value: 'popup' }],
    ['prop-anchor', { value: 'bottom-right' }], ['prop-size', { value: 'large' }], ['prop-gap', { value: '16' }], ['prop-width', { value: '500' }], ['prop-height', { value: '280' }], ['skin-bg-color', { value: '#201817' }], ['prop-border-radius', { value: '24' }], ['prop-opacity', { value: '0.99' }], ['prop-duration', { value: '30000' }], ['prop-hold-duration', { value: '30000' }], ['prop-dismiss-mode', { value: 'closeButton' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: { card: { types: { minimal: { marker: 'preserved' } } } } }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.activeType, 'popup');
  assert.equal(collect.card.types.popup.appearance.width, 500);
  assert.equal(collect.card.types.minimal.marker, 'preserved');
});

test('visual settings collect emits nested card visual contract', () => {
  const html = renderVisualSettingsPage('/settings-visual', { profile: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function collect('));
  assert.ok(script);
  const collectStart = script.indexOf('function collect(');
  const collectEnd = script.indexOf('var previewOpen', collectStart);
  const source = collectStart >= 0 && collectEnd > collectStart ? script.slice(collectStart, collectEnd) : null;
  assert.ok(source);
  assert.match(source, /properties:\s*\{\s*space:/);
  assert.match(source, /skin:\s*\{\s*skinId:[\s\S]*background:\s*\{/);
  assert.match(source, /effects:\s*\{\s*effectConfigId:[\s\S]*slots:\s*\{/);
  assert.doesNotMatch(source, /properties:\{size:/);
  assert.doesNotMatch(source, /skin:\s*\{\s*skinId:[\s\S]*backgroundColor:/);
  const values = new Map([
    ['global-visual-enabled', { checked: true, value: '' }], ['global-visual-default-mode', { value: 'off' }],
    ['prop-layout', { value: 'simple' }], ['prop-anchor', { value: 'top-right' }], ['prop-gap', { value: '8' }], ['prop-size', { value: 'medium' }],
    ['skin-bg-color', { value: '#0e1916' }], ['skin-bg-asset', { value: '' }], ['skin-bg-fit', { value: 'fill' }], ['skin-bg-padding', { value: '0' }],
    ['prop-border-radius', { value: '30' }], ['prop-opacity', { value: '0.42' }], ['prop-border-width', { value: '2' }], ['prop-border-color', { value: '#62d0a8' }], ['prop-paint-overflow', { value: '12' }], ['prop-duration', { value: '30000' }], ['prop-hold-duration', { value: '30000' }],
    ['prop-dismiss-mode', { value: 'closeButton' }], ['prop-hover-highlight', { getAttribute: (name) => name === 'aria-pressed' ? 'true' : null }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.properties.space.size, 'medium');
  assert.equal(collect.card.types.minimal.properties.space.grow, 'down');
  assert.equal(collect.card.types.minimal.properties.space.wrap, 'parallel');
  assert.equal(collect.card.types.minimal.properties.space.marginLeft, 18);
  assert.equal(collect.card.types.minimal.properties.space.marginRight, 18);
  assert.equal(collect.card.types.minimal.appearance.width, 420);
  assert.equal(collect.card.types.minimal.appearance.height, 220);
  assert.equal('aspectRatio' in collect.card.types.minimal.appearance, false);
  assert.equal('aspectRatio' in collect.card.types.minimal.properties.space, false);
  // Single source of truth: properties.shape owns the shape value, skin.decoration derives it.
  assert.equal(collect.card.types.minimal.properties.shape.borderRadius, 30);
  assert.equal(collect.card.types.minimal.appearance.borderRadius, 30);
  assert.equal(collect.card.types.minimal.skin.decoration.borderRadius, 30);
  assert.equal(collect.card.types.minimal.properties.shape.opacity, 0.42);
  assert.equal(collect.card.types.minimal.skin.decoration.opacity, 0.42);
  assert.equal(collect.card.types.minimal.appearance.borderWidth, 2);
  assert.equal(collect.card.types.minimal.appearance.borderColor, '#62d0a8');
  assert.equal(collect.card.types.minimal.appearance.paintOverflow, 12);
  assert.equal(collect.card.types.minimal.properties.shape.borderWidth, 2);
  assert.equal(collect.card.types.minimal.properties.interaction.hoverHighlight, 'on');
  assert.equal(collect.card.types.minimal.skin.background.color, '#0e1916');
  assert.equal(collect.card.types.minimal.parts.title.textPaint, 'solid');
  assert.equal(collect.card.types.minimal.parts.body.textPaint, 'solid');
});

test('visual settings collect writes part geometry and omits empty axes', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function collect('));
  const collectStart = script.indexOf('function collect(');
  const collectEnd = script.indexOf('var previewOpen', collectStart);
  const source = script.slice(collectStart, collectEnd);
  const values = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true }],
    ['part-title-x', { value: '0' }], ['part-title-y', { value: '12' }], ['part-title-w', { value: '180' }], ['part-title-h', { value: '34' }],
    ['part-body-x', { value: '900' }], ['part-body-y', { value: '-4' }], ['part-body-w', { value: '0' }], ['part-body-h', { value: '' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.parts.title.x, 0);
  assert.equal(collect.card.types.minimal.parts.title.y, 12);
  assert.equal(collect.card.types.minimal.parts.title.w, 180);
  assert.equal(collect.card.types.minimal.parts.title.h, 34);
  assert.equal(collect.card.types.minimal.parts.body.x, 900);
  assert.equal(collect.card.types.minimal.parts.body.y, 0);
  assert.equal('w' in collect.card.types.minimal.parts.body, false);
  assert.equal(collect.card.types.minimal.parts.title.textPaint, 'solid');
  assert.equal(collect.card.types.minimal.parts.body.textPaint, 'solid');
});

test('visual settings page restores saved part stroke into the visible editor', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: {
      profile: {
        version: 2,
        behaviorId: 'stack',
        global: { enabled: true },
        card: {
          activeType: 'minimal',
          types: {
            minimal: {
              parts: { title: { stroke: '#00ffaa', strokeWidth: 3 } },
              glossary: { '标题色': '#f2fff9' }
            }
          }
        }
      }
    }
  });
  assert.match(html, /id="part-title-stroke-width"[^>]*value="3"/);
  assert.match(html, /id="part-title-stroke"[^>]*value="#00ffaa"/);
  assert.match(html, /id="part-selected"[^>]*value="title"/);
  assert.match(html, /id="part-paint-stroke-width"[^>]*value="3"/);
  assert.match(html, /id="part-paint-stroke"[^>]*value="#00ffaa"/);
  assert.match(html, /id="root-fields"[^>]*hidden/);
  assert.doesNotMatch(html, /id="part-fields"[^>]*hidden/);
  assert.match(html, /class="chip is-on is-selected" data-part="title"/);
  assert.match(html, /function rememberedSelectedPart\(/);
  assert.match(html, /applyModeEditor\(\(\$\("pipeline-type"\) && \$\("pipeline-type"\)\.value\) \|\| "minimal", true\)/);
  assert.match(html, /rememberedSelectedPart\(\) \|\| \(\$\("part-selected"\) && \$\("part-selected"\)\.value\) \|\| "root"/);
  assert.match(html, /ignoreControlWheel/);
  assert.match(html, /function hydrateVisualFromServer\(/);
  assert.match(html, /json\("visual-settings-status"/);
  assert.match(html, /method:\s*"POST"/);
  assert.match(html, /hydrateVisualFromServer\(\)/);
});

test('visual settings fragment restores saved part stroke into the visible editor', () => {
  const fragment = renderVisualSettingsFragment('/settings-content?view=visual', {
    settings: {
      profile: {
        version: 2,
        behaviorId: 'stack',
        global: { enabled: true },
        card: {
          activeType: 'minimal',
          types: {
            minimal: {
              parts: { title: { stroke: '#00ffaa', strokeWidth: 3 } },
              glossary: { '标题色': '#f2fff9' }
            }
          }
        }
      }
    }
  });
  assert.match(fragment, /id="part-selected"[^>]*value="title"/);
  assert.match(fragment, /id="part-paint-stroke-width"[^>]*value="3"/);
  assert.match(fragment, /id="part-paint-stroke"[^>]*value="#00ffaa"/);
  assert.doesNotMatch(fragment, /id="part-fields"[^>]*hidden/);
  assert.match(fragment, /applyModeEditor\(\(\$\("pipeline-type"\) && \$\("pipeline-type"\)\.value\) \|\| "minimal", true\)/);
  assert.match(fragment, /function hydrateVisualFromServer\(/);
  assert.match(fragment, /hydrateVisualFromServer\(\)/);
});

test('visual studio remembers the selected part across remount', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function rememberedSelectedPart('));
  const start = script.indexOf('function isSelectablePart(');
  const end = script.indexOf('function setPartHidden(', start);
  const source = script.slice(start, end);
  const sessionStorage = {
    data: {},
    getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null; },
    setItem(key, value) { this.data[key] = String(value); }
  };
  const remembered = new Function('window', 'sessionStorage', `${source}; rememberSelectedPart("title"); return rememberedSelectedPart();`);
  const windowRef = {};
  assert.equal(remembered(windowRef, sessionStorage), 'title');
  assert.equal(windowRef.__notificationHubSelectedPart, 'title');
  assert.equal(sessionStorage.data['nh-visual-selected-part'], 'title');
  const restored = new Function('window', 'sessionStorage', `${source}; return rememberedSelectedPart();`);
  assert.equal(restored({}, sessionStorage), 'title');
});

test('visual fragment after store save shows the new part stroke instead of the old one', () => {
  const store = new VisualSettingsStore({
    initialSettings: {
      profile: {
        version: 2,
        global: { enabled: true },
        card: {
          activeType: 'minimal',
          types: {
            minimal: {
              parts: { title: { fill: '#ff0000', stroke: '#9f581e', strokeWidth: 2 } }
            }
          }
        }
      }
    }
  });
  const before = renderVisualSettingsFragment('/settings-content?view=visual', {
    settings: store.getSnapshot().settings,
    profile: store.getSnapshot().settings.profile
  });
  assert.match(before, /id="part-paint-stroke-width"[^>]*value="2"/);
  store.updateVisualSettings({
    profile: {
      version: 2,
      global: { enabled: true },
      card: {
        activeType: 'minimal',
        types: {
          minimal: {
            parts: { title: { fill: '#ff0000', stroke: '#9f581e', strokeWidth: 6 } }
          }
        }
      }
    }
  });
  const after = renderVisualSettingsFragment('/settings-content?view=visual', {
    settings: store.getSnapshot().settings,
    profile: store.getSnapshot().settings.profile
  });
  assert.match(after, /id="part-paint-stroke-width"[^>]*value="6"/);
  assert.doesNotMatch(after, /id="part-paint-stroke-width"[^>]*value="2"/);
  assert.match(after, /id="part-title-stroke-width"[^>]*value="6"/);
});

test('visual remount hydrates live POST status instead of trusting SSR HTML', async () => {
  const html = renderVisualSettingsPage('/settings-visual');
  assert.match(html, /function hydrateVisualFromServer\(/);
  assert.match(html, /json\("visual-settings-status"/);
  assert.match(html, /method:\s*"POST"/);
  assert.match(html, /hydrateVisualFromServer\(\)/);
  assert.match(html, /requestOptions\.cache = options\.cache \|\| "no-store"/);
  const { app, routes } = harness();
  const store = new VisualSettingsStore({
    initialSettings: {
      profile: {
        version: 2,
        global: { enabled: true },
        card: {
          activeType: 'minimal',
          types: {
            minimal: {
              parts: { title: { fill: '#ff0000', stroke: '#9f581e', strokeWidth: 2 } }
            }
          }
        }
      }
    }
  });
  registerVisualSettingsRoute(app, {
    _notificationHubVNextPlugin: {
      getVisualSettingsStatus() {
        const snap = store.getSnapshot();
        return { revision: snap.revision, status: snap.status, settings: snap.settings, profile: snap.settings.profile };
      }
    }
  });
  const context = () => ({ req: { url: '/visual-settings-status' }, json(value, status = 200) { return { value, status }; }, header() {} });
  assert.equal(routes.get('GET /visual-settings-status')(context()).value.profile.card.types.minimal.parts.title.strokeWidth, 2);
  store.updateVisualSettings({
    profile: {
      version: 2,
      global: { enabled: true },
      card: {
        activeType: 'minimal',
        types: {
          minimal: {
            parts: { title: { fill: '#ff0000', stroke: '#9f581e', strokeWidth: 6 } }
          }
        }
      }
    }
  });
  const live = routes.get('POST /visual-settings-status')(context());
  assert.equal(live.value.ok, true);
  assert.equal(live.value.profile.card.types.minimal.parts.title.strokeWidth, 6);
});

test('visual settings collect flushes visible part stroke before reading hidden fields', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const source = extractFlushAndCollect(html);
  const values = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['part-selected', { value: 'title' }],
    ['part-paint-fill', { value: '#ffaa00' }],
    ['part-paint-stroke', { value: '#00ffaa' }],
    ['part-paint-stroke-width', { value: '3' }],
    ['part-paint-x', { value: '30' }],
    ['part-paint-y', { value: '12' }],
    ['part-paint-w', { value: '180' }],
    ['part-paint-h', { value: '34' }],
    ['part-title-fill', { value: '' }],
    ['part-title-stroke', { value: '' }],
    ['part-title-stroke-width', { value: '0' }],
    ['part-title-x', { value: '' }],
    ['part-title-y', { value: '' }],
    ['part-title-w', { value: '' }],
    ['part-title-h', { value: '' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.parts.title.fill, '#ffaa00');
  assert.equal(collect.card.types.minimal.parts.title.stroke, '#00ffaa');
  assert.equal(collect.card.types.minimal.parts.title.strokeWidth, 3);
  assert.equal(collect.card.types.minimal.parts.title.textPaint, 'solid');
});

test('visual settings collect keeps glossary fill names while flushing stroke width', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const source = extractFlushAndCollect(html);
  const values = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['glossary-json', { value: '{"\u6807\u9898\u8272":"#f2fff9"}' }],
    ['part-selected', { value: 'title' }],
    ['part-paint-fill', { value: '#ffffff' }],
    ['part-paint-stroke', { value: '#00ffaa' }],
    ['part-paint-stroke-width', { value: '4' }],
    ['part-title-fill', { value: '\u6807\u9898\u8272' }],
    ['part-title-stroke', { value: '' }],
    ['part-title-stroke-width', { value: '0' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.parts.title.fill, '标题色');
  assert.equal(collect.card.types.minimal.parts.title.stroke, '#00ffaa');
  assert.equal(collect.card.types.minimal.parts.title.strokeWidth, 4);
  assert.equal(collect.card.types.minimal.parts.title.textPaint, 'solid');
});

test('setting visible stroke to 0 writes 0 instead of keeping previous 2', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const source = extractFlushAndCollect(html);
  const values = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['part-selected', { value: 'title' }],
    ['part-paint-fill', { value: '#ff0000' }],
    ['part-paint-stroke', { value: '#9f581e' }],
    ['part-paint-stroke-width', { value: '0' }],
    ['part-title-fill', { value: '#ff0000' }],
    ['part-title-stroke', { value: '#9f581e' }],
    ['part-title-stroke-width', { value: '2' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.parts.title.strokeWidth, 0);
  const store = new VisualSettingsStore({
    initialSettings: {
      profile: {
        version: 2,
        global: { enabled: true },
        card: {
          activeType: 'minimal',
          types: {
            minimal: {
              parts: { title: { fill: '#ff0000', stroke: '#9f581e', strokeWidth: 2 } }
            }
          }
        }
      }
    }
  });
  store.updateVisualSettings({
    profile: {
      version: 2,
      global: { enabled: true },
      card: {
        activeType: 'minimal',
        types: {
          minimal: {
            parts: collect.card.types.minimal.parts
          }
        }
      }
    }
  });
  assert.equal(store.getSnapshot().settings.profile.card.types.minimal.parts.title.strokeWidth, 0);
  const fragment = renderVisualSettingsFragment('/settings-content?view=visual', {
    settings: store.getSnapshot().settings,
    profile: store.getSnapshot().settings.profile
  });
  assert.match(fragment, /id="part-title-stroke-width"[^>]*value="0"/);
  assert.match(fragment, /id="part-paint-stroke-width"[^>]*value="0"/);
  assert.doesNotMatch(fragment, /id="part-paint-stroke-width"[^>]*value="2"/);
});

test('visual settings collect writes selected part paint and omits empty parts', () => {
  const html = renderVisualSettingsPage('/settings-visual', { profile: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function collect('));
  const collectStart = script.indexOf('function collect(');
  const collectEnd = script.indexOf('var previewOpen', collectStart);
  const source = script.slice(collectStart, collectEnd);
  const values = new Map([
    ['global-visual-enabled', { checked: true, value: '' }], ['global-visual-default-mode', { value: 'off' }],
    ['pipeline-type', { value: 'minimal' }], ['pipeline-behavior', { value: 'stack' }],
    ['prop-size', { value: 'medium' }], ['prop-anchor', { value: 'bottom-right' }], ['prop-gap', { value: '8' }],
    ['skin-bg-color', { value: '#0e1916' }], ['prop-border-radius', { value: '16' }], ['prop-opacity', { value: '0.96' }],
    ['prop-duration', { value: '30000' }], ['prop-hold-duration', { value: '30000' }], ['prop-dismiss-mode', { value: 'closeButton' }],
    ['part-title-fill', { value: '#ffaa00' }], ['part-title-stroke', { value: '#00ffaa' }], ['part-title-stroke-width', { value: '2' }],
    ['part-body-fill', { value: '' }], ['part-body-stroke', { value: '' }], ['part-body-stroke-width', { value: '0' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.parts.title.fill, '#ffaa00');
  assert.equal(collect.card.types.minimal.parts.title.stroke, '#00ffaa');
  assert.equal(collect.card.types.minimal.parts.title.strokeWidth, 2);
  assert.equal(collect.card.types.minimal.parts.title.textPaint, 'solid');
  assert.equal(collect.card.types.minimal.parts.body.textPaint, 'solid');
});

test('visual settings collect writes glossary names on part paint', () => {
  const html = renderVisualSettingsPage('/settings-visual', { profile: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function collect('));
  const collectStart = script.indexOf('function collect(');
  const collectEnd = script.indexOf('var previewOpen', collectStart);
  const source = script.slice(collectStart, collectEnd);
  const values = new Map([
    ['global-visual-enabled', { checked: true, value: '' }], ['global-visual-default-mode', { value: 'off' }],
    ['pipeline-type', { value: 'minimal' }], ['pipeline-behavior', { value: 'stack' }],
    ['prop-size', { value: 'medium' }], ['prop-anchor', { value: 'bottom-right' }], ['prop-gap', { value: '8' }],
    ['skin-bg-color', { value: '#0e1916' }], ['prop-border-radius', { value: '16' }], ['prop-opacity', { value: '0.96' }],
    ['prop-duration', { value: '30000' }], ['prop-hold-duration', { value: '30000' }], ['prop-dismiss-mode', { value: 'closeButton' }],
    ['glossary-json', { value: '{"\u6807\u9898\u8272":"#f2fff9"}' }],
    ['part-title-fill', { value: '\u6807\u9898\u8272' }], ['part-title-stroke', { value: '' }], ['part-title-stroke-width', { value: '0' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.deepEqual(collect.card.types.minimal.glossary, { '标题色': '#f2fff9' });
  assert.equal(collect.card.types.minimal.parts.title.fill, '标题色');
  assert.equal(collect.card.types.minimal.parts.title.strokeWidth, 0);
  assert.equal(collect.card.types.minimal.parts.title.textPaint, 'solid');
});

test('ticker direction chips and collect default left, recover right', () => {
  const leftHtml = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 2, behaviorId: 'ticker', ticker: { speedPxPerSec: 400, band: 'top', bandRatio: 0.28, trackCount: 3, minGapPx: 64 }, global: { enabled: true } } }
  });
  assert.match(leftHtml, /id="ticker-direction"/);
  assert.match(leftHtml, /data-ticker-direction="left"[^>]*aria-pressed="true"/);
  assert.match(leftHtml, /data-ticker-direction="right"[^>]*>左 → 右</);
  assert.match(leftHtml, /id="ticker-direction-copy">从右往左，看过即走</);
  assert.doesNotMatch(leftHtml, /id="preview-copy"/);
  assert.doesNotMatch(leftHtml, /stage-face/);
  assert.match(leftHtml, /ticker-direction/);
  const rightHtml = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 2, behaviorId: 'ticker', ticker: { speedPxPerSec: 400, band: 'top', bandRatio: 0.28, trackCount: 3, minGapPx: 64, direction: 'right' }, global: { enabled: true } } }
  });
  assert.match(rightHtml, /<option value="right" selected>左 → 右<\/option>/);
  assert.match(rightHtml, /id="ticker-direction-copy">从左往右，看过即走</);
  assert.doesNotMatch(rightHtml, /id="preview-copy"/);
  assert.doesNotMatch(rightHtml, /right:\s*ticker\.direction === "right"/);
  const script = [...leftHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function collect('));
  const collectStart = script.indexOf('function collect(');
  const collectEnd = script.indexOf('var previewOpen', collectStart);
  const source = script.slice(collectStart, collectEnd);
  assert.match(source, /direction:\s*value\("ticker-direction",\s*"left"\)/);
  assert.doesNotMatch(source, /applyTickerDirection/);
  const values = new Map([
    ['global-visual-enabled', { checked: true, value: '' }], ['global-visual-default-mode', { value: 'off' }],
    ['pipeline-behavior', { value: 'ticker' }], ['pipeline-type', { value: 'minimal' }],
    ['prop-size', { value: 'medium' }], ['prop-anchor', { value: 'bottom-right' }], ['prop-gap', { value: '8' }],
    ['skin-bg-color', { value: '#0e1916' }], ['prop-border-radius', { value: '16' }], ['prop-opacity', { value: '0.96' }],
    ['prop-duration', { value: '30000' }], ['prop-hold-duration', { value: '30000' }], ['prop-dismiss-mode', { value: 'closeButton' }],
    ['ticker-speed', { value: '400' }], ['ticker-band', { value: 'top' }], ['ticker-track-count', { value: '3' }], ['ticker-band-ratio', { value: '28' }], ['ticker-min-gap', { value: '64' }], ['ticker-track-gap', { value: '8' }]
  ]);
  const missing = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(missing.ticker.direction, 'left');
  const rightValues = new Map(values);
  rightValues.set('ticker-direction', { value: 'right' });
  const recovered = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => rightValues.get(id) ?? { value: '' });
  assert.equal(recovered.ticker.direction, 'right');
});

test('ticker collect forces hover highlight off while click-through is on', () => {
  const html = renderVisualSettingsPage('/settings-visual', { profile: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function collect('));
  const collectStart = script.indexOf('function collect(');
  const collectEnd = script.indexOf('var previewOpen', collectStart);
  const source = script.slice(collectStart, collectEnd);
  const values = new Map([
    ['global-visual-enabled', { checked: true, value: '' }], ['global-visual-default-mode', { value: 'off' }],
    ['pipeline-behavior', { value: 'ticker' }], ['pipeline-type', { value: 'minimal' }],
    ['prop-size', { value: 'medium' }], ['prop-anchor', { value: 'bottom-right' }], ['prop-gap', { value: '8' }],
    ['skin-bg-color', { value: '#0e1916' }], ['prop-border-radius', { value: '16' }], ['prop-opacity', { value: '0.96' }],
    ['prop-duration', { value: '30000' }], ['prop-hold-duration', { value: '30000' }], ['prop-dismiss-mode', { value: 'closeButton' }],
    ['ticker-speed', { value: '400' }], ['ticker-band', { value: 'top' }], ['ticker-track-count', { value: '3' }], ['ticker-band-ratio', { value: '28' }], ['ticker-min-gap', { value: '64' }], ['ticker-track-gap', { value: '8' }],
    ['ticker-click-through', { getAttribute: (name) => name === 'aria-pressed' ? 'true' : null }],
    ['ticker-hover-highlight', { getAttribute: (name) => name === 'aria-pressed' ? 'true' : null }],
    ['prop-hover-highlight', { getAttribute: (name) => name === 'aria-pressed' ? 'true' : null }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.behaviorId, 'ticker');
  assert.equal(collect.ticker.clickThrough, true);
  assert.equal(collect.card.types.minimal.properties.interaction.hoverHighlight, 'off');
  assert.equal(collect.card.types.minimal.effects.slots.enter.effectId, 'fade');
  assert.equal('size' in collect.card.types.minimal.properties, false);
  assert.equal('backgroundColor' in collect.card.types.minimal.skin, false);
});

test('visual settings realtime preview keeps the latest draft and has an explicit close gate', () => {
  const html = renderVisualSettingsPage('/settings-visual', { profile: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  assert.match(html, /function schedulePreviewUpdate/);
  assert.match(html, /previewPending\s*=\s*true/);
  assert.match(html, /if\s*\(previewOpen\)/);
  assert.match(html, /schedulePreviewUpdate\(\)/);
  assert.match(html, /if\s*\(previewPending\)/);
  assert.match(html, /previewGeneration\s*\+\+/);
  assert.match(html, /previewOpen\s*=\s*false/);
  assert.match(html, /visual-preview\/close/);
});

test('visual settings delegated listeners handle controls mounted and replaced after initialization', () => {
  const html = renderVisualSettingsPage('/settings-visual', { profile: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('var syncIds'));
  const start = script.indexOf('var syncIds');
  const end = script.indexOf('var previewButton', start);
  const source = script.slice(start, end);
  const listeners = new Map();
  const elements = new Map();
  const document = {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); }
  };
  const window = {};
  const dirty = [];
  const sync = [];
  const applied = [];
  const $ = (id) => elements.get(id) ?? null;
  const run = () => new Function('document', 'window', '$', 'markVisualDirty', 'syncPreview', 'applyGlobalVisualState', `${source}; return window.__notificationHubVisualInputHandler;`)(document, window, $, () => dirty.push(true), () => sync.push(true), () => applied.push(true));

  run();
  const first = { id: 'prop-size' };
  elements.set('prop-size', first);
  listeners.get('input')({ type: 'input', target: first });
  const replacement = { id: 'prop-size' };
  elements.set('prop-size', replacement);
  listeners.get('change')({ type: 'change', target: replacement });
  assert.equal(dirty.length, 2);
  assert.equal(sync.length, 2);

  run();
  listeners.get('input')({ type: 'input', target: replacement });
  assert.equal(sync.length, 3, 're-initializing the fragment keeps one delegated listener');
  const global = { id: 'global-visual-enabled', checked: false };
  elements.set('global-visual-enabled', global);
  listeners.get('change')({ type: 'change', target: global });
  assert.equal(applied.length, 1);
});

test('studio click handler is named and removed on dispose so random speed stays clickable', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 2, behaviorId: 'ticker', ticker: { speedPxPerSec: 400 }, global: { enabled: true } } }
  });
  assert.match(html, /function studioClickHandler\(event\)/);
  assert.match(html, /window\.__notificationHubStudioClick = studioClickHandler/);
  assert.match(html, /removeEventListener\("click", studioClickHandler\)/);
  assert.match(html, /id="ticker-speed-random"/);
  assert.match(html, /class="ticker-flow-random"/);
  assert.doesNotMatch(html, /slider-row with-action/);
});

test('visual settings preview exposes explicit failure and latest-update guards', () => {
  const html = renderVisualSettingsPage('/settings-visual', { profile: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  assert.match(html, /function previewError\(error\)/);
  assert.match(html, /失败 · /);
  assert.match(html, /json\("visual-preview\/update"/);
  assert.match(html, /previewPending\s*&&\s*previewOpen/);
  assert.match(html, /generation\s*!==\s*previewGeneration/);
});

test('visual settings fragment passes studio structure', () => {
  const fragment = renderVisualSettingsFragment('/settings-content?view=visual', {
    profile: { global: { enabled: true, preset: 'soft' }, categories: {} },
    status: 'saved'
  });
  assert.match(fragment, /class="studio"/);
  assert.match(fragment, /飞法/);
  assert.match(fragment, /换堆叠或弹幕，卡面不另起一套/);
  assert.match(fragment, /卡面/);
  assert.match(fragment, /pipeline-type/);
  assert.match(fragment, /pipeline-behavior/);
  assert.match(fragment, /syncPreview/);
  assert.match(fragment, /visual-preview\/open/);
  assert.match(fragment, /visual-preview\/update/);
  assert.doesNotMatch(fragment, /open-visual-workbench|workbench-phase|visual-workbench\/open|workbenchPayload/);
  assert.match(fragment, /visual-settings-save/);
  assert.doesNotMatch(fragment, /visual-assets-open/);
  assert.match(fragment, /id="bg-asset-import"[\s\S]*id="bg-asset-library"[\s\S]*id="bg-adjust-open"/);
  assert.match(fragment, />素材库</);
  assert.match(fragment, /<details/);
  assert.match(fragment, /id="prop-anchor"/);
  assert.match(fragment, /id="prop-grow"/);
  assert.match(fragment, /data-grow="up"/);
  assert.match(fragment, /往哪长/);
  assert.match(fragment, /id="prop-wrap"/);
  assert.match(fragment, /data-wrap-open="off"/);
  assert.match(fragment, /data-wrap-path="parallel"/);
  assert.match(fragment, /data-wrap-path="snake"/);
  assert.match(fragment, /开新列/);
  assert.match(fragment, /走线/);
  assert.match(fragment, /满了沿另一边开列/);
  assert.doesNotMatch(fragment, /id="visual-assets-open"/);
  assert.doesNotMatch(fragment, /<[^>]+visibility:hidden/);
  assert.doesNotMatch(fragment, /<\/main>/);
  assert.equal((fragment.match(/<script>/g) ?? []).length, 1);
  assert.doesNotMatch(fragment, /grid-template-columns:190px/);
  assert.match(fragment, /已绑定事件试运行/);
  assert.doesNotMatch(fragment, /全部事件/);
  assert.doesNotMatch(fragment, /run-tests/);
});

test('visual settings route exposes status, update, and preview endpoints', async () => {
  const { app, routes } = harness();
  const calls = [];
  const api = {
    getVisualSettingsStatus() { calls.push('status'); return { revision: 1, status: 'applied' }; },
    async updateVisualSettings(patch) { calls.push(['update', patch]); return { revision: 2, status: 'applied' }; },
    async openVisualPreviewCard(input) { calls.push(['previewOpen', input]); return { created: true, cardId: 'preview-1', receivedDraft: true, updated: false, recreated: false, draftFingerprint: '0123456789abcdef', nativeVisualFingerprint: '1111111111111111' }; },
    async updateVisualPreviewCard(input) { calls.push(['previewUpdate', input]); return { cardId: 'preview-1', receivedDraft: true, updated: true, recreated: false, draftFingerprint: 'fedcba9876543210', nativeVisualFingerprint: '2222222222222222' }; },
    async closeVisualPreviewCard() { calls.push('previewClose'); return { closed: true }; },
    previewVisualSettings(input) { calls.push(['preview', input]); return { input, decision: { enabled: true, preset: 'soft', intensity: 'balanced', category: 'chat', matchedBy: 'category', reason: 'category-policy' } }; },
    async runVisualEventExperiment(input) { calls.push(['eventExperiment', input]); return { generated: input.count, failed: 0, historyWritten: false, soundPlayed: false }; },
    async runVisualDraftSample(input) { calls.push(['draftSample', input]); return { generated: 1, receivedDraft: true, behaviorId: input.draft?.behaviorId ?? 'stack', historyWritten: false, soundPlayed: false }; },
    async clearVisualStudioCards() { calls.push('clearCards'); return { dismissed: [], count: 0, historyWritten: false }; },
    async runParallelCardSample(input) { calls.push(['parallel', input]); return { generated: 4, failed: 0 }; },
    listVisualProfiles() { calls.push('listProfiles'); return []; },
    removeVisualProfile(profileId) { calls.push(['removeProfile', profileId]); return { removed: true, visualRevision: 2 }; },
    clearVisualDiagnostics() { calls.push('clearVisualDiagnostics'); return { visualDiagnostics: [] }; },
    exportVisualDiagnostics() { calls.push('exportVisualDiagnostics'); return { savedToFile: true }; },
    saveVisualProfile(input) { calls.push(['save', input]); return { profileId: input.profileId, name: input.name, profile: {}, references: [], visualRevision: 1 }; },
    previewApplyVisualProfile(input) { calls.push(['previewApply', input]); return { preview: { added: 1, overwritten: 0, unchanged: 0, missing: 0 } }; },
    applyVisualProfileToEvents(input) { calls.push(['apply', input]); return { result: { applied: 1, failed: 0 } }; },
    listCustomVisualEvents() { calls.push('listCustom'); return []; },
    restoreVisualEventDefault(eventId) { calls.push(['restore', eventId]); return { ok: true }; }
  };
  registerVisualSettingsRoute(app, { _notificationHubVNextPlugin: api });
  assert.deepEqual([...routes.keys()], ['GET /settings-visual', 'GET /visual-settings-status', 'POST /visual-settings-status', 'GET /visual-diagnostics', 'POST /visual-diagnostics-clear', 'POST /visual-diagnostics-export', 'POST /visual-settings-update', 'POST /visual-settings-preview', 'POST /visual-workbench/open', 'POST /visual-workbench/update', 'POST /visual-workbench/close', 'POST /visual-preview/open', 'POST /visual-preview/update', 'POST /visual-preview/close', 'POST /visual-try-one', 'POST /visual-clear-cards', 'POST /visual-test-event', 'POST /visual-test-parallel-cards', 'GET /visual-profiles', 'POST /visual-profiles/save', 'DELETE /visual-profiles/:profileId', 'POST /visual-profiles/preview-apply', 'POST /visual-profiles/apply', 'GET /custom-visual-events', 'POST /custom-visual-events/restore-default', 'GET /agent-avatars/:id/file']);
  const context = (body = {}) => ({ req: { url: '/settings-visual', json: async () => body }, html(value) { return { kind: 'html', value }; }, json(value, status = 200) { return { value, status }; } });
  assert.match(routes.get('GET /settings-visual')(context()).value, /通知视觉/);
  assert.equal((routes.get('GET /visual-settings-status')(context())).value.ok, true);
  assert.equal((routes.get('POST /visual-settings-status')(context())).value.ok, true);
  assert.equal((await routes.get('POST /visual-settings-update')(context({ profile: { global: { preset: 'accent' } } }))).value.ok, true);
  const previewOpenResponse = await routes.get('POST /visual-preview/open')(context({ draft: { global: { enabled: true } } }));
  assert.deepEqual(previewOpenResponse.value, { ok: true, created: true, cardId: 'preview-1', receivedDraft: true, updated: false, recreated: false, draftFingerprint: '0123456789abcdef', nativeVisualFingerprint: '1111111111111111' });
  const previewUpdateResponse = await routes.get('POST /visual-preview/update')(context({ draft: { global: { enabled: true } } }));
  assert.deepEqual(previewUpdateResponse.value, { ok: true, created: false, receivedDraft: true, updated: true, recreated: false, cardId: 'preview-1', draftFingerprint: 'fedcba9876543210', nativeVisualFingerprint: '2222222222222222' });
  assert.deepEqual(calls.at(-1), ['previewUpdate', { draft: { global: { enabled: true } } }]);
  assert.equal('card' in previewUpdateResponse.value, false);
  assert.equal('response' in previewUpdateResponse.value, false);
  const previewResponse = await routes.get('POST /visual-settings-preview')(context({ labels: ['chat'], importance: 'normal' }));
  assert.equal(previewResponse.value.ok, true);
  assert.deepEqual(previewResponse.value.decision, { enabled: true, preset: 'soft', intensity: 'balanced', category: 'chat', matchedBy: 'category', reason: 'category-policy' });
  assert.deepEqual(calls.at(-1), ['preview', { labels: ['chat'], importance: 'normal' }]);
  const tryOneResponse = await routes.get('POST /visual-try-one')(context({ draft: { behaviorId: 'ticker' } }));
  assert.equal(tryOneResponse.value.ok, true);
  assert.equal(tryOneResponse.value.generated, 1);
  assert.equal(tryOneResponse.value.receivedDraft, true);
  assert.deepEqual(calls.at(-1), ['draftSample', { draft: { behaviorId: 'ticker' } }]);
  const testResponse = await routes.get('POST /visual-test-event')(context({ eventId: 'chat.assistant_reply.completed', count: 2, intervalMs: 0 }));
  assert.equal(testResponse.value.ok, true);
  assert.equal(testResponse.value.generated, 2);
  assert.deepEqual(calls.at(-1), ['eventExperiment', { eventId: 'chat.assistant_reply.completed', count: 2, intervalMs: 0 }]);
  const parallelResponse = await routes.get('POST /visual-test-parallel-cards')(context({}));
  assert.equal(parallelResponse.value.ok, true);
  assert.equal(parallelResponse.value.generated, 4);
  assert.equal(calls.at(-1)[0], 'parallel');
});

test('visual profile ids remain distinct for non-ASCII names', () => {
  const html = renderVisualSettingsPage('/settings-visual', { settings: { profile: { global: { enabled: true } } } });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function slugify'));
  const slugifySource = script.slice(script.indexOf('function slugify'), script.indexOf('function refreshProfiles'));
  const slugify = new Function(`${slugifySource}; return slugify;`)();
  assert.notEqual(slugify('配置包甲'), slugify('配置包乙'));
  assert.match(slugify('配置包甲'), /^u/);
});

test('visual settings page has save-as-profile section', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 1, global: { enabled: true, preset: 'soft' }, categories: {} } },
    revision: 2,
    status: 'saved'
  });
  // Save-as-profile section
  assert.match(html, /保存为配置包/);
  assert.match(html, /visual-profile-name/);
  assert.match(html, /visual-profile-save/);
  assert.doesNotMatch(html, /id="visual-package-export"/);
  assert.match(html, /visual-profile-list/);
  // Conflict dialog structure
  assert.match(html, /visual-conflict-dialog/);
  assert.match(html, /覆盖/);
  assert.match(html, /保留.*放弃/);
  assert.match(html, /创建副本/);
  // Profile list stays in the visual workbench.
  assert.match(html, /visual-profile-list/);
});

test('visual settings page shows saved profiles when data provided', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 1, global: { enabled: true, preset: 'soft' }, categories: {} } },
    profiles: [
      { profileId: 'stack-minimal', name: 'stack·minimal', source: 'local', references: ['chat.assistant_reply.completed'] },
      { profileId: 'ticker-maid', name: 'ticker·maid', source: 'import', references: [] }
    ],
    revision: 2,
    status: 'saved'
  });
  assert.match(html, /stack·minimal/);
  assert.match(html, /ticker·maid/);
  assert.match(html, /chat\.assistant_reply\.completed/);
  assert.match(html, /class="secondary profile-export" data-profile-id="stack-minimal"/);
  assert.match(html, /profileIds:\s*\[profileId\]/);
  assert.match(html, /data-profile-name="stack·minimal"/);
  assert.match(html, /已自定义配置包/);
  assert.match(html, /visual-profile-list/);
});

test('visual settings route exposes save profile endpoints', async () => {
  const { app, routes } = harness();
  const api = {
    getVisualSettingsStatus() { return { revision: 1, status: 'saved' }; },
    async updateVisualSettings(patch) { return { revision: 2, status: 'applied' }; },
    previewVisualSettings(input) { return { input, decision: { enabled: true, preset: 'soft', intensity: 'balanced', category: 'chat', matchedBy: 'category', reason: 'category-policy' } }; },
    async runNotificationTest(input) { return { generated: input.events.length, failed: 0 }; },
    async runParallelCardSample(input) { return { generated: 4, failed: 0 }; },
    listVisualProfiles() { return []; },
    saveVisualProfile(input) { return { profileId: input.profileId, name: input.name, profile: {}, references: [], visualRevision: 1 }; },
    previewApplyVisualProfile(input) { return { preview: { added: 1, overwritten: 0, unchanged: 0, missing: 0 } }; },
    applyVisualProfileToEvents(input) { return { result: { applied: 1, failed: 0 } }; }
  };
  registerVisualSettingsRoute(app, { _notificationHubVNextPlugin: api });
  const routeKeys = [...routes.keys()];
  assert.ok(routeKeys.includes('POST /visual-profiles/save'), 'save endpoint should be registered');
  assert.ok(routeKeys.includes('GET /visual-profiles'), 'list profiles endpoint should be registered');
  assert.ok(routeKeys.includes('POST /visual-profiles/apply'), 'apply endpoint should be registered');
  assert.ok(routeKeys.includes('POST /visual-profiles/preview-apply'), 'preview-apply endpoint should be registered');
});

test('visual settings page has event-bound visual experiment section', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 1, global: { enabled: true, preset: 'soft' }, categories: {} } },
    revision: 2,
    status: 'saved'
  });
  assert.match(html, /已绑定事件试运行/);
  assert.match(html, /visual-test-event/);
  assert.match(html, /读取已绑定事件/);
  assert.match(html, /json\("custom-visual-events"\)/);
  assert.match(html, /renderProfileList/);
  assert.match(html, /function refreshProfiles/);
  assert.doesNotMatch(html, /NotificationHubSettingsShell\.loadView\("visual"\)/);
  assert.match(html, /visual-test-count/);
  assert.match(html, /visual-test-event/);
  assert.match(html, /eventId:\s*eventId[\s\S]*count:\s*count[\s\S]*intervalMs:\s*interval/);
  assert.doesNotMatch(html, /visual-test-event[\s\S]{0,1200}draft:\s*collect\(\)/);
  assert.match(html, /visual-try-one/);
  assert.match(html, /json\("visual-try-one"[\s\S]*studioNativeBody\(\)/);
  assert.doesNotMatch(html, /json\("visual-test-event"[\s\S]*count:1,intervalMs:0/);
  assert.match(html, /visual-test-send/);
  assert.doesNotMatch(html, /visual-test-parallel/);
  assert.doesNotMatch(html, /并行测试堆叠和弹幕/);
  assert.match(html, /visual-test-feedback/);
  assert.doesNotMatch(html, /预览测试/);
  assert.doesNotMatch(html, /visual-test-notification/);
});

test('try-one sits in the title row and previews the current draft', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 2, behaviorId: 'ticker', global: { enabled: true } } }
  });
  assert.match(html, /hero-actions[\s\S]*id="visual-try-one"[\s\S]*id="open-visual-preview"[\s\S]*id="visual-settings-save"/);
  assert.doesNotMatch(html, /preview-actions[\s\S]{0,240}id="visual-try-one"/);
  assert.doesNotMatch(html, /preview-actions[\s\S]{0,400}id="open-visual-preview"/);
  assert.match(html, /json\("visual-try-one"[\s\S]*studioNativeBody\(\)/);
  assert.match(html, /试一条在标题旁/);
});

test('visual settings page has apply-to-events section', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 1, global: { enabled: true, preset: 'soft' }, categories: {} } },
    profiles: [
      { profileId: 'stack-minimal', name: 'stack·minimal', source: 'local', references: [] }
    ],
    events: [
      { eventId: 'chat.assistant_reply.completed', categoryId: 'chat', eventTypeId: 'completed', label: '助手回复完成' },
      { eventId: 'tool.completed', categoryId: 'tool', eventTypeId: 'completed', label: '工具执行完成' }
    ],
    revision: 2,
    status: 'saved'
  });
  assert.match(html, /应用于事件/);
  assert.match(html, /默认不出桌面卡；选事件再套这套样子。弹幕方案会飞，堆叠方案会叠。/);
  assert.doesNotMatch(html, /全部事件/);
  assert.match(html, /apply-event-select/);
  assert.match(html, /apply-visual-profile/);
  assert.doesNotMatch(html, /apply-visual-preview/);
  assert.doesNotMatch(html, /预览影响/);
  assert.match(html, /apply-visual-btn/);
  assert.match(html, /apply-bound-list/);
  assert.match(html, /chat\.assistant_reply\.completed/);
  assert.match(html, /stack·minimal/);
});

test('visual settings route exposes preview-apply and apply endpoints', async () => {
  const { app, routes } = harness();
  const api = {
    getVisualSettingsStatus() { return { revision: 1, status: 'saved' }; },
    async updateVisualSettings(patch) { return { revision: 2, status: 'applied' }; },
    previewVisualSettings(input) { return { input, decision: { enabled: true, preset: 'soft', intensity: 'balanced', category: 'chat', matchedBy: 'category', reason: 'category-policy' } }; },
    async runNotificationTest(input) { return { generated: input.events.length, failed: 0 }; },
    async runParallelCardSample(input) { return { generated: 4, failed: 0 }; },
    listVisualProfiles() { return []; },
    saveVisualProfile(input) { return { profileId: input.profileId, name: input.name, profile: {}, references: [], visualRevision: 1 }; },
    previewApplyVisualProfile(input) { return { preview: { added: 2, overwritten: 0, unchanged: 1, missing: 0 } }; },
    applyVisualProfileToEvents(input) { return { result: { applied: 2, failed: 0 } }; },
    listCustomVisualEvents() { return []; }
  };
  registerVisualSettingsRoute(app, { _notificationHubVNextPlugin: api });
  const routeKeys = [...routes.keys()];
  assert.ok(routeKeys.includes('POST /visual-profiles/preview-apply'), 'preview-apply endpoint should be registered');
  assert.ok(routeKeys.includes('POST /visual-profiles/apply'), 'apply endpoint should be registered');
  assert.ok(routeKeys.includes('GET /custom-visual-events'), 'custom visual events endpoint should be registered');
  assert.ok(routeKeys.includes('POST /custom-visual-events/restore-default'), 'restore-default endpoint should be registered');
});

test('visual settings page has diagnostics section', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 1, global: { enabled: true, preset: 'soft', intensity: 'balanced' }, categories: {} } },
    revision: 2,
    status: 'applied',
    effectRules: [],
    effectRuleTargets: []
  });
  assert.match(html, /诊断/);
  assert.match(html, /visual-diagnostics/);
  assert.match(html, /已应用/);
  assert.match(html, /visual-diagnostics-list/);
  const diag = html.slice(html.indexOf('id="visual-diagnostics"'));
  const refreshAt = diag.indexOf('id="refresh-visual-diagnostics"');
  const clearAt = diag.indexOf('id="clear-visual-diagnostics"');
  const exportAt = diag.indexOf('id="export-visual-diagnostics"');
  const listAt = diag.indexOf('id="visual-diagnostics-list"');
  assert.ok(refreshAt >= 0 && refreshAt < listAt, 'refresh should sit above the diagnostic list');
  assert.ok(clearAt > refreshAt && clearAt < listAt, 'clear should sit with refresh above the list');
  assert.ok(exportAt > clearAt && exportAt < listAt, 'export should sit with refresh above the list');
  assert.match(html, /class="diag-toolbar"/);
});

test('visual settings page has global switch and default mode selector', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 1, global: { enabled: true, preset: 'soft', intensity: 'balanced', defaultMode: 'off' }, categories: {} } },
    revision: 2,
    status: 'applied',
    effectRules: [],
    effectRuleTargets: []
  });
  assert.match(html, /开启全局视觉/);
  assert.match(html, /visual-global-switch/);
  assert.match(html, /默认视觉效果/);
  assert.match(html, /defaultMode/);
  assert.match(html, /off.*关闭视觉/);
  assert.match(html, /stack.*全部堆叠/);
  assert.match(html, /ticker.*全部弹幕/);
  assert.doesNotMatch(html, /value="minimal"[^>]*>极简/);
});

test('visual settings page disables pipeline when global visual is off', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 1, global: { enabled: false, preset: 'soft', intensity: 'balanced', defaultMode: 'off' }, categories: {} } },
    revision: 2,
    status: 'saved',
    effectRules: [],
    effectRuleTargets: []
  });
  assert.match(html, /visual-global-off/);
  assert.match(html, /关闭全局视觉/);
});

test('visual studio hides inactive behavior knobs and keeps a single primary save', () => {
  const stack = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 2, behaviorId: 'stack', global: { enabled: true } } }
  });
  const ticker = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 2, behaviorId: 'ticker', ticker: { speedPxPerSec: 400, band: 'top', bandRatio: 0.28, trackCount: 0, minGapPx: 64 }, global: { enabled: true } } }
  });
  assert.match(stack, /id="ticker-section"[^>]*hidden/);
  assert.match(stack, /id="stack-section"(?![^>]*hidden)/);
  assert.match(ticker, /id="ticker-section"(?![^>]*hidden)/);
  assert.match(ticker, /id="stack-section"[^>]*hidden/);
  assert.equal((stack.match(/class="primary"/g) ?? []).length, 1);
  assert.doesNotMatch(stack, /id="ticker-hover-pause"|id="ticker-overflow"/);
  assert.match(ticker, /id="ticker-track-count"[^>]*(?![^>]*max)/);
  assert.doesNotMatch(stack, /id="ticker-track-count"[^>]*max=/);
  assert.doesNotMatch(stack, /VISUAL WORKBENCH|stack\.main|Native preview/);
  assert.equal((stack.match(/id="visual-preview-stage"/g) ?? []).length, 0);
  assert.doesNotMatch(stack, /stage-card stage-ticker|data-preview-card="ticker"|data-preview-card="popup"/);
});

test('studio setting groups use fold and referenced profiles can be deleted', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 2, behaviorId: 'stack', global: { enabled: true, defaultMode: 'off' } } },
    profiles: [
      { profileId: 'visual.bound', name: '占用包', source: 'local', references: ['chat.assistant_reply.completed'] }
    ],
    visualDiagnostics: [
      { code: 'VISUAL_PREVIEW_CREATED', stage: 'PREVIEW_SESSION', message: 'ok', level: 'ok', details: { cardId: 'c1' }, timestamp: 't' },
      { code: 'VISUAL_EVENT_BINDING_PROFILE_MISSING', stage: 'EVENT_CARD', message: 'missing', level: 'error', details: { eventId: 'chat.assistant_reply.completed' }, timestamp: 't' }
    ]
  });
  assert.match(html, /id="stack-section"(?![^>]*hidden)/);
  assert.match(html, /id="stack-charter"/);
  assert.match(html, /id="stack-card"/);
  assert.match(html, /id="appearance-section"[^>]*open/);
  assert.doesNotMatch(html, /id="visual-preview"[^a-zA-Z0-9_-]/);
  assert.doesNotMatch(html, /id="visual-preview">/);
  assert.match(html, /class="hero-preview-status"/);
  assert.doesNotMatch(html, /出现方式|堆叠怎么出现|弹幕怎么流/);
  assert.match(html, /<summary>卡面/);
  assert.doesNotMatch(html, /<summary>预览/);
  assert.match(html, /class="secondary profile-delete" data-profile-id="visual.bound"/);
  assert.match(html, /visual-delete-dialog/);
  assert.match(html, /解除绑定，改走默认视觉档/);
  assert.doesNotMatch(html, /并行测试堆叠和弹幕/);
  assert.match(html, /1 个问题/);
  assert.match(html, /visual-diagnostic-row is-error/);
  assert.match(html, /visual-diagnostic-row is-ok/);
  assert.match(html, /function refreshProfiles\(\)/);
  assert.match(html, /renderProfileList/);
  assert.doesNotMatch(html, /value\.overwritten/);
});

test('stack dismiss uses combinable chips instead of a visible exclusive select', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 2, behaviorId: 'stack', global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: { properties: { interaction: { dismissMode: 'timeout', autoDismiss: 'on' } } } } } } }
  });
  assert.match(html, /id="prop-dismiss-close"/);
  assert.match(html, /id="prop-dismiss-anywhere"/);
  assert.match(html, /id="prop-dismiss-auto"[^>]*aria-pressed="true"/);
  assert.match(html, /超时自动收/);
  assert.match(html, /id="prop-dismiss-mode"[^>]*mode-contract-select/);
  assert.doesNotMatch(html, /<label for="prop-dismiss-mode">关闭方式<\/label><select id="prop-dismiss-mode">/);
  assert.doesNotMatch(html, /<select id="prop-dismiss-mode">[\s\S]*<option value="timeout"/);
});

test('visual settings collect writes click dismiss pair and independent autoDismiss', () => {
  const html = renderVisualSettingsPage('/settings-visual', { profile: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function collect('));
  const collectStart = script.indexOf('function collect(');
  const collectEnd = script.indexOf('var previewOpen', collectStart);
  const source = script.slice(collectStart, collectEnd);
  const values = new Map([
    ['global-visual-enabled', { checked: true, value: '' }], ['global-visual-default-mode', { value: 'off' }],
    ['pipeline-type', { value: 'minimal' }], ['pipeline-behavior', { value: 'stack' }],
    ['prop-size', { value: 'medium' }], ['prop-anchor', { value: 'bottom-right' }], ['prop-gap', { value: '8' }],
    ['skin-bg-color', { value: '#0e1916' }], ['prop-border-radius', { value: '16' }], ['prop-opacity', { value: '0.96' }],
    ['prop-duration', { value: '120000' }], ['prop-hold-duration', { value: '120000' }], ['prop-dismiss-mode', { value: 'anywhere' }],
    ['prop-dismiss-auto', { getAttribute: (name) => name === 'aria-pressed' ? 'true' : null }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.properties.interaction.dismissMode, 'anywhere');
  assert.equal(collect.card.types.minimal.properties.interaction.autoDismiss, 'on');
  assert.equal(collect.card.types.minimal.properties.interaction.timeoutMs, 120000);
  assert.equal(collect.card.types.minimal.properties.lifecycle.holdDurationMs, 120000);
});

test('title and body fill control is labeled as text color, not fill', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    profile: {
      global: { enabled: true },
      card: { activeType: 'minimal', types: { minimal: { parts: { title: { fill: '#ff2244' } } } } }
    }
  });
  assert.match(html, /for="part-paint-fill">文字/);
  assert.match(html, /fillLabel.textContent = "文字"/);
  assert.doesNotMatch(html, /填充（字体颜色）/);
  assert.match(html, /paint-kicker">位置/);
  assert.match(html, /paint-kicker">文字/);
  assert.match(html, /paint-kicker">背景/);
  assert.match(html, /paint-kicker">描边/);
  assert.match(html, /id="part-paint-background"/);
  assert.match(html, /id="part-paint-background-on"/);
  assert.match(html, /function clampNumberInput/);
});

test('visual settings page has a show chip for title and body parts', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  assert.match(html, /id="part-show"/);
  assert.match(html, /id="part-title-show"/);
  assert.match(html, /id="part-body-show"/);
  assert.match(html, /id="part-icon-show"/);
  assert.match(html, /id="part-assistantName-show"/);
  assert.doesNotMatch(html, /id="part-close-show"/);
});

test('visual settings collect writes body show false and keeps it after save', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const source = extractFlushAndCollect(html);
  const values = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['part-body-show', { value: 'false' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.parts.body.show, false);
  const store = new VisualSettingsStore({
    initialSettings: {
      profile: {
        version: 2,
        global: { enabled: true },
        card: { activeType: 'minimal', types: { minimal: { parts: collect.card.types.minimal.parts } } }
      }
    }
  });
  assert.equal(store.getSnapshot().settings.profile.card.types.minimal.parts.body.show, false);
  const fragment = renderVisualSettingsFragment('/settings-content?view=visual', {
    settings: store.getSnapshot().settings,
    profile: store.getSnapshot().settings.profile
  });
  assert.match(fragment, /id="part-body-show"[^>]*value="false"/);
});

test('visual settings collect writes icon and assistantName closed and keeps them after save', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const source = extractFlushAndCollect(html);
  const values = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['part-icon-show', { value: 'false' }],
    ['part-assistantName-show', { value: 'false' }],
    ['part-icon-source', { value: 'custom' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.parts.icon.show, false);
  assert.equal(collect.card.types.minimal.parts.icon.source, 'custom');
  assert.equal(collect.card.types.minimal.parts.icon.assetId, null);
  assert.equal(collect.card.types.minimal.parts.assistantName.show, false);
  const store = new VisualSettingsStore({
    initialSettings: {
      profile: {
        version: 2,
        global: { enabled: true },
        card: { activeType: 'minimal', types: { minimal: { parts: collect.card.types.minimal.parts } } }
      }
    }
  });
  const saved = store.getSnapshot().settings.profile.card.types.minimal.parts;
  assert.equal(saved.icon.show, false);
  assert.equal(saved.assistantName.show, false);
  const fragment = renderVisualSettingsFragment('/settings-content?view=visual', {
    settings: store.getSnapshot().settings,
    profile: store.getSnapshot().settings.profile
  });
  assert.match(fragment, /id="part-icon-show"[^>]*value="false"/);
  assert.match(fragment, /id="part-assistantName-show"[^>]*value="false"/);
});

test('defaultPartRect fills title when ticker body is off', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function defaultPartRect('));
  const start = script.indexOf('function defaultPartRect(');
  const end = script.indexOf('function hiddenAxis(', start);
  const source = script.slice(start, end);
  const values = new Map([
    ['prop-width', { value: '480' }],
    ['prop-height', { value: '84' }],
    ['pipeline-behavior', { value: 'ticker' }],
    ['part-title-show', { value: '' }],
    ['part-body-show', { value: 'false' }]
  ]);
  const rect = new Function('$', 'closePartEnabled', `${source}; return defaultPartRect("title");`)(
    (id) => values.get(id) ?? { value: '' },
    () => false
  );
  assert.equal(rect.x, 14);
  assert.equal(rect.y, 8);
  assert.equal(rect.w, 480 - 28);
  assert.equal(rect.h, 84 - 16);
});

test('visual settings collect writes body fontSize and rainbow textPaint and restores them', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const source = extractFlushAndCollect(html);
  const values = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['part-body-font-size', { value: '18' }],
    ['part-body-font-family', { value: 'heiti' }],
    ['part-body-text-paint', { value: 'rainbow' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.parts.body.fontSize, 18);
  assert.equal(collect.card.types.minimal.parts.body.fontFamily, 'heiti');
  assert.equal(collect.card.types.minimal.parts.body.textPaint, 'rainbow');
  assert.equal(collect.card.types.minimal.parts.body.fontAssetId, null);
  const store = new VisualSettingsStore({
    initialSettings: {
      profile: {
        version: 2,
        global: { enabled: true },
        card: { activeType: 'minimal', types: { minimal: { parts: collect.card.types.minimal.parts } } }
      }
    }
  });
  store.updateVisualSettings({
    profile: {
      version: 2,
      global: { enabled: true },
      card: { activeType: 'minimal', types: { minimal: { parts: collect.card.types.minimal.parts } } }
    }
  });
  const saved = store.getSnapshot().settings.profile.card.types.minimal.parts.body;
  assert.equal(saved.fontSize, 18);
  assert.equal(saved.textPaint, 'rainbow');
  const fragment = renderVisualSettingsFragment('/settings-content?view=visual', {
    settings: store.getSnapshot().settings,
    profile: store.getSnapshot().settings.profile
  });
  assert.match(fragment, /id="part-body-font-size"[^>]*value="18"/);
  assert.match(fragment, /id="part-body-text-paint"[^>]*value="rainbow"/);
});

test('visual settings collect writes title fontAssetId and omits it for system fonts', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const source = extractFlushAndCollect(html);
  const imported = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => {
    if (id === 'pipeline-type') return { value: 'minimal' };
    if (id === 'pipeline-behavior') return { value: 'stack' };
    if (id === 'global-visual-enabled') return { checked: true, value: '' };
    if (id === 'part-title-font-family') return { value: 'font:font-asset-1' };
    return { value: '' };
  });
  assert.equal(imported.card.types.minimal.parts.title.fontAssetId, 'font-asset-1');
  assert.equal('fontFamily' in imported.card.types.minimal.parts.title, false);
  const system = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => {
    if (id === 'pipeline-type') return { value: 'minimal' };
    if (id === 'pipeline-behavior') return { value: 'stack' };
    if (id === 'global-visual-enabled') return { checked: true, value: '' };
    if (id === 'part-title-font-family') return { value: 'yahei' };
    return { value: '' };
  });
  assert.equal(system.card.types.minimal.parts.title.fontFamily, 'yahei');
  assert.equal(system.card.types.minimal.parts.title.fontAssetId, null);
});

test('turning rainbow off survives save merge and comes back off', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const source = extractFlushAndCollect(html);
  const off = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => {
    if (id === 'pipeline-type') return { value: 'minimal' };
    if (id === 'pipeline-behavior') return { value: 'stack' };
    if (id === 'global-visual-enabled') return { checked: true, value: '' };
    if (id === 'part-title-text-paint') return { value: '' };
    return { value: '' };
  });
  assert.equal(off.card.types.minimal.parts.title.textPaint, 'solid');
  const store = new VisualSettingsStore({
    initialSettings: {
      profile: {
        version: 2,
        global: { enabled: true },
        card: { activeType: 'minimal', types: { minimal: { parts: { title: { textPaint: 'rainbow' } } } } }
      }
    }
  });
  store.updateVisualSettings({
    profile: {
      version: 2,
      global: { enabled: true },
      card: { activeType: 'minimal', types: { minimal: { parts: off.card.types.minimal.parts } } }
    }
  });
  const saved = store.getSnapshot().settings.profile.card.types.minimal.parts.title;
  assert.equal(saved.textPaint, 'solid');
  const fragment = renderVisualSettingsFragment('/settings-content?view=visual', {
    settings: store.getSnapshot().settings,
    profile: store.getSnapshot().settings.profile
  });
  assert.match(fragment, /id="part-title-text-paint"[^>]*value=""/);
  assert.match(fragment, /id="part-paint-rainbow"[^>]*aria-pressed="false"/);
});

test('studio preview omits hidden body hit including ticker copy', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  assert.match(html, /function partShown\(/);
  assert.doesNotMatch(html, /className = "stage-face"/);
  assert.doesNotMatch(html, /id="visual-preview-stage"/);
  assert.doesNotMatch(html, /class="stack-ghost"/);
  assert.doesNotMatch(html, /ticker-card ticker-ghost/);
});

test('studio stage uses screen ratio and title fit shrinks the front part', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  assert.doesNotMatch(html, /\.stage\{/);
  assert.doesNotMatch(html, /function packEqualStack\(/);
  assert.doesNotMatch(html, /function renderStudioPreview\(/);
  assert.doesNotMatch(html, /id="visual-preview-stage"/);
  assert.match(html, /id="part-paint-fit-width"/);
  assert.doesNotMatch(html, /fillRgba\(bg, opacity\)/);
  assert.doesNotMatch(html, /card\.style\.opacity/);
});

test('studio range labels use the loosened bounds', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  assert.match(html, /宽（1–1920）/);
  assert.match(html, /高（1–1080）/);
  assert.match(html, /左（0–1920）/);
  assert.match(html, /上（0–1080）/);
  assert.match(html, /圆角（0–480）/);
  assert.match(html, /描边宽度（0–32）/);
  assert.match(html, /绘制溢出（0–240）/);
  assert.match(html, /id="part-paint-font-bold"/);
  assert.match(html, /id="part-paint-font-italic"/);
  assert.match(html, /id="part-paint-font-underline"/);
  assert.match(html, /id="part-paint-font-strike"/);
  assert.match(html, />加粗</);
  assert.match(html, />斜体</);
  assert.match(html, />下划线</);
  assert.match(html, />删除线</);
});

test('visual settings collect writes loosened extremes that still validate', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const source = extractFlushAndCollect(html);
  const values = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['prop-width', { value: '1920' }],
    ['prop-height', { value: '1' }],
    ['prop-border-radius', { value: '480' }],
    ['prop-border-width', { value: '32' }],
    ['prop-paint-overflow', { value: '240' }],
    ['part-title-stroke-width', { value: '32' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  const appearance = collect.card.types.minimal.appearance;
  assert.equal(appearance.width, 1920);
  assert.equal(appearance.height, 1);
  assert.equal(appearance.borderRadius, 480);
  assert.equal(appearance.borderWidth, 32);
  assert.equal(appearance.paintOverflow, 240);
  assert.equal(collect.card.types.minimal.parts.title.strokeWidth, 32);
  const settings = createCardVisualSettings({ activeType: 'minimal', types: { minimal: collect.card.types.minimal } });
  assert.equal(settings.types.minimal.appearance.width, 1920);
  assert.equal(settings.types.minimal.appearance.height, 1);
  assert.equal(settings.types.minimal.appearance.borderRadius, 480);
  const classic = createCardVisualSettings({
    types: { minimal: { appearance: { width: 420, height: 220 } } }
  });
  assert.equal(classic.types.minimal.appearance.width, 420);
  assert.equal(classic.types.minimal.appearance.height, 220);
});

test('visual settings collect writes body fontItalic and restores the four style chips', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const source = extractFlushAndCollect(html);
  const values = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['part-body-font-italic', { value: 'true' }],
    ['part-body-font-underline', { value: 'true' }],
    ['part-body-font-strike', { value: 'true' }],
    ['part-body-font-bold', { value: 'true' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.parts.body.fontItalic, true);
  assert.equal(collect.card.types.minimal.parts.body.fontUnderline, true);
  assert.equal(collect.card.types.minimal.parts.body.fontStrike, true);
  assert.equal(collect.card.types.minimal.parts.body.fontBold, true);
  const store = new VisualSettingsStore({
    initialSettings: {
      profile: {
        version: 2,
        global: { enabled: true },
        card: { activeType: 'minimal', types: { minimal: { parts: collect.card.types.minimal.parts } } }
      }
    }
  });
  store.updateVisualSettings({
    profile: {
      version: 2,
      global: { enabled: true },
      card: { activeType: 'minimal', types: { minimal: { parts: collect.card.types.minimal.parts } } }
    }
  });
  const saved = store.getSnapshot().settings.profile.card.types.minimal.parts.body;
  assert.equal(saved.fontItalic, true);
  assert.equal(saved.fontUnderline, true);
  assert.equal(saved.fontStrike, true);
  assert.equal(saved.fontBold, true);
  const fragment = renderVisualSettingsFragment('/settings-content?view=visual', {
    settings: store.getSnapshot().settings,
    profile: store.getSnapshot().settings.profile
  });
  assert.match(fragment, /id="part-body-font-italic"[^>]*value="true"/);
  assert.match(fragment, /id="part-body-font-underline"[^>]*value="true"/);
  assert.match(fragment, /id="part-body-font-strike"[^>]*value="true"/);
  assert.match(fragment, /id="part-body-font-bold"[^>]*value="true"/);
});

test('applyVisual success path reloads visual-profiles then refreshProfiles', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function applyVisual('));
  const start = script.indexOf('function applyVisual(');
  const end = script.indexOf('function esc(', start);
  const source = script.slice(start, end);
  assert.match(source, /json\("visual-profiles\/apply"/);
  assert.match(source, /json\("visual-profiles"\)/);
  assert.match(source, /state\.profiles\s*=/);
  assert.match(source, /refreshProfiles\(\)/);
  assert.match(source, /loadBoundEvents\(\)/);
  assert.ok(source.indexOf('json("visual-profiles")') < source.indexOf('refreshProfiles()'));
  assert.ok(source.indexOf('refreshProfiles()') < source.indexOf('loadBoundEvents()'));
});

test('studio sample dropdown only keeps hanako butter rational', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    studioAgents: [
      { id: 'hanako', name: 'Hanako' },
      { id: 'butter', name: 'butter' },
      { id: 'rational', name: 'ming' },
      { id: 'kong', name: 'Kong' },
      { id: 'codekid', name: 'Wright' }
    ]
  });
  assert.match(html, /option value="hanako">Hanako<\/option>/);
  assert.match(html, /option value="butter">butter<\/option>/);
  assert.match(html, /option value="rational">ming<\/option>/);
  assert.doesNotMatch(html, /option value="kong"/);
  assert.doesNotMatch(html, /option value="codekid"/);
  assert.match(html, /样例只用来预览 Hanako、butter、ming/);
});

test('visual settings collect writes title fitWidth and omits it when off', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const source = extractFlushAndCollect(html);
  const onValues = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['part-title-fit-width', { value: 'true' }],
    ['part-title-fit-compensate', { value: 'true' }]
  ]);
  const on = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => onValues.get(id) ?? { value: '' });
  assert.equal(on.card.types.minimal.parts.title.fitWidth, true);
  assert.equal(on.card.types.minimal.parts.title.fitCompensate, true);
  const offValues = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['part-title-fit-width', { value: '' }],
    ['part-title-fit-compensate', { value: '' }]
  ]);
  const off = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => offValues.get(id) ?? { value: '' });
  assert.equal('fitWidth' in (off.card.types.minimal.parts.title || {}), false);
  assert.equal('fitCompensate' in (off.card.types.minimal.parts.title || {}), false);
});

test('visual settings collect writes title textStroke and omits it when off', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  assert.match(html, /id="part-paint-text-stroke"/);
  assert.match(html, />字描边</);
  assert.match(html, /id="part-title-text-stroke"/);
  assert.match(html, /id="part-title-text-stroke-color"/);
  assert.match(html, /id="part-body-text-stroke"/);
  assert.match(html, /id="part-assistantName-text-stroke"/);
  assert.match(html, /id="part-text-stroke-color-field"[^>]*hidden/);
  assert.doesNotMatch(html, /id="part-close-text-stroke"/);
  const source = extractFlushAndCollect(html);
  const onValues = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['part-title-text-stroke', { value: 'true' }],
    ['part-title-text-stroke-color', { value: '#112233' }]
  ]);
  const on = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => onValues.get(id) ?? { value: '' });
  assert.equal(on.card.types.minimal.parts.title.textStroke, true);
  assert.equal(on.card.types.minimal.parts.title.textStrokeColor, '#112233');
  const offValues = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['part-title-text-stroke', { value: '' }],
    ['part-title-text-stroke-color', { value: '#112233' }]
  ]);
  const off = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => offValues.get(id) ?? { value: '' });
  assert.equal('textStroke' in (off.card.types.minimal.parts.title || {}), false);
  assert.equal('textStrokeColor' in (off.card.types.minimal.parts.title || {}), false);
});

test('visual settings collect writes unbounded gap, stroke extras, and close icon', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  assert.match(html, /id="prop-gap"(?![^>]*max=)/);
  assert.match(html, /id="prop-border-paint"/);
  assert.match(html, /id="part-paint-text-stroke-width"/);
  assert.match(html, /id="part-paint-text-stroke-rainbow"/);
  assert.match(html, /data-close-icon="star"/);
  const source = extractFlushAndCollect(html);
  const values = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['prop-gap', { value: '64' }],
    ['prop-border-paint', { value: '', getAttribute: (name) => (name === 'aria-pressed' ? 'true' : null) }],
    ['part-title-text-stroke', { value: 'true' }],
    ['part-title-text-stroke-color', { value: '#112233' }],
    ['part-title-text-stroke-width', { value: '5' }],
    ['part-title-text-stroke-paint', { value: 'rainbow' }],
    ['part-title-stroke-paint', { value: 'gradient' }],
    ['part-close-icon', { value: 'star' }],
    ['part-close-icon-color', { value: '#ffcc00' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.properties.space.gap, 64);
  assert.equal(collect.card.types.minimal.appearance.borderPaint, 'gradient');
  assert.equal(collect.card.types.minimal.parts.title.textStroke, true);
  assert.equal(collect.card.types.minimal.parts.title.textStrokeWidth, 5);
  assert.equal(collect.card.types.minimal.parts.title.textStrokePaint, 'rainbow');
  assert.equal(collect.card.types.minimal.parts.title.strokePaint, 'gradient');
  assert.equal(collect.card.types.minimal.parts.close.closeIcon, 'star');
  assert.equal(collect.card.types.minimal.parts.close.closeIconColor, '#ffcc00');
});

test('visual settings collect writes close radius 0 and studio defaults unsaved close to a circle', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const source = extractFlushAndCollect(html);
  const values = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['part-close-radius', { value: '0' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.parts.close.radius, 0);
  const zero = renderVisualSettingsPage('/settings-visual', {
    settings: {
      profile: {
        version: 2,
        global: { enabled: true },
        card: { activeType: 'minimal', types: { minimal: { parts: { close: { radius: 0 } } } } }
      }
    }
  });
  assert.match(zero, /id="part-close-radius"[^>]*value="0"/);
  assert.match(zero, /id="part-paint-radius"[^>]*value="0"/);
  const unsaved = renderVisualSettingsPage('/settings-visual', {
    settings: {
      profile: {
        version: 2,
        global: { enabled: true },
        card: { activeType: 'minimal', types: { minimal: { parts: { close: { fill: '#1d2b27' } } } } }
      }
    }
  });
  assert.match(unsaved, /id="part-paint-radius"[^>]*value="14"/);
});

test('visual settings collect writes title background and opacity', () => {
  const html = renderVisualSettingsPage('/settings-visual');
  const source = extractFlushAndCollect(html);
  const values = new Map([
    ['pipeline-type', { value: 'minimal' }],
    ['pipeline-behavior', { value: 'stack' }],
    ['global-visual-enabled', { checked: true, value: '' }],
    ['part-title-fill', { value: '#f2fff9' }],
    ['part-title-background', { value: '#1d2b27' }],
    ['part-title-opacity', { value: '0.6' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.parts.title.fill, '#f2fff9');
  assert.equal(collect.card.types.minimal.parts.title.background, '#1d2b27');
  assert.equal(collect.card.types.minimal.parts.title.opacity, 0.6);
});
