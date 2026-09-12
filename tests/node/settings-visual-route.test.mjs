import assert from 'node:assert/strict';
import test from 'node:test';
import registerVisualSettingsRoute, { renderVisualSettingsPage, renderVisualSettingsFragment } from '../../plugin/routes/settings-visual.js';

function harness() {
  const routes = new Map();
  const app = { get(path, handler) { routes.set(`GET ${path}`, handler); }, post(path, handler) { routes.set(`POST ${path}`, handler); }, delete(path, handler) { routes.set(`DELETE ${path}`, handler); } };
  return { app, routes };
}

test('visual settings page renders hierarchical pipeline layout', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 1, global: { enabled: true, preset: 'soft' }, categories: { error: { preset: 'critical' } } } },
    revision: 3,
    status: 'applied'
  });
  // Pipeline hierarchy
  assert.match(html, /通知视觉/);
  assert.match(html, /卡片行为/);
  assert.match(html, /pipeline-behavior/);
  assert.match(html, /stack.*堆叠/);
  assert.match(html, /卡片种类/);
  assert.match(html, /pipeline-type/);
  assert.match(html, /minimal.*极简/);
  assert.match(html, /极简卡片外观/);
  assert.match(html, /卡片属性/);
  assert.match(html, /卡片属性[\s\S]*皮肤/);
  assert.match(html, /皮肤/);
  assert.match(html, /skin-bg-color/);
  assert.match(html, /管理视觉素材/);
  assert.match(html, /visual-assets-open/);
  assert.match(html, /打开实时预览/);
  assert.match(html, /visual-settings-save/);
  assert.match(html, /<details/);
  assert.match(html, /visual-diagnostics-list/);
  // Preview
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
  assert.match(html, /data-visual-mode="minimal"[^>]*aria-pressed="true"/);
  assert.match(html, /data-visual-mode="danmaku"[^>]*aria-pressed="false"/);
  assert.match(html, /data-visual-mode="popup"[^>]*aria-pressed="false"/);
  assert.match(html, /if\(window.__notificationHubVisualDispose\)window.__notificationHubVisualDispose\(\)/);
  assert.match(html, /previewGeneration/);
  assert.match(html, /previewPending&&previewOpen/);
  assert.match(html, /关闭实时预览/);
  assert.match(html, /visual-preview\/close/);
  assert.match(html, /document\.addEventListener\("input",visualInputHandler\)/);
  assert.match(html, /document\.addEventListener\("change",visualInputHandler\)/);
  assert.match(html, /__notificationHubVisualInputHandler/);
  assert.match(html, /function feedback\(id,text,kind\)/);
  assert.doesNotMatch(html, /var feedback=\$\("visual-feedback"\)/);
  assert.match(html, /profileFeedback=\$\("visual-feedback"\)/);
  assert.match(html, /visual-preview\/open/);
  assert.match(html, /visual-preview\/update/);
  assert.match(html, /JSON\.stringify\(\{draft:collect\(\)\}\)/);
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

test('visual mode editor drives the active type and keeps preview in document flow', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    profile: { global: { enabled: true }, card: { activeType: 'popup', types: { popup: { appearance: { width: 480, height: 260 } } } } }
  });
  assert.match(html, /data-editor-mode="popup"/);
  assert.match(html, /id="pipeline-behavior"[^>]*>[\s\S]*popup/);
  assert.match(html, /id="prop-width"[^>]*value="480"/);
  assert.match(html, /id="prop-height"[^>]*value="260"/);
  assert.match(html, /id="visual-preview-floating"/);
  assert.match(html, /id="visual-preview-stage"/);
  assert.match(html, /data-preview-card="minimal"/);
  assert.match(html, /id="prop-margin-left"/);
  assert.match(html, /id="prop-margin-right"/);
  assert.match(html, /id="prop-margin-top"/);
  assert.match(html, /id="prop-margin-bottom"/);
  assert.match(html, /距屏幕左侧/);
  assert.match(html, /距屏幕右侧/);
  assert.match(html, /距屏幕顶部/);
  assert.match(html, /距屏幕底部/);
  assert.match(html, /id="prop-opacity" type="number" min="0" max="1"/);
  assert.match(html, /id="prop-width"[^>]*value="480"(?![^>]*disabled)/);
  assert.doesNotMatch(html, /id="prop-aspect-ratio"/);
  assert.match(html, /grid-template-columns:190px minmax\(0,1fr\) minmax\(260px,300px\)/);
  assert.match(html, /visual-preview-column\{display:block;grid-area:preview;position:sticky/);
  assert.match(html, /preview-sticky-panel\{position:static/);
  assert.match(html, /grid-template-areas:"preview" "sidebar" "editor"/);
  assert.match(html, /stage-popup\{top:auto;right:10px;bottom:10px;left:auto;transform:none\}/);
  assert.doesNotMatch(html, /visual-preview-drag-handle|previewDragHandle/);
  assert.match(html, /button\.setAttribute\("aria-pressed",active\?"true":"false"\)/);
  assert.match(html, /bindStageDrag/);
  assert.match(html, /pointerdown/);
});

