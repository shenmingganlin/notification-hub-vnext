import { PAGE_NAVIGATION_SCRIPT, PAGE_NAVIGATION_STYLE, renderPageNavigation } from './page-navigation.js';
import {
  createVisualProfile,
  TICKER_DEFAULTS,
  TICKER_SPEED_BOUNDS,
  TICKER_MIN_GAP_BOUNDS,
  TICKER_TRACK_GAP_BOUNDS
} from '../domain/visual-settings.js';
import { allowedStackGrows, resolveStackGrow, resolveStackWrap } from '../domain/stack-grow.js';
import { STUDIO_CLIENT } from './settings-visual-client.js';

const ROUTE_ERRORS = Object.freeze({
  VISUAL_SETTINGS_API_UNAVAILABLE: '视觉设置暂不可用。',
  VISUAL_PROFILE_API_UNAVAILABLE: '视觉方案 API 暂不可用。',
  VISUAL_TEST_API_UNAVAILABLE: '视觉测试功能暂不可用。'
});
const CARD_SIZES = Object.freeze({ small: '小', medium: '中', large: '大' });
const CARD_DISMISS_CLICK_MODES = Object.freeze({ closeButton: '关闭按钮', anywhere: '任意点击' });
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
  if (field.includes('marginLeft')) return '距左要填 ≥0 的整数。';
  if (field.includes('marginRight')) return '距右要填 ≥0 的整数。';
  if (field.includes('marginTop')) return '距上要填 ≥0 的整数。';
  if (field.includes('marginBottom')) return '距下要填 ≥0 的整数。';
  if (field.includes('gap')) return '卡片间距要填 ≥0 的整数。';
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
    fonts: Array.isArray(value.fonts) ? value.fonts : [],
    events: Array.isArray(value.events) ? value.events : [],
    studioAgents: Array.isArray(value.studioAgents) ? value.studioAgents : [],
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
function dockMarginOn(anchor, side) {
  const a = anchor || 'bottom-right';
  if (side === 'left') return a.endsWith('left');
  if (side === 'right') return a.endsWith('right');
  if (side === 'top') return a.startsWith('top');
  return a.startsWith('bottom');
}
function growPad(anchor, grow) {
  const resolved = resolveStackGrow(anchor, grow);
  const allowed = allowedStackGrows(anchor);
  const cell = (dir, label) => {
    const on = resolved === dir;
    const can = allowed[dir];
    return '<button type="button" class="grow-cell' + (on && can ? ' is-on' : '') + (can ? '' : ' is-off') + '" data-grow="' + dir + '" aria-pressed="' + (on && can ? 'true' : 'false') + '" aria-disabled="' + (can ? 'false' : 'true') + '">' + label + '</button>';
  };
  const growOptions = ['up', 'down', 'left', 'right'].map((dir) => '<option value="' + dir + '"' + (resolved === dir ? ' selected' : '') + '>' + dir + '</option>').join('');
  return '<div class="grow" role="group" aria-label="往哪长">'
    + '<span class="grow-spacer"></span>' + cell('up', '上') + '<span class="grow-spacer"></span>'
    + cell('left', '左') + '<span class="grow-center" aria-hidden="true"></span>' + cell('right', '右')
    + '<span class="grow-spacer"></span>' + cell('down', '下') + '<span class="grow-spacer"></span></div>'
    + '<select id="prop-grow" class="mode-contract-select" aria-label="往哪长" tabindex="-1" aria-hidden="true">' + growOptions + '</select>';
}
function wrapPad(wrap, grow) {
  const resolved = resolveStackWrap(wrap);
  const open = resolved !== 'off';
  const path = resolved === 'snake' ? 'snake' : 'parallel';
  const axisLabel = (grow === 'left' || grow === 'right') ? '开新行' : '开新列';
  const note = resolved === 'off'
    ? '满了掀最旧'
    : resolved === 'snake'
      ? '折返，二维满了掀最旧。停靠是最先来的那张。'
      : '满了沿另一边开列';
  const openChip = (id, on, label) => '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-wrap-open="' + id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + label + '</button>';
  const pathChip = (id, on, label) => '<button type="button" class="chip' + (on ? ' is-on' : '') + (open ? '' : ' is-off') + '" data-wrap-path="' + id + '" aria-pressed="' + (on && open ? 'true' : 'false') + '" aria-disabled="' + (open ? 'false' : 'true') + '">' + label + '</button>';
  return '<div class="field stack-wrap"><span class="label" id="prop-wrap-open-label">' + axisLabel + '</span>'
    + '<div class="chip-row" role="group" aria-label="新列或新行">'
    + openChip('off', !open, '关')
    + openChip('on', open, '开')
    + '</div>'
    + '<span class="label">走线</span>'
    + '<div class="chip-row" role="group" aria-label="走线">'
    + pathChip('parallel', path === 'parallel', '平行')
    + pathChip('snake', path === 'snake', '蛇形')
    + '</div>'
    + '<p class="field-note" id="prop-wrap-note">' + note + '</p>'
    + '<select id="prop-wrap" class="mode-contract-select" aria-label="走线" tabindex="-1" aria-hidden="true">'
    + '<option value="off"' + (resolved === 'off' ? ' selected' : '') + '>off</option>'
    + '<option value="parallel"' + (resolved === 'parallel' ? ' selected' : '') + '>parallel</option>'
    + '<option value="snake"' + (resolved === 'snake' ? ' selected' : '') + '>snake</option>'
    + '</select></div>';
}
function fieldNumber(label, id, value, min, max, step, disabled) {
  return '<div class="field"><label for="' + id + '">' + escapeHtml(label) + '</label><input id="' + id + '" type="number" min="' + min + '"' + (max != null ? ' max="' + max + '"' : '') + (step != null ? ' step="' + step + '"' : '') + (disabled ? ' disabled' : '') + ' value="' + escapeHtml(String(value)) + '"></div>';
}
function closeIconChip(id, label, current) {
  const on = current === id;
  return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-close-icon="' + escapeHtml(id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + escapeHtml(label) + '</button>';
}
function hoverHighlightChip(id, on, locked) {
  const pressed = on && !locked;
  return '<button type="button" id="' + id + '" class="chip' + (pressed ? ' is-on' : '') + (locked ? ' is-locked' : '') + '" aria-pressed="' + (pressed ? 'true' : 'false') + '" aria-disabled="' + (locked ? 'true' : 'false') + '"' + (locked ? ' title="不挡点击开着时，弹幕吃不到鼠标，没法加亮。" aria-describedby="ticker-hover-why"' : '') + '>悬停加亮</button>';
}

const SYNC_ELEMENT_IDS = Object.freeze([
  'global-visual-enabled', 'global-visual-default-mode',
  'prop-size', 'prop-anchor', 'prop-grow', 'prop-wrap', 'prop-margin-left', 'prop-margin-right', 'prop-margin-top', 'prop-margin-bottom', 'prop-gap', 'prop-layout', 'prop-width', 'prop-height',
  'prop-border-radius', 'prop-opacity', 'prop-border-width', 'prop-border-color', 'prop-paint-overflow',
  'part-paint-fill', 'part-paint-fill-box', 'part-paint-background', 'part-paint-opacity', 'part-paint-bg-asset',
  'part-paint-stroke', 'part-paint-stroke-width', 'part-paint-x', 'part-paint-y', 'part-paint-w', 'part-paint-h', 'part-paint-radius',
  'part-paint-font-size', 'part-paint-font-family', 'part-paint-text-stroke-color', 'part-paint-text-stroke-width', 'part-paint-close-icon-color',
  'prop-duration', 'prop-hold-duration',
  'prop-dismiss-mode',
  'skin-bg-color', 'skin-bg-asset', 'skin-bg-fit', 'skin-bg-padding', 'skin-bg-scale', 'skin-bg-x', 'skin-bg-y',
  'pipeline-behavior', 'pipeline-type',
  'ticker-speed', 'ticker-band', 'ticker-band-ratio', 'ticker-track-count', 'ticker-track-gap', 'ticker-min-gap', 'ticker-direction'
]);

function modeChips(behaviorId) {
  const chips = BEHAVIOR_AXIS_OPTIONS.map((option) => {
    if (option.implemented) {
      const selected = option.value === behaviorId;
      return '<button type="button" class="chip' + (selected ? ' is-on is-selected' : '') + '" data-axis="behavior" data-value="' + escapeHtml(option.value) + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' + escapeHtml(option.name) + '</button>';
    }
    return '<button type="button" class="chip is-locked" data-axis="behavior" data-value="' + escapeHtml(option.value) + '" aria-disabled="true" aria-pressed="false" tabindex="0" aria-describedby="popup-why">' + escapeHtml(option.name) + ' <span class="chip-badge">未实现</span></button>';
  }).join('');
  return '<div class="mode-block panel"><h2 class="panel-title">飞法</h2><div class="mode-row" role="group" aria-label="飞法">' + chips + '</div><p class="mode-why" id="mode-face-hint">换堆叠或弹幕，卡面不另起一套。</p><p class="mode-why" id="popup-why">突脸还在开发中，暂时不能选择。现在只能用堆叠或弹幕。</p></div>';
}

