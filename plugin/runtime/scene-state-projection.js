import { createSceneState } from './scene-state.js';

function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function text(value, fallback) { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }

export function projectRuntimeToSceneState(registry, { updatedAt = new Date().toISOString(), workArea = {} } = {}) {
  if (!registry || typeof registry.forEach !== 'function') throw Object.assign(new Error('registry is required'), { code: 'VISUAL_SCENE_PROJECTION_INVALID' });
  const cards = [];
  const channels = [];
  const normalizedWorkArea = {
    resolution: workArea.resolution ?? (workArea.source === 'explicit-override' ? 'explicit' : 'provider'),
    left: Number.isInteger(workArea.left) ? workArea.left : 0,
    top: Number.isInteger(workArea.top) ? workArea.top : 0,
    width: Number.isInteger(workArea.width) && workArea.width > 0 ? workArea.width : 1280,
    height: Number.isInteger(workArea.height) && workArea.height > 0 ? workArea.height : 720,
    dpiScale: typeof workArea.dpiScale === 'number' && workArea.dpiScale > 0 ? workArea.dpiScale : 1,
    isFallback: workArea.isFallback ?? false,
    source: workArea.source === 'explicit-override' ? 'explicit-override' : 'provider'
  };
  registry.forEach((channel) => {
    const snapshot = channel.snapshot();
    const cardOrder = [];
    for (const card of snapshot.cards.filter((entry) => entry.state === 'active')) {
      const index = cards.length;
      cardOrder.push(card.cardId);
      cards.push({
        id: card.cardId,
        title: text(card.cardId, 'Notification'),
        body: '',
        x: normalizedWorkArea.left,
        y: normalizedWorkArea.top + index * 8,
        width: 320,
        height: 96,
        visual: { enabled: true, preset: 'minimal', intensity: 'balanced', category: null },
        presentation: {
          eventId: 'visual.runtime.card',
          categoryId: 'runtime',
          eventTypeId: 'card.active',
          visualProfileId: 'visual.default'
        },
        behavior: { behaviorProfileId: snapshot.behaviorId, behaviorChannelId: snapshot.channelId }
      });
    }
    channels.push({ channelId: snapshot.channelId, profileId: snapshot.behaviorId, cardOrder });
  });
  return freeze(createSceneState({
    updatedAt,
    sceneWindow: null,
    cardOrder: cards.map((card) => card.id),
    cards,
    layout: { mode: 'stack', direction: 'down', anchor: 'top-left', spacing: 8, workArea: normalizedWorkArea },
    behaviorChannels: channels
  }));
}
