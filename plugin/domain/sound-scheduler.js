function schedulerError(message) {
  const error = new Error(message);
  error.code = 'SOUND_SCHEDULER_INPUT_INVALID';
  return error;
}

function result(status, extra = {}) {
  return Object.freeze({ status, ...extra });
}

function defaultSoundKey(decision) {
  const value = decision.soundId ?? decision.cue ?? null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function createSoundScheduler({
  play,
  now = () => Date.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer),
  maxQueue = 64,
  keyOf = defaultSoundKey
} = {}) {
  if (typeof play !== 'function') throw schedulerError('play must be a function');
  if (typeof now !== 'function' || typeof setTimer !== 'function' || typeof clearTimer !== 'function' || typeof keyOf !== 'function') {
    throw schedulerError('now, setTimer, clearTimer and keyOf must be functions');
  }
  // Kept as a validated compatibility option. Sound playback is eager and no longer uses a wait queue.
  if (!Number.isInteger(maxQueue) || maxQueue < 1) throw schedulerError('maxQueue must be a positive integer');

  const activeItems = new Set();
  const activeBySound = new Map();
  let lastCriticalAt = null;
  let cleared = false;

  function removeActive(item) {
    activeItems.delete(item);
    if (item.soundKey === null) return;
    const items = activeBySound.get(item.soundKey);
    if (!items) return;
    items.delete(item);
    if (items.size === 0) activeBySound.delete(item.soundKey);
  }

  function scheduleImmediate(decision, context, key) {
    const awaitPlayback = context.awaitPlayback !== false;
    const onSettled = typeof context.onSettled === 'function' ? context.onSettled : null;
    let resolve;
    const item = {
      soundKey: key,
      settled: false,
      resolve: null
    };
    const promise = new Promise((settlePromise) => { resolve = settlePromise; });
    item.resolve = (value) => {
      if (item.settled) return;
      item.settled = true;
      removeActive(item);
      resolve(value);
    };
    activeItems.add(item);
    if (key !== null) {
      if (!activeBySound.has(key)) activeBySound.set(key, new Set());
      activeBySound.get(key).add(item);
    }
    if (decision.importance === 'critical' || decision.priority === 'critical') lastCriticalAt = now();

    const settle = (value) => {
      item.resolve(value);
      try { onSettled?.(value); } catch { /* diagnostic callbacks are observational */ }
    };
    const playbackPromise = Promise.resolve()
      .then(() => play({ decision, context }))
      .then((playback) => {
        const playbackFailed = playback && typeof playback === 'object' && playback.played === false;
        const settled = result(playbackFailed ? 'failed' : 'played', playbackFailed
          ? {
              soundKey: item.soundKey,
              suppressDuplicates: decision.suppressDuplicates !== false,
              diagnostic: playback.diagnostic ?? playback.reason ?? 'SOUND_PLAYBACK_FAILED',
              playback
            }
          : {
              soundKey: item.soundKey,
              suppressDuplicates: decision.suppressDuplicates !== false,
              playback
            });
        settle(settled);
        return settled;
      })
      .catch((error) => {
        const settled = result('failed', {
          soundKey: item.soundKey,
          suppressDuplicates: decision.suppressDuplicates !== false,
          diagnostic: error?.code ? `${error.code}: ${error.message ?? String(error)}` : 'SOUND_PLAYBACK_FAILED',
          error: error instanceof Error ? error.message : String(error),
          errorCode: error?.code ?? null
        });
        settle(settled);
        return settled;
      })
      .finally(() => removeActive(item));
    if (!awaitPlayback) {
      return Promise.resolve(result('started', {
        soundKey: item.soundKey,
        suppressDuplicates: decision.suppressDuplicates !== false
      }));
    }
    return promise;
  }

  function schedule(decision, context = {}) {
    if (!decision || typeof decision !== 'object') return Promise.reject(schedulerError('decision must be an object'));
    if (!context || typeof context !== 'object') return Promise.reject(schedulerError('context must be an object'));
    if (cleared) return Promise.resolve(result('cleared'));
    if (decision.play === false) return Promise.resolve(result('skipped', { reason: decision.reason ?? 'policy-denied' }));

    const candidateKey = keyOf(decision, context);
    const key = typeof candidateKey === 'string' && candidateKey.trim() ? candidateKey.trim() : null;
    const suppressDuplicates = decision.suppressDuplicates !== false;

    if (suppressDuplicates && key !== null && activeBySound.has(key)) {
      return Promise.resolve(result('merged', {
        cue: decision.cue ?? null,
        soundId: decision.soundId ?? null,
        soundKey: key,
        suppressDuplicates: true
      }));
    }

    return scheduleImmediate(decision, context, key);
  }

  function waitForIdle({ timeoutMs = 5000, pollMs = 25 } = {}) {
    const timeout = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 5000;
    const poll = Number.isFinite(pollMs) ? Math.max(1, pollMs) : 25;
    if (activeItems.size === 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      const startedAt = now();
      const check = () => {
        if (activeItems.size === 0) { resolve(true); return; }
        if (now() - startedAt >= timeout) { resolve(false); return; }
        setTimer(check, poll);
      };
      setTimer(check, poll);
    });
  }

  function clear() {
    cleared = true;
    for (const item of [...activeItems]) item.resolve(result('cleared', { reason: 'scheduler-cleared' }));
    lastCriticalAt = null;
  }

  function getStatus() {
    return Object.freeze({ queued: 0, playing: activeItems.size > 0, lastCriticalAt });
  }

  return Object.freeze({ schedule, clear, getStatus, waitForIdle });
}