function stackSection(props, behaviorId) {
  const anchor = props.anchor ?? 'bottom-right';
  const holdMs = props.holdDurationMs ?? props.timeoutMs ?? 30000;
  const holdSeconds = Math.max(1, Math.round(Number(holdMs) / 1000) || 30);
  const legacyTimeout = props.dismissMode === 'timeout';
  const clickMode = props.dismissMode === 'anywhere' ? 'anywhere' : 'closeButton';
  const autoOn = props.autoDismiss === 'on' || props.autoDismiss === true || legacyTimeout;
  const dock = ANCHOR_ORDER.map((id) => '<button type="button" class="dock-cell' + (anchor === id ? ' is-on' : '') + '" data-anchor="' + id + '">' + ANCHOR_LABELS[id] + '</button>').join('');
  const anchorOptions = ANCHOR_ORDER.map((id) => '<option value="' + id + '"' + (anchor === id ? ' selected' : '') + '>' + ANCHOR_LABELS[id] + '</option>').join('');
  const dismissChip = (id, value, label, on) => '<button type="button" id="' + id + '" class="chip' + (on ? ' is-on' : '') + '" data-dismiss="' + value + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + label + '</button>';
  return '<div id="stack-section"' + (behaviorId === 'ticker' ? ' hidden' : '') + '>'
    + '<section class="group group-charter panel" id="stack-charter" aria-label="通道">'
    + '<h2 class="group-name">通道</h2>'
    + '<p class="group-hint">全池一份法律。停靠、往哪长、走线、边距，改了所有堆叠卡都听。</p>'
    + '<div class="stack-layout">'
    + '<div class="field"><span class="label">停靠</span><div class="dock" role="group" aria-label="停靠在屏幕哪个角">' + dock + '</div>'
    + '<select id="prop-anchor" class="mode-contract-select" aria-label="停靠" tabindex="-1" aria-hidden="true">' + anchorOptions + '</select></div>'
    + '<div class="field"><span class="label">往哪长</span>' + growPad(anchor, props.grow) + '<p class="field-note">对着墙的两边是灰的。</p></div>'
    + wrapPad(props.wrap, resolveStackGrow(anchor, props.grow))
    + '</div>'
    + '<div class="fields" style="margin-top:20px">'
    + fieldNumber('距左（≥0）', 'prop-margin-left', props.marginLeft ?? props.margin ?? 18, 0, null, 1, !dockMarginOn(anchor, 'left'))
    + fieldNumber('距右（≥0）', 'prop-margin-right', props.marginRight ?? props.margin ?? 18, 0, null, 1, !dockMarginOn(anchor, 'right'))
    + fieldNumber('距上（≥0）', 'prop-margin-top', props.marginTop ?? props.margin ?? 18, 0, null, 1, !dockMarginOn(anchor, 'top'))
    + fieldNumber('距下（≥0）', 'prop-margin-bottom', props.marginBottom ?? props.margin ?? 18, 0, null, 1, !dockMarginOn(anchor, 'bottom'))
    + fieldNumber('卡片间距', 'prop-gap', props.gap ?? 8, 0, null, 1)
    + '</div>'
    + '<p class="field-note">只改停靠那两面。另外两面灰色，不挤空间。</p>'
    + '<select id="prop-layout" class="mode-contract-select" aria-label="排列方式" tabindex="-1" aria-hidden="true">' + optionList(LAYOUT_OPTIONS, props.layout ?? 'simple') + '</select>'
    + '<input id="prop-duration" type="hidden" value="' + escapeHtml(String(props.durationMs ?? 30000)) + '">'
    + '<input id="prop-hold-duration" type="hidden" value="' + escapeHtml(String(holdMs)) + '">'
    + '</section>'
    + '<section class="group group-card panel" id="stack-card" aria-label="这张卡">'
    + '<h2 class="group-name">这张卡</h2>'
    + '<p class="group-hint">只改这张卡的关闭、停留、加亮。别的卡不受影响。</p>'
    + '<div class="stack-life">'
    + '<div class="field"><span class="label">关闭方式</span><div class="chip-row" role="group" aria-label="关闭方式">'
    + dismissChip('prop-dismiss-close', 'closeButton', '关闭按钮', clickMode === 'closeButton')
    + dismissChip('prop-dismiss-anywhere', 'anywhere', '任意点击', clickMode === 'anywhere')
    + '<button type="button" id="prop-dismiss-auto" class="chip' + (autoOn ? ' is-on' : '') + '" data-auto-dismiss="on" aria-pressed="' + (autoOn ? 'true' : 'false') + '">超时自动收</button>'
    + '</div><select id="prop-dismiss-mode" class="mode-contract-select" aria-label="关闭方式" tabindex="-1" aria-hidden="true">' + optionList(CARD_DISMISS_CLICK_MODES, clickMode) + '</select></div>'
    + '<div class="stack-life-row">'
    + '<div class="field"><label for="hold-seconds">停留（秒）</label><input id="hold-seconds" type="number" min="1" max="120" step="1" value="' + holdSeconds + '"></div>'
    + '<div class="field"><span class="label">悬停加亮</span>' + hoverHighlightChip('prop-hover-highlight', props.hoverHighlight === 'on', false) + '</div>'
    + '</div>'
    + '<p class="field-note">停留 1–120 秒。悬停加亮默认关，打开后鼠标放上去卡片会亮一点。</p>'
    + '</div></section></div>';
}

function tickerSection(ticker, behaviorId, hoverHighlight) {
  const config = ticker ?? {};
  const storedBandPercent = Math.round((config.bandRatio ?? TICKER_DEFAULTS.bandRatio) * 100);
  const band = config.band ?? TICKER_DEFAULTS.band;
  const speed = config.speedPxPerSec ?? TICKER_DEFAULTS.speedPxPerSec;
  const gap = config.minGapPx ?? TICKER_DEFAULTS.minGapPx;
  const trackGap = config.trackGapPx ?? TICKER_DEFAULTS.trackGapPx;
  const tracks = config.trackCount ?? TICKER_DEFAULTS.trackCount;
  const direction = config.direction === 'right' ? 'right' : 'left';
  const flyRight = direction === 'right';
  const bandFillPercent = (!Number.isInteger(tracks) || tracks < 1)
    ? Math.max(15, Math.min(100, storedBandPercent))
    : Math.max(15, Math.min(100, Math.round(tracks * 84 / 1080 * 100)));
  const trackNote = tracks === 0
    ? '旧自动档，改数字即按条数主控'
    : '填几就是几行。带子高度跟着变，贴顶或贴底。';
  return '<div class="ticker-section" id="ticker-section"' + (behaviorId === 'ticker' ? '' : ' hidden') + '>'
    + '<section class="group group-charter panel" id="ticker-charter" aria-label="通道">'
    + '<h2 class="group-name">通道</h2>'
    + '<p class="group-hint">全池一份法律。带子、轨道、净空、点穿，改了所有弹幕卡都听。</p>'
    + '<div class="ticker-flow-stage">'
    + '<div class="field"><span class="label">带子</span>'
    + '<div class="band" id="ticker-band-control" data-side="' + escapeHtml(band) + '"><div class="band-fill" id="ticker-band-fill" style="height:' + bandFillPercent + '%"></div>'
    + '<button type="button" class="band-hit top" data-band="top">顶部</button>'
    + '<button type="button" class="band-hit bottom" data-band="bottom">底部</button></div>'
    + '<select id="ticker-band" class="mode-contract-select" aria-label="带子" tabindex="-1" aria-hidden="true">'
    + '<option value="top"' + (band === 'top' ? ' selected' : '') + '>顶部</option>'
    + '<option value="bottom"' + (band === 'bottom' ? ' selected' : '') + '>底部</option></select>'
    + '<input id="ticker-band-ratio" type="hidden" value="' + bandFillPercent + '">'
    + '</div></div>'
    + '<div class="ticker-flow-lanes">'
    + '<div class="field"><label for="ticker-track-count">轨道数（≥0）</label>'
    + '<input id="ticker-track-count" type="number" min="0" step="1" value="' + escapeHtml(String(tracks)) + '">'
    + '<p class="field-note">' + trackNote + '</p></div>'
    + '<div class="ticker-flow-gaps">'
    + '<div class="field"><label for="ticker-min-gap">同轨净空</label>'
    + '<div class="slider-row"><input id="ticker-min-gap" type="range" min="' + TICKER_MIN_GAP_BOUNDS.min + '" max="' + TICKER_MIN_GAP_BOUNDS.max + '" value="' + gap + '">'
    + '<div class="slider-val" id="ticker-min-gap-val">' + gap + '</div></div></div>'
    + '<div class="field"><label for="ticker-track-gap">异轨间距</label>'
    + '<div class="slider-row"><input id="ticker-track-gap" type="range" min="' + TICKER_TRACK_GAP_BOUNDS.min + '" max="' + TICKER_TRACK_GAP_BOUNDS.max + '" value="' + trackGap + '">'
    + '<div class="slider-val" id="ticker-track-gap-val">' + trackGap + '</div></div></div>'
    + '</div></div>'
    + '<div class="ticker-flow-pointer">'
    + '<div class="field"><span class="label">点穿</span>'
    + '<div class="chip-row">'
    + '<button type="button" id="ticker-click-through" class="chip' + (config.clickThrough !== false ? ' is-on' : '') + '" aria-pressed="' + (config.clickThrough !== false ? 'true' : 'false') + '">不挡点击</button>'
    + '</div>'
    + '<p class="field-note">开着不挡点击：弹幕从鼠标上穿过，点不到、也拖不走。</p></div>'
    + '</div></section>'
    + '<section class="group group-card panel" id="ticker-card" aria-label="这张卡">'
    + '<h2 class="group-name">这张卡</h2>'
    + '<p class="group-hint">只改这张卡的方向和速度。点穿开着时加亮点不到。</p>'
    + '<div class="field"><span class="label">方向</span>'
    + '<div class="chip-row" role="group" aria-label="方向">'
    + '<button type="button" class="chip' + (!flyRight ? ' is-on' : '') + '" data-ticker-direction="left" aria-pressed="' + (!flyRight ? 'true' : 'false') + '">右 → 左</button>'
    + '<button type="button" class="chip' + (flyRight ? ' is-on' : '') + '" data-ticker-direction="right" aria-pressed="' + (flyRight ? 'true' : 'false') + '">左 → 右</button>'
    + '</div>'
    + '<small id="ticker-direction-copy">' + (flyRight ? '从左往右，看过即走' : '从右往左，看过即走') + '</small>'
    + '<select id="ticker-direction" class="mode-contract-select" aria-label="方向" tabindex="-1" aria-hidden="true">'
    + '<option value="left"' + (!flyRight ? ' selected' : '') + '>右 → 左</option>'
    + '<option value="right"' + (flyRight ? ' selected' : '') + '>左 → 右</option></select></div>'
    + '<div class="ticker-flow-pace">'
    + '<div class="field"><label for="ticker-speed">速度</label>'
    + '<div class="slider-row"><input id="ticker-speed" type="range" min="' + TICKER_SPEED_BOUNDS.min + '" max="' + TICKER_SPEED_BOUNDS.max + '" step="10" value="' + speed + '"' + (config.speedRandom ? ' disabled' : '') + '>'
    + '<div class="slider-val' + (config.speedRandom ? ' is-muted' : '') + '" id="ticker-speed-val">' + speed + '</div></div>'
    + '<div class="ticker-flow-random">'
    + '<button type="button" id="ticker-speed-random" class="chip' + (config.speedRandom ? ' is-on' : '') + '" aria-pressed="' + (config.speedRandom ? 'true' : 'false') + '">随机</button>'
    + '<p class="field-note">点随机：每条弹幕自己抽一个速度。滑杆是固定速度。</p>'
    + '</div></div></div>'
    + '<div class="field"><span class="label">悬停加亮</span>'
    + hoverHighlightChip('ticker-hover-highlight', hoverHighlight === 'on', config.clickThrough !== false)
    + '<p class="field-note" id="ticker-hover-why"' + (config.clickThrough !== false ? '' : ' hidden') + '>不挡点击开着时，弹幕吃不到鼠标，没法加亮。</p></div>'
    + '</section></div>';
}

