function queueError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function createVisualRuntimePromotionQueue({ execute } = {}) {
  if (typeof execute !== 'function') throw queueError('VISUAL_RUNTIME_PROMOTION_EXECUTOR_INVALID', 'execute must be a function');
  const pending = new Map();
  let draining = null;
  let closed = false;

  async function drain() {
    if (draining) return draining;
    draining = (async () => {
      while (!closed && pending.size > 0) {
        const [notificationId, entry] = pending.entries().next().value;
        try {
          const result = await execute(entry.input);
          pending.delete(notificationId);
          entry.resolve(result);
        } catch (error) {
          entry.lastError = error;
          break;
        }
      }
    })().finally(() => {
      draining = null;
    });
    return draining;
  }

  return {
    enqueue(input = {}) {
      const notificationId = typeof input?.record?.notificationId === 'string'
        ? input.record.notificationId.trim()
        : '';
      if (!notificationId) return Promise.reject(queueError('VISUAL_RUNTIME_PROMOTION_ID_INVALID', 'input.record.notificationId must be a non-empty string'));
      if (closed) return Promise.reject(queueError('VISUAL_RUNTIME_PROMOTION_QUEUE_CLOSED', 'promotion queue is closed'));
      const existing = pending.get(notificationId);
      if (existing) return existing.promise;
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      pending.set(notificationId, { input, promise, resolve, reject });
      void drain();
      return promise;
    },
    async retry() {
      if (closed) return;
      if (draining) await draining;
      return drain();
    },
    close(error = queueError('VISUAL_RUNTIME_PROMOTION_QUEUE_CLOSED', 'promotion queue closed')) {
      closed = true;
      for (const entry of pending.values()) entry.reject(error);
      pending.clear();
    },
    get size() { return pending.size; },
    get active() { return Boolean(draining); }
  };
}
