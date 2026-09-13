import { PAGE_NAVIGATION_SCRIPT, PAGE_NAVIGATION_STYLE, renderPageNavigation } from './page-navigation.js';
import {
  createVisualProfile,
  TICKER_DEFAULTS,
  TICKER_SPEED_BOUNDS,
  TICKER_MIN_GAP_BOUNDS,
  TICKER_TRACK_GAP_BOUNDS
} from '../domain/visual-settings.js';
import { STUDIO_CLIENT } from './settings-visual-client.js';

const ROUTE_ERRORS = Object.freeze({
  VISUAL_SETTINGS_API_UNAVAILABLE: '视觉设置暂不可用。',
  VISUAL_PROFILE_API_UNAVAILABLE: '视觉方案 API 暂不可用。',
  VISUAL_TEST_API_UNAVAILABLE: '视觉测试功能暂不可用。'
});
const CARD_SIZES = Object.freeze({ small: '小', medium: '中', large: '大' });
const CARD_DISMISS_MODES = Object.freeze({ closeButton: '关闭按钮', anywhere: '任意点击', timeout: '超时自动收' });
const BEHAVIOR_AXIS_OPTIONS = Object.freeze([
  { value: 'stack', name: '堆叠', implemented: true },
  { value: 'ticker', name: '弹幕', implemented: true },
  { value: 'popup', name: '突脸', implemented: false, why: '突脸还在开发中，暂时不能选择。' }
]);
const TYPE_OPTIONS = Object.freeze([
  { value: 'minimal', label: 'minimal · 极简卡片', coming: false }
]);
const LAYOUT_OPTIONS = Object.freeze({ simple: '简单排列' });
const ANCHOR_LABELS = Object.freeze({ 'top-left': '左上', 'top-right': '右上', 'bottom-left': '左下', 'bottom-right': '右下' });
const ANCHOR_ORDER = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function readJsonBody(c) { return c.req.json().catch(() => ({})); }
function visualFieldMessage(error) {
  const field = String(error?.details?.field ?? '');
  if (error?.code !== 'CARD_VISUAL_FIELD_INVALID') return null;
  if (field.includes('marginLeft')) return '距左要填 0 到 96 的整数。';
  if (field.includes('marginRight')) return '距右要填 0 到 96 的整数。';
  if (field.includes('marginTop')) return '距上要填 0 到 96 的整数。';
  if (field.includes('marginBottom')) return '距下要填 0 到 96 的整数。';
  if (field.includes('gap')) return '卡片间距要填 0 到 48 的整数。';
  return '这项要填范围内的整数。';
}
function errorPayload(error) { return { code: error?.code ?? 'VISUAL_SETTINGS_ROUTE_FAILED', message: visualFieldMessage(error) ?? ROUTE_ERRORS[error?.code] ?? error?.message ?? String(error), details: error?.details ?? {} }; }
function visualPreviewResponse(result = {}) { return { created: result.created === true, receivedDraft: result.receivedDraft === true, updated: result.updated === true, recreated: result.recreated === true, cardId: typeof result.cardId === 'string' ? result.cardId : null, draftFingerprint: typeof result.draftFingerprint === 'string' ? result.draftFingerprint : null, nativeVisualFingerprint: typeof result.nativeVisualFingerprint === 'string' ? result.nativeVisualFingerprint : null }; }
function normalizeBootProfile(value) {
  try { return createVisualProfile(value ?? {}); } catch { return value ?? {}; }
}
function initialModel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { profile: {}, profiles: [], assets: [], status: 'loading' };
  return {
    profile: normalizeBootProfile(value.profile ?? value.settings?.profile ?? {}),
    profiles: Array.isArray(value.profiles) ? value.profiles : [],
    assets: Array.isArray(value.assets) ? value.assets : [],
    events: Array.isArray(value.events) ? value.events : [],
    status: value.status ?? 'saved',
    revision: value.revision ?? null,
    visualDiagnostics: Array.isArray(value.visualDiagnostics) ? value.visualDiagnostics : []
  };
}
function optionList(values, selected) {
  return Object.entries(values).map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
}
function selectOptions(options, selected) {
  return options.map((opt) => `<option value="${escapeHtml(opt.value)}"${opt.value === selected ? ' selected' : ''}${opt.coming ? ' disabled' : ''}>${escapeHtml(opt.label)}</option>`).join('');
}
function typeSelect(selected) { return selectOptions(TYPE_OPTIONS, selected); }
function fieldNumber(label, id, value, min, max, step) {
  return '<div class="field"><label for="' + id + '">' + escapeHtml(label) + '</label><input id="' + id + '" type="number" min="' + min + '" max="' + max + '"' + (step != null ? ' step="' + step + '"' : '') + ' value="' + escapeHtml(String(value)) + '"></div>';
}

const SYNC_ELEMENT_IDS = Object.freeze([
  'global-visual-enabled', 'global-visual-default-mode',
  'prop-size', 'prop-anchor', 'prop-margin-left', 'prop-margin-right', 'prop-margin-top', 'prop-margin-bottom', 'prop-gap', 'prop-layout', 'prop-width', 'prop-height',
  'prop-border-radius', 'prop-opacity',
  'prop-duration', 'prop-hold-duration',
  'prop-dismiss-mode',
  'skin-bg-color', 'skin-bg-asset', 'skin-bg-fit', 'skin-bg-padding',
  'pipeline-behavior', 'pipeline-type',
  'ticker-speed', 'ticker-band', 'ticker-band-ratio', 'ticker-track-count', 'ticker-track-gap', 'ticker-min-gap'
]);

function modeChips(behaviorId) {
  const chips = BEHAVIOR_AXIS_OPTIONS.map((option) => {
    if (option.implemented) {
      const selected = option.value === behaviorId;
      return '<button type="button" class="chip' + (selected ? ' is-on is-selected' : '') + '" data-axis="behavior" data-value="' + escapeHtml(option.value) + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' + escapeHtml(option.name) + '</button>';
    }
    return '<button type="button" class="chip is-locked" data-axis="behavior" data-value="' + escapeHtml(option.value) + '" aria-disabled="true" aria-pressed="false" tabindex="0" aria-describedby="popup-why">' + escapeHtml(option.name) + ' <span class="chip-badge">未实现</span></button>';
  }).join('');
  return '<div class="mode-block"><div class="mode-row" role="group" aria-label="出现方式">' + chips + '</div><p class="mode-why" id="popup-why">突脸还在开发中，暂时不能选择。现在只能用堆叠或弹幕。</p></div>';
}

