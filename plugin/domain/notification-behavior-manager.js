import { createBehaviorCard, createBehaviorProfile } from './notification-behavior.js';
import { createCardChannelPolicy } from './card-runtime-policy.js';

function managerError(code, message, field) {
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

export function createBehaviorManager({ channelId, profile, policy = {}, adapter = null } = {}) {
  const normalizedProfile = createBehaviorProfile({ ...profile, channelId: channelId ?? profile?.channelId });
  const normalizedPolicy = createCardChannelPolicy({ ...policy, policyId: policy.policyId ?? channelId ?? normalizedProfile.channelId });
  const cards = new Map();
  const pending = new Map();
  const aggregateKeys = new Set();
  let suppressedCount = 0;
  let queuedCount = 0;
  return {
    channelId: normalizedProfile.channelId,
    profile: normalizedProfile,
    policy: normalizedPolicy,
    adapter,
    cards,
    enqueue(cardInput) {
      const card = createBehaviorCard({ ...cardInput, channelId: normalizedProfile.channelId });
      const aggregateKey = `${card.eventId}:${card.payload?.deduplicationKey ?? ''}`;
      if (normalizedPolicy.suppression === 'aggressive' && aggregateKeys.has(aggregateKey)) {
        suppressedCount += 1;
        return null;
      }
      if (normalizedPolicy.suppression === 'aggressive') aggregateKeys.add(aggregateKey);
      if (normalizedPolicy.suppression !== 'off' && cards.size >= normalizedPolicy.maxVisible) {
        if (normalizedPolicy.overflow === 'drop-oldest') {
          const oldest = cards.keys().next().value;
          if (oldest) { cards.delete(oldest); suppressedCount += 1; }
        } else if (normalizedPolicy.overflow === 'aggregate' || normalizedPolicy.overflow === 'queue') {
          pending.set(card.cardId, card);
          queuedCount = pending.size;
          return card;
        }
      }
      cards.set(card.cardId, card);
      adapter?.enqueue?.(card, normalizedProfile, normalizedPolicy);
      return card;
    },
    remove(cardId) {
      if (typeof cardId !== 'string' || !cardId.trim()) throw managerError('NOTIFICATION_BEHAVIOR_CARD_ID_INVALID', 'cardId must be a non-empty string', 'cardId');
      const card = cards.get(cardId) ?? pending.get(cardId) ?? null;
      if (!card) return null;
      if (cards.has(cardId)) {
        cards.delete(cardId);
        adapter?.remove?.(card, normalizedProfile);
        const next = pending.values().next().value;
        if (next) {
          pending.delete(next.cardId);
          cards.set(next.cardId, next);
          queuedCount = pending.size;
          adapter?.enqueue?.(next, normalizedProfile, normalizedPolicy);
        }
      } else {
        pending.delete(cardId);
        queuedCount = pending.size;
      }
      return card;
    },
    snapshot() {
      return freezeDeep({
        version: 'v1',
        channelId: normalizedProfile.channelId,
        profile: clone(normalizedProfile),
        policy: clone(normalizedPolicy),
        cards: [...cards.values()].map(clone),
        pending: [...pending.values()].map(clone),
        metrics: { channelCount: 1, activeCardCount: cards.size + pending.size, visibleCardCount: cards.size, queuedCardCount: pending.size, suppressedCardCount: suppressedCount }
      });
    }
  };
}

export function enqueueBehaviorCard(manager, card) {
  if (!manager || typeof manager.enqueue !== 'function') throw managerError('NOTIFICATION_BEHAVIOR_MANAGER_INVALID', 'manager must expose enqueue()', 'manager');
  return manager.enqueue(card);
}

export function removeBehaviorCard(manager, cardId) {
  if (!manager || typeof manager.remove !== 'function') throw managerError('NOTIFICATION_BEHAVIOR_MANAGER_INVALID', 'manager must expose remove()', 'manager');
  return manager.remove(cardId);
}

export function snapshotBehaviorManager(manager) {
  if (!manager || typeof manager.snapshot !== 'function') throw managerError('NOTIFICATION_BEHAVIOR_MANAGER_INVALID', 'manager must expose snapshot()', 'manager');
  return manager.snapshot();
}

export function restoreBehaviorManager(manager, snapshot) {
  if (!manager || typeof manager.enqueue !== 'function') throw managerError('NOTIFICATION_BEHAVIOR_MANAGER_INVALID', 'manager must expose enqueue()', 'manager');
  if (!snapshot || snapshot.channelId !== manager.channelId || !Array.isArray(snapshot.cards)) {
    throw managerError('NOTIFICATION_BEHAVIOR_SNAPSHOT_INVALID', 'snapshot does not belong to this behavior channel', 'snapshot');
  }
  for (const card of snapshot.cards) manager.enqueue(card);
  return manager.snapshot();
}
