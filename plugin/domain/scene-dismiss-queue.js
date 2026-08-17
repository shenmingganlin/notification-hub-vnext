function queueError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function createSceneDismissQueue({ execute } = {}) {
  if (typeof execute !== 'function') throw queueError('SCENE_DISMISS_QUEUE_EXECUTOR_INVALID', 'execute must be a function');
  const queue = [];
  const pending = new Map();
  let drainPromise = null;
  let closed = false;

  async function drain() {
    if (drainPromise) return drainPromise;
    drainPromise = (async () => {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry || !pending.has(entry.notificationId)) continue;
        try {
          entry.resolve(await execute(entry.job));
        } catch (error) {
          entry.reject(error);
        } finally {
          pending.delete(entry.notificationId);
        }
      }
    })().finally(() => {
      drainPromise = null;
      if (queue.length > 0 && !closed) void drain();
    });
    return drainPromise;
  }

  return {
    enqueue(job = {}) {
      const notificationId = typeof job.notificationId === 'string' ? job.notificationId.trim() : '';
      if (!notificationId) throw queueError('SCENE_DISMISS_NOTIFICATION_ID_INVALID', 'notificationId must be a non-empty string');
      if (closed) return Promise.reject(queueError('SCENE_DISMISS_QUEUE_CLOSED', 'Scene dismiss queue is closed'));
      const existing = pending.get(notificationId);
      if (existing) return existing;
      let resolvePromise;
      let rejectPromise;
      const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
      pending.set(notificationId, promise);
      queue.push({ notificationId, job, resolve: resolvePromise, reject: rejectPromise });
      void drain();
      return promise;
    },
    clearPending(error = queueError('SCENE_DISMISS_QUEUE_CLEARED', 'Pending Scene dismiss requests were cleared')) {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry) continue;
        pending.delete(entry.notificationId);
        entry.reject(error);
      }
    },
    close(error = queueError('SCENE_DISMISS_QUEUE_CLOSED', 'Scene dismiss queue is closed')) {
      closed = true;
      this.clearPending(error);
    },
    get size() { return queue.length; },
    get active() { return Boolean(drainPromise); }
  };
}