function stackSection(props, behaviorId) {
  const anchor = props.anchor ?? 'bottom-right';
  const holdMs = props.holdDurationMs ?? 30000;
  const holdSeconds = Math.max(1, Math.round(Number(holdMs) / 1000) || 30);
  const dock = ANCHOR_ORDER.map((id) => '<button type="button" class="dock-cell' + (anchor === id ? ' is-on' : '') + '" data-anchor="' + id + '">' + ANCHOR_LABELS[id] + '</button>').join('');
  const anchorOptions = ANCHOR_ORDER.map((id) => '<option value="' + id + '"' + (anchor === id ? ' selected' : '') + '>' + ANCHOR_LABELS[id] + '</option>').join('');
  return '<details class="fold" id="stack-section"' + (behaviorId === 'ticker' ? ' hidden' : ' open') + ' aria-label="堆叠怎么出现">'
    + '<summary>堆叠怎么出现 <small>卡片从角落叠上来</small></summary><div class="fold-body"><p class="group-hint">卡片从角落叠上来，停在那里等你看完。</p>'
    + '<div class="inline-pair"><div class="field"><span class="label">停靠</span><div class="dock" role="group" aria-label="停靠在屏幕哪个角">' + dock + '</div>'
    + '<select id="prop-anchor" class="mode-contract-select" aria-label="停靠" tabindex="-1" aria-hidden="true">' + anchorOptions + '</select></div>'
    + '<div class="fields" style="flex:1;min-width:0">'
    + '<div class="field"><label for="prop-dismiss-mode">关闭方式</label><select id="prop-dismiss-mode">' + optionList(CARD_DISMISS_MODES, props.dismissMode ?? 'closeButton') + '</select></div>'
    + '<div class="field"><label for="hold-seconds">停留时长（秒）</label><input id="hold-seconds" type="number" min="1" max="120" step="1" value="' + holdSeconds + '"></div>'
    + '</div></div>'
    + '<details class="more"><summary>边距与卡片间距</summary><div class="fields" style="margin-top:12px">'
    + fieldNumber('距左', 'prop-margin-left', props.marginLeft ?? props.margin ?? 18, 0, 96, 1)
    + fieldNumber('距右', 'prop-margin-right', props.marginRight ?? props.margin ?? 18, 0, 96, 1)
    + fieldNumber('距上', 'prop-margin-top', props.marginTop ?? props.margin ?? 18, 0, 96, 1)
    + fieldNumber('距下', 'prop-margin-bottom', props.marginBottom ?? props.margin ?? 18, 0, 96, 1)
    + fieldNumber('卡片间距', 'prop-gap', props.gap ?? 8, 0, 48, 1)
    + '</div></details>'
    + '<select id="prop-layout" class="mode-contract-select" aria-label="排列方式" tabindex="-1" aria-hidden="true">' + optionList(LAYOUT_OPTIONS, props.layout ?? 'simple') + '</select>'
    + '<input id="prop-duration" type="hidden" value="' + escapeHtml(String(props.durationMs ?? 30000)) + '">'
    + '<input id="prop-hold-duration" type="hidden" value="' + escapeHtml(String(holdMs)) + '">' 
    + '</div></details>';
}

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
    + '<div class="slider-val' + (config.speedRandom ? ' is-muted' : '') + '" id="ticker-speed-val">' + speed + '</div></div>'
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

function appearanceSection(props, appearance, skin, assetOptions) {
  const size = props.size ?? appearance.size ?? 'medium';
  const radius = props.borderRadius ?? appearance.borderRadius ?? 16;
  const opacity = props.opacity ?? appearance.opacity ?? 0.96;
  const width = appearance.width ?? 420;
  const height = appearance.height ?? 220;
  const color = skin.background?.color ?? skin.backgroundColor ?? appearance.backgroundColor ?? '#0e1916';
  const fit = appearance.backgroundFit ?? skin.background?.fit ?? 'fill';
  const padding = skin.background?.padding ?? skin.backgroundPadding ?? appearance.backgroundPadding ?? 0;
  return '<details class="fold is-quiet" id="appearance-section" open aria-label="卡片外观">'
    + '<summary>卡片外观 <small>尺寸、圆角、底色</small></summary><div class="fold-body"><p class="group-hint">这一张卡看起来多大、多圆、什么底。比出现方式轻一档。</p>'
    + '<div class="fields">'
    + '<div class="field"><label for="prop-size">尺寸</label><select id="prop-size">' + optionList(CARD_SIZES, size) + '</select></div>'
    + fieldNumber('圆角', 'prop-border-radius', radius, 0, 48)
    + fieldNumber('宽', 'prop-width', width, 240, 720)
    + fieldNumber('高', 'prop-height', height, 64, 360)
    + '<div class="field"><label for="prop-opacity">透明度</label><input id="prop-opacity" type="number" min="0" max="1" step="0.01" value="' + opacity + '"></div>'
    + '<div class="field"><label for="skin-bg-color">背景色</label><input id="skin-bg-color" type="color" value="' + escapeHtml(color) + '"></div>'
    + '</div>'
    + '<input id="skin-bg-asset" type="hidden" value="">'
    + '<input id="skin-bg-fit" type="hidden" value="' + escapeHtml(fit) + '">'
    + '<input id="skin-bg-padding" type="hidden" value="' + escapeHtml(String(padding)) + '">' 
    + '</div></details>';
}

