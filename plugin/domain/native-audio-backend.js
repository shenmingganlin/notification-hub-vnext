import { NativeAudioClient } from './native-audio-client.js';

function backendError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function createNativeAudioBackend({
  platform = process.platform,
  client = null,
  clientFactory = (options) => new NativeAudioClient(options),
  executablePath,
  context,
  clientOptions = {}
} = {}) {
  if (platform !== 'win32') {
    return Object.freeze({
      async playCue() { return { played: false, deviceAvailable: false }; },
      async playFile() { return { played: false, deviceAvailable: false }; },
      async warmup() { return false; },
      dispose() {}
    });
  }
  const audioClient = client ?? clientFactory({ executablePath, context, ...clientOptions });
  const loaded = new Set();
  return Object.freeze({
    async playCue({ cue, volume }) {
      const result = await audioClient.cue({ cue, volume });
      return { played: result.accepted === true || result.rendered === true, source: 'native-audio', ...result };
    },
    async playFile({ path, soundId, volume }) {
      if (typeof path !== 'string' || !path || typeof soundId !== 'string' || !soundId) {
        throw backendError('AUDIO_FILE_INPUT_INVALID', 'Native audio file playback requires path and soundId');
      }
      if (!loaded.has(soundId)) {
        await audioClient.load({ soundId, filePath: path });
        loaded.add(soundId);
      }
      const result = await audioClient.play({ soundId, volume });
      return { played: result.accepted === true || result.rendered === true, source: 'native-audio', ...result };
    },
    async warmup() {
      await audioClient.start();
      return true;
    },
    async unload(soundId) {
      await audioClient.unload(soundId);
      loaded.delete(soundId);
    },
    async dispose() {
      loaded.clear();
      await audioClient.dispose();
    }
  });
}
