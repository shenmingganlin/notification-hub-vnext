import { PROTOCOL_VERSION } from '../protocol/index.js';

export const SCENE_STATE_VERSION = 1;

const TOP_LEVEL_FIELDS = new Set([
  'sceneStateVersion',
  'protocolVersion',
  'updatedAt',
  'sceneWindow',
  'cardOrder',
  'cards',
  'layout'
]);
const WINDOW_FIELDS = new Set(['x', 'y', 'width', 'height']);
const CARD_FIELDS = new Set(['id', 'title', 'body', 'x', 'y', 'width', 'height']);
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
  validateGeometry(state.sceneWindow, 'SceneState sceneWindow', 'RUNTIME_SCENE_STATE_WINDOW_INVALID');
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
    layout: 'layout' in input ? input.layout : null
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
