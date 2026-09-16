import { createNotificationDisplaySettings } from '../domain/notification-display-settings.js';
import { createSidebarDisplaySettings } from '../domain/sidebar-display-settings.js';
import { createPresentationProfileFromSettings } from '../domain/event-presentation-settings.js';
import { resolveVisualSettingsPersistenceConfig } from '../domain/visual-settings-persistence-config.js';
import { resolveSoundSettingsPersistenceConfig } from '../domain/sound-settings-persistence-config.js';
import { resolveEventPresentationSettingsPersistenceConfig } from '../domain/event-presentation-settings-persistence-config.js';
import { projectVisualRegistryToEventSettings } from '../domain/visual-registry-persistence.js';
import { VisualRegistryPersistenceCoordinator } from '../domain/visual-registry-persistence-coordinator.js';

export async function restoreObservedPersistence({ create, afterRestore, onError } = {}) {
  const persistence = create?.() ?? null;
  try {
    const restored = await persistence?.restore?.();
    if (afterRestore) await afterRestore({ persistence, restored });
  } catch (error) {
    onError?.(error);
  }
  persistence?.observe?.();
  return persistence;
}

export async function stopObservedPersistence(persistence, { onError, after } = {}) {
  try {
    await persistence?.flush?.();
  } catch (error) {
    onError?.(error);
  } finally {
    persistence?.dispose?.();
    after?.();
  }
}

function applySoundSnapshot(host) {
  const snapshot = host.soundSettingsStore.getSnapshot();
  host.notificationApi.setSoundEnabled(snapshot.settings.globalSoundEnabled && snapshot.settings.workModeMuted !== true);
  host.notificationApi.setSoundProfile(snapshot.settings.profile);
  return snapshot;
}

export function createNotificationDisplaySettingsPersistence(host) {
  try {
    return host.notificationDisplaySettingsPersistenceFactory(host.ctx);
  } catch (error) {
    host.recordNotificationDiagnostic(error, 'display-settings-persistence-config');
    return null;
  }
}

export async function restoreNotificationDisplaySettings(host) {
  host.notificationDisplaySettingsPersistence = createNotificationDisplaySettingsPersistence(host);
  if (!host.notificationDisplaySettingsPersistence) return host.notificationDisplaySettings;
  try {
    const restored = await host.notificationDisplaySettingsPersistence.restore();
    if (restored) host.notificationDisplaySettings = createNotificationDisplaySettings(restored);
  } catch (error) {
    host.recordNotificationDiagnostic(error, 'display-settings-restore');
  }
  return host.notificationDisplaySettings;
}

export async function stopNotificationDisplaySettingsPersistence(host) {
  host.notificationDisplaySettingsPersistence = null;
}

export function createSidebarDisplaySettingsPersistence(host) {
  try {
    return host.sidebarDisplaySettingsPersistenceFactory(host.ctx);
  } catch (error) {
    host.recordNotificationDiagnostic(error, 'sidebar-display-settings-persistence-config');
    return null;
  }
}

export async function restoreSidebarDisplaySettings(host) {
  host.sidebarDisplaySettingsPersistence = createSidebarDisplaySettingsPersistence(host);
  if (!host.sidebarDisplaySettingsPersistence) return host.sidebarDisplaySettings;
  try {
    const restored = await host.sidebarDisplaySettingsPersistence.restore();
    if (restored) host.sidebarDisplaySettings = createSidebarDisplaySettings(restored);
  } catch (error) {
    host.recordNotificationDiagnostic(error, 'sidebar-display-settings-restore');
  }
  return host.sidebarDisplaySettings;
}

export async function stopSidebarDisplaySettingsPersistence(host) {
  host.sidebarDisplaySettingsPersistence = null;
}

export function createVisualSettingsPersistence(host) {
  try {
    const resolved = resolveVisualSettingsPersistenceConfig({
      dataDir: host.ctx.dataDir,
      config: host.ctx.config
    });
    if (!resolved.enabled) return null;
    return host.visualSettingsPersistenceFactory(host.ctx, {
      store: host.visualSettingsStore
    });
  } catch (error) {
    host.ctx.log?.warn?.(`[notification-hub-vnext] Visual settings persistence unavailable: ${error.message}`);
    return null;
  }
}

export async function restoreVisualSettings(host) {
  host.visualSettingsPersistence = await restoreObservedPersistence({
    create: () => createVisualSettingsPersistence(host),
    onError: (error) => {
      host.ctx.log?.warn?.(`[notification-hub-vnext] Visual settings restore failed: ${error.message}`);
    }
  });
  return host.visualSettingsStore.getSnapshot();
}

export async function stopVisualSettingsPersistence(host) {
  const persistence = host.visualSettingsPersistence;
  host.visualSettingsPersistence = null;
  await stopObservedPersistence(persistence, {
    onError: (error) => {
      host.ctx.log?.warn?.(`[notification-hub-vnext] Visual settings flush failed: ${error.message}`);
    }
  });
}

export function createEventPresentationSettingsPersistence(host) {
  try {
    const resolved = resolveEventPresentationSettingsPersistenceConfig({
      dataDir: host.ctx.dataDir,
      config: host.ctx.config
    });
    if (!resolved.enabled) return null;
    return host.eventPresentationSettingsPersistenceFactory(host.ctx, {
      store: host.eventPresentationSettingsStore
    });
  } catch (error) {
    host.recordNotificationDiagnostic(error, 'event-presentation-settings-persistence-config');
    return null;
  }
}