function previewSection(behaviorId, anchor) {
  const copy = behaviorId === 'ticker' ? '只演弹幕：从右往左流过这条带。' : '只演堆叠：从选定的角叠上来。';
  return '<details class="fold" id="visual-preview" open aria-label="预览">'
    + '<summary>预览 <small id="preview-copy">' + copy + '</small></summary><div class="fold-body">'
    + '<div class="preview-head"><h2 class="group-name" style="margin:0">舞台</h2>'
    + '<div class="preview-actions"><button id="open-visual-preview" class="secondary" type="button">打开实时预览</button></div></div>'
    + '<div id="visual-preview-floating">'
    + '<div id="visual-preview-stage" class="stage" data-anchor="' + escapeHtml(anchor) + '"></div>'
    + '<div class="preview-runtime-status"><span id="visual-preview-state" class="state-pill">等待更新</span></div>'
    + '<div id="visual-preview-confirmation" class="visual-preview-confirmation" role="status" aria-live="polite">尚未收到后端确认。</div>'
    + '<div id="visual-preview-toast" class="toast" role="status"></div>'
    + '</div></div></details>';
}

function saveProfileSection(profiles) {
  const list = Array.isArray(profiles) ? profiles : [];
  const listHtml = list.length
    ? '<div class="profile-list">' + list.map(function (p) {
        var refs = p.references && p.references.length ? '<span class="profile-refs">' + escapeHtml(p.references.length + ' 个事件') + '</span>' : '<span class="profile-refs muted">未使用</span>';
        var canDelete = p.profileId !== 'visual.default';
        var action = '<button type="button" class="secondary profile-export" data-profile-id="' + escapeHtml(p.profileId) + '" data-profile-name="' + escapeHtml(p.name) + '">导出</button>' + (canDelete ? '<button type="button" class="secondary profile-delete" data-profile-id="' + escapeHtml(p.profileId) + '">删除</button>' : '');
        return '<div class="profile-list-item" data-profile-id="' + escapeHtml(p.profileId) + '"><span class="profile-list-name">' + escapeHtml(p.name) + '</span><span class="profile-list-meta">' + refs + '<span class="profile-source">' + escapeHtml(p.source === 'local' ? '本地' : p.source === 'import' ? '导入' : '内置') + '</span>' + action + '</span></div>';
      }).join('') + '</div>'
    : '<div class="profile-list-empty">暂无已保存的配置包</div>';
  return '<div class="fold-body">'
    + '<p class="muted">把当前这组样子存成一份，以后可以换用。这里不是保存整页设置。</p>'
    + '<div class="row"><div class="field" style="flex:1;min-width:180px"><label for="visual-profile-name">名称</label>'
    + '<input id="visual-profile-name" type="text" value="" maxlength="80" placeholder="给这套样子起个中文名"></div>'
    + '<button id="visual-profile-save" class="secondary" type="button">保存为配置包</button></div>'
    + '<div id="visual-feedback" class="feedback"></div>'
    + '<div id="visual-conflict-dialog" class="conflict-dialog" style="display:none"><div class="conflict-dialog-body">'
    + '<p>配置包 <strong id="visual-conflict-name"></strong> 已存在。请选择操作：</p>'
    + '<div class="conflict-actions"><button id="visual-conflict-overwrite" class="danger" type="button">覆盖</button>'
    + '<button id="visual-conflict-copy" class="secondary" type="button">创建副本</button>'
    + '<button id="visual-conflict-keep" class="secondary" type="button">保留 · 放弃</button></div></div></div>'
    + '<div id="visual-delete-dialog" class="conflict-dialog" style="display:none"><div class="conflict-dialog-body">'
    + '<p>删除配置包 <strong id="visual-delete-name"></strong> 后，下列已绑定事件会解除绑定，改走默认视觉档。后果不可从这条撤销。</p>'
    + '<ul id="visual-delete-events" class="delete-event-list"></ul>'
    + '<div class="conflict-actions"><button id="visual-delete-confirm" class="danger" type="button">确认删除</button>'
    + '<button id="visual-delete-cancel" class="secondary" type="button">取消</button></div></div></div>'
    + '<h3 class="group-name">已自定义配置包</h3>'
    + '<div id="visual-profile-list" class="profile-list-wrapper">' + listHtml + '</div></div>';
}

function applyToEventsSection(profiles, events) {
  const profileList = Array.isArray(profiles) ? profiles : [];
  const eventList = Array.isArray(events) ? events : [];
  const profileOptions = profileList.length
    ? profileList.map(function (p) { return '<option value="' + escapeHtml(p.profileId) + '">' + escapeHtml(p.name) + '</option>'; }).join('')
    : '<option value="">暂无可用的配置包</option>';
  const eventOptions = eventList.length
    ? eventList.map(function (e) { return '<option value="' + escapeHtml(e.eventId) + '">' + escapeHtml(e.label || e.eventId) + '</option>'; }).join('')
    : '<option value="">暂无可用的测试事件</option>';
  return '<div class="fold-body"><p class="muted">默认不出桌面卡；选事件再套这套样子。弹幕方案会飞，堆叠方案会叠。</p><div class="row">'
    + '<div class="field" style="min-width:180px;flex:1"><label for="apply-visual-profile">配置包</label><select id="apply-visual-profile">' + profileOptions + '</select></div>'
    + '<div class="field" style="min-width:180px;flex:1"><label for="apply-event-select">事件</label><select id="apply-event-select">' + eventOptions + '</select></div>'
    + '<button id="apply-visual-btn" class="secondary" type="button">应用</button></div>'
    + '<div id="apply-visual-feedback" class="feedback"></div>'
    + '<div id="apply-bound-list" class="apply-bound-list" style="display:none"><h3 class="apply-bound-title">已绑定事件</h3><div class="apply-bound-items"></div></div></div>';
}

function visualExperimentSection() {
  return '<div class="fold-body"><p class="muted">测已绑定事件，不是当前草稿。试一条在标题旁。</p><div class="row">'
    + '<div class="field" style="min-width:180px;flex:1"><label for="visual-test-event">事件</label><select id="visual-test-event"><option value="">读取已绑定事件…</option></select></div>'
    + '<div class="field"><label for="visual-test-count">次数</label><input id="visual-test-count" type="number" min="1" max="50" step="1" value="1"></div>'
    + '<div class="field"><label for="visual-test-interval">间隔 (ms)</label><input id="visual-test-interval" type="number" min="0" max="5000" step="50" value="120"></div>'
    + '<button id="visual-test-send" class="secondary" type="button">运行视觉实验</button></div>'
    + '<div id="visual-test-feedback" class="feedback"></div></div>';
}

