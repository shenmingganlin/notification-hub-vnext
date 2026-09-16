const MAX_ENTRIES = 50;

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function boundedIds(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).slice(0, MAX_ENTRIES)
    : [];
}

function projectCard(card = {}) {
  const presentation = card.presentation ?? {};
  const behavior = card.behavior ?? {};
  return {
    id: textOrNull(card.id),
    x: numberOrNull(card.x),
    y: numberOrNull(card.y),
    width: numberOrNull(card.width),
    height: numberOrNull(card.height),
    eventId: textOrNull(presentation.eventId),
    categoryId: textOrNull(presentation.categoryId),
    eventTypeId: textOrNull(presentation.eventTypeId),
    visualProfileId: textOrNull(presentation.visualProfileId),
    behaviorProfileId: textOrNull(behavior.behaviorProfileId),
    behaviorChannelId: textOrNull(behavior.behaviorChannelId),
    flight: textOrNull(behavior.flight ?? behavior.behaviorProfileId),
    flightChannelId: textOrNull(behavior.flightChannelId ?? behavior.behaviorChannelId)
  };
}

function projectChannel(channel = {}) {
  return {
    channelId: textOrNull(channel.channelId),
    profileId: textOrNull(channel.profileId),
    cardOrder: boundedIds(channel.cardOrder)
  };
}

export function createSceneBehaviorDiagnostics(snapshot = null) {
  const cards = Array.isArray(snapshot?.cards) ? snapshot.cards : [];
  const channels = Array.isArray(snapshot?.flightChannels)
    ? snapshot.flightChannels
    : (Array.isArray(snapshot?.behaviorChannels) ? snapshot.behaviorChannels : []);
  const cardOrder = Array.isArray(snapshot?.cardOrder) ? snapshot.cardOrder : [];
  const projectedCards = cards.slice(0, MAX_ENTRIES).map(projectCard);
  const projectedChannels = channels.slice(0, MAX_ENTRIES).map(projectChannel);
  const truncated = cards.length > MAX_ENTRIES
    || channels.length > MAX_ENTRIES
    || cardOrder.length > MAX_ENTRIES
    || channels.some((channel) => Array.isArray(channel?.cardOrder) && channel.cardOrder.length > MAX_ENTRIES);
  return Object.freeze({
    version: 'v1',
    cardCount: cards.length,
    channelCount: channels.length,
    truncated,
    cards: Object.freeze(projectedCards.map((card) => Object.freeze(card))),
    channels: Object.freeze(projectedChannels.map((channel) => Object.freeze(channel)))
  });
}

export const SCENE_BEHAVIOR_DIAGNOSTICS_MAX_ENTRIES = MAX_ENTRIES;
