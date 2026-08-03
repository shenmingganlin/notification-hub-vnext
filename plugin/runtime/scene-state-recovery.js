import { validateSceneState } from './scene-state.js';

function sceneStateRecoveryError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function cardPayload(card) {
  return {
    id: card.id,
    title: card.title,
    body: card.body,
    x: card.x,
    y: card.y,
    width: card.width,
    height: card.height
  };
}

function layoutPayload(layout) {
  const { workArea } = layout;
  if (workArea.resolution === 'provider') {
    return {
      layout: layout.mode,
      direction: layout.direction,
      anchor: layout.anchor,
      spacing: layout.spacing
    };
  }
  if (workArea.left !== 0 || workArea.top !== 0 || workArea.source !== 'explicit-override') {
    throw sceneStateRecoveryError(
      'RUNTIME_SCENE_STATE_RECOVERY_WORK_AREA_UNSUPPORTED',
      'Recovery replay cannot represent a non-zero explicit work-area origin',
      { left: workArea.left, top: workArea.top, source: workArea.source }
    );
  }
  return {
    layout: layout.mode,
    direction: layout.direction,
    anchor: layout.anchor,
    spacing: layout.spacing,
    workAreaWidth: workArea.width,
    workAreaHeight: workArea.height,
    dpiScale: workArea.dpiScale
  };
}

export function sceneStateToRecoveryEntries(state) {
  validateSceneState(state);
  const cardsById = new Map(state.cards.map((card) => [card.id, card]));
  const entries = [];

  if (state.sceneWindow !== null && (state.cardOrder.length > 0 || state.layout !== null)) {
    entries.push({
      key: 'scene-window',
      type: 'scene.update',
      payload: cloneJson(state.sceneWindow)
    });
  }

  if (state.layout !== null) {
    entries.push({
      key: 'scene-layout',
      type: 'scene.set-mode',
      payload: layoutPayload(state.layout)
    });
  }

  for (const id of state.cardOrder) {
    entries.push({
      key: `scene-card-${id}`,
      type: 'scene.create',
      payload: cardPayload(cardsById.get(id))
    });
  }
  return entries;
}
