import assert from 'node:assert/strict';
import test from 'node:test';
import registerVisualSettingsRoute, { renderVisualSettingsPage, renderVisualSettingsFragment } from '../../plugin/routes/settings-visual.js';

function harness() {
  const routes = new Map();
  const app = { get(path, handler) { routes.set(`GET ${path}`, handler); }, post(path, handler) { routes.set(`POST ${path}`, handler); }, delete(path, handler) { routes.set(`DELETE ${path}`, handler); } };
  return { app, routes };
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
  assert.match(html, /data-axis="behavior" data-value="ticker"[^>]*aria-pressed="true"/);
  assert.match(html, /id="stack-section"[^>]*hidden/);
  assert.doesNotMatch(html, /id="ticker-hover-pause"|id="ticker-overflow"/);
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
  assert.match(html, /选一种出现方式/);
  assert.match(html, /出现方式/);
  assert.match(html, /pipeline-behavior/);
  assert.match(html, /堆叠/);
  assert.match(html, /未实现/);
  assert.match(html, /pipeline-type/);
  assert.match(html, /极简/);
  assert.match(html, /卡片外观/);
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
  assert.doesNotMatch(html, /<(input|select|button)[^>]*\sdisabled/);
  assert.doesNotMatch(html, /visibility:hidden/);
  assert.doesNotMatch(html, /skin-radius|skin-opacity|skin-scheme|skin-color-|skin-shadow|skin-border-|skin-blur|skin-density/);
  assert.doesNotMatch(html, /effect-enter|effect-idle|effect-exit/);
  assert.doesNotMatch(html, /prop-blur|prop-shadow|prop-border-width|prop-border-color/);
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
  assert.match(html, /JSON\.stringify\(\{\s*draft:\s*collect\(\)\s*\}\)/);
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
  assert.match(html, /id="visual-preview-floating"/);
  assert.match(html, /id="visual-preview-stage"/);
  assert.match(html, /id="prop-margin-left"/);
  assert.match(html, /id="prop-margin-right"/);
  assert.match(html, /id="prop-margin-top"/);
  assert.match(html, /id="prop-margin-bottom"/);
  assert.match(html, /距左/);
  assert.match(html, /距右/);
  assert.match(html, /距上/);
  assert.match(html, /距下/);
  assert.match(html, /id="prop-opacity" type="number" min="0" max="1"/);
  assert.match(html, /id="prop-width"[^>]*value="480"(?![^>]*disabled)/);
  assert.doesNotMatch(html, /id="prop-aspect-ratio"/);
  assert.doesNotMatch(html, /grid-template-columns:190px/);
  assert.doesNotMatch(html, /visual-preview-column\{display:block;grid-area:preview;position:sticky/);
  assert.doesNotMatch(html, /stage-card stage-ticker|stage-card stage-popup|preview-channel-list/);
  assert.equal((html.match(/id="visual-preview-stage"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /visual-preview-drag-handle|previewDragHandle/);
  assert.match(html, /setAttribute\("aria-pressed",\s*active\s*\?\s*"true"\s*:\s*"false"\)/);
  assert.match(html, /bindStageDrag/);
  assert.match(html, /pointerdown/);
  assert.match(html, /@keyframes ticker-flow/);
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
    ['prop-border-radius', { value: '30' }], ['prop-opacity', { value: '0.42' }], ['prop-duration', { value: '30000' }], ['prop-hold-duration', { value: '30000' }],
    ['prop-dismiss-mode', { value: 'closeButton' }]
  ]);
  const collect = new Function('state', '$', `${source}; return collect();`)({ profile: {} }, (id) => values.get(id) ?? { value: '' });
  assert.equal(collect.card.types.minimal.properties.space.size, 'medium');
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
  assert.equal(collect.card.types.minimal.skin.background.color, '#0e1916');
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
  assert.match(fragment, /出现方式/);
  assert.match(fragment, /卡片外观/);
  assert.match(fragment, /pipeline-type/);
  assert.match(fragment, /pipeline-behavior/);
  assert.match(fragment, /syncPreview/);
  assert.match(fragment, /visual-preview\/open/);
  assert.match(fragment, /visual-preview\/update/);
  assert.doesNotMatch(fragment, /open-visual-workbench|workbench-phase|visual-workbench\/open|workbenchPayload/);
  assert.match(fragment, /visual-settings-save/);
  assert.doesNotMatch(fragment, /visual-assets-open/);
  assert.match(fragment, /<details/);
  assert.match(fragment, /id="prop-anchor"/);
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
  assert.deepEqual([...routes.keys()], ['GET /settings-visual', 'GET /visual-settings-status', 'GET /visual-diagnostics', 'POST /visual-diagnostics-clear', 'POST /visual-diagnostics-export', 'POST /visual-settings-update', 'POST /visual-settings-preview', 'POST /visual-workbench/open', 'POST /visual-workbench/update', 'POST /visual-workbench/close', 'POST /visual-preview/open', 'POST /visual-preview/update', 'POST /visual-preview/close', 'POST /visual-try-one', 'POST /visual-clear-cards', 'POST /visual-test-event', 'POST /visual-test-parallel-cards', 'GET /visual-profiles', 'POST /visual-profiles/save', 'DELETE /visual-profiles/:profileId', 'POST /visual-profiles/preview-apply', 'POST /visual-profiles/apply', 'GET /custom-visual-events', 'POST /custom-visual-events/restore-default']);
  const context = (body = {}) => ({ req: { url: '/settings-visual', json: async () => body }, html(value) { return { kind: 'html', value }; }, json(value, status = 200) { return { value, status }; } });
  assert.match(routes.get('GET /settings-visual')(context()).value, /通知视觉/);
  assert.equal((routes.get('GET /visual-settings-status')(context())).value.ok, true);
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
  assert.match(html, /json\("visual-try-one"[\s\S]*draft:\s*collect\(\)/);
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
  assert.match(html, /hero-actions[\s\S]*id="visual-try-one"[\s\S]*id="visual-settings-save"/);
  assert.doesNotMatch(html, /preview-actions[\s\S]{0,240}id="visual-try-one"/);
  assert.match(html, /json\("visual-try-one"[\s\S]*draft:\s*collect\(\)/);
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
  assert.equal((stack.match(/id="visual-preview-stage"/g) ?? []).length, 1);
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
  assert.match(html, /id="stack-section"[^>]*open/);
  assert.match(html, /id="appearance-section"[^>]*open/);
  assert.match(html, /id="visual-preview"[^>]*open/);
  assert.match(html, /<summary>堆叠怎么出现/);
  assert.match(html, /<summary>弹幕怎么流/);
  assert.match(html, /<summary>卡片外观/);
  assert.match(html, /<summary>预览/);
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
