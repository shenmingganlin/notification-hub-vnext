import { CARD_TYPES as CONTENT_CARD_TYPES } from './card-visual-settings.js';
import { resolveStackWrap, stackGrowToNativeDirection } from './stack-grow.js';

// cardType 只承载内容结构轴（与 CARD_TYPES 单一来源对齐）。
// 出现方式（stack/ticker/popup）不再混进 cardType，已独立为 behaviorId 轴。
const CARD_TYPES = new Set(CONTENT_CARD_TYPES);

function nativeVisualError(code, message, field) {
  return Object.assign(new Error(message), { code, details: field ? { field } : {} });
}

const DEFAULT_VISUAL = Object.freeze({
  enabled: true,
  preset: 'minimal',
  intensity: 'balanced',
  category: null,
  cardType: 'minimal'
});

const DEFAULT_BEHAVIOR = Object.freeze({
  layout: 'simple',
  boundary: 'work-area'
});

const NATIVE_VISUAL_CATEGORIES = new Set(['chat', 'channel', 'tool', 'error', 'plugin', 'model_service']);
const NATIVE_DISMISS_MODES = new Set(['closeButton', 'anywhere', 'timeout', 'buttonOnly']);

// Ticker 行为参数（ticker 契约 §2）。Native 侧只接受已实现的值域。
const NATIVE_TICKER_BANDS = new Set(['top', 'bottom']);
const NATIVE_TICKER_DIRECTIONS = new Set(['left', 'right']);
const NATIVE_TICKER_OVERFLOWS = new Set(['avoid', 'queue']);
const NATIVE_TICKER_LIMITS = Object.freeze({ speed: [150, 800], bandRatio: [0.15, 1], minGap: [24, 160], trackGap: [0, 48] });
function clampInteger(value, fallback, bounds) {
  if (!Number.isInteger(value)) return fallback;
  return Math.max(bounds[0], Math.min(bounds[1], value));
}
function clampNumber(value, fallback, bounds) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(bounds[0], Math.min(bounds[1], value));
}

const DEFAULT_APPEARANCE = Object.freeze({
  size: 'medium',
  aspectRatio: 'default',
  backgroundColor: '#0e1916',
  backgroundFit: 'fill',
  backgroundPadding: 0,
  borderRadius: 16,
  opacity: 0.96
});

function stringOr(value, fallback) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

const NATIVE_STACK_ANCHORS = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

function nativeStackMargin(space, side) {
  const raw = Number.isInteger(space[side])
    ? space[side]
    : (Number.isInteger(space.margin) ? space.margin : 18);
  return Math.max(0, raw);
}

export function spaceToNativeStackLayout(space = {}) {
  const anchor = NATIVE_STACK_ANCHORS.has(space.anchor) ? space.anchor : 'bottom-right';
  const wrap = resolveStackWrap(space.wrap);
  const leftOn = String(anchor).endsWith('left');
  const topOn = String(anchor).startsWith('top');
  return {
    layout: 'stack',
    direction: stackGrowToNativeDirection(anchor, space.grow, wrap),
    wrap,
    anchor,
    spacing: Number.isInteger(space.gap) ? space.gap : 8,
    marginLeft: leftOn ? nativeStackMargin(space, 'marginLeft') : 0,
    marginRight: leftOn ? 0 : nativeStackMargin(space, 'marginRight'),
    marginTop: topOn ? nativeStackMargin(space, 'marginTop') : 0,
    marginBottom: topOn ? 0 : nativeStackMargin(space, 'marginBottom')
  };
}

/**
 * Project the richer Plugin visual model into the strict scene.create contract.
 * Geometry-only fields stay on the card root; Native does not parse them inside visual.
 */
