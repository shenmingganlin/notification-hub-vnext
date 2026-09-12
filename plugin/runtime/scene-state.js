import { PROTOCOL_VERSION } from '../protocol/index.js';

export const SCENE_STATE_VERSION = 1;

const TOP_LEVEL_FIELDS = new Set([
  'sceneStateVersion',
  'protocolVersion',
  'updatedAt',
  'sceneWindow',
  'cardOrder',
  'cards',
  'layout',
  'behaviorChannels'
]);
const WINDOW_FIELDS = new Set(['x', 'y', 'width', 'height']);
const CARD_FIELDS = new Set(['id', 'title', 'body', 'x', 'y', 'width', 'height', 'visual', 'presentation', 'behavior']);
const VISUAL_PRESETS = new Set(['minimal', 'soft', 'accent', 'warning', 'critical']);
const VISUAL_INTENSITIES = new Set(['reduced', 'balanced', 'expressive']);
const VISUAL_CATEGORIES = new Set(['chat', 'channel', 'tool', 'error', 'plugin', 'model_service']);
const VISUAL_CARD_TYPES = new Set(['minimal', 'danmaku', 'popup']);
const VISUAL_CARD_SIZES = new Set(['small', 'medium', 'large']);
const VISUAL_ASPECT_RATIOS = new Set(['default', 'square', 'wide']);
const VISUAL_BACKGROUND_FITS = new Set(['fill', 'contain', 'cover']);
const VISUAL_DISMISS_MODES = new Set(['closeButton', 'anywhere', 'timeout', 'buttonOnly']);
const VISUAL_CLOSE_BUTTON_POSITIONS = new Set(['top-right', 'top-left', 'bottom-right', 'bottom-left']);
const VISUAL_BACKGROUND_COLOR = /^#[0-9a-f]{6}$/i;
const VISUAL_ASSET_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const LAYOUT_FIELDS = new Set(['mode', 'direction', 'anchor', 'spacing', 'workArea']);
const WORK_AREA_FIELDS = new Set([
  'resolution',
  'left',
  'top',
  'width',
  'height',
  'dpiScale',
  'isFallback',
  'source'
]);
const LAYOUT_MODES = new Set(['stack', 'shelf']);
const DIRECTIONS = new Set(['down', 'up', 'left', 'right']);
const ANCHORS = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const WORK_AREA_RESOLUTIONS = new Set(['provider', 'explicit']);

function sceneStateError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertJsonSafe(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw sceneStateError('RUNTIME_SCENE_STATE_INVALID', 'SceneState cannot contain non-finite numbers');
    }
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) {
    throw sceneStateError('RUNTIME_SCENE_STATE_INVALID', 'SceneState must contain only finite JSON values');
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJsonSafe(item, seen);
  } else {
    for (const [key, item] of Object.entries(value)) {
      if (typeof key !== 'string') {
        throw sceneStateError('RUNTIME_SCENE_STATE_INVALID', 'SceneState object keys must be strings');
      }
      assertJsonSafe(item, seen);
    }
  }
  seen.delete(value);
}

function cloneJson(value) {
  assertJsonSafe(value);
  return JSON.parse(JSON.stringify(value));
}

function assertExactFields(value, fields, label, code = 'RUNTIME_SCENE_STATE_INVALID') {
  if (!isRecord(value)) {
    throw sceneStateError(code, `${label} must be an object`);
  }
  const unknown = Object.keys(value).filter((field) => !fields.has(field));
  if (unknown.length > 0) {
    throw sceneStateError(code, `${label} contains unknown field(s): ${unknown.join(', ')}`, { fields: unknown });
  }
}

function validateGeometry(value, label, code) {
  assertExactFields(value, WINDOW_FIELDS, label, code);
  if (!['x', 'y', 'width', 'height'].every((field) => Number.isInteger(value[field]))) {
    throw sceneStateError(code, `${label} requires integer x, y, width, and height`);
  }
  if (value.width <= 0 || value.height <= 0 || value.width > 10000 || value.height > 10000) {
    throw sceneStateError(code, `${label} width and height are outside the supported range`);
  }
}

function validateVisualDecision(visual) {
  if (!isRecord(visual)
    || typeof visual.enabled !== 'boolean'
    || !VISUAL_PRESETS.has(visual.preset)
    || !VISUAL_INTENSITIES.has(visual.intensity)
    || (visual.category !== null && !VISUAL_CATEGORIES.has(visual.category))) {
    throw sceneStateError('RUNTIME_SCENE_STATE_CARD_INVALID', 'SceneState card visual decision is invalid');
  }
  assertExactFields(visual, new Set(['enabled', 'preset', 'intensity', 'category']), 'SceneState card visual', 'RUNTIME_SCENE_STATE_CARD_INVALID');
}