const PART_PAINT_DEFAULTS = Object.freeze({
  title: Object.freeze({ fill: '#f2fff9', stroke: '#62d0a8' }),
  body: Object.freeze({ fill: '#c5d8d0', stroke: '#62d0a8' }),
  close: Object.freeze({ fill: '#1d2b27', stroke: '#62d0a8' }),
  icon: Object.freeze({ fill: '#1d2b27', stroke: '#62d0a8' }),
  assistantName: Object.freeze({ fill: '#62d0a8', stroke: '#62d0a8' })
});
const PART_PAINT_HEX = /^#[0-9a-fA-F]{6}$/;

function partPaintSaved(paint) {
  if (!paint || typeof paint !== 'object') return false;
  if (typeof paint.fill === 'string' && paint.fill) return true;
  if (typeof paint.stroke === 'string' && paint.stroke) return true;
  if (Number.isInteger(paint.strokeWidth) && paint.strokeWidth > 0) return true;
  if (Number.isInteger(paint.x) || Number.isInteger(paint.y)) return true;
  if (Number.isInteger(paint.w) && paint.w > 0) return true;
  if (Number.isInteger(paint.h) && paint.h > 0) return true;
  if (Number.isInteger(paint.fontSize) && paint.fontSize >= 8) return true;
  if (typeof paint.fontFamily === 'string' && paint.fontFamily) return true;
  if (typeof paint.fontAssetId === 'string' && paint.fontAssetId) return true;
  if (paint.textPaint === 'rainbow') return true;
  if (paint.fontBold === true || paint.fontBold === false) return true;
  if (paint.fontItalic === true || paint.fontUnderline === true || paint.fontStrike === true) return true;
  if (paint.show === true || Number.isInteger(paint.radius)) return true;
  if (typeof paint.source === 'string' && paint.source) return true;
  if (typeof paint.assetId === 'string' && paint.assetId) return true;
  if (typeof paint.background === 'string' && paint.background) return true;
  if (typeof paint.opacity === 'number' && paint.opacity !== 1) return true;
  if (typeof paint.backgroundAssetId === 'string' && paint.backgroundAssetId) return true;
  return false;
}

function initialSelectedPart(parts = {}) {
  for (const id of ['title', 'body', 'close', 'icon', 'assistantName']) {
    if (partPaintSaved(parts[id])) return id;
  }
  return 'root';
}

function resolveSsrPaintColor(value, glossary, fallback) {
  if (typeof value === 'string' && PART_PAINT_HEX.test(value)) return value;
  if (typeof value === 'string' && glossary && typeof glossary[value] === 'string' && PART_PAINT_HEX.test(glossary[value])) return glossary[value];
  return fallback;
}

function partChip(id, label, selectedId = 'root', off = false) {
  const selected = id === selectedId;
  return '<button type="button" class="chip' + (selected ? ' is-on is-selected' : '') + (off ? ' is-off' : '') + '" data-part="' + id + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' + label + '</button>';
}

function partHidden(id, paint = {}) {
  const geom = (key, ok) => '<input id="part-' + id + '-' + key + '" type="hidden" value="' + escapeHtml(ok ? String(paint[key]) : '') + '">';
  const showable = id === 'title' || id === 'body' || id === 'icon' || id === 'assistantName';
  const showValue = (id === 'icon' || id === 'assistantName')
    ? (paint.show === true ? 'true' : 'false')
    : (paint.show === false ? 'false' : '');
  const show = showable
    ? '<input id="part-' + id + '-show" type="hidden" value="' + escapeHtml(showValue) + '">'
    : '';
  const textIds = id === 'title' || id === 'body' || id === 'assistantName';
  const iconScale = typeof paint.backgroundScale === 'number' ? paint.backgroundScale : 1;
  const iconX = typeof paint.backgroundX === 'number' ? paint.backgroundX : 0.5;
  const iconY = typeof paint.backgroundY === 'number' ? paint.backgroundY : 0.5;
  const iconExtra = id === 'icon'
    ? '<input id="part-icon-source" type="hidden" value="' + escapeHtml(paint.source === 'custom' ? 'custom' : 'assistant') + '">'
      + '<input id="part-icon-asset-id" type="hidden" value="' + escapeHtml(paint.assetId ?? '') + '">'
      + '<input id="part-icon-scale" type="hidden" value="' + escapeHtml(String(iconScale)) + '">'
      + '<input id="part-icon-x" type="hidden" value="' + escapeHtml(String(iconX)) + '">'
      + '<input id="part-icon-y" type="hidden" value="' + escapeHtml(String(iconY)) + '">'
    : '';
  const bgAsset = id === 'icon'
    ? ''
    : '<input id="part-' + id + '-bg-asset" type="hidden" value="' + escapeHtml(paint.backgroundAssetId ?? '') + '">'
      + '<input id="part-' + id + '-bg-scale" type="hidden" value="' + escapeHtml(String(typeof paint.backgroundScale === 'number' ? paint.backgroundScale : 1)) + '">'
      + '<input id="part-' + id + '-bg-x" type="hidden" value="' + escapeHtml(String(typeof paint.backgroundX === 'number' ? paint.backgroundX : 0.5)) + '">'
      + '<input id="part-' + id + '-bg-y" type="hidden" value="' + escapeHtml(String(typeof paint.backgroundY === 'number' ? paint.backgroundY : 0.5)) + '">';
  return '<input id="part-' + id + '-fill" type="hidden" value="' + escapeHtml(paint.fill ?? '') + '">'
    + '<input id="part-' + id + '-background" type="hidden" value="' + escapeHtml(paint.background ?? '') + '">'
    + '<input id="part-' + id + '-opacity" type="hidden" value="' + escapeHtml(typeof paint.opacity === 'number' ? String(paint.opacity) : '') + '">'
    + '<input id="part-' + id + '-stroke" type="hidden" value="' + escapeHtml(paint.stroke ?? '') + '">'
    + '<input id="part-' + id + '-stroke-width" type="hidden" value="' + escapeHtml(String(Number.isInteger(paint.strokeWidth) ? paint.strokeWidth : 0)) + '">'
    + geom('x', Number.isInteger(paint.x))
    + geom('y', Number.isInteger(paint.y))
    + geom('w', Number.isInteger(paint.w) && paint.w > 0)
    + geom('h', Number.isInteger(paint.h) && paint.h > 0)
    + '<input id="part-' + id + '-radius" type="hidden" value="' + escapeHtml(Number.isInteger(paint.radius) ? String(paint.radius) : '') + '">'
    + show
    + iconExtra
    + ((id === 'title' || id === 'assistantName')
      ? '<input id="part-' + id + '-fit-width" type="hidden" value="' + escapeHtml(paint.fitWidth === true ? 'true' : '') + '">'
        + '<input id="part-' + id + '-fit-compensate" type="hidden" value="' + escapeHtml(paint.fitCompensate === true ? 'true' : '') + '">'
      : '')
    + (textIds
      ? '<input id="part-' + id + '-font-size" type="hidden" value="' + escapeHtml(Number.isInteger(paint.fontSize) ? String(paint.fontSize) : '') + '">'
        + '<input id="part-' + id + '-font-family" type="hidden" value="' + escapeHtml(paint.fontAssetId ? ('font:' + paint.fontAssetId) : (paint.fontFamily ?? '')) + '">'
        + '<input id="part-' + id + '-text-paint" type="hidden" value="' + escapeHtml(paint.textPaint === 'rainbow' ? 'rainbow' : '') + '">'
        + '<input id="part-' + id + '-font-bold" type="hidden" value="' + escapeHtml(paint.fontBold === true ? 'true' : (paint.fontBold === false ? 'false' : '')) + '">'
        + '<input id="part-' + id + '-font-italic" type="hidden" value="' + escapeHtml(paint.fontItalic === true ? 'true' : '') + '">'
        + '<input id="part-' + id + '-font-underline" type="hidden" value="' + escapeHtml(paint.fontUnderline === true ? 'true' : '') + '">'
        + '<input id="part-' + id + '-font-strike" type="hidden" value="' + escapeHtml(paint.fontStrike === true ? 'true' : '') + '">'
        + '<input id="part-' + id + '-text-stroke" type="hidden" value="' + escapeHtml(paint.textStroke === true ? 'true' : '') + '">'
        + '<input id="part-' + id + '-text-stroke-color" type="hidden" value="' + escapeHtml(typeof paint.textStrokeColor === 'string' ? paint.textStrokeColor : '') + '">'
        + '<input id="part-' + id + '-text-stroke-width" type="hidden" value="' + escapeHtml(Number.isInteger(paint.textStrokeWidth) ? String(paint.textStrokeWidth) : '') + '">'
        + '<input id="part-' + id + '-text-stroke-paint" type="hidden" value="' + escapeHtml(paint.textStrokePaint === 'rainbow' ? 'rainbow' : '') + '">'
      : '')
    + '<input id="part-' + id + '-stroke-paint" type="hidden" value="' + escapeHtml(paint.strokePaint === 'gradient' ? 'gradient' : '') + '">'
    + (id === 'close'
      ? '<input id="part-close-icon" type="hidden" value="' + escapeHtml(paint.closeIcon || '') + '">'
        + '<input id="part-close-icon-color" type="hidden" value="' + escapeHtml(typeof paint.closeIconColor === 'string' ? paint.closeIconColor : '') + '">'
      : '')
    + bgAsset;
}