function diagnosticsSection(boot) {
  const status = boot.status || 'saved';
  const revision = boot.revision;
  const statusLabel = status === 'applied' ? '已应用' : status === 'saved' ? '已保存' : status === 'loading' ? '加载中' : status;
  const diagnostics = Array.isArray(boot.visualDiagnostics) ? boot.visualDiagnostics : [];
  const rows = diagnostics.length
    ? diagnostics.slice(0, 12).map((entry) => {
        const level = entry.level === 'error' || entry.level === 'warn' ? entry.level : 'ok';
        const details = entry.details && typeof entry.details === 'object'
          ? ['eventId', 'profileId', 'cardId'].map((key) => entry.details[key] ? key + ' ' + entry.details[key] : '').filter(Boolean).join(' · ')
          : '';
        return '<div class="visual-diagnostic-row is-' + level + '"><div><strong>' + escapeHtml(entry.code || 'VISUAL_OPERATION') + '</strong><span>' + escapeHtml(entry.stage || 'visual') + ' · ' + escapeHtml(entry.message || '') + '</span>' + (details ? '<span class="diag-details">' + escapeHtml(details) + '</span>' : '') + '</div><time>' + escapeHtml(entry.timestamp || '') + '</time></div>';
      }).join('')
    : '<div class="empty-state">还没有视觉诊断记录。保存或试一条之后，这里会出现结果。</div>';
  return '<div class="fold-body" id="visual-diagnostics"><p class="muted">最近一次视觉操作记在这。问题用危险色，正常操作用淡色。</p>'
    + '<div class="row"><span class="muted">设置状态 ' + escapeHtml(statusLabel) + '</span><span class="muted">修订版本 ' + (revision != null ? revision : '—') + '</span></div>'
    + '<div id="visual-diagnostics-list" class="visual-diagnostics-list">' + rows + '</div>'
    + '<div id="visual-diagnostics-feedback" class="feedback" role="status" aria-live="polite"></div>'
    + '<div class="row"><button id="refresh-visual-diagnostics" class="secondary" type="button">刷新</button>'
    + '<button id="clear-visual-diagnostics" class="secondary" type="button">清空</button>'
    + '<button id="export-visual-diagnostics" class="secondary" type="button">导出</button></div></div>';
}

function renderBody(currentUrl, initialData) {
  const boot = initialModel(initialData);
  const profile = boot.profile ?? {};
  const card = profile.card ?? {};
  const activeType = card.activeType ?? 'minimal';
  const activeConfig = card.types?.[activeType] ?? card.types?.minimal ?? {};
  const behaviorId = profile.behaviorId ?? 'stack';
  const appearance = activeConfig.appearance ?? {};
  const properties = activeConfig.properties ?? {};
  const props = { ...properties.space, ...properties.shape, ...properties.lifecycle, ...properties.interaction };
  const global = profile.global ?? {};
  const globalEnabled = global.enabled !== false;
  const globalDefaultMode = global.defaultMode || 'off';
  const initial = JSON.stringify(boot).replaceAll('<', '\\u003c');
  const backgroundAssetId = activeConfig.skin?.background?.assetId ?? appearance.backgroundAssetId;
  const assetOptions = boot.assets.map((asset) => `<option value="${escapeHtml(asset.assetId)}"${backgroundAssetId === asset.assetId ? ' selected' : ''}>${escapeHtml(asset.name)} · ${escapeHtml(String(asset.format).toUpperCase())}</option>`).join('');
  const behaviorOptions = BEHAVIOR_AXIS_OPTIONS.map((option) => '<option value="' + escapeHtml(option.value) + '"' + (option.value === behaviorId ? ' selected' : '') + (option.implemented ? '' : ' disabled') + '>' + escapeHtml(option.value) + '</option>').join('');
  const anchor = props.anchor ?? 'bottom-right';
  return '<div class="studio" data-settings-view-root="visual" data-mode="' + escapeHtml(behaviorId) + '" data-editor-mode="' + escapeHtml(activeType) + '">'
    + '<header class="hero"><div><h1>通知视觉</h1><p>选一种出现方式，只调这一组，看见它怎么动，再保存。</p></div>'
    + '<div class="hero-actions"><button id="visual-try-one" class="secondary" type="button">试一条</button>'
    + '<button id="visual-clear-cards" class="secondary" type="button">清除屏幕上的视觉卡</button>'
    + '<button id="visual-settings-save" class="primary" type="button">保存</button></div></header>'
    + '<div class="visual-global-row" id="visual-global-switch">'
    + '<div' + (globalEnabled ? '' : ' id="visual-global-off"') + ' class="visual-global-cluster">'
    + '<label class="visual-global-toggle"><input type="checkbox" id="global-visual-enabled"' + (globalEnabled ? ' checked' : '') + '><span>' + (globalEnabled ? '开启全局视觉' : '关闭全局视觉') + '</span></label>'
    + '<label class="visual-global-default">默认视觉效果<select id="global-visual-default-mode" aria-describedby="visual-default-mode-hint">'
    + '<option value="off"' + (globalDefaultMode === 'off' ? ' selected' : '') + '>关闭视觉</option>'
    + '<option value="stack"' + (globalDefaultMode === 'stack' || globalDefaultMode === 'minimal' ? ' selected' : '') + '>全部堆叠</option>'
    + '<option value="ticker"' + (globalDefaultMode === 'ticker' ? ' selected' : '') + '>全部弹幕</option></select></label>'
    + '<div id="visual-page-status" class="state-pill">' + escapeHtml(boot.status === 'applied' ? '已应用' : '已读取') + '</div></div></div>'
    + '<p class="visual-global-hint" id="visual-default-mode-hint">没单独绑定的事件走这里；总开关仍最高。关闭总开关后，真实事件不出桌面卡，试一条和实时预览仍可用。</p>'
    + '<div id="visual-settings-feedback" class="feedback" role="status" aria-live="polite"></div>'
    + '<select id="pipeline-behavior" class="mode-contract-select" aria-label="出现方式" tabindex="-1" aria-hidden="true">' + behaviorOptions + '</select>'
    + '<select id="pipeline-type" class="mode-contract-select" aria-label="卡片种类" tabindex="-1" aria-hidden="true">' + typeSelect(activeType) + '</select>'
    + modeChips(behaviorId)
    + '<div class="studio-main">'
    + stackSection(props, behaviorId)
    + tickerSection(profile.ticker ?? {}, behaviorId)
    + appearanceSection(props, appearance, activeConfig.skin ?? {}, assetOptions)
    + previewSection(behaviorId, anchor)
    + '</div>'
    + '<div class="studio-secondary">'
    + '<details class="fold"><summary>配置包 <small>存一份、换一份</small></summary>' + saveProfileSection(boot.profiles) + '</details>'
    + '<details class="fold"><summary>应用于事件 <small>选事件再套这套样子</small></summary>' + applyToEventsSection(boot.profiles, boot.events) + '</details>'
    + '<details class="fold"><summary>已绑定事件试运行 <small>次数、间隔</small></summary>' + visualExperimentSection() + '</details>'
    + '<details class="fold"><summary>诊断 <small id="visual-diagnostics-summary">' + (function () {
      const n = (boot.visualDiagnostics || []).filter((entry) => entry.level === 'error' || entry.level === 'warn').length;
      return n ? (n + ' 个问题') : '最近一次视觉操作';
    }()) + '</small></summary>' + diagnosticsSection(boot) + '</details>'
    + '</div></div>'
    + '<script>(function(){var initial=' + initial + ';var state=initial;var $=function(id){return document.getElementById(id)};'
    + STUDIO_CLIENT
    + '})();</script>';
}

