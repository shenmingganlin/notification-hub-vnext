import assert from 'node:assert/strict';
import test from 'node:test';

import { createNotificationServices } from '../../plugin/services/notification-services.js';

function createContext() {
  return {
    pluginDir: 'C:\\Hana\\plugins\\notification-hub-vnext',
    dataDir: 'C:\\Hana\\data\\notification-hub-vnext',
    config: { globalSoundEnabled: false }
  };
}

test('createNotificationServices returns the notification service composition', () => {
  const services = createNotificationServices({ ctx: createContext(), soundBackendFactory: () => ({}) });

  assert.deepEqual(Object.keys(services).sort(), [
    'notificationApi',
    'notificationStore',
    'setSoundBackend',
    'settingsStore',
    'soundAssetRegistry',
    'soundAssetRoot',
    'soundAssetStorage',
    'soundBackend',
    'soundConfig',
    'soundScheduler',
    'soundSettingsStore'
  ]);
  assert.equal(typeof services.notificationStore.add, 'function');
  assert.equal(typeof services.settingsStore.getSnapshot, 'function');
  assert.equal(typeof services.soundSettingsStore.getSnapshot, 'function');
  assert.equal(typeof services.soundAssetRegistry.get, 'function');
  assert.equal(typeof services.soundScheduler.schedule, 'function');
  assert.equal(typeof services.notificationApi.ingestEvent, 'function');
  assert.equal(services.soundConfig.enabled, false);
});

test('backend and scheduler factories receive the existing context and options', () => {
  const ctx = createContext();
  let backendOptions;
  let schedulerOptions;
  const backend = { playCue() {} };
  const scheduler = { schedule() { return Promise.resolve({ status: 'skipped' }); } };

  const services = createNotificationServices({
    ctx,
    soundBackendFactory: (options) => {
      backendOptions = options;
      return backend;
    },
    soundSchedulerFactory: (options) => {
      schedulerOptions = options;
      return scheduler;
    }
  });

  assert.equal(backendOptions.context, ctx);
  assert.equal(backendOptions.platform, process.platform);
  assert.equal(backendOptions.executablePath, 'C:\\Hana\\plugins\\notification-hub-vnext\\runtime\\notification-hub-audio-engine.exe');
  assert.equal(typeof schedulerOptions.keyOf, 'function');
  assert.equal(typeof schedulerOptions.durationOf, 'function');
  assert.equal(typeof schedulerOptions.play, 'function');
  assert.equal(schedulerOptions.durationOf({ soundId: 'builtin.default' }), 160);
  assert.equal(services.soundBackend, backend);
  assert.equal(services.soundScheduler, scheduler);
});

test('sound scheduler follows a backend activated after service composition', async () => {
  const calls = [];
  const initialBackend = { async playCue() { calls.push('initial'); return { played: true }; }, async playFile() { return { played: true }; } };
  const activeBackend = { async playCue() { calls.push('active'); return { played: true }; }, async playFile() { return { played: true }; } };
  let schedulerOptions;
  const services = createNotificationServices({
    ctx: { ...createContext(), config: { globalSoundEnabled: true } },
    soundBackendFactory: () => initialBackend,
    soundSchedulerFactory: (options) => {
      schedulerOptions = options;
      return { schedule() { return Promise.resolve({ status: 'played' }); } };
    }
  });

  services.setSoundBackend(activeBackend);
  await schedulerOptions.play({ decision: { play: true, cue: 'default', volume: 1 } });
  assert.deepEqual(calls, ['active']);
});

test('NotificationApi shares the factory store and scheduler instances', () => {
  const ctx = createContext();
  ctx.config.globalSoundEnabled = true;
  let scheduled = 0;
  const scheduler = {
    schedule() {
      scheduled += 1;
      return Promise.resolve({ status: 'played' });
    }
  };
  const services = createNotificationServices({
    ctx,
    soundBackendFactory: () => ({ playCue() {} }),
    soundSchedulerFactory: () => scheduler
  });

  assert.equal(services.notificationApi.store, services.notificationStore);
  services.notificationApi.setSoundProfile({
    global: { enabled: true, cue: 'tool-complete' }
  });
  const result = services.notificationApi.ingestEvent({
    event: {
      eventId: 'event-1',
      traceId: 'trace-1',
      type: 'message_end',
      stopReason: 'end_turn',
      source: 'model'
    },
    notification: { title: 'Test', content: 'Body' }
  });
  assert.equal(scheduled, 1);
  assert.equal(result.sound.scheduled, true);
});
