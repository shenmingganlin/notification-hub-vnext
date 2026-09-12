export function createRuntimeClock({ registry, onExpired = null } = {}) {
  if (!registry || typeof registry.forEach !== 'function') throw Object.assign(new Error('registry is required'), { code: 'VISUAL_RUNTIME_CLOCK_INVALID' });
  let lastNow = null;
  return {
    tick(now) {
      if (!Number.isInteger(now) || now < 0) throw Object.assign(new Error('now must be a non-negative integer'), { code: 'VISUAL_RUNTIME_CLOCK_TIME_INVALID' });
      if (lastNow !== null && now < lastNow) throw Object.assign(new Error('clock cannot move backwards'), { code: 'VISUAL_RUNTIME_CLOCK_TIME_INVALID' });
      lastNow = now;
      const expired = [];
      const reclaimed = [];
      registry.forEach((channel) => {
        const snapshot = channel.snapshot();
        for (const card of snapshot.cards) {
          if (card.state !== 'active' || card.startedAt === null || now - card.startedAt < card.durationMs) continue;
          channel.close(card.cardId, 'timeout', now);
          expired.push(card.cardId);
          channel.reclaim(card.cardId, now);
          reclaimed.push(card.cardId);
          onExpired?.({ cardId: card.cardId, channelId: snapshot.channelId, at: now });
        }
      });
      return { expired, reclaimed };
    },
    now() { return lastNow; }
  };
}