function appearanceSection(props, appearance, skin, assetOptions, parts = {}, glossary = {}, fonts = [], studioAgents = []) {
  const size = props.size ?? appearance.size ?? 'medium';
  const radius = props.borderRadius ?? appearance.borderRadius ?? 16;
  const opacity = props.opacity ?? appearance.opacity ?? 0.96;
  const width = appearance.width ?? 420;
  const height = appearance.height ?? 220;
  const color = skin.background?.color ?? skin.backgroundColor ?? appearance.backgroundColor ?? '#0e1916';
  const borderWidth = props.borderWidth ?? appearance.borderWidth ?? skin.decoration?.borderWidth ?? 0;
  const borderColor = props.borderColor ?? appearance.borderColor ?? skin.decoration?.borderColor ?? '#62d0a8';
  const paintOverflow = appearance.paintOverflow ?? 0;
  const fit = appearance.backgroundFit ?? skin.background?.fit ?? 'fill';
  const padding = skin.background?.padding ?? skin.backgroundPadding ?? appearance.backgroundPadding ?? 0;
  const bgScale = typeof appearance.backgroundScale === 'number' ? appearance.backgroundScale : 1;
  const bgX = typeof appearance.backgroundX === 'number' ? appearance.backgroundX : 0.5;
  const bgY = typeof appearance.backgroundY === 'number' ? appearance.backgroundY : 0.5;
  const selectedPart = initialSelectedPart(parts);
  const selectedPaint = selectedPart === 'root' ? {} : (parts[selectedPart] || {});
  const selectedDefaults = PART_PAINT_DEFAULTS[selectedPart] || PART_PAINT_DEFAULTS.title;
  const visibleFill = resolveSsrPaintColor(selectedPaint.fill, glossary, selectedDefaults.fill);
  const visibleStroke = resolveSsrPaintColor(selectedPaint.stroke, glossary, selectedDefaults.stroke);
  const visibleStrokeWidth = Number.isInteger(selectedPaint.strokeWidth) ? selectedPaint.strokeWidth : 0;
  const visibleX = Number.isInteger(selectedPaint.x) ? selectedPaint.x : 0;
  const visibleY = Number.isInteger(selectedPaint.y) ? selectedPaint.y : 0;
  const visibleW = Number.isInteger(selectedPaint.w) && selectedPaint.w > 0 ? selectedPaint.w : 1;
  const visibleH = Number.isInteger(selectedPaint.h) && selectedPaint.h > 0 ? selectedPaint.h : 1;
  const partCopy = selectedPart === 'body' ? '正在编正文'
    : selectedPart === 'close' ? '正在编关闭'
    : selectedPart === 'icon' ? '正在编图标'
    : selectedPart === 'assistantName' ? '正在编助手名'
    : '正在编标题';
  const titleOff = parts.title?.show === false;
  const bodyOff = parts.body?.show === false;
  const iconOff = parts.icon?.show !== true;
  const nameOff = parts.assistantName?.show !== true;
  const textPartSelected = selectedPart === 'title' || selectedPart === 'body' || selectedPart === 'assistantName';
  const showableSelected = selectedPart === 'title' || selectedPart === 'body' || selectedPart === 'icon' || selectedPart === 'assistantName';
  const selectedShow = selectedPart === 'icon'
    ? !iconOff
    : (selectedPart === 'assistantName'
      ? !nameOff
      : (selectedPart === 'body' ? !bodyOff : !titleOff));
  const lastTextOn = (selectedPart === 'title' && bodyOff) || (selectedPart === 'body' && titleOff);
  const fontFamilies = { yahei: '微软雅黑', heiti: '黑体', songti: '宋体', segoe: '西文 Segoe' };
  const visibleFontSize = Number.isInteger(selectedPaint.fontSize) ? selectedPaint.fontSize : (selectedPart === 'assistantName' ? 12 : (selectedPart === 'body' ? 13 : 20));
  const closeDefaultRadius = Math.trunc(Math.min(
    Number.isInteger(selectedPaint.w) && selectedPaint.w > 0 ? selectedPaint.w : 28,
    Number.isInteger(selectedPaint.h) && selectedPaint.h > 0 ? selectedPaint.h : 28
  ) / 2);
  const visibleRadius = Number.isInteger(selectedPaint.radius)
    ? selectedPaint.radius
    : (selectedPart === 'close' ? closeDefaultRadius : 0);
  const iconSource = parts.icon?.source === 'custom' ? 'custom' : 'assistant';
  const iconAssetId = parts.icon?.assetId ?? '';
  const sampleAgentOptions = ['hanako', 'butter', 'rational'].map((id) => {
    const agent = (studioAgents ?? []).find((item) => item.id === id);
    if (!agent) return '';
    return '<option value="' + escapeHtml(agent.id) + '">' + escapeHtml(agent.name || agent.id) + '</option>';
  }).join('');
  const visibleBackground = resolveSsrPaintColor(selectedPaint.background, glossary, '#1d2b27');
  const visiblePartOpacity = typeof selectedPaint.opacity === 'number' ? selectedPaint.opacity : 1;
  const backgroundOn = typeof selectedPaint.background === 'string' && selectedPaint.background.length > 0;
  const visiblePartBgAsset = selectedPaint.backgroundAssetId ?? '';
  const visibleFontFamily = selectedPaint.fontAssetId
    ? ('font:' + selectedPaint.fontAssetId)
    : (fontFamilies[selectedPaint.fontFamily] ? selectedPaint.fontFamily : 'yahei');
  const rainbowOn = textPartSelected && selectedPaint.textPaint === 'rainbow';
  const boldOn = textPartSelected && (selectedPart === 'title' ? selectedPaint.fontBold !== false : selectedPaint.fontBold === true);
  const italicOn = textPartSelected && selectedPaint.fontItalic === true;
  const underlineOn = textPartSelected && selectedPaint.fontUnderline === true;
  const strikeOn = textPartSelected && selectedPaint.fontStrike === true;
  const textStrokeOn = textPartSelected && selectedPaint.textStroke === true;
  const visibleTextStrokeColor = typeof selectedPaint.textStrokeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(selectedPaint.textStrokeColor)
    ? selectedPaint.textStrokeColor
    : '#0a0d0d';
  const textStrokeRainbowOn = textStrokeOn && selectedPaint.textStrokePaint === 'rainbow';
  const visibleTextStrokeWidth = Number.isInteger(selectedPaint.textStrokeWidth) ? selectedPaint.textStrokeWidth : 2;
  const borderPaintOn = appearance.borderPaint === 'gradient';
  const strokePaintOn = selectedPaint.strokePaint === 'gradient';
  const closeIcon = selectedPaint.closeIcon && selectedPaint.closeIcon.length > 0 ? selectedPaint.closeIcon : 'x';
  const visibleCloseIconColor = typeof selectedPaint.closeIconColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(selectedPaint.closeIconColor)
    ? selectedPaint.closeIconColor
    : '#d1e0e0';
  return '<details class="fold panel is-quiet" id="appearance-section" open aria-label="卡面">'
    + '<summary>卡面 <small>根或一件零件</small></summary><div class="fold-body"><p class="group-hint">没选中孩子就是在编根。点标题、正文、关闭、图标或助手名，只出那一件的位置、文字、背景和描边。</p>'
    + '<div class="field"><span class="label">零件</span><div class="chip-row" id="part-chip-row">'
    + partChip('root', '根', selectedPart)
    + partChip('title', '标题', selectedPart, titleOff)
    + partChip('body', '正文', selectedPart, bodyOff)
    + partChip('close', '关闭', selectedPart)
    + partChip('icon', '图标', selectedPart, iconOff)
    + partChip('assistantName', '助手名', selectedPart, nameOff)
    + '</div></div>'
    + '<div id="root-fields" class="fields"' + (selectedPart === 'root' ? '' : ' hidden') + '>'
    + '<div class="field"><label for="prop-size">尺寸</label><select id="prop-size">' + optionList(CARD_SIZES, size) + '</select></div>'
    + fieldNumber('圆角（0–480）', 'prop-border-radius', radius, 0, 480)
    + fieldNumber('宽（1–1920）', 'prop-width', width, 1, 1920)
    + fieldNumber('高（1–1080）', 'prop-height', height, 1, 1080)
    + '<div class="field"><label for="prop-opacity">背景透明度（0–1）</label><input id="prop-opacity" type="number" min="0" max="1" step="0.01" value="' + opacity + '"></div>'
    + '<div class="field"><label for="skin-bg-color">背景色</label><input id="skin-bg-color" type="color" value="' + escapeHtml(color) + '"></div>'
    + fieldNumber('描边宽度（0–32）', 'prop-border-width', borderWidth, 0, 32)
    + '<div class="field"><label for="prop-border-color">描边颜色</label><input id="prop-border-color" type="color" value="' + escapeHtml(borderColor) + '"></div>'
    + '<div class="field span-2"><span class="label">描边</span><div class="chip-row"><button type="button" class="chip' + (borderPaintOn ? ' is-on' : '') + '" id="prop-border-paint" aria-pressed="' + (borderPaintOn ? 'true' : 'false') + '">彩色描边</button></div></div>'
    + fieldNumber('绘制溢出（0–240）', 'prop-paint-overflow', paintOverflow, 0, 240)
    + '<div class="field span-2" id="bg-asset-field"><span class="label">底图</span><select id="skin-bg-asset" aria-label="底图"><option value="">没有图 · 纯色</option>' + assetOptions + '</select><div class="chip-row"><button type="button" id="bg-adjust-open" class="chip">调整底图</button></div><p class="field-note">没选图就是纯色。选了图再调整大小和位置。素材从顶栏素材库进。</p></div>'
    + '<div class="field span-2" id="glossary-block"><span class="label">词表</span><p class="field-note" id="glossary-empty">没有词表。零件自己调色。</p><div id="glossary-rows"></div><button type="button" id="glossary-add" class="chip">加一个名字</button></div>'
    + '</div>'
    + '<div id="part-fields"' + (selectedPart === 'root' ? ' hidden' : '') + '>'
    + '<p class="field-note" id="part-fields-copy">' + partCopy + '</p>'
    + '<div class="chip-row" id="part-show-row"' + (showableSelected ? '' : ' hidden') + '>'
    + '<button type="button" class="chip' + (selectedShow ? ' is-on' : '') + (lastTextOn ? ' is-locked' : '') + '" id="part-show" aria-pressed="' + (selectedShow ? 'true' : 'false') + '"' + (lastTextOn ? ' aria-disabled="true"' : '') + '>显示</button>'
    + '</div>'
    + '<div id="part-icon-fields"' + (selectedPart === 'icon' ? '' : ' hidden') + ' class="fields" style="grid-column:1/-1">'
    + '<div class="field span-2"><span class="label">图源</span><div class="chip-row">'
    + '<button type="button" class="chip' + (iconSource === 'assistant' ? ' is-on' : '') + '" id="part-icon-source-assistant" aria-pressed="' + (iconSource === 'assistant' ? 'true' : 'false') + '">助手头像</button>'
    + '<button type="button" class="chip' + (iconSource === 'custom' ? ' is-on' : '') + '" id="part-icon-source-custom" aria-pressed="' + (iconSource === 'custom' ? 'true' : 'false') + '">自定义</button>'
    + '</div><p class="field-note" id="part-icon-assistant-note">真通知跟人走。预览用样例助手。</p></div>'
    + '<div class="field span-2" id="part-icon-custom-field"' + (iconSource === 'custom' ? '' : ' hidden') + '><span class="label">自定义图</span><select id="part-icon-asset" aria-label="自定义图"><option value="">没有图 · 纯色</option>' + assetOptions + '</select><div class="chip-row"><button type="button" id="icon-asset-import" class="chip">导入</button><button type="button" id="icon-asset-library" class="chip">素材库</button></div></div>'
    + '<div class="field span-2"><div class="chip-row"><button type="button" id="icon-adjust-open" class="chip">调整底图</button></div><p class="field-note">图标也能调大小和位置，跟根的底图同一套。</p></div>'
    + '</div>'
    + '<div class="field span-2" id="studio-sample-field"' + ((selectedPart === 'assistantName' || (selectedPart === 'icon' && iconSource === 'assistant')) ? '' : ' hidden') + '><label for="studio-sample-agent">样例助手</label><select id="studio-sample-agent"><option value="">没有样例</option>' + sampleAgentOptions + '</select><p class="field-note">样例只用来预览 Hanako、butter、ming 三张默认脸。真通知跟人走，任何助手都能出图标，不写进配置包。</p></div>'
    + '<div class="paint-group" id="part-geom-group"><p class="paint-kicker">位置</p><div class="fields">'
    + fieldNumber('左（0–1920）', 'part-paint-x', visibleX, 0, 1920)
    + fieldNumber('上（0–1080）', 'part-paint-y', visibleY, 0, 1080)
    + fieldNumber('区域宽（1–1920）', 'part-paint-w', visibleW, 1, 1920, undefined, (selectedPart === 'title' || selectedPart === 'assistantName') && selectedPaint.fitWidth === true)
    + '<div class="field" id="part-fit-width-field"' + ((selectedPart === 'title' || selectedPart === 'assistantName') ? '' : ' hidden') + '><span class="label">宽度</span><div class="chip-row"><button type="button" class="chip' + (selectedPaint.fitWidth === true ? ' is-on' : '') + '" id="part-paint-fit-width" aria-pressed="' + (selectedPaint.fitWidth === true ? 'true' : 'false') + '">自适应</button><button type="button" class="chip' + (selectedPaint.fitCompensate === true ? ' is-on' : '') + (selectedPaint.fitWidth === true ? '' : ' is-locked') + '" id="part-paint-fit-compensate" aria-pressed="' + (selectedPaint.fitCompensate === true ? 'true' : 'false') + '"' + (selectedPaint.fitWidth === true ? '' : ' aria-disabled="true"') + '>补偿</button></div><p class="field-note">自适应：单行包住文字。补偿：底板往左让垫，字不右移；关掉则左缘钉住，适合助手名对齐。左的数字仍是锚点，不改盘。</p></div>'
    + fieldNumber('区域高（1–1080）', 'part-paint-h', visibleH, 1, 1080)
    + fieldNumber('区域圆角（0–240）', 'part-paint-radius', visibleRadius, 0, 240)
    + '</div></div>'
    + '<div class="paint-group" id="part-text-group"' + (textPartSelected ? '' : ' hidden') + '><p class="paint-kicker">文字</p><p class="field-note">字保持实色，不跟背景一起变淡。</p><div id="part-text-fields" class="fields">'
    + '<div class="field"><label for="part-paint-fill">文字</label><input id="part-paint-fill" type="color"' + (rainbowOn ? ' disabled' : '') + ' value="' + escapeHtml(visibleFill) + '"><div class="chip-row" id="part-fill-names" hidden></div></div>'
    + fieldNumber('字号（8–72）', 'part-paint-font-size', visibleFontSize, 8, 72)
    + '<div class="field span-2" id="font-asset-field"><label for="part-paint-font-family">字体</label><select id="part-paint-font-family">' + optionList({ ...fontFamilies, ...Object.fromEntries((fonts ?? []).map((asset) => ['font:' + asset.assetId, asset.name])) }, visibleFontFamily) + '</select><div class="chip-row"><button type="button" id="font-asset-import" class="chip">导入</button><button type="button" id="font-asset-library" class="chip">字体库</button></div></div>'
    + '<div class="field span-2"><span class="label">文字颜色</span><div class="chip-row"><button type="button" class="chip' + (rainbowOn ? ' is-on' : '') + '" id="part-paint-rainbow" aria-pressed="' + (rainbowOn ? 'true' : 'false') + '">彩色字</button></div></div>'
    + '<div class="field span-2"><span class="label">字样式</span><div class="chip-row">'
    + '<button type="button" class="chip' + (boldOn ? ' is-on' : '') + '" id="part-paint-font-bold" aria-pressed="' + (boldOn ? 'true' : 'false') + '">加粗</button>'
    + '<button type="button" class="chip' + (italicOn ? ' is-on' : '') + '" id="part-paint-font-italic" aria-pressed="' + (italicOn ? 'true' : 'false') + '">斜体</button>'
    + '<button type="button" class="chip' + (underlineOn ? ' is-on' : '') + '" id="part-paint-font-underline" aria-pressed="' + (underlineOn ? 'true' : 'false') + '">下划线</button>'
    + '<button type="button" class="chip' + (strikeOn ? ' is-on' : '') + '" id="part-paint-font-strike" aria-pressed="' + (strikeOn ? 'true' : 'false') + '">删除线</button>'
    + '</div></div>'
    + '<div class="field span-2"><span class="label">字描边</span><div class="chip-row">'
    + '<button type="button" class="chip' + (textStrokeOn ? ' is-on' : '') + '" id="part-paint-text-stroke" aria-pressed="' + (textStrokeOn ? 'true' : 'false') + '">字描边</button>'
    + '<button type="button" class="chip' + (textStrokeRainbowOn ? ' is-on' : '') + '" id="part-paint-text-stroke-rainbow" aria-pressed="' + (textStrokeRainbowOn ? 'true' : 'false') + '"' + (textStrokeOn ? '' : ' hidden') + '>彩色描边</button>'
    + '</div></div>'
    + '<div class="field" id="part-text-stroke-color-field"' + (textStrokeOn && !textStrokeRainbowOn ? '' : ' hidden') + '><label for="part-paint-text-stroke-color">字描边颜色</label><input id="part-paint-text-stroke-color" type="color" value="' + escapeHtml(visibleTextStrokeColor) + '"></div>'
    + '<div class="field" id="part-text-stroke-width-field"' + (textStrokeOn ? '' : ' hidden') + '><label for="part-paint-text-stroke-width">字描边厚度（1–16）</label><input id="part-paint-text-stroke-width" type="number" min="1" max="16" step="1" value="' + visibleTextStrokeWidth + '"></div>'
    + '</div></div>'
    + '<div class="paint-group" id="part-bg-group"><p class="paint-kicker">背景</p><p class="field-note" id="part-bg-note">' + (textPartSelected ? '垫在字下面，让字能看清。没有就不画。' : '这块零件的底。关闭和图标默认用自己的底色。') + '</p><div class="fields">'
    + '<div class="field span-2" id="part-background-on-row"' + (textPartSelected ? '' : ' hidden') + '><div class="chip-row"><button type="button" class="chip' + (backgroundOn ? ' is-on' : '') + '" id="part-paint-background-on" aria-pressed="' + (backgroundOn ? 'true' : 'false') + '">垫底</button></div></div>'
    + '<div class="field" id="part-background-color-field"' + (textPartSelected && !backgroundOn ? ' hidden' : '') + '><label for="part-paint-background">背景</label><input id="part-paint-background" type="color" value="' + escapeHtml(visibleBackground) + '"><div class="chip-row" id="part-background-names" hidden></div></div>'
    + '<div class="field" id="part-fill-as-bg-field"' + (textPartSelected ? ' hidden' : '') + '><label for="part-paint-fill-box">背景</label><input id="part-paint-fill-box" type="color" value="' + escapeHtml(visibleFill) + '"></div>'
    + fieldNumber('背景透明度（0–1）', 'part-paint-opacity', visiblePartOpacity, 0, 1, 0.01)
    + '<div class="field span-2" id="part-bg-asset-field"' + (selectedPart === 'icon' ? ' hidden' : '') + '><span class="label">底图</span><select id="part-paint-bg-asset" aria-label="零件底图"><option value="">没有图 · 纯色</option>' + assetOptions + '</select><div class="chip-row"><button type="button" id="part-bg-adjust-open" class="chip">调整底图</button></div></div>'
    + '</div></div>'
    + '<div class="paint-group" id="part-stroke-group"><p class="paint-kicker">描边</p><div class="fields">'
    + fieldNumber('描边宽度（0–32）', 'part-paint-stroke-width', visibleStrokeWidth, 0, 32)
    + '<div class="field"><label for="part-paint-stroke">描边颜色</label><input id="part-paint-stroke" type="color" value="' + escapeHtml(visibleStroke) + '"><div class="chip-row" id="part-stroke-names" hidden></div></div>'
    + '<div class="field span-2"><span class="label">描边</span><div class="chip-row"><button type="button" class="chip' + (strokePaintOn ? ' is-on' : '') + '" id="part-paint-stroke-paint" aria-pressed="' + (strokePaintOn ? 'true' : 'false') + '">彩色描边</button></div></div>'
    + '</div></div>'
    + '<div class="paint-group" id="part-close-icon-group"' + (selectedPart === 'close' ? '' : ' hidden') + '><p class="paint-kicker">关闭图标</p><div class="fields">'
    + '<div class="field span-2"><span class="label">形状</span><div class="chip-row" id="close-icon-row">'
    + closeIconChip('none', '无', closeIcon)
    + closeIconChip('x', '叉', closeIcon)
    + closeIconChip('circle', '圆', closeIcon)
    + closeIconChip('minus', '减号', closeIcon)
    + closeIconChip('plus', '加号', closeIcon)
    + closeIconChip('star', '星', closeIcon)
    + closeIconChip('disc', '实心圆', closeIcon)
    + '</div></div>'
    + '<div class="field"><label for="part-paint-close-icon-color">图标颜色</label><input id="part-paint-close-icon-color" type="color" value="' + escapeHtml(visibleCloseIconColor) + '"></div>'
    + '</div></div>'
    + '</div>'
    + '<input id="part-selected" type="hidden" value="' + escapeHtml(selectedPart) + '">'
    + partHidden('title', parts.title)
    + partHidden('body', parts.body)
    + partHidden('close', parts.close)
    + partHidden('icon', parts.icon)
    + partHidden('assistantName', parts.assistantName)
    + '<input id="glossary-json" type="hidden" value="' + escapeHtml(JSON.stringify(glossary && typeof glossary === 'object' ? glossary : {})) + '">'
    + '<input id="skin-bg-scale" type="hidden" value="' + escapeHtml(String(bgScale)) + '">'
    + '<input id="skin-bg-x" type="hidden" value="' + escapeHtml(String(bgX)) + '">'
    + '<input id="skin-bg-y" type="hidden" value="' + escapeHtml(String(bgY)) + '">'
    + '<input id="skin-bg-fit" type="hidden" value="' + escapeHtml(fit) + '">'
    + '<input id="skin-bg-padding" type="hidden" value="' + escapeHtml(String(padding)) + '">' 
    + '</div></details>';
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
    + '<div class="field"><label for="visual-test-count">次数（1–50）</label><input id="visual-test-count" type="number" min="1" max="50" step="1" value="1"></div>'
    + '<div class="field"><label for="visual-test-interval">间隔（0–5000 ms）</label><input id="visual-test-interval" type="number" min="0" max="5000" step="50" value="120"></div>'
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
  return '<div class="fold-body" id="visual-diagnostics">'
    + '<div class="diag-toolbar">'
    + '<div class="row diag-status"><span class="muted">设置状态 ' + escapeHtml(statusLabel) + '</span><span class="muted">修订版本 ' + (revision != null ? revision : '—') + '</span></div>'
    + '<div class="row diag-actions"><button id="refresh-visual-diagnostics" class="secondary" type="button">刷新</button>'
    + '<button id="clear-visual-diagnostics" class="secondary" type="button">清空</button>'
    + '<button id="export-visual-diagnostics" class="secondary" type="button">导出</button></div></div>'
    + '<p class="muted">最近一次视觉操作记在这。问题用危险色，正常操作用淡色。</p>'
    + '<div id="visual-diagnostics-feedback" class="feedback" role="status" aria-live="polite"></div>'
    + '<div id="visual-diagnostics-list" class="visual-diagnostics-list">' + rows + '</div></div>';
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
  const closeVisible = props.dismissMode !== 'anywhere';
  return '<div class="studio" data-settings-view-root="visual" data-mode="' + escapeHtml(behaviorId) + '" data-editor-mode="' + escapeHtml(activeType) + '" data-close="' + (closeVisible ? 'on' : 'off') + '">' 
    + '<header class="hero"><div><h1>通知视觉</h1><p>先定通道（全池一份法律），再定这张卡怎么走、活多久。换飞法只换这两组。</p></div>'
    + '<div class="hero-side"><div class="hero-actions"><button id="visual-try-one" class="secondary" type="button">试一条</button>'
    + '<button id="open-visual-preview" class="secondary" type="button">打开实时预览</button>'
    + '<button id="visual-settings-save" class="primary" type="button">保存</button></div>'
    + '<div class="hero-actions hero-library"><button id="open-visual-assets" class="secondary" type="button">素材库</button>'
    + '<button id="visual-clear-cards" class="secondary" type="button">清除屏幕上的视觉卡</button></div>'
    + '<div class="hero-preview-status"><span id="visual-preview-state" class="state-pill">等待更新</span>'
    + '<span id="visual-preview-confirmation" class="visual-preview-confirmation" role="status" aria-live="polite">尚未收到后端确认。</span>'
    + '<span id="visual-preview-toast" class="toast" role="status"></span></div></div></header>'
    + '<div class="visual-global-row panel" id="visual-global-switch">'
    + '<h2 class="panel-title">全局视觉</h2>'
    + '<div' + (globalEnabled ? '' : ' id="visual-global-off"') + ' class="visual-global-cluster">'
    + '<label class="visual-global-toggle"><input type="checkbox" id="global-visual-enabled"' + (globalEnabled ? ' checked' : '') + '><span>' + (globalEnabled ? '开启全局视觉' : '关闭全局视觉') + '</span></label>'
    + '<label class="visual-global-default">默认视觉效果<select id="global-visual-default-mode" aria-describedby="visual-default-mode-hint">'
    + '<option value="off"' + (globalDefaultMode === 'off' ? ' selected' : '') + '>关闭视觉</option>'
    + '<option value="stack"' + (globalDefaultMode === 'stack' || globalDefaultMode === 'minimal' ? ' selected' : '') + '>全部堆叠</option>'
    + '<option value="ticker"' + (globalDefaultMode === 'ticker' ? ' selected' : '') + '>全部弹幕</option></select></label>'
    + '<div id="visual-page-status" class="state-pill">' + escapeHtml(boot.status === 'applied' ? '已应用' : '已读取') + '</div></div>'
    + '<p class="visual-global-hint" id="visual-default-mode-hint">没单独绑定的事件走这里；总开关仍最高。关闭总开关后，真实事件不出桌面卡，试一条和实时预览仍可用。</p></div>'
    + '<div id="visual-settings-feedback" class="feedback" role="status" aria-live="polite"></div>'
    + '<select id="pipeline-behavior" class="mode-contract-select" aria-label="飞法" tabindex="-1" aria-hidden="true">' + behaviorOptions + '</select>'
    + '<select id="pipeline-type" class="mode-contract-select" aria-label="卡片种类" tabindex="-1" aria-hidden="true">' + typeSelect(activeType) + '</select>'
    + modeChips(behaviorId)
    + '<div class="studio-main">'
    + stackSection(props, behaviorId)
    + tickerSection(profile.ticker ?? {}, behaviorId, props.hoverHighlight)
    + appearanceSection(props, appearance, activeConfig.skin ?? {}, assetOptions, activeConfig.parts ?? {}, activeConfig.glossary ?? {}, boot.fonts ?? [], boot.studioAgents ?? [])
    + '</div>'
    + '<div class="studio-secondary">'
    + '<details class="fold panel"><summary>配置包 <small>存一份、换一份</small></summary>' + saveProfileSection(boot.profiles) + '</details>'
    + '<details class="fold panel"><summary>应用于事件 <small>选事件再套这套样子</small></summary>' + applyToEventsSection(boot.profiles, boot.events) + '</details>'
    + '<details class="fold panel"><summary>已绑定事件试运行 <small>次数、间隔</small></summary>' + visualExperimentSection() + '</details>'
    + '<details class="fold panel"><summary>诊断 <small id="visual-diagnostics-summary">' + (function () {
      const n = (boot.visualDiagnostics || []).filter((entry) => entry.level === 'error' || entry.level === 'warn').length;
      return n ? (n + ' 个问题') : '最近一次视觉操作';
    }()) + '</small></summary>' + diagnosticsSection(boot) + '</details>'
    + '</div></div>'
    + bgAdjustOverlay()
    + '<script>(function(){var initial=' + initial + ';var state=initial;var $=function(id){return document.getElementById(id)};'
    + STUDIO_CLIENT
    + '})();</script>';
}