const CSS_STYLES = ":root{color-scheme:dark;--bg:#0e1513;--surface:#17221f;--raised:#1d2b27;--text:#e7f2ee;--muted:#9bb1a9;--line:#304740;--accent:#62d0a8;--strong:#38b88d;--ink:#092118;--ticker:#56c8d8;--popup:#f1c77a;--danger:#f18c8c;--success:#72d49e;--radius:7px;--ctrl-h:36px}\n.shell *,.studio,.studio *{box-sizing:border-box}.shell{margin:0;background:var(--bg);color:var(--text)}\nbody{font:14px/1.5 \"Segoe UI\",\"Microsoft YaHei\",sans-serif;min-width:320px}\nbutton,input,select{font:inherit;color:inherit}\n.shell button,.studio button{cursor:pointer;min-height:var(--ctrl-h);height:var(--ctrl-h);padding:0 14px;border:1px solid var(--line);border-radius:var(--radius);background:transparent;color:var(--text);font-size:13px;font-weight:600}\nbutton:hover{background:var(--raised)}\nbutton.primary,.primary{min-width:88px;padding:0 18px;border-color:var(--strong);background:var(--strong);color:var(--ink);font-size:14px;font-weight:700}\nbutton.primary:hover,.primary:hover{background:var(--accent);border-color:var(--accent)}\nbutton.primary:active,.primary:active{transform:translateY(1px)}\nbutton.primary.is-saved{background:var(--raised);border-color:var(--line);color:var(--text)}\nbutton.secondary,.secondary{background:transparent;border-color:var(--line);color:var(--text)}\nbutton.secondary:hover,.secondary:hover{background:var(--raised)}\nbutton.danger{background:var(--danger);color:var(--ink);border-color:var(--danger)}\nbutton.danger:hover{background:#f3a0a0}\nbutton:disabled,input:disabled,select:disabled{opacity:.48;cursor:not-allowed}\nbutton:focus-visible,.chip:focus-visible,.dock-cell:focus-visible,.band-hit:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}\n[hidden]{display:none!important}\n.shell{max-width:1280px;margin:0 auto;padding:0 0 24px}\n.settings-toolbar{display:flex;justify-content:space-between;gap:12px;margin:18px 40px 0}\n.crumb{color:var(--muted);font-size:12px;align-self:center}\n.studio{width:min(1280px,100%);margin:0 auto;padding:36px 40px 80px}\n.hero{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:16px}.hero-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex-shrink:0}\n.hero h1{margin:0 0 6px;font-size:23px;font-weight:700;letter-spacing:0;line-height:1.2}\n.hero p{margin:0;max-width:36em;color:var(--muted);font-size:14px;line-height:1.5}\n.visual-global-row{margin-bottom:16px}\n.visual-global-cluster{display:flex;flex-wrap:wrap;align-items:center;gap:16px}\n.visual-global-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;font-weight:600}\n.visual-global-toggle input[type=checkbox]{width:18px;height:18px;accent-color:var(--accent)}\n.visual-global-default{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px}\n.visual-global-default select{height:var(--ctrl-h);padding:0 10px;border:1px solid var(--line);border-radius:6px;background:var(--raised);color:var(--text)}\n.visual-global-hint{margin:0 0 12px;color:var(--muted);font-size:12px}\n.state-pill{padding:6px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted);white-space:nowrap;font-size:12px}\n.mode-block{margin-bottom:32px}\n.mode-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}\n.chip{display:inline-flex;align-items:center;gap:8px;min-height:var(--ctrl-h);padding:0 14px;border:1px solid var(--line);border-radius:var(--radius);background:var(--raised);color:var(--text);font-size:13px;font-weight:600}\n.chip:hover{border-color:var(--accent)}\n.chip.is-on,.chip.is-selected{border-color:var(--strong);box-shadow:inset 0 -2px 0 var(--accent)}\n.chip.is-locked{border-style:dashed;background:transparent;color:var(--muted);cursor:default}\n.chip.is-locked:hover{border-color:var(--line);background:transparent}\n.chip-badge{padding:1px 7px;border:1px solid #6d5b32;border-radius:999px;color:var(--popup);font-size:11px;font-weight:600;line-height:1.4}\n.mode-why{margin:8px 0 0;color:var(--muted);font-size:12px;line-height:1.45}\n.group{margin-bottom:32px}\n.group-name{margin:0 0 12px;font-size:13px;font-weight:700;color:var(--text)}\n.group.is-quiet .group-name{color:var(--muted);font-weight:600}\n.group-hint{margin:-6px 0 14px;color:var(--muted);font-size:12px}\n.fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px 20px;max-width:720px}\n.field{display:grid;gap:6px;min-width:0}\n.field.span-2{grid-column:1/-1}\n.field label,.field .label{font-size:12px;color:var(--muted);line-height:1.3}\n.field input[type=number],.field input[type=text],.field select{width:100%;height:var(--ctrl-h);padding:0 10px;border:1px solid var(--line);border-radius:6px;background:var(--raised);color:var(--text)}\n.field input[type=color]{width:100%;height:var(--ctrl-h);padding:4px;border:1px solid var(--line);border-radius:6px;background:var(--raised);cursor:pointer}\n.field-note,.muted{color:var(--muted);font-size:12px}\n.slider-row{display:grid;grid-template-columns:minmax(0,1fr) 64px;gap:12px;align-items:center;min-width:0}.slider-row>*{min-width:0}.slider-row.with-action{grid-template-columns:minmax(0,1fr) 64px max-content}.slider-row.with-action .chip{position:relative;z-index:1}\n.studio input[type=range],.shell input[type=range]{width:100%;height:var(--ctrl-h);margin:0;accent-color:var(--accent);background:transparent}\n.slider-val{height:var(--ctrl-h);display:grid;place-items:center;border:1px solid var(--line);border-radius:6px;background:var(--raised);font-size:13px;font-variant-numeric:tabular-nums}\n.dock{width:168px;height:112px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:4px;padding:6px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg)}\n.dock-cell{border:1px solid var(--line);border-radius:5px;background:var(--raised);color:var(--muted);font-size:12px;font-weight:600;height:auto;min-height:0}\n.dock-cell:hover{border-color:var(--accent);color:var(--text)}\n.dock-cell.is-on{border-color:var(--strong);background:var(--surface);color:var(--text);box-shadow:inset 0 0 0 1px var(--accent)}\n.band{position:relative;width:220px;height:96px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);overflow:hidden}\n.band-fill{position:absolute;left:0;right:0;height:28%;background:rgba(86,200,216,.18);border:1px solid var(--ticker);pointer-events:none}\n.band[data-side=top] .band-fill{top:0;border-width:0 0 1px}\n.band[data-side=bottom] .band-fill{bottom:0;border-width:1px 0 0}\n.band-hit{position:absolute;left:0;right:0;height:50%;border:0;background:transparent;color:var(--muted);font-size:12px;font-weight:600;text-align:left;padding:8px 10px}\n.band-hit.top{top:0}.band-hit.bottom{bottom:0}\n.band-hit:hover{color:var(--text)}\n.band[data-side=top] .band-hit.top,.band[data-side=bottom] .band-hit.bottom{color:var(--text)}\n.inline-pair{display:flex;flex-wrap:wrap;align-items:flex-end;gap:20px}\ndetails.more{margin-top:8px;max-width:720px}\ndetails.more>summary{list-style:none;display:flex;align-items:center;min-height:32px;color:var(--muted);font-size:12px;cursor:pointer}\ndetails.more>summary::-webkit-details-marker{display:none}\ndetails.more>summary::before{content:\"▸\";margin-right:6px;color:var(--muted)}\ndetails.more[open]>summary::before{content:\"▾\"}\ndetails.more>summary:hover{color:var(--text)}\n.preview-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}\n.preview-head h2{margin:0;font-size:13px;font-weight:700}\n.preview-head span{display:block;margin-top:2px;color:var(--muted);font-size:12px;font-weight:400}\n.preview-actions{display:flex;flex-wrap:wrap;gap:8px}\n.stage{position:relative;height:280px;overflow:hidden;border:1px solid var(--line);border-radius:var(--radius);background:#0a100f}\n.stage-label{position:absolute;top:10px;left:12px;z-index:2;color:var(--muted);font-size:12px}\n.stack-card{position:absolute;width:220px;padding:12px 14px;border:1px solid #6d817a;border-radius:8px;background:#14201c}\n.stack-card strong{display:block;font-size:13px}\n.stack-card small{color:var(--muted);font-size:12px}\n.stack-card .x{position:absolute;top:8px;right:10px;color:var(--muted);font-size:12px}\n.stage[data-anchor=bottom-right] .stack-card{right:16px;bottom:16px}\n.stage[data-anchor=bottom-left] .stack-card{left:16px;bottom:16px}\n.stage[data-anchor=top-right] .stack-card{right:16px;top:28px}\n.stage[data-anchor=top-left] .stack-card{left:16px;top:28px}\n.stage[data-anchor=bottom-right] .stack-card:nth-child(3),.stage[data-anchor=bottom-left] .stack-card:nth-child(3){transform:translateY(-14px);opacity:.86}\n.stage[data-anchor=bottom-right] .stack-card:nth-child(4),.stage[data-anchor=bottom-left] .stack-card:nth-child(4){transform:translateY(-28px);opacity:.7}\n.stage[data-anchor=top-right] .stack-card:nth-child(3),.stage[data-anchor=top-left] .stack-card:nth-child(3){transform:translateY(14px);opacity:.86}\n.stage[data-anchor=top-right] .stack-card:nth-child(4),.stage[data-anchor=top-left] .stack-card:nth-child(4){transform:translateY(28px);opacity:.7}\n.ticker-band-preview{position:absolute;left:0;right:0;overflow:hidden}\n.ticker-lane{position:relative;height:36px;margin-bottom:8px}\n.ticker-card{position:absolute;top:0;left:0;display:flex;align-items:center;gap:10px;width:240px;height:32px;padding:0 12px;border:1px solid var(--ticker);border-radius:6px;background:#10262a;white-space:nowrap;animation:ticker-flow var(--flow,4.8s) linear infinite}\n.ticker-card strong{font-size:12px}.ticker-card small{color:var(--muted);font-size:12px}\n@keyframes ticker-flow{from{transform:translateX(720px)}to{transform:translateX(-260px)}}\n.toast{min-height:20px;margin-top:8px;color:var(--muted);font-size:12px}\n.toast.ok{color:var(--accent)}\n.preview-runtime-status{display:flex;align-items:center;gap:8px;margin-top:8px}\n.visual-preview-confirmation{min-height:20px;margin-top:6px;color:var(--muted);font-size:12px}\n.visual-preview-confirmation.success{color:var(--accent)}\n.visual-preview-confirmation.error{color:var(--danger)}\n.feedback{min-height:22px;color:var(--muted);font-size:12px}\n.feedback.success{color:var(--success)}\n.feedback.error{color:var(--danger)}\n.studio-secondary{margin-top:40px;border-top:1px solid var(--line);padding-top:8px}\n.fold{border-bottom:1px solid var(--line)}\n.fold>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;min-height:44px;cursor:pointer;font-size:13px;font-weight:700}\n.fold>summary::-webkit-details-marker{display:none}\n.fold>summary:hover{color:var(--accent)}\n.fold>summary small{font-weight:400;color:var(--muted)}\n.fold-body{padding:0 0 20px;display:grid;gap:12px;max-width:720px}\n.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}\n.profile-list-item,.pack-item{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line);font-size:13px;flex-wrap:wrap}\n.profile-list-meta{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--muted)}\n.profile-refs{color:var(--accent)}.profile-refs.muted{color:var(--muted)}\n.profile-source{padding:2px 6px;border:1px solid var(--line);border-radius:4px;font-size:12px}\n.profile-list-empty,.empty-state{padding:16px 12px;color:var(--muted);text-align:center;font-size:13px}\n.conflict-dialog{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:1000}\n.conflict-dialog-body{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:24px;max-width:420px;width:90%;display:grid;gap:16px}\n.conflict-actions{display:flex;gap:8px;flex-wrap:wrap}\n.apply-bound-list{display:grid;gap:8px}\n.apply-bound-item{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--line);font-size:12px}\n.apply-bound-item .bound-profile{color:var(--accent)}\n.visual-diagnostics-list{display:grid;gap:6px}\n.visual-diagnostic-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line)}\n.visual-diagnostic-row strong{font-size:12px}\n.visual-diagnostic-row span,.visual-diagnostic-row time{font-size:12px;color:var(--muted)}\n.visual-diagnostic-row.is-error strong,.visual-diagnostic-row.is-warn strong{color:var(--danger)}\n.visual-diagnostic-row.is-ok strong{color:var(--muted)}\n.visual-diagnostic-row .diag-details{display:block;margin-top:2px}\n.delete-event-list{margin:0;padding-left:1.2em;color:var(--text);font-size:13px}\n.studio-main>.fold{margin-bottom:8px}\n.mode-contract-select{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}\n.ticker-section .fold-body{gap:20px;max-width:560px}\n.ticker-section .ticker-flow-stage,.ticker-section .ticker-flow-pace,.ticker-section .ticker-flow-lanes,.ticker-section .ticker-flow-pointer{display:grid;gap:8px;min-width:0}\n.ticker-section .band{width:100%;height:96px}.studio .ticker-section .band-hit{height:50%;min-height:0;padding:8px 10px;border:0;border-radius:0;background:transparent;font-size:12px;font-weight:600;color:var(--muted);text-align:left}.studio .ticker-section .band-hit:hover{color:var(--text);border-color:transparent}.studio .ticker-section .band[data-side=top] .band-hit.top,.studio .ticker-section .band[data-side=bottom] .band-hit.bottom{color:var(--text)}.studio .ticker-section .slider-val.is-muted{color:var(--muted);opacity:.55}.studio .ticker-section .ticker-flow-pointer .chip{width:fit-content;justify-self:start}\n.ticker-section .slider-row{display:grid;grid-template-columns:minmax(0,1fr) 64px;gap:12px;align-items:center;min-width:0}\n.ticker-section .slider-row input[type=range]{width:100%;min-width:0;height:var(--ctrl-h);margin:0}\n.ticker-section .ticker-flow-random{display:flex;align-items:center;gap:12px;flex-wrap:wrap}\n.ticker-section .ticker-flow-random #ticker-speed-random{flex:0 0 auto}\n.ticker-section .ticker-flow-random .field-note{margin:0;flex:1 1 200px}\n.ticker-section .ticker-flow-lanes .field input[type=number]{max-width:160px}\n.ticker-section .ticker-flow-gaps{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px 20px;min-width:0}\n.ticker-section .ticker-flow-pointer .chip{width:fit-content}\n@media(max-width:820px){.studio{padding:28px 20px 64px}.settings-toolbar{margin:18px 20px 0}.fields{max-width:none}.stage{height:240px}}\n@media(max-width:560px){.studio{padding:20px 14px 56px}.settings-toolbar{margin:18px 14px 0;flex-direction:column}.hero{flex-direction:column;align-items:stretch;gap:12px}.hero-actions{width:100%}.hero-actions .primary,.hero-actions .secondary,.preview-actions .secondary,.btn-ghost{width:100%}.fields{grid-template-columns:1fr}.field.span-2{grid-column:auto}.inline-pair{flex-direction:column;align-items:flex-start}.dock,.band{width:100%}.preview-head{flex-direction:column;align-items:stretch}.stage{height:220px}.fold>summary{align-items:flex-start;flex-direction:column;gap:4px;padding:10px 0}.ticker-section .fold-body{max-width:none}.ticker-section .ticker-flow-gaps{grid-template-columns:minmax(0,1fr)}.ticker-section .ticker-flow-random{flex-direction:column;align-items:flex-start}.ticker-section .ticker-flow-lanes .field input[type=number]{max-width:none}}";
export function renderVisualSettingsPage(currentUrl = '', initialData = null) {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notification Hub 通知视觉</title><style>'
    + PAGE_NAVIGATION_STYLE
    + CSS_STYLES
    + '</style></head><body><main class="shell">'
    + renderPageNavigation({ active: 'settings', currentUrl })
    + '<div class="settings-toolbar"><button id="back-settings" class="secondary" type="button">← 返回设置中心</button><span class="crumb">设置 / 通知视觉</span></div>'
    + renderBody(currentUrl, initialData)
    + '</main>' + PAGE_NAVIGATION_SCRIPT + '</body></html>';
}