function validateNativeVisual(visual) {
  const nativeFields = new Set(['enabled', 'preset', 'intensity', 'category', 'cardType', 'behavior', 'appearance', 'interaction']);
  assertExactFields(visual, nativeFields, 'SceneState card visual', 'RUNTIME_SCENE_STATE_CARD_INVALID');
  if (typeof visual.enabled !== 'boolean'
    || !VISUAL_PRESETS.has(visual.preset)
    || !VISUAL_INTENSITIES.has(visual.intensity)
    || (visual.category !== null && !VISUAL_CATEGORIES.has(visual.category))) {
    throw sceneStateError('RUNTIME_SCENE_STATE_CARD_INVALID', 'SceneState card visual decision is invalid');
  }
  if (!VISUAL_CARD_TYPES.has(visual.cardType)) {
    throw sceneStateError('RUNTIME_SCENE_STATE_CARD_INVALID', 'SceneState card visual cardType is invalid');
  }
  if (!isRecord(visual.behavior)
    || visual.behavior.layout !== 'simple'
    || visual.behavior.boundary !== 'work-area') {
    throw sceneStateError('RUNTIME_SCENE_STATE_CARD_INVALID', 'SceneState card visual behavior is invalid');
  }
  assertExactFields(visual.behavior, new Set(['layout', 'boundary']), 'SceneState card visual behavior', 'RUNTIME_SCENE_STATE_CARD_INVALID');
  if ('interaction' in visual) {
    const interaction = visual.interaction;
    if (!isRecord(interaction)
      || !VISUAL_DISMISS_MODES.has(interaction.dismissMode)
      || !VISUAL_CLOSE_BUTTON_POSITIONS.has(interaction.closeButtonPosition)
      || !Number.isInteger(interaction.timeoutMs)
      || interaction.timeoutMs < 1000
      || interaction.timeoutMs > 60000) {
      throw sceneStateError('RUNTIME_SCENE_STATE_CARD_INVALID', 'SceneState card visual interaction is invalid');
    }
    assertExactFields(interaction, new Set(['dismissMode', 'closeButtonPosition', 'timeoutMs']), 'SceneState card visual interaction', 'RUNTIME_SCENE_STATE_CARD_INVALID');
  }
  const appearance = visual.appearance;
  if (!isRecord(appearance)
    || !VISUAL_CARD_SIZES.has(appearance.size)
    || !VISUAL_ASPECT_RATIOS.has(appearance.aspectRatio)
    || typeof appearance.backgroundColor !== 'string'
    || !VISUAL_BACKGROUND_COLOR.test(appearance.backgroundColor)
    || !VISUAL_BACKGROUND_FITS.has(appearance.backgroundFit)
    || typeof appearance.backgroundPadding !== 'number'
    || !Number.isFinite(appearance.backgroundPadding)
    || appearance.backgroundPadding < 0
    || appearance.backgroundPadding > 40
    || !Number.isInteger(appearance.borderRadius)
    || appearance.borderRadius < 0
    || appearance.borderRadius > 48
    || typeof appearance.opacity !== 'number'
    || !Number.isFinite(appearance.opacity)
    || appearance.opacity < 0
    || appearance.opacity > 1
    || ('backgroundAssetId' in appearance && (typeof appearance.backgroundAssetId !== 'string' || !VISUAL_ASSET_ID.test(appearance.backgroundAssetId)))) {
    throw sceneStateError('RUNTIME_SCENE_STATE_CARD_INVALID', 'SceneState card visual appearance is invalid');
  }
  assertExactFields(
    appearance,
    new Set(['size', 'aspectRatio', 'backgroundColor', 'backgroundAssetId', 'backgroundFit', 'backgroundPadding', 'borderRadius', 'opacity']),
    'SceneState card visual appearance',
    'RUNTIME_SCENE_STATE_CARD_INVALID'
  );
}

