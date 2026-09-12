import { createBehaviorCard, createBehaviorProfile } from './notification-behavior.js';
import { createCardChannelPolicy } from './card-runtime-policy.js';
import { createBehaviorStateStore } from './notification-behavior-state.js';

function managerError(code, message, field) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field } : {};
  return error;
}

export function createBehaviorManager({ channelId, profile, policy = {}, adapter = null } = {}) {
  const normalizedProfile = createBehaviorProfile({ ...profile, channelId: channelId ?? profile?.channelId });
  const normalizedPolicy = createCardChannelPolicy({ ...policy, policyId: policy.policyId ?? channelId ?? normalizedProfile.channelId });
  const state = createBehaviorStateStore({ channelId: normalizedProfile.channelId });
  return {
    channelId: normalizedProfile.channelId,
    profile: normalizedProfile,
    policy: normalizedPolicy,
    adapter,
    enqueue(cardInput) {
      const card = createBehaviorCard({ ...cardInput, channelId: normalizedProfile.channelId });
      if (normalizedPolicy.suppression === 'aggressive' && state.isSuppressed(card)) {
        state.markSuppressed();
        return null;
      }
      if (normalizedPolicy.suppression === 'aggressive') state.rememberAggregate(card);
      const result = state.place(card, normalizedPolicy);
      if (result.state === 'visible') adapter?.enqueue?.(result.card, normalizedProfile, normalizedPolicy);
      return result.card;
    },
    removeByNotificationId(notificationId) {
      if (typeof notificationId !== 'string' || !notificationId.trim()) throw managerError('NOTIFICATION_ID_INVALID', 'notificationId must be a non-empty string', 'notificationId');
      const card = state.findByNotificationId(notificationId);
      if (!card) return { removed: null, promoted: null };
      return this.removeWithPromotion(card.cardId);
    },
    removeWithPromotion(cardId) {
      if (typeof cardId !== 'string' || !cardId.trim()) throw managerError('NOTIFICATION_BEHAVIOR_CARD_ID_INVALID', 'cardId must be a non-empty string', 'cardId');
      const result = state.remove(cardId);
      if (!result.removed) return { removed: null, promoted: null };
      if (result.visible) {
        adapter?.remove?.(result.removed, normalizedProfile);
        if (result.promoted) adapter?.enqueue?.(result.promoted, normalizedProfile, normalizedPolicy);
      }
      return { removed: result.removed, promoted: result.promoted };
    },
    remove(cardId) {
      if (typeof cardId !== 'string' || !cardId.trim()) throw managerError('NOTIFICATION_BEHAVIOR_CARD_ID_INVALID', 'cardId must be a non-empty string', 'cardId');
      const result = state.remove(cardId);
      if (!result.removed) return null;
      if (result.visible) {
        adapter?.remove?.(result.removed, normalizedProfile);
        if (result.promoted) adapter?.enqueue?.(result.promoted, normalizedProfile, normalizedPolicy);
      }
      return result.removed;
    },
    restore(snapshot) {
      state.restore(snapshot);
      return state.snapshot({ profile: normalizedProfile, policy: normalizedPolicy });
    },
    snapshot() {
      return state.snapshot({ profile: normalizedProfile, policy: normalizedPolicy });
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
  if (!snapshot || snapshot.channelId !== manager.channelId
    || !Array.isArray(snapshot.cards)
    || (snapshot.pending !== undefined && !Array.isArray(snapshot.pending))) {
    throw managerError('NOTIFICATION_BEHAVIOR_SNAPSHOT_INVALID', 'snapshot does not belong to this behavior channel', 'snapshot');
  }

  // Restore recoverable state directly. Enqueueing would replay physical side effects
  // and would apply current capacity rules to an already-valid snapshot.
  return typeof manager.restore === 'function'
    ? manager.restore(snapshot)
    : manager.snapshot();
}