export function renderVisualSettingsFragment(currentUrl = '', initialData = null) {
  return '<style data-settings-view-style>' + CSS_STYLES + '</style>'
    + renderBody(currentUrl, initialData);
}

export default function registerVisualSettingsRoute(app, ctx) {
  const getPlugin = () => ctx?._notificationHubVNextSettingsApi ?? ctx?._notificationHubVNextPlugin;
  app.get('/settings-visual', (c) => { const plugin = getPlugin(); return c.html(renderVisualSettingsPage(c?.req?.url ?? '', typeof plugin?.getVisualSettingsStatus === 'function' ? plugin.getVisualSettingsStatus() : null)); });
  app.get('/visual-settings-status', (c) => { try { const plugin = getPlugin(); if (!plugin?.getVisualSettingsStatus) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_SETTINGS_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...plugin.getVisualSettingsStatus() }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); } });
  app.get('/visual-diagnostics', (c) => { try { const plugin = getPlugin(); if (!plugin?.getVisualSettingsStatus) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_SETTINGS_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, visualDiagnostics: plugin.getVisualSettingsStatus().visualDiagnostics ?? [] }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); } });
  app.post('/visual-diagnostics-clear', (c) => { try { const plugin = getPlugin(); if (!plugin?.clearVisualDiagnostics) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_SETTINGS_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...plugin.clearVisualDiagnostics() }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-diagnostics-export', async (c) => { try { const plugin = getPlugin(); if (!plugin?.exportVisualDiagnostics) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_SETTINGS_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.exportVisualDiagnostics(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-settings-update', async (c) => { try { const plugin = getPlugin(); if (!plugin?.updateVisualSettings) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_SETTINGS_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...await plugin.updateVisualSettings(await readJsonBody(c)) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.post('/visual-settings-preview', async (c) => { try { const plugin = getPlugin(); if (!plugin?.previewVisualSettings) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_SETTINGS_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...plugin.previewVisualSettings(await readJsonBody(c)) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.post('/visual-workbench/open', async (c) => { try { const plugin = getPlugin(); if (!plugin?.openVisualWorkbenchCard) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_WORKBENCH_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.openVisualWorkbenchCard(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-workbench/update', async (c) => { try { const plugin = getPlugin(); if (!plugin?.updateVisualWorkbenchCard) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_WORKBENCH_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.updateVisualWorkbenchCard(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-workbench/close', async (c) => { try { const plugin = getPlugin(); if (!plugin?.closeVisualWorkbenchCard) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_WORKBENCH_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.closeVisualWorkbenchCard()) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-preview/open', async (c) => { try { const plugin = getPlugin(); if (!plugin?.openVisualPreviewCard) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_PREVIEW_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...visualPreviewResponse(await plugin.openVisualPreviewCard(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-preview/update', async (c) => { try { const plugin = getPlugin(); if (!plugin?.updateVisualPreviewCard) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_PREVIEW_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...visualPreviewResponse(await plugin.updateVisualPreviewCard(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-preview/close', async (c) => { try { const plugin = getPlugin(); if (!plugin?.closeVisualPreviewCard) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_PREVIEW_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.closeVisualPreviewCard()) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); } });
  app.post('/visual-try-one', async (c) => { try { const plugin = getPlugin(); if (!plugin?.runVisualDraftSample) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_TEST_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.runVisualDraftSample(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.post('/visual-clear-cards', async (c) => { try { const plugin = getPlugin(); if (!plugin?.clearVisualStudioCards) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_TEST_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.clearVisualStudioCards()) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.post('/visual-test-event', async (c) => { try { const plugin = getPlugin(); if (!plugin?.runVisualEventExperiment) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_TEST_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.runVisualEventExperiment(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.post('/visual-test-parallel-cards', async (c) => { try { const plugin = getPlugin(); if (!plugin?.runParallelCardSample) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_TEST_API_UNAVAILABLE' }) }, 503); return c.json({ ok: true, ...(await plugin.runParallelCardSample(await readJsonBody(c))) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  // Visual profile endpoints (forwarded to settings.js API)
  app.get('/visual-profiles', (c) => { try { const plugin = getPlugin(); if (!plugin?.listVisualProfiles) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, profiles: plugin.listVisualProfiles() }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); } });
  app.post('/visual-profiles/save', async (c) => { try { const plugin = getPlugin(); if (!plugin?.saveVisualProfile) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, profile: plugin.saveVisualProfile(await readJsonBody(c)) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.delete('/visual-profiles/:profileId', (c) => { try { const plugin = getPlugin(); if (!plugin?.removeVisualProfile) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, ...plugin.removeVisualProfile(c.req.param('profileId')) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, error?.code === 'VISUAL_PROFILE_REGISTRY_IN_USE' ? 409 : error?.code === 'VISUAL_PROFILE_REGISTRY_NOT_FOUND' ? 404 : 400); } });
  app.post('/visual-profiles/preview-apply', async (c) => { try { const plugin = getPlugin(); if (!plugin?.previewApplyVisualProfile) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, preview: plugin.previewApplyVisualProfile(await readJsonBody(c)) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.post('/visual-profiles/apply', async (c) => { try { const plugin = getPlugin(); if (!plugin?.applyVisualProfileToEvents) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, result: plugin.applyVisualProfileToEvents(await readJsonBody(c)) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
  app.get('/custom-visual-events', (c) => { try { const plugin = getPlugin(); if (!plugin?.listCustomVisualEvents) return c.json({ ok: false, error: { code: 'VISUAL_EVENT_API_UNAVAILABLE', message: 'Visual event API unavailable' } }, 503); return c.json({ ok: true, events: plugin.listCustomVisualEvents() }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); } });
  app.post('/custom-visual-events/restore-default', async (c) => { try { const plugin = getPlugin(); if (!plugin?.restoreVisualEventDefault) return c.json({ ok: false, error: { code: 'VISUAL_EVENT_API_UNAVAILABLE', message: 'Visual event API unavailable' } }, 503); const body = await readJsonBody(c); return c.json({ ok: true, ...plugin.restoreVisualEventDefault(body.eventId) }); } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); } });
}