function validateCard(card) {
  assertExactFields(card, CARD_FIELDS, 'SceneState card', 'RUNTIME_SCENE_STATE_CARD_INVALID');
  if (!isNonEmptyString(card.id) || !isNonEmptyString(card.title) || typeof card.body !== 'string') {
    throw sceneStateError(
      'RUNTIME_SCENE_STATE_CARD_INVALID',
      'SceneState card requires non-empty id and title plus a string body'
    );
  }
  validateGeometry({
    x: card.x,
    y: card.y,
    width: card.width,
    height: card.height
  }, 'SceneState card', 'RUNTIME_SCENE_STATE_CARD_INVALID');
  if ('visual' in card) {
    if (!isRecord(card.visual)) {
      throw sceneStateError('RUNTIME_SCENE_STATE_CARD_INVALID', 'SceneState card visual must be an object');
    }
    if ('cardType' in card.visual || 'behavior' in card.visual || 'appearance' in card.visual) {
      validateNativeVisual(card.visual);
    } else {
      validateVisualDecision(card.visual);
    }
  }
  if ('presentation' in card) {
    if (!isRecord(card.presentation)
      || !['eventId', 'categoryId', 'eventTypeId', 'visualProfileId'].every((field) => isNonEmptyString(card.presentation[field]))) {
      throw sceneStateError('RUNTIME_SCENE_STATE_CARD_INVALID', 'SceneState card presentation metadata is invalid');
    }
    assertExactFields(card.presentation, new Set(['eventId', 'categoryId', 'eventTypeId', 'visualProfileId']), 'SceneState card presentation', 'RUNTIME_SCENE_STATE_CARD_INVALID');
  }
  if ('behavior' in card) {
    if (!isRecord(card.behavior)
      || !isNonEmptyString(card.behavior.behaviorProfileId)
      || !isNonEmptyString(card.behavior.behaviorChannelId)) {
      throw sceneStateError('RUNTIME_SCENE_STATE_CARD_INVALID', 'SceneState card behavior metadata is invalid');
    }
    assertExactFields(card.behavior, new Set(['behaviorProfileId', 'behaviorChannelId']), 'SceneState card behavior', 'RUNTIME_SCENE_STATE_CARD_INVALID');
  }
}

function validateBehaviorChannels(channels, cardIds) {
  if (!Array.isArray(channels)) {
    throw sceneStateError('RUNTIME_SCENE_STATE_BEHAVIOR_INVALID', 'SceneState behaviorChannels must be an array');
  }
  const seenCards = new Set();
  for (const channel of channels) {
    assertExactFields(
      channel,
      new Set(['channelId', 'profileId', 'cardOrder']),
      'SceneState behavior channel',
      'RUNTIME_SCENE_STATE_BEHAVIOR_INVALID'
    );
    if (!isNonEmptyString(channel.channelId)
      || !isNonEmptyString(channel.profileId)
      || !Array.isArray(channel.cardOrder)
      || !channel.cardOrder.every(isNonEmptyString)
      || new Set(channel.cardOrder).size !== channel.cardOrder.length) {
      throw sceneStateError('RUNTIME_SCENE_STATE_BEHAVIOR_INVALID', 'SceneState behavior channel metadata is invalid');
    }
    for (const cardId of channel.cardOrder) {
      if (!cardIds.has(cardId) || seenCards.has(cardId)) {
        throw sceneStateError(
          'RUNTIME_SCENE_STATE_BEHAVIOR_INVALID',
          'SceneState behavior channel cardOrder must reference each explicit card at most once'
        );
      }
      seenCards.add(cardId);
    }
  }
}

function validateWorkArea(workArea) {
  assertExactFields(
    workArea,
    WORK_AREA_FIELDS,
    'SceneState layout workArea',
    'RUNTIME_SCENE_STATE_WORK_AREA_INVALID'
  );
  if (!WORK_AREA_RESOLUTIONS.has(workArea.resolution)
    || !Number.isInteger(workArea.left)
    || !Number.isInteger(workArea.top)
    || !Number.isInteger(workArea.width)
    || !Number.isInteger(workArea.height)
    || workArea.width <= 0
    || workArea.height <= 0
    || typeof workArea.dpiScale !== 'number'
    || !Number.isFinite(workArea.dpiScale)
    || workArea.dpiScale <= 0
    || typeof workArea.isFallback !== 'boolean'
    || !isNonEmptyString(workArea.source)) {
    throw sceneStateError(
      'RUNTIME_SCENE_STATE_WORK_AREA_INVALID',
      'SceneState workArea has invalid resolution, geometry, DPI, fallback, or source metadata'
    );
  }
  if (workArea.resolution === 'explicit' && workArea.source !== 'explicit-override') {
    throw sceneStateError(
      'RUNTIME_SCENE_STATE_WORK_AREA_INVALID',
      'Explicit SceneState workArea must use the explicit-override source'
    );
  }
  if (workArea.resolution === 'provider' && workArea.source === 'explicit-override') {
    throw sceneStateError(
      'RUNTIME_SCENE_STATE_WORK_AREA_INVALID',
      'Provider SceneState workArea cannot use the explicit-override source'
    );
  }
}

