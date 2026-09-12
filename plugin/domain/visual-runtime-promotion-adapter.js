function promotionError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function createVisualRuntimePromotionAdapter({ createNativeCard, commit } = {}) {
  if (typeof createNativeCard !== 'function') {
    throw promotionError('VISUAL_RUNTIME_PROMOTION_CREATE_INVALID', 'createNativeCard must be a function');
  }
  if (typeof commit !== 'function') {
    throw promotionError('VISUAL_RUNTIME_PROMOTION_COMMIT_INVALID', 'commit must be a function');
  }
  const committed = new Set();

  return Object.freeze({
    async promote({ promotedCard, record, nativePayload } = {}) {
      const notificationId = promotedCard?.notificationId ?? record?.notificationId;
      if (typeof notificationId !== 'string' || !notificationId.trim()) {
        throw promotionError('VISUAL_RUNTIME_PROMOTION_CARD_INVALID', 'promotedCard.notificationId must be a non-empty string');
      }
      if (!record || record.notificationId !== notificationId) {
        throw promotionError('VISUAL_RUNTIME_PROMOTION_RECORD_INVALID', 'record must match promotedCard.notificationId');
      }
      if (committed.has(notificationId)) return { notificationId, decision: 'already-committed' };

      const response = await createNativeCard({ promotedCard, record, nativePayload });
      const result = await commit({ promotedCard, record, nativePayload, response });
      committed.add(notificationId);
      return { notificationId, decision: 'committed', response, result };
    },
    hasCommitted(notificationId) {
      return committed.has(notificationId);
    }
  });
}