function bgAdjustOverlay() {
  return '<div id="bg-adjust" class="bg-adjust" hidden>'
    + '<div class="bg-adjust-sheet">'
    + '<div class="bg-adjust-head"><h2>调整底图</h2><button type="button" id="bg-adjust-close" class="secondary">关闭</button></div>'
    + '<p class="bg-adjust-extracted" id="bg-adjust-extracted">宽 — · 高 — · 圆角 — · 绘制溢出 — · 提取自设置页面</p>'
    + '<p class="bg-adjust-legend" id="bg-adjust-legend"><span class="bg-adjust-key"><span class="bg-adjust-swatch bg-adjust-swatch-draw" aria-hidden="true"></span>绘制框</span><span class="bg-adjust-key"><span class="bg-adjust-swatch bg-adjust-swatch-hit" aria-hidden="true"></span>可点框</span></p>'
    + '<div class="bg-adjust-stage" id="bg-adjust-stage">'
    + '<div class="bg-adjust-clip" id="bg-adjust-clip"><img id="bg-adjust-image" alt=""></div>'
    + '<div class="bg-adjust-draw" id="bg-adjust-draw"></div>'
    + '<div class="bg-adjust-hit" id="bg-adjust-hit"></div>'
    + '</div>'
    + '<div class="bg-adjust-bar">'
    + '<label class="bg-adjust-num">大小（20–800）<input id="bg-adjust-scale" type="number" min="20" max="800" step="1" value="100"></label>'
    + '<label class="bg-adjust-num">左右（0–100）<input id="bg-adjust-x" type="number" min="0" max="100" step="1" value="50"></label>'
    + '<label class="bg-adjust-num">上下（0–100）<input id="bg-adjust-y" type="number" min="0" max="100" step="1" value="50"></label>'
    + '<button type="button" id="bg-adjust-invert" class="chip" aria-pressed="false">滚轮翻转</button>'
    + '<button type="button" id="bg-adjust-save" class="chip">保存</button>'
    + '</div>'
    + '<p class="field-note">拖图改位置，滚轮改大小。关闭不保存这一层的改动。</p>'
    + '</div></div>';
}

