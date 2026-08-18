function backendError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function acceptedResult(result) {
  if (!result || result.accepted !== true || typeof result.voiceId !== 'string' || !result.voiceId) {
    throw backendError('AUDIO_ENGINE_PLAY_REJECTED', 'Audio Engine did not accept the voice', { result });
  }
  return { played: true, accepted: true, voiceId: result.voiceId, source: 'audio-engine' };
}

export function createAudioEngineBackend({
  host,
  client = host?.client,
  platform = process.platform,
  preload = [],
  assetFingerprint = new Map()
} = {}) {
  if (platform !== 'win32') {
    return Object.freeze({
      async playCue() { return { played: false, deviceAvailable: false }; },
      async playFile() { return { played: false, deviceAvailable: false }; },
      async warmup() { return false; },
      async dispose() {},
      async load() {},
      async unload() {}
    });
  }
  if (!client || typeof client.request !== 'function') {
    throw backendError('AUDIO_ENGINE_CLIENT_INVALID', 'Audio Engine backend requires a client');
  }
  const loaded = new Map(assetFingerprint);
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
    if (loaded.get(soundId) === (fingerprint ?? filePath)) return { loaded: true, cached: true };
    const result = await client.request('audio.load', { soundId, path: filePath.replaceAll('\\', '/') }, { retryable: false });
    loaded.set(soundId, fingerprint ?? filePath);
    return { loaded: result.loaded !== false, cached: false, ...result };
  }

  return Object.freeze({
    async playCue({ cue, volume }) {
      await ensureReady();
      const soundId = `builtin.${cue}`;
      try {
        return acceptedResult(await client.request('audio.play', { soundId, volume }, { retryable: false }));
      } catch (error) {
        throw backendError(error.code ?? 'AUDIO_ENGINE_PLAY_FAILED', error.message ?? String(error), error.details ?? {});
      }
    },
    async playFile({ path, soundId, volume }) {
      await load(soundId, path);
      return acceptedResult(await client.request('audio.play', { soundId, volume }, { retryable: false }));
    },
    async warmup() {
      await ensureReady();
      for (const item of preload) await load(item.soundId, item.path, item.fingerprint);
      return true;
    },
    async unload(soundId) {
      await ensureReady();
      await client.request('audio.unload', { soundId }, { retryable: false });
      loaded.delete(soundId);
    },
    async dispose() {
      disposed = true;
      loaded.clear();
    },
    load
  });
}

export { backendError, acceptedResult };
