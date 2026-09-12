import { createBehaviorCard } from './notification-behavior.js';

function stateError(code, message, field) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field } : {};
  return error;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function cardAggregateKey(card) {
  return `${card.eventId}:${card.payload?.deduplicationKey ?? ''}`;
}

function validateChannelId(channelId) {
  if (typeof channelId !== 'string' || !channelId.trim()) {
    throw stateError('NOTIFICATION_BEHAVIOR_CHANNEL_ID_INVALID', 'channelId must be a non-empty string', 'channelId');
  }
  return channelId.trim();
}

export function createBehaviorStateStore({ channelId } = {}) {
  const normalizedChannelId = validateChannelId(channelId);
  const cards = new Map();
  const pending = new Map();
  const aggregateKeys = new Set();
  let suppressedCount = 0;

  function normalizeCard(card) {
    return createBehaviorCard({ ...card, channelId: normalizedChannelId });
  }

  function assertUnique(cardsToCheck, pendingToCheck) {
    const ids = [...cardsToCheck, ...pendingToCheck].map((card) => card.cardId);
    if (new Set(ids).size !== ids.length) {
      throw stateError('NOTIFICATION_BEHAVIOR_SNAPSHOT_INVALID', 'snapshot contains duplicate card ids', 'snapshot');
    }
  }

  return {
    get channelId() {
      return normalizedChannelId;
    },
    get cards() {
      return cards;
    },
    get pending() {
      return pending;
    },
    get suppressedCount() {
      return suppressedCount;
    },
    findByNotificationId(notificationId) {
      return [...cards.values(), ...pending.values()].find((card) => card.notificationId === notificationId) ?? null;
    },
    isSuppressed(card) {
      return aggregateKeys.has(cardAggregateKey(card));
    },
    rememberAggregate(card) {
      aggregateKeys.add(cardAggregateKey(card));
    },
    markSuppressed() {
      suppressedCount += 1;
    },
    place(card, { maxVisible, overflow }) {
      const normalizedCard = normalizeCard(card);
      if (cards.size >= maxVisible) {
        if (overflow === 'drop-oldest') {
          const oldest = cards.keys().next().value;
          if (oldest) {
            cards.delete(oldest);
            suppressedCount += 1;
          }
        } else if (overflow === 'aggregate' || overflow === 'queue') {
          pending.set(normalizedCard.cardId, normalizedCard);
          return { card: normalizedCard, state: 'pending' };
        }
      }
      cards.set(normalizedCard.cardId, normalizedCard);
      return { card: normalizedCard, state: 'visible' };
    },
    remove(cardId) {
      const removed = cards.get(cardId) ?? pending.get(cardId) ?? null;
      if (!removed) return { removed: null, promoted: null, visible: false };
      if (cards.has(cardId)) {
        cards.delete(cardId);
        const next = pending.values().next().value ?? null;
        if (next) {
          pending.delete(next.cardId);
          cards.set(next.cardId, next);
        }
        return { removed, promoted: next, visible: true };
      }
      pending.delete(cardId);
      return { removed, promoted: null, visible: false };
    },
    restore(snapshot) {
      if (!snapshot || !Array.isArray(snapshot.cards) || (snapshot.pending !== undefined && !Array.isArray(snapshot.pending))) {
        throw stateError('NOTIFICATION_BEHAVIOR_SNAPSHOT_INVALID', 'snapshot does not contain valid card collections', 'snapshot');
      }
      const restoredCards = snapshot.cards.map(normalizeCard);
      const restoredPending = (snapshot.pending ?? []).map(normalizeCard);
      assertUnique(restoredCards, restoredPending);
      cards.clear();
      pending.clear();
      aggregateKeys.clear();
      restoredCards.forEach((card) => { cards.set(card.cardId, card); aggregateKeys.add(cardAggregateKey(card)); });
      restoredPending.forEach((card) => { pending.set(card.cardId, card); aggregateKeys.add(cardAggregateKey(card)); });
      return this.snapshot();
    },
    snapshot({ profile = null, policy = null } = {}) {
      return freezeDeep({
        version: 'v1',
        channelId: normalizedChannelId,
        ...(profile ? { profile: clone(profile) } : {}),
        ...(policy ? { policy: clone(policy) } : {}),
        cards: [...cards.values()].map(clone),
        pending: [...pending.values()].map(clone),
        metrics: {
          channelCount: 1,
          activeCardCount: cards.size + pending.size,
          visibleCardCount: cards.size,
          queuedCardCount: pending.size,
          suppressedCardCount: suppressedCount
        }
      });
    }
  };
}