function validateLayout(layout) {
  if (layout === null) return;
  assertExactFields(layout, LAYOUT_FIELDS, 'SceneState layout', 'RUNTIME_SCENE_STATE_LAYOUT_INVALID');
  if (!LAYOUT_MODES.has(layout.mode)
    || !DIRECTIONS.has(layout.direction)
    || !ANCHORS.has(layout.anchor)
    || !Number.isInteger(layout.spacing)
    || layout.spacing < 0) {
    throw sceneStateError(
      'RUNTIME_SCENE_STATE_LAYOUT_INVALID',
      'SceneState layout requires a valid mode, direction, anchor, and non-negative spacing'
    );
  }
  validateWorkArea(layout.workArea);
}

export function validateSceneState(state) {
  assertJsonSafe(state);
  assertExactFields(state, TOP_LEVEL_FIELDS, 'SceneState');
  if (state.sceneStateVersion !== SCENE_STATE_VERSION || state.protocolVersion !== PROTOCOL_VERSION) {
    throw sceneStateError(
      'RUNTIME_SCENE_STATE_VERSION_UNSUPPORTED',
      'SceneState version is unsupported',
      {
        sceneStateVersion: state.sceneStateVersion,
        protocolVersion: state.protocolVersion,
        supportedSceneStateVersion: SCENE_STATE_VERSION,
        supportedProtocolVersion: PROTOCOL_VERSION
      }
    );
  }
  if (typeof state.updatedAt !== 'string' || Number.isNaN(Date.parse(state.updatedAt))) {
    throw sceneStateError('RUNTIME_SCENE_STATE_INVALID', 'SceneState updatedAt must be an ISO date-time');
  }
  if (state.sceneWindow !== null) {
    validateGeometry(state.sceneWindow, 'SceneState sceneWindow', 'RUNTIME_SCENE_STATE_WINDOW_INVALID');
  }
  if (!Array.isArray(state.cardOrder) || !state.cardOrder.every(isNonEmptyString)
    || new Set(state.cardOrder).size !== state.cardOrder.length) {
    throw sceneStateError(
      'RUNTIME_SCENE_STATE_CARD_ORDER_INVALID',
      'SceneState cardOrder must contain unique non-empty card ids'
    );
  }
  if (!Array.isArray(state.cards)) {
    throw sceneStateError('RUNTIME_SCENE_STATE_CARD_INVALID', 'SceneState cards must be an array');
  }
  const cardIds = new Set();
  for (const card of state.cards) {
    validateCard(card);
    if (cardIds.has(card.id)) {
      throw sceneStateError('RUNTIME_SCENE_STATE_CARD_INVALID', `Duplicate SceneState card id: ${card.id}`);
    }
    cardIds.add(card.id);
  }
  if (cardIds.size !== state.cardOrder.length || state.cardOrder.some((id) => !cardIds.has(id))) {
    throw sceneStateError(
      'RUNTIME_SCENE_STATE_CARD_ORDER_INVALID',
      'SceneState cardOrder must contain every card id exactly once'
    );
  }
  if ('behaviorChannels' in state) validateBehaviorChannels(state.behaviorChannels, cardIds);
  validateLayout(state.layout);
  return state;
}

export function createSceneState(input = {}) {
  if (!isRecord(input)) {
    throw sceneStateError('RUNTIME_SCENE_STATE_INVALID', 'SceneState input must be an object');
  }
  assertExactFields(input, TOP_LEVEL_FIELDS, 'SceneState');
  const state = {
    sceneStateVersion: 'sceneStateVersion' in input ? input.sceneStateVersion : SCENE_STATE_VERSION,
    protocolVersion: 'protocolVersion' in input ? input.protocolVersion : PROTOCOL_VERSION,
    updatedAt: 'updatedAt' in input ? input.updatedAt : new Date().toISOString(),
    sceneWindow: input.sceneWindow,
    cardOrder: 'cardOrder' in input ? input.cardOrder : [],
    cards: 'cards' in input ? input.cards : [],
    layout: 'layout' in input ? input.layout : null,
    ...(Object.hasOwn(input, 'behaviorChannels') ? { behaviorChannels: input.behaviorChannels } : {})
  };
  validateSceneState(state);
  return cloneJson(state);
}

export function serializeSceneState(state) {
  validateSceneState(state);
  return JSON.stringify(state);
}

export function parseSceneState(serialized) {
  if (typeof serialized !== 'string') {
    throw sceneStateError('RUNTIME_SCENE_STATE_INVALID', 'Serialized SceneState must be a string');
  }
  let state;
  try {
    state = JSON.parse(serialized);
  } catch (error) {
    throw sceneStateError('RUNTIME_SCENE_STATE_INVALID', 'Serialized SceneState is not valid JSON', {
      cause: error.message
    });
  }
  return validateSceneState(state);
}