test('visual mode collection writes the edited type instead of always overwriting minimal', () => {
  const html = renderVisualSettingsPage('/settings-visual', { profile: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function collect(){'));
  const collectStart = script.indexOf('function collect(){');
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
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('function collect(){'));
  assert.ok(script);
  const collectStart = script.indexOf('function collect(){');
  const collectEnd = script.indexOf('var previewOpen', collectStart);
  const source = collectStart >= 0 && collectEnd > collectStart ? script.slice(collectStart, collectEnd) : null;
  assert.ok(source);
  assert.match(source, /properties:\{space:/);
  assert.match(source, /skin:\{skinId:[\s\S]*background:\{/);
  assert.match(source, /effects:\{effectConfigId:[\s\S]*slots:\{/);
  assert.doesNotMatch(source, /properties:\{size:/);
  assert.doesNotMatch(source, /skin:\{skinId:[\s\S]*backgroundColor:/);
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
  assert.match(html, /previewPending=true/);
  assert.match(html, /if\(previewOpen\)\{setPreviewState\("等待更新"\);schedulePreviewUpdate\(\)\}/);
  assert.match(html, /if\(previewPending\)schedulePreviewUpdate\(\)/);
  assert.match(html, /previewGeneration\+\+/);
  assert.match(html, /previewOpen=false/);
  assert.match(html, /visual-preview\/close/);
});

test('visual settings delegated listeners handle controls mounted and replaced after initialization', () => {
  const html = renderVisualSettingsPage('/settings-visual', { profile: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((value) => value.includes('var syncIds='));
  const start = script.indexOf('var syncIds=');
  const end = script.indexOf('if($("visual-settings-save"))', start);
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

test('visual settings preview exposes explicit failure and latest-update guards', () => {
  const html = renderVisualSettingsPage('/settings-visual', { profile: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  assert.match(html, /function previewError\(error\)/);
  assert.match(html, /失败 · \"\+code/);
  assert.match(html, /Promise\.resolve\(\)\.then\(function\(\)\{return json\("visual-preview\/update"/);
  assert.match(html, /if\(previewPending&&previewOpen\)schedulePreviewUpdate\(\)/);
  assert.match(html, /generation!==previewGeneration/);
});

test('visual settings fragment passes pipeline structure', () => {
  const fragment = renderVisualSettingsFragment('/settings-content?view=visual', {
    profile: { global: { enabled: true, preset: 'soft' }, categories: {} },
    status: 'saved'
  });
  assert.match(fragment, /visual-workbench/);
  assert.match(fragment, /卡片行为/);
  assert.match(fragment, /卡片种类/);
  assert.match(fragment, /卡片属性/);
  assert.match(fragment, /皮肤/);
  assert.match(fragment, /pipeline-type/);
  assert.match(fragment, /pipeline-behavior/);
  assert.match(fragment, /syncPreview/);
  assert.match(fragment, /visual-preview\/open/);
  assert.match(fragment, /visual-preview\/update/);
  assert.doesNotMatch(fragment, /open-visual-workbench|workbench-phase|visual-workbench\/open|workbenchPayload/);
  assert.match(fragment, /visual-settings-save/);
  assert.match(fragment, /visual-assets-open/);
  assert.match(fragment, /<details/);
  assert.match(fragment, /<details class="editor-accordion" open>[\s\S]*id="prop-size"/);
  assert.match(fragment, /<details class="editor-accordion"[\s\S]*id="visual-assets-open"/);
  assert.doesNotMatch(fragment, /<[^>]+visibility:hidden/);
  assert.doesNotMatch(fragment, /<\/main>/);
  assert.equal((fragment.match(/<script>/g) ?? []).length, 1);
  assert.match(fragment, /grid-template-columns:190px minmax\(0,1fr\) minmax\(260px,300px\)/);
  assert.match(fragment, /视觉实验台/);
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
  assert.deepEqual([...routes.keys()], ['GET /settings-visual', 'GET /visual-settings-status', 'GET /visual-diagnostics', 'POST /visual-diagnostics-clear', 'POST /visual-diagnostics-export', 'POST /visual-settings-update', 'POST /visual-settings-preview', 'POST /visual-workbench/open', 'POST /visual-workbench/update', 'POST /visual-workbench/close', 'POST /visual-preview/open', 'POST /visual-preview/update', 'POST /visual-preview/close', 'POST /visual-test-event', 'POST /visual-test-parallel-cards', 'GET /visual-profiles', 'POST /visual-profiles/save', 'DELETE /visual-profiles/:profileId', 'POST /visual-profiles/preview-apply', 'POST /visual-profiles/apply', 'GET /custom-visual-events', 'POST /custom-visual-events/restore-default']);
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
  assert.match(html, /profileIds:\[profileId\]/);
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
  assert.match(html, /视觉实验台/);
  assert.match(html, /visual-test-event/);
  assert.match(html, /读取已绑定事件/);
  assert.match(html, /json\("custom-visual-events"\)/);
  assert.match(html, /NotificationHubSettingsShell/);
  assert.match(html, /visual-test-count/);
  assert.match(html, /visual-test-event/);
  assert.match(html, /JSON\.stringify\(\{eventId:eventId,count:count,intervalMs:interval\}\)/);
  assert.doesNotMatch(html, /visual-test-event[\s\S]{0,1200}draft:collect\(\)/);
  assert.match(html, /visual-test-send/);
  assert.match(html, /visual-test-parallel/);
  assert.match(html, /visual-test-parallel-cards/);
  assert.match(html, /visual-test-feedback/);
  assert.doesNotMatch(html, /预览测试/);
  assert.doesNotMatch(html, /visual-test-notification/);
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
  assert.match(html, /apply-event-select/);
  assert.match(html, /apply-visual-profile/);
  assert.match(html, /apply-visual-preview/);
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
  assert.match(html, /off.*视觉关闭/);
  assert.match(html, /minimal.*极简/);
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