const CSS_STYLES = ":root{color-scheme:dark;--bg:#0e1513;--surface:#17221f;--raised:#1d2b27;--text:#e7f2ee;--muted:#9bb1a9;--line:#304740;--accent:#62d0a8;--strong:#38b88d;--ink:#092118;--ticker:#56c8d8;--popup:#f1c77a;--danger:#f18c8c;--success:#72d49e;--radius:7px;--ctrl-h:36px}\n.shell *,.studio,.studio *{box-sizing:border-box}.shell{margin:0;background:var(--bg);color:var(--text)}\nbody{font:14px/1.5 \"Segoe UI\",\"Microsoft YaHei\",sans-serif;min-width:320px}\nbutton,input,select{font:inherit;color:inherit}\n.shell button,.studio button{cursor:pointer;min-height:var(--ctrl-h);height:var(--ctrl-h);padding:0 14px;border:1px solid var(--line);border-radius:var(--radius);background:transparent;color:var(--text);font-size:13px;font-weight:600}\nbutton:hover{background:var(--raised)}\nbutton.primary,.primary{min-width:88px;padding:0 18px;border-color:var(--strong);background:var(--strong);color:var(--ink);font-size:14px;font-weight:700}\nbutton.primary:hover,.primary:hover{background:var(--accent);border-color:var(--accent)}\nbutton.primary:active,.primary:active{transform:translateY(1px)}\nbutton.primary.is-saved{background:var(--raised);border-color:var(--line);color:var(--text)}\nbutton.secondary,.secondary{background:transparent;border-color:var(--line);color:var(--text)}\nbutton.secondary:hover,.secondary:hover{background:var(--raised)}\nbutton.danger{background:var(--danger);color:var(--ink);border-color:var(--danger)}\nbutton.danger:hover{background:#f3a0a0}\nbutton:disabled,input:disabled,select:disabled{opacity:.48;cursor:not-allowed}#part-paint-fill:disabled{filter:grayscale(1)}\nbutton:focus-visible,.chip:focus-visible,.dock-cell:focus-visible,.band-hit:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}\n[hidden]{display:none!important}\n.shell{max-width:1280px;margin:0 auto;padding:0 0 24px}\n.settings-toolbar{display:flex;justify-content:space-between;gap:12px;margin:18px 40px 0}\n.crumb{color:var(--muted);font-size:12px;align-self:center}\n.studio{width:min(1280px,100%);margin:0 auto;padding:36px 40px 80px}\n.panel{min-width:0;border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:16px 20px}\n.panel-title{margin:0 0 10px;font-size:14px;line-height:1.3;font-weight:700}\n.studio-main,.studio-secondary{display:grid;gap:16px}.studio-main{margin-bottom:16px}\n.hero{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:16px}.hero-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex-shrink:0}.hero-side{display:grid;gap:8px;justify-items:end;flex-shrink:0}.hero-preview-status{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px;max-width:36em}\n.hero h1{margin:0 0 6px;font-size:23px;font-weight:700;letter-spacing:0;line-height:1.2}\n.hero p{margin:0;max-width:36em;color:var(--muted);font-size:14px;line-height:1.5}\n.visual-global-row{margin-bottom:16px}\n.visual-global-cluster{display:flex;flex-wrap:wrap;align-items:center;gap:16px}\n.visual-global-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;font-weight:600}\n.visual-global-toggle input[type=checkbox]{width:18px;height:18px;accent-color:var(--accent)}\n.visual-global-default{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px}\n.visual-global-default select{height:var(--ctrl-h);padding:0 10px;border:1px solid var(--line);border-radius:6px;background:var(--raised);color:var(--text)}\n.visual-global-hint{margin:8px 0 0;color:var(--muted);font-size:12px}\n.state-pill{padding:6px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted);white-space:nowrap;font-size:12px}\n.mode-block{margin-bottom:16px}\n.mode-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}\n.chip{display:inline-flex;align-items:center;gap:8px;min-height:var(--ctrl-h);padding:0 14px;border:1px solid var(--line);border-radius:var(--radius);background:var(--raised);color:var(--text);font-size:13px;font-weight:600}\n.chip:hover{border-color:var(--accent)}\n.chip.is-on,.chip.is-selected{border-color:var(--strong);box-shadow:inset 0 -2px 0 var(--accent)}\n.chip.is-locked{border-style:dashed;background:transparent;color:var(--muted);cursor:default}.chip.is-off{opacity:.35;cursor:not-allowed}.chip.is-off:hover{border-color:var(--line);background:var(--raised)}\n.chip.is-locked:hover{border-color:var(--line);background:transparent}\n.chip-badge{padding:1px 7px;border:1px solid #6d5b32;border-radius:999px;color:var(--popup);font-size:11px;font-weight:600;line-height:1.4}\n.mode-why{margin:8px 0 0;color:var(--muted);font-size:12px;line-height:1.45}\n.group{margin-bottom:32px}\n.group-name{margin:0 0 12px;font-size:13px;font-weight:700;color:var(--text)}\n.group.is-quiet .group-name{color:var(--muted);font-weight:600}\n.group-hint{margin:-6px 0 14px;color:var(--muted);font-size:12px}\n.fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px 20px;max-width:720px}\n.field{display:grid;gap:6px;min-width:0}\n.field.span-2{grid-column:1/-1}\n.field label,.field .label{font-size:12px;color:var(--muted);line-height:1.3}\n.field input[type=number],.field input[type=text],.field select{width:100%;height:var(--ctrl-h);padding:0 10px;border:1px solid var(--line);border-radius:6px;background:var(--raised);color:var(--text)}\n.field input[type=color]{width:100%;height:var(--ctrl-h);padding:4px;border:1px solid var(--line);border-radius:6px;background:var(--raised);cursor:pointer}\n.field-note,.muted{color:var(--muted);font-size:12px}\n.slider-row{display:grid;grid-template-columns:minmax(0,1fr) 64px;gap:12px;align-items:center;min-width:0}.slider-row>*{min-width:0}.slider-row.with-action{grid-template-columns:minmax(0,1fr) 64px max-content}.slider-row.with-action .chip{position:relative;z-index:1}\n.studio input[type=range],.shell input[type=range]{width:100%;height:var(--ctrl-h);margin:0;accent-color:var(--accent);background:transparent}\n.slider-val{height:var(--ctrl-h);display:grid;place-items:center;border:1px solid var(--line);border-radius:6px;background:var(--raised);font-size:13px;font-variant-numeric:tabular-nums}\n.dock{width:168px;height:112px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:4px;padding:6px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg)}.grow{width:168px;height:112px;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr;gap:4px;padding:6px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg)}.grow-cell{border:1px solid var(--line);border-radius:5px;background:var(--raised);color:var(--muted);font-size:12px;font-weight:600;height:auto;min-height:0}.grow-cell.is-on{background:var(--accent);color:var(--ink);border-color:var(--accent)}.grow-cell.is-off,.grow-cell:disabled{opacity:.35;cursor:not-allowed}.grow-center{border-radius:5px;background:var(--raised);opacity:.35}\n.dock-cell{border:1px solid var(--line);border-radius:5px;background:var(--raised);color:var(--muted);font-size:12px;font-weight:600;height:auto;min-height:0}\n.dock-cell:hover{border-color:var(--accent);color:var(--text)}\n.dock-cell.is-on{border-color:var(--strong);background:var(--surface);color:var(--text);box-shadow:inset 0 0 0 1px var(--accent)}\n.band{position:relative;width:220px;height:96px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);overflow:hidden}\n.band-fill{position:absolute;left:0;right:0;height:28%;background:rgba(86,200,216,.18);border:1px solid var(--ticker);pointer-events:none}\n.band[data-side=top] .band-fill{top:0;border-width:0 0 1px}\n.band[data-side=bottom] .band-fill{bottom:0;border-width:1px 0 0}\n.band-hit{position:absolute;left:0;right:0;height:50%;border:0;background:transparent;color:var(--muted);font-size:12px;font-weight:600;text-align:left;padding:8px 10px}\n.band-hit.top{top:0}.band-hit.bottom{bottom:0}\n.band-hit:hover{color:var(--text)}\n.band[data-side=top] .band-hit.top,.band[data-side=bottom] .band-hit.bottom{color:var(--text)}\n.inline-pair{display:flex;flex-wrap:wrap;align-items:flex-end;gap:20px}\ndetails.more{margin-top:8px;max-width:720px}\ndetails.more>summary{list-style:none;display:flex;align-items:center;min-height:32px;color:var(--muted);font-size:12px;cursor:pointer}\ndetails.more>summary::-webkit-details-marker{display:none}\ndetails.more>summary::before{content:\"▸\";margin-right:6px;color:var(--muted)}\ndetails.more[open]>summary::before{content:\"▾\"}\ndetails.more>summary:hover{color:var(--text)}\n.toast{min-height:20px;margin-top:8px;color:var(--muted);font-size:12px}\n.toast.ok{color:var(--accent)}\n.preview-runtime-status{display:flex;align-items:center;gap:8px;margin-top:8px}\n.visual-preview-confirmation{color:var(--muted);font-size:12px;line-height:1.3}\n.visual-preview-confirmation.success{color:var(--accent)}\n.visual-preview-confirmation.error{color:var(--danger)}\n.feedback{min-height:22px;color:var(--muted);font-size:12px}\n.feedback.success{color:var(--success)}\n.feedback.error{color:var(--danger)}\n.studio-secondary{margin-top:16px;border-top:none;padding-top:0}\n.fold>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;min-height:44px;cursor:pointer;font-size:13px;font-weight:700}\n.fold>summary::-webkit-details-marker{display:none}\n.fold>summary:hover{color:var(--accent)}\n.fold>summary small{font-weight:400;color:var(--muted)}\n.fold-body{padding:0 0 20px;display:grid;gap:12px}\n.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}\n.profile-list-item,.pack-item{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line);font-size:13px;flex-wrap:wrap}\n.profile-list-meta{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--muted)}\n.profile-refs{color:var(--accent)}.profile-refs.muted{color:var(--muted)}\n.profile-source{padding:2px 6px;border:1px solid var(--line);border-radius:4px;font-size:12px}\n.profile-list-empty,.empty-state{padding:16px 12px;color:var(--muted);text-align:center;font-size:13px}\n.conflict-dialog{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:1000}\n.conflict-dialog-body{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:24px;max-width:420px;width:90%;display:grid;gap:16px}\n.conflict-actions{display:flex;gap:8px;flex-wrap:wrap}\n.apply-bound-list{display:grid;gap:8px}\n.apply-bound-item{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--line);font-size:12px}\n.apply-bound-item .bound-profile{color:var(--accent)}\n.visual-diagnostics-list{display:grid;gap:6px}\n.visual-diagnostic-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line)}\n.visual-diagnostic-row strong{font-size:12px}\n.visual-diagnostic-row span,.visual-diagnostic-row time{font-size:12px;color:var(--muted)}\n.visual-diagnostic-row.is-error strong,.visual-diagnostic-row.is-warn strong{color:var(--danger)}\n.visual-diagnostic-row.is-ok strong{color:var(--muted)}\n.visual-diagnostic-row .diag-details{display:block;margin-top:2px}\n.delete-event-list{margin:0;padding-left:1.2em;color:var(--text);font-size:13px}\n.studio-main>.fold{margin-bottom:0}\n.mode-contract-select{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}\n.ticker-section .fold-body{gap:20px;max-width:560px}\n.ticker-section .ticker-flow-stage,.ticker-section .ticker-flow-pace,.ticker-section .ticker-flow-lanes,.ticker-section .ticker-flow-pointer{display:grid;gap:8px;min-width:0}\n.chip-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}\n.ticker-section .band{width:100%;height:96px}.studio .ticker-section .band-hit{height:50%;min-height:0;padding:8px 10px;border:0;border-radius:0;background:transparent;font-size:12px;font-weight:600;color:var(--muted);text-align:left}.studio .ticker-section .band-hit:hover{color:var(--text);border-color:transparent}.studio .ticker-section .band[data-side=top] .band-hit.top,.studio .ticker-section .band[data-side=bottom] .band-hit.bottom{color:var(--text)}.studio .ticker-section .slider-val.is-muted{color:var(--muted);opacity:.55}.studio .ticker-section .ticker-flow-pointer .chip{width:fit-content;justify-self:start}\n.ticker-section .slider-row{display:grid;grid-template-columns:minmax(0,1fr) 64px;gap:12px;align-items:center;min-width:0}\n.ticker-section .slider-row input[type=range]{width:100%;min-width:0;height:var(--ctrl-h);margin:0}\n.ticker-section .ticker-flow-random{display:flex;align-items:center;gap:12px;flex-wrap:wrap}\n.ticker-section .ticker-flow-random #ticker-speed-random{flex:0 0 auto}\n.ticker-section .ticker-flow-random .field-note{margin:0;flex:1 1 200px}\n.ticker-section .ticker-flow-lanes .field input[type=number]{max-width:160px}\n.ticker-section .ticker-flow-gaps{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px 20px;min-width:0}\n.ticker-section .ticker-flow-pointer .chip{width:fit-content}\n@media(max-width:820px){.studio{padding:28px 20px 64px}.settings-toolbar{margin:18px 20px 0}.fields{max-width:none}}\n@media(max-width:560px){.studio{padding:20px 14px 56px}.settings-toolbar{margin:18px 14px 0;flex-direction:column}.hero{flex-direction:column;align-items:stretch;gap:12px}.hero-actions{width:100%}.hero-actions .primary,.hero-actions .secondary,.btn-ghost{width:100%}.fields{grid-template-columns:1fr}.field.span-2{grid-column:auto}.inline-pair{flex-direction:column;align-items:flex-start}.dock,.band{width:100%}.fold>summary{align-items:flex-start;flex-direction:column;gap:4px;padding:10px 0}.ticker-section .fold-body{max-width:none}.ticker-section .ticker-flow-gaps{grid-template-columns:minmax(0,1fr)}.ticker-section .ticker-flow-random{flex-direction:column;align-items:flex-start}.ticker-section .ticker-flow-lanes .field input[type=number]{max-width:none}}\n.glossary-row{display:grid;grid-template-columns:minmax(0,1fr) 52px max-content;gap:8px;align-items:center;margin:0 0 8px}.glossary-row input[type=text]{min-width:0}#glossary-add{width:fit-content}.bg-adjust{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,14,12,.82)}.bg-adjust-sheet{width:min(840px,94vw);display:grid;gap:12px;padding:20px 20px 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.bg-adjust-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.bg-adjust-head h2{margin:0;font-size:16px;font-weight:700}.bg-adjust-extracted{margin:0;color:var(--muted);font-size:12px}.bg-adjust-stage{position:relative;height:min(420px,56vh);overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#0a100f;cursor:grab;touch-action:none}.bg-adjust-stage.is-dragging{cursor:grabbing}.bg-adjust-clip{position:absolute;overflow:hidden;pointer-events:none}.bg-adjust-clip img{position:absolute;left:0;top:0;max-width:none;max-height:none;pointer-events:none;user-select:none}.bg-adjust-draw,.bg-adjust-hit{position:absolute;box-sizing:border-box;pointer-events:none}.bg-adjust-draw{border:1.5px solid var(--accent)}.bg-adjust-hit{border:1.5px solid #56c8d8}.bg-adjust-legend{display:flex;flex-wrap:wrap;gap:16px;margin:0;color:var(--muted);font-size:12px;line-height:1.4}.bg-adjust-key{display:inline-flex;align-items:center;gap:8px}.bg-adjust-swatch{width:14px;height:10px;box-sizing:border-box;border-radius:2px;background:transparent}.bg-adjust-swatch-draw{border:1.5px solid var(--accent)}.bg-adjust-swatch-hit{border:1.5px solid #56c8d8}.bg-adjust-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}.bg-adjust-num{display:grid;gap:4px;color:var(--muted);font-size:12px}.bg-adjust-num input{width:88px;height:var(--ctrl-h);padding:0 10px;border:1px solid var(--line);border-radius:6px;background:var(--raised);color:var(--text)}#part-chip-row [data-part].is-off{opacity:.48}";
const CSS_PART_EXTRAS = '.paint-group{display:grid;gap:8px;padding:14px 0 4px;border-top:1px solid var(--line)}.paint-kicker{margin:0;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.paint-group .fields{max-width:none}.paint-group .field-note{margin:0}'
  + '.studio .mode-block{margin-bottom:32px}'
  + '.group-charter,.group-card{margin:0}'
  + '#stack-section,#ticker-section{display:grid;gap:16px}'
  + '.stack-layout{display:grid;grid-template-columns:168px 168px minmax(200px,1fr);gap:16px 24px;align-items:start}'
  + '.stack-layout>.field,.stack-layout>.stack-life{min-width:0}'
  + '.stack-layout .dock,.stack-layout .grow{width:100%;max-width:200px;height:160px}'
  + '.studio .stack-layout .dock-cell,.studio .stack-layout .grow-cell{height:auto;min-height:0;padding:0;display:grid;place-items:center}'
  + '.stack-wrap .chip-row{flex-wrap:wrap}'
  + '.stack-life{display:grid;gap:12px;align-content:start}'
  + '.stack-life .label,.stack-life label{white-space:nowrap}'
  + '.stack-life-row{display:grid;grid-template-columns:minmax(88px,.8fr) minmax(0,1fr);gap:12px 16px;align-items:end}'
  + '.stack-life .field-note{margin:0}'
  + '.diag-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:0;z-index:2;padding:8px 0 12px;background:var(--surface);border-bottom:1px solid var(--line)}'
  + '.diag-toolbar .row{margin:0}'
  + '.diag-actions{justify-content:flex-end}'
  + '@media(max-width:1100px){.stack-layout{grid-template-columns:168px 168px minmax(0,1fr)}.stack-life{grid-column:1/-1}.stack-life-row{max-width:420px}}'
  + '@media(max-width:720px){.stack-layout{grid-template-columns:1fr 1fr}.stack-wrap{grid-column:1/-1}.stack-layout .dock,.stack-layout .grow{max-width:none}}'
  + '@media(max-width:560px){.stack-layout{grid-template-columns:1fr}.stack-life-row{grid-template-columns:1fr}.diag-toolbar,.diag-actions{flex-direction:column;align-items:stretch}.diag-actions .secondary{width:100%}}';