export async function restoreEventPresentationSettings(host) {
  host.eventPresentationSettingsPersistence = createEventPresentationSettingsPersistence(host);
  try {
    const restored = await host.eventPresentationSettingsPersistence?.restore?.();
    if (restored) {
      host.notificationApi.setPresentationProfile(createPresentationProfileFromSettings(restored.settings));
      host.eventPresentationSettingsStore.markApplied(host.eventPresentationSettingsStore.getSnapshot().revision);
    }
  } catch (error) {
    host.recordNotificationDiagnostic(error, 'event-presentation-settings-restore');
  }
  host.eventPresentationSettingsPersistence?.on?.('diagnostic', (diagnostic) => {
    host.recordNotificationDiagnostic(diagnostic, 'event-presentation-settings-persistence');
  });
  host.eventPresentationSettingsPersistence?.observe?.();
  return host.eventPresentationSettingsStore.getSnapshot();
}

export async function stopEventPresentationSettingsPersistence(host) {
  const persistence = host.eventPresentationSettingsPersistence;
  host.eventPresentationSettingsPersistence = null;
  await stopObservedPersistence(persistence, {
    onError: (error) => host.recordNotificationDiagnostic(error, 'event-presentation-settings-flush')
  });
}

export function createVisualRegistryPersistence(host) {
  if (host.visualRegistryPersistence) return host.visualRegistryPersistence;
  try {
    host.visualRegistryPersistence = new VisualRegistryPersistenceCoordinator({
      profileRegistry: host.visualProfileRegistry,
      bindingRegistry: host.visualBindingRegistry,
      filePath: host.visualRegistryPersistencePath,
      revision: host.visualRegistryRevision
    });
    host.visualRegistryPersistence.on('diagnostic', (diagnostic) => {
      host.recordNotificationDiagnostic(diagnostic, 'visual-registry-persistence');
    });
    return host.visualRegistryPersistence;
  } catch (error) {
    host.recordNotificationDiagnostic(error, 'visual-registry-persistence-config');
    return null;
  }
}

export async function restoreVisualRegistry(host) {
  const persistence = createVisualRegistryPersistence(host);
  if (!persistence) return null;
  try {
    const snapshot = await persistence.restore();
    if (snapshot) {
      host.visualRegistryRevision = snapshot.revision;
      if (!host.visualProfileRegistry.has('visual.default')) {
        host.visualProfileRegistry.register({
          profileId: 'visual.default',
          name: '默认视觉方案',
          profile: host.visualSettingsStore.getSnapshot().settings.profile,
          source: 'builtin'
        });
      }
      if (host.visualBindingRegistry.list().length > 0) {
        const projected = projectVisualRegistryToEventSettings({
          settings: host.eventPresentationSettingsStore.getSnapshot().settings,
          bindingRegistry: host.visualBindingRegistry,
          profileRegistry: host.visualProfileRegistry
        });
        const settingsSnapshot = host.eventPresentationSettingsStore.updateSettings({ events: projected.events });
        host.notificationApi.setPresentationProfile(createPresentationProfileFromSettings(settingsSnapshot.settings));
        host.eventPresentationSettingsStore.markApplied(settingsSnapshot.revision);
      }
    } else {
      host.queueVisualRegistryPersistence();
    }
    return snapshot;
  } catch (error) {
    host.recordNotificationDiagnostic(error, 'visual-registry-restore');
    return null;
  }
}

export async function stopVisualRegistryPersistence(host) {
  const persistence = host.visualRegistryPersistence;
  host.visualRegistryPersistence = null;
  if (!persistence) return;
  await stopObservedPersistence(persistence, {
    onError: (error) => host.recordNotificationDiagnostic(error, 'visual-registry-flush')
  });
}

export function createSoundSettingsPersistence(host) {
  try {
    const resolved = resolveSoundSettingsPersistenceConfig({
      dataDir: host.ctx.dataDir,
      config: host.ctx.config
    });
    if (!resolved.enabled) return null;
    return host.soundSettingsPersistenceFactory(host.ctx, {
      store: host.soundSettingsStore
    });
  } catch (error) {
    host.recordSoundDiagnostic(error, 'persistence-config');
    return null;
  }
}

export async function restoreSoundSettings(host) {
  host.soundSettingsPersistence = createSoundSettingsPersistence(host);
  if (!host.soundSettingsPersistence) return applySoundSnapshot(host);
  host.soundSettingsPersistence.on?.('diagnostic', (diagnostic) => host.recordSoundDiagnostic(diagnostic, 'persistence'));
  try {
    await host.soundSettingsPersistence.restore();
  } catch (error) {
    host.recordSoundDiagnostic(error, 'restore');
  }
  host.soundSettingsPersistence.observe?.();
  return applySoundSnapshot(host);
}

export async function stopSoundSettingsPersistence(host) {
  const persistence = host.soundSettingsPersistence;
  host.soundSettingsPersistence = null;
  await stopObservedPersistence(persistence, {
    onError: (error) => host.recordSoundDiagnostic(error, 'flush'),
    after: () => {
      host.soundScheduler?.clear?.();
      host.soundBackend?.dispose?.();
    }
  });
}

export async function stopHostStores(host) {
  await stopSoundSettingsPersistence(host);
  await stopVisualSettingsPersistence(host);
  await stopEventPresentationSettingsPersistence(host);
  await stopVisualRegistryPersistence(host);
  await stopNotificationDisplaySettingsPersistence(host);
  await stopSidebarDisplaySettingsPersistence(host);
}
