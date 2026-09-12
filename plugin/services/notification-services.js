import path from 'node:path';

import { NotificationApi } from '../api/notification-api.js';
import { createWindowsAudioBackend, playNotificationSound, resolveSoundPlaybackKey } from '../domain/audio-adapter.js';
import { createSoundAssetRegistry } from '../domain/sound-asset-registry.js';
import { resolveGlobalSoundConfig } from '../domain/sound-config.js';
import { createSoundScheduler } from '../domain/sound-scheduler.js';
import { SoundSettingsStore } from '../domain/sound-settings-store.js';
import { NotificationStore } from '../domain/notification-store.js';
import { SettingsStore } from '../domain/settings-store.js';
import { resolveSoundAssetStoragePaths } from '../domain/sound-asset-storage-path.js';

export function createNotificationServices({
  ctx = {},
  soundBackendFactory = (options) => createWindowsAudioBackend(options),
  soundSchedulerFactory = createSoundScheduler,
  onSoundDiagnostic = null
} = {}) {
  const notificationStore = new NotificationStore();
  const settingsStore = new SettingsStore();
  const soundSettingsStore = new SoundSettingsStore();
  const soundAssetRegistry = createSoundAssetRegistry();
  const soundAssetStorage = resolveSoundAssetStoragePaths({
    dataDir: ctx?.dataDir,
    persistentDataDir: ctx?.soundAssetDataDir,
    userDataDir: ctx?.userDataDir
  });
  const soundAssetRoot = soundAssetStorage.assetRoot;
  const soundConfig = resolveGlobalSoundConfig({ config: ctx?.config });
  let activeSoundBackend = soundBackendFactory({
    platform: process.platform,
    executablePath: path.resolve(ctx?.pluginDir || process.cwd(), 'runtime', 'notification-hub-audio-engine.exe'),
    context: ctx
  });
  const setSoundBackend = (backend) => {
    if (!backend || typeof backend.playCue !== 'function' || typeof backend.playFile !== 'function') {
      throw new TypeError('sound backend must provide playCue and playFile');
    }
    activeSoundBackend = backend;
    return activeSoundBackend;
  };
  const soundScheduler = soundSchedulerFactory({
    keyOf: resolveSoundPlaybackKey,
    durationOf: (decision) => {
      const soundId = typeof decision?.soundId === 'string' && decision.soundId.trim()
        ? decision.soundId.trim()
        : (typeof decision?.cue === 'string' && decision.cue.trim() ? `builtin.${decision.cue.trim()}` : null);
      return soundId ? (soundAssetRegistry.get(soundId)?.durationMs ?? 0) : 0;
    },
    play: ({ decision }) => playNotificationSound({
      decision,
      backend: activeSoundBackend,
      options: { assetRegistry: soundAssetRegistry, soundAssetRoot }
    })
  });
  const notificationApi = new NotificationApi({
    store: notificationStore,
    soundConfig,
    soundProfile: soundSettingsStore.getSnapshot().settings.profile,
    // Keep legacy sound behavior until an event-presentation snapshot is restored.
    presentationProfile: null,
    soundScheduler,
    onSoundDiagnostic
  });

  return {
    notificationStore,
    settingsStore,
    soundSettingsStore,
    soundAssetRegistry,
    soundAssetRoot,
    soundAssetStorage,
    soundBackend: activeSoundBackend,
    setSoundBackend,
    soundScheduler,
    notificationApi,
    soundConfig
  };
}