export function renderVisualSettingsPage(currentUrl = '', initialData = null) {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notification Hub 通知视觉</title><style>'
    + PAGE_NAVIGATION_STYLE
    + CSS_STYLES
    + CSS_PART_EXTRAS
    + '</style></head><body><main class="shell">'
    + renderPageNavigation({ active: 'settings', currentUrl })
    + '<div class="settings-toolbar"><button id="back-settings" class="secondary" type="button">← 返回设置中心</button><span class="crumb">设置 / 通知视觉</span></div>'
    + renderBody(currentUrl, initialData)
    + '</main>' + PAGE_NAVIGATION_SCRIPT + '</body></html>';
}

export function renderVisualSettingsFragment(currentUrl = '', initialData = null) {
  return '<style data-settings-view-style>' + CSS_STYLES + CSS_PART_EXTRAS + '</style>'
    + renderBody(currentUrl, initialData);
}

export default function registerVisualSettingsRoute(app, ctx) {
  const getPlugin = () => ctx?._notificationHubVNextSettingsApi ?? ctx?._notificationHubVNextPlugin;
  app.get('/settings-visual', (c) => { const plugin = getPlugin(); return c.html(renderVisualSettingsPage(c?.req?.url ?? '', typeof plugin?.getVisualSettingsStatus === 'function' ? plugin.getVisualSettingsStatus() : null)); });
  const visualSettingsStatus = (c) => {
    try {
      if (typeof c.header === 'function') c.header('Cache-Control', 'no-store');
      const plugin = getPlugin();
      if (!plugin?.getVisualSettingsStatus) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_SETTINGS_API_UNAVAILABLE' }) }, 503);
      return c.json({ ok: true, ...plugin.getVisualSettingsStatus() });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, 500);
    }
  };
  app.get('/visual-settings-status', visualSettingsStatus);
  app.post('/visual-settings-status', visualSettingsStatus);
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
  app.get('/agent-avatars/:id/file', async (c) => {
    try {
      const plugin = getPlugin();
      if (!plugin?.readAgentAvatarFile) return c.json({ ok: false, error: errorPayload({ code: 'AGENT_AVATAR_API_UNAVAILABLE', message: '助手头像暂不可用。' }) }, 503);
      const file = await plugin.readAgentAvatarFile(c.req.param('id'));
      if (!file) return c.json({ ok: false, error: errorPayload({ code: 'AGENT_AVATAR_NOT_FOUND', message: '助手头像不存在。' }) }, 404);
      const mime = file.format === 'jpg' || file.format === 'jpeg' ? 'image/jpeg' : file.format === 'webp' ? 'image/webp' : 'image/png';
      const accept = String(c.req.header?.('Accept') || c.req.header?.('accept') || '');
      if (accept.includes('application/json')) {
        const bytes = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
        return c.json({ ok: true, id: file.id, format: file.format, dataUrl: 'data:' + mime + ';base64,' + bytes.toString('base64') });
      }
      return c.body(file.buffer, 200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, 500);
    }
  });
}
