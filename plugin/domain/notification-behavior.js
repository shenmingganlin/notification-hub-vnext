import { resolveFlightId } from './channel-charter.js';
import { createCardLife } from './card-life.js';
import { lexiconError } from './lexicon-error.js';

/** @deprecated 用 FLIGHT_IDS。含 danmaku 只为旧事件巷校验。 */
export const BEHAVIOR_MODES = Object.freeze(['stack', 'danmaku', 'ticker', 'popup']);
export const FLIGHT_MODES = BEHAVIOR_MODES;

function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function text(field, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw lexiconError('NOTIFICATION_BEHAVIOR_FIELD_INVALID', `${field} must be a non-empty string`, { field });
  }
  return value.trim();
}

export function createFlightProfile(input = {}) {
  if (!plain(input)) {
    throw lexiconError('NOTIFICATION_BEHAVIOR_PROFILE_INVALID', 'flight profile must be a plain object', { field: 'profile' });
  }
  const flight = resolveFlightId(input.flight ?? input.mode ?? 'stack', 'flight');
  const channelId = text('channelId', input.channelId ?? `${flight}.main`);
  const life = createCardLife({
    durationMs: input.life?.durationMs ?? input.durationMs
  });
  const maxVisible = input.maxVisible ?? 8;
  if (!Number.isInteger(maxVisible) || maxVisible < 1 || maxVisible > 100) {
    throw lexiconError('NOTIFICATION_BEHAVIOR_MAX_VISIBLE_INVALID', 'maxVisible must be between 1 and 100', {
      field: 'maxVisible',
      expected: 'integer 1..100',
      actual: input.maxVisible
    });
  }
  return freezeDeep({
    profileId: input.profileId ?? flight,
    flight,
    mode: flight,
    channelId,
    life,
    durationMs: life.durationMs,
    maxVisible,
    aggregation: input.aggregation ?? 'none'
  });
}

/** @deprecated 用 createFlightProfile。返回值仍带 mode / durationMs 旧键。 */
export const createBehaviorProfile = createFlightProfile;

export function createBehaviorCard(input = {}) {
  if (!plain(input)) {
    throw lexiconError('NOTIFICATION_BEHAVIOR_CARD_INVALID', 'behavior card must be a plain object', { field: 'card' });
  }
  return freezeDeep({
    cardId: text('cardId', input.cardId),
    notificationId: text('notificationId', input.notificationId ?? input.cardId),
    eventId: text('eventId', input.eventId),
    channelId: text('channelId', input.channelId),
    visualProfileId: text('visualProfileId', input.visualProfileId ?? 'visual.default'),
    createdAt: input.createdAt ?? new Date().toISOString(),
    payload: clone(input.payload ?? {})
  });
}