export function resolveVisualDraftPayload(visual = {}, cardType = {}) {
  const behavior = { ...(visual.behavior ?? {}) };
  const appearance = { ...(visual.appearance ?? {}) };
  const propertiesSpace = cardType.properties?.space ?? {};
  const propertiesShape = cardType.properties?.shape ?? {};
  const propertiesInteraction = cardType.properties?.interaction ?? {};
  const skinBackground = cardType.skin?.background ?? {};
  const skinDecoration = cardType.skin?.decoration ?? {};
  const rawAppearance = cardType.appearance ?? {};

  for (const field of ['layout', 'boundary']) {
    if (behavior[field] === undefined && propertiesSpace[field] !== undefined) behavior[field] = propertiesSpace[field];
  }
  for (const field of ['gap', 'margin', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom']) {
    if (behavior[field] === undefined && propertiesSpace[field] !== undefined) behavior[field] = propertiesSpace[field];
  }
  const legacyMargin = behavior.margin ?? 18;
  for (const field of ['marginLeft', 'marginRight', 'marginTop', 'marginBottom']) {
    if (behavior[field] === undefined) behavior[field] = legacyMargin;
  }
  if (behavior.dismissMode === undefined && propertiesInteraction.dismissMode !== undefined) behavior.dismissMode = propertiesInteraction.dismissMode;
  if (behavior.closeButtonPosition === undefined && propertiesInteraction.closeButtonPosition !== undefined) behavior.closeButtonPosition = propertiesInteraction.closeButtonPosition;
  if (!('size' in rawAppearance) && propertiesSpace.size !== undefined) appearance.size = propertiesSpace.size;
  if (!('aspectRatio' in rawAppearance) && propertiesSpace.aspectRatio !== undefined) appearance.aspectRatio = propertiesSpace.aspectRatio;
  if (!('backgroundColor' in rawAppearance) && skinBackground.color !== undefined) appearance.backgroundColor = skinBackground.color;
  if (!('backgroundAssetId' in rawAppearance) && skinBackground.assetId !== undefined) appearance.backgroundAssetId = skinBackground.assetId;
  if (!('backgroundFit' in rawAppearance) && skinBackground.fit !== undefined) appearance.backgroundFit = skinBackground.fit;
  if (!('backgroundPadding' in rawAppearance) && skinBackground.padding !== undefined) appearance.backgroundPadding = skinBackground.padding;
  if (!('borderRadius' in rawAppearance) && propertiesShape.borderRadius !== undefined) appearance.borderRadius = propertiesShape.borderRadius;
  if (!('borderRadius' in rawAppearance) && skinDecoration.borderRadius !== undefined) appearance.borderRadius = skinDecoration.borderRadius;
  if (!('opacity' in rawAppearance) && propertiesShape.opacity !== undefined) appearance.opacity = propertiesShape.opacity;
  if (!('opacity' in rawAppearance) && skinDecoration.opacity !== undefined) appearance.opacity = skinDecoration.opacity;
  if (!('borderWidth' in rawAppearance) && propertiesShape.borderWidth !== undefined) appearance.borderWidth = propertiesShape.borderWidth;
  if (!('borderWidth' in rawAppearance) && skinDecoration.borderWidth !== undefined) appearance.borderWidth = skinDecoration.borderWidth;
  if (!('borderColor' in rawAppearance) && propertiesShape.borderColor !== undefined) appearance.borderColor = propertiesShape.borderColor;
  if (!('borderColor' in rawAppearance) && skinDecoration.borderColor !== undefined) appearance.borderColor = skinDecoration.borderColor;

  const effects = cardType.effects?.slots;
  if (effects) {
    const activeEffects = Object.values(effects).filter((slot) => slot?.enabled && slot.effectId && slot.effectId !== 'none');
    visual = { ...visual, intensity: activeEffects.length > 0 ? 'expressive' : 'reduced' };
  }
  if (cardType.parts && typeof cardType.parts === 'object' && !Array.isArray(cardType.parts) && Object.keys(cardType.parts).length > 0) {
    visual = { ...visual, parts: cardType.parts };
  }
  if (cardType.glossary && typeof cardType.glossary === 'object' && !Array.isArray(cardType.glossary) && Object.keys(cardType.glossary).length > 0) {
    visual = { ...visual, glossary: cardType.glossary };
  }
  return {
    ...visual,
    behavior,
    appearance,
    interaction: {
      ...(visual.interaction ?? {}),
      dismissMode: visual.interaction?.dismissMode ?? propertiesInteraction.dismissMode ?? 'closeButton',
      closeButtonPosition: visual.interaction?.closeButtonPosition ?? propertiesInteraction.closeButtonPosition ?? 'top-right',
      timeoutMs: visual.interaction?.timeoutMs ?? propertiesInteraction.timeoutMs ?? propertiesInteraction.durationMs ?? 30000,
      hoverHighlight: visual.interaction?.hoverHighlight ?? propertiesInteraction.hoverHighlight ?? 'off',
      autoDismiss: visual.interaction?.autoDismiss ?? propertiesInteraction.autoDismiss ?? 'off'
    }
  };
}

export function projectNativeVisualPayload(visual = {}) {
  const behavior = visual.behavior ?? {};
  const appearance = visual.appearance ?? {};
  const projected = {
    enabled: typeof visual.enabled === 'boolean' ? visual.enabled : DEFAULT_VISUAL.enabled,
    preset: stringOr(visual.preset, DEFAULT_VISUAL.preset),
    intensity: stringOr(visual.intensity, DEFAULT_VISUAL.intensity),
    category: NATIVE_VISUAL_CATEGORIES.has(visual.category) ? visual.category : DEFAULT_VISUAL.category,
    cardType: visual.cardType === undefined
      ? DEFAULT_VISUAL.cardType
      : (CARD_TYPES.has(visual.cardType) ? visual.cardType : (() => { throw nativeVisualError('NATIVE_VISUAL_CARD_TYPE_INVALID', 'cardType is unsupported', 'cardType'); })()),
    behavior: {
      layout: stringOr(behavior.layout, DEFAULT_BEHAVIOR.layout),
      boundary: stringOr(behavior.boundary, DEFAULT_BEHAVIOR.boundary)
    },
    interaction: {
      dismissMode: NATIVE_DISMISS_MODES.has(visual.interaction?.dismissMode) ? visual.interaction.dismissMode : 'closeButton',
      closeButtonPosition: typeof visual.interaction?.closeButtonPosition === 'string' ? visual.interaction.closeButtonPosition : 'top-right',
      timeoutMs: Number.isInteger(visual.interaction?.timeoutMs) ? Math.max(1000, Math.min(120000, visual.interaction.timeoutMs)) : 30000
    },
    appearance: {
      size: stringOr(appearance.size, DEFAULT_APPEARANCE.size),
      aspectRatio: stringOr(appearance.aspectRatio, DEFAULT_APPEARANCE.aspectRatio),
      backgroundColor: stringOr(appearance.backgroundColor, DEFAULT_APPEARANCE.backgroundColor),
      backgroundFit: stringOr(appearance.backgroundFit, DEFAULT_APPEARANCE.backgroundFit),
      backgroundPadding: typeof appearance.backgroundPadding === 'number' ? appearance.backgroundPadding : DEFAULT_APPEARANCE.backgroundPadding,
      borderRadius: Number.isInteger(appearance.borderRadius) ? appearance.borderRadius : DEFAULT_APPEARANCE.borderRadius,
      opacity: clampNumber(appearance.opacity, DEFAULT_APPEARANCE.opacity, [0, 1])
    }
  };
  if (typeof appearance.backgroundAssetId === 'string' && appearance.backgroundAssetId.length > 0) {
    projected.appearance.backgroundAssetId = appearance.backgroundAssetId;
    const scale = clampNumber(appearance.backgroundScale, 1, [0.2, 8]);
    const x = clampNumber(appearance.backgroundX, 0.5, [0, 1]);
    const y = clampNumber(appearance.backgroundY, 0.5, [0, 1]);
    if (scale !== 1 || x !== 0.5 || y !== 0.5) {
      projected.appearance.backgroundScale = scale;
      projected.appearance.backgroundX = x;
      projected.appearance.backgroundY = y;
    }
  }
  if (Number.isInteger(appearance.borderWidth) && appearance.borderWidth > 0) {
    projected.appearance.borderWidth = Math.max(0, Math.min(32, appearance.borderWidth));
    projected.appearance.borderColor = stringOr(appearance.borderColor, '#62d0a8');
  }
  if (Number.isInteger(appearance.paintOverflow) && appearance.paintOverflow > 0) {
    projected.appearance.paintOverflow = Math.max(0, Math.min(240, appearance.paintOverflow));
  }
  // Ticker 参数只在卡片确实携带时下发；缺省时 Native 用自己的默认值，
  // 因此旧客户端不发这个字段时行为与今日一致（向后兼容）。
  const ticker = visual.ticker;
  if (ticker && typeof ticker === 'object' && !Array.isArray(ticker)) {
    projected.ticker = {
      speedPxPerSec: clampInteger(ticker.speedPxPerSec, 400, NATIVE_TICKER_LIMITS.speed),
      band: NATIVE_TICKER_BANDS.has(ticker.band) ? ticker.band : 'top',
      bandRatio: clampNumber(ticker.bandRatio, 0.28, NATIVE_TICKER_LIMITS.bandRatio),
      trackCount: Number.isInteger(ticker.trackCount) && ticker.trackCount >= 0 ? ticker.trackCount : 0,
      trackGapPx: clampInteger(ticker.trackGapPx, 8, NATIVE_TICKER_LIMITS.trackGap),
      minGapPx: clampInteger(ticker.minGapPx, 64, NATIVE_TICKER_LIMITS.minGap),
      clickThrough: ticker.clickThrough !== false,
      hoverPause: ticker.hoverPause === true,
      overflow: NATIVE_TICKER_OVERFLOWS.has(ticker.overflow) ? ticker.overflow : 'avoid',
      direction: NATIVE_TICKER_DIRECTIONS.has(ticker.direction) ? ticker.direction : 'left'
    };
    // 弹幕只做出屏回收，不用堆叠的 timeout 中途掐掉。
    if (projected.interaction.dismissMode === 'timeout') projected.interaction.dismissMode = 'closeButton';
  }
  const hoverOn = visual.interaction?.hoverHighlight === true || visual.interaction?.hoverHighlight === 'on';
  const tickerBlocksHover = Boolean(projected.ticker && projected.ticker.clickThrough);
  if (hoverOn && !tickerBlocksHover) projected.interaction.hoverHighlight = true;
  const autoOn = visual.interaction?.autoDismiss === true || visual.interaction?.autoDismiss === 'on';
  if (projected.ticker) {
    // ticker never auto-dismisses by timeout
  } else if (projected.interaction.dismissMode === 'timeout') {
    projected.interaction.dismissMode = 'closeButton';
    projected.interaction.autoDismiss = true;
  } else if (autoOn) {
    projected.interaction.autoDismiss = true;
  }
  return projected;
}
