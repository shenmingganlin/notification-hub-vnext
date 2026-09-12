function backendError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

const BUILTIN_CUE_FILES = Object.freeze({
  default: 'ding.wav',
  success: 'ding.wav',
  error: 'Windows Exclamation.wav',
  critical: 'Windows Critical Stop.wav',
  'chat-incoming': 'chimes.wav',
  'channel-incoming': 'notify.wav',
  'tool-complete': 'ding.wav',
  'tool-failed': 'Windows Exclamation.wav',
  'plugin-notice': 'notify.wav',
  warning: 'Windows Exclamation.wav',
  'critical-error': 'Windows Critical Stop.wav'
});

function acceptedResult(result, durationMs = 0) {
  if (!result || result.accepted !== true || typeof result.voiceId !== 'string' || !result.voiceId) {
    throw backendError('AUDIO_ENGINE_PLAY_REJECTED', 'Audio Engine did not accept the voice', { result });
  }
  return { played: true, accepted: true, voiceId: result.voiceId, source: 'audio-engine', ...(durationMs > 0 ? { durationMs } : {}) };
}

export function createAudioEngineBackend({
  host,
  client = host?.client,
  platform = process.platform,
  preload = [],
  assetFingerprint = new Map(),
  builtinPathResolver = (cue) => {
    const filename = BUILTIN_CUE_FILES[cue];
    return filename && process.env.WINDIR ? `${process.env.WINDIR}\\Media\\${filename}` : '';
  }
} = {}) {
  if (platform !== 'win32') {
    return Object.freeze({
      async playCue() { return { played: false, deviceAvailable: false }; },
      async playFile() { return { played: false, deviceAvailable: false }; },
      async warmup() { return false; },
      async dispose() {},
      async load() {},
      getDuration() { return 0; },
      async unload() {}
    });
  }
  if (!client || typeof client.request !== 'function') {
    throw backendError('AUDIO_ENGINE_CLIENT_INVALID', 'Audio Engine backend requires a client');
  }
  const loaded = new Map(assetFingerprint);
  const inFlightLoads = new Map();
  const inFlightBySoundId = new Map();
  const durations = new Map();
  let disposed = false;

  async function ensureReady() {
    if (disposed) throw backendError('AUDIO_ENGINE_BACKEND_DISPOSED', 'Audio Engine backend is disposed');
    if (host?.getStatus && host.getStatus().state !== 'ready') {
      throw backendError('AUDIO_ENGINE_NOT_READY', 'Audio Engine is not ready');
    }
  }

  async function load(soundId, filePath, fingerprint = null) {
    await ensureReady();
    if (typeof soundId !== 'string' || !soundId || typeof filePath !== 'string' || !filePath) {
      throw backendError('AUDIO_LOAD_INPUT_INVALID', 'soundId and filePath are required');
    }
    const requestedFingerprint = fingerprint ?? filePath;
    const cacheKey = `${soundId}\u0000${requestedFingerprint}`;
    const pendingForSound = inFlightBySoundId.get(soundId);
    if (pendingForSound) {
      if (pendingForSound.fingerprint === requestedFingerprint) return pendingForSound.promise;
      await pendingForSound.promise.catch(() => {});
      return load(soundId, filePath, fingerprint);
    }
    if (loaded.get(soundId) === requestedFingerprint) return { loaded: true, cached: true };
    const pending = inFlightLoads.get(cacheKey);
    if (pending) return pending;
    const request = (async () => {
      const result = await client.request('audio.load', { soundId, path: filePath.replaceAll('\\', '/') }, { retryable: false });
      if (result?.loaded !== false) loaded.set(soundId, requestedFingerprint);
      if (Number.isFinite(result?.durationMs) && result.durationMs >= 0) durations.set(soundId, result.durationMs);
      return { loaded: result.loaded !== false, cached: false, ...result };
    })();
    inFlightLoads.set(cacheKey, request);
    inFlightBySoundId.set(soundId, { fingerprint: requestedFingerprint, promise: request });
    try {
      return await request;
    } finally {
      if (inFlightLoads.get(cacheKey) === request) inFlightLoads.delete(cacheKey);
      if (inFlightBySoundId.get(soundId)?.promise === request) inFlightBySoundId.delete(soundId);
    }
  }

  return Object.freeze({
    async playCue({ cue, volume }) {
      const soundId = `builtin.${cue}`;
      const builtinPath = builtinPathResolver(cue);
      if (!builtinPath) throw backendError('AUDIO_BUILTIN_CUE_NOT_FOUND', `Built-in cue is unavailable: ${cue}`);
      await load(soundId, builtinPath, builtinPath);
      try {
        return acceptedResult(await client.request('audio.play', { soundId, volume }, { retryable: false }), durations.get(soundId) ?? 0);
      } catch (error) {
        throw backendError(error.code ?? 'AUDIO_ENGINE_PLAY_FAILED', error.message ?? String(error), error.details ?? {});
      }
    },
    async playFile({ path, soundId, volume }) {
      await load(soundId, path);
      return acceptedResult(await client.request('audio.play', { soundId, volume }, { retryable: false }), durations.get(soundId) ?? 0);
    },
    async warmup() {
      await ensureReady();
      let loadedAll = true;
      for (const item of preload) {
        const result = await load(item.soundId, item.path, item.fingerprint);
        if (result?.loaded === false) loadedAll = false;
      }
      return loadedAll;
    },
    async unload(soundId) {
      await ensureReady();
      await client.request('audio.unload', { soundId }, { retryable: false });
      loaded.delete(soundId);
    },
    async dispose() {
      disposed = true;
      loaded.clear();
      inFlightLoads.clear();
      inFlightBySoundId.clear();
      durations.clear();
    },
    getDuration(soundId) {
      return durations.get(soundId) ?? 0;
    },
    load
  });
}

export { BUILTIN_CUE_FILES, backendError, acceptedResult };
