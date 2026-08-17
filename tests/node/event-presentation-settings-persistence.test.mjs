import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import NotificationHubVNextPlugin from '../../plugin/index.js';
import { EventPresentationSettingsStore } from '../../plugin/domain/event-presentation-settings-store.js';
import {
  createEventPresentationSettingsStoreSnapshot
} from '../../plugin/domain/event-presentation-settings-store.js';
import { EventPresentationSettingsPersistenceCoordinator } from '../../plugin/domain/event-presentation-settings-persistence.js';
import {
  loadEventPresentationSettingsSnapshot,
  saveEventPresentationSettingsSnapshot
} from '../../plugin/domain/event-presentation-settings-store-store.js';

test('event presentation persistence saves only the latest debounced snapshot', async () => {
  const store = new EventPresentationSettingsStore();
  const saved = [];
  const timers = [];
  const coordinator = new EventPresentationSettingsPersistenceCoordinator({
    store,
    filePath: 'event-presentation-settings.json',
    save: async (snapshot, filePath) => saved.push({ snapshot, filePath }),
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel: (timer) => { timer.cancelled = true; }
  });

  coordinator.observe();
  store.updateSettings({ global: {
    soundProfileId: 'sound.one',
    visualProfileId: 'visual.default',
    behaviorProfileId: 'stack',
    behaviorChannelId: 'stack.main'
  } });
  store.updateSettings({ global: {
    soundProfileId: 'sound.one',
    visualProfileId: 'visual.one',
    behaviorProfileId: 'stack',
    behaviorChannelId: 'stack.main'
  } });

  assert.equal(timers.length, 2);
  assert.equal(timers[0].cancelled, true);
  assert.equal(saved.length, 0);

  timers[1].callback();
  await coordinator.flush();

  assert.equal(saved.length, 1);
  assert.equal(saved[0].filePath, 'event-presentation-settings.json');
  assert.equal(saved[0].snapshot.revision, 3);
  assert.equal(saved[0].snapshot.settings.global.soundProfileId, 'sound.one');
  assert.equal(saved[0].snapshot.settings.global.visualProfileId, 'visual.one');
});

test('event presentation restore does not schedule a save', async () => {
  const store = new EventPresentationSettingsStore();
  const timers = [];
  const persisted = createEventPresentationSettingsStoreSnapshot({
    global: {
      soundProfileId: 'sound.restored',
      visualProfileId: 'visual.default',
      behaviorProfileId: 'stack',
      behaviorChannelId: 'stack.main'
    }
  }, 8);
  const coordinator = new EventPresentationSettingsPersistenceCoordinator({
    store,
    filePath: 'event-presentation-settings.json',
    load: async () => persisted,
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel: (timer) => { timer.cancelled = true; }
  });

  coordinator.observe();
  await coordinator.restore();

  assert.equal(store.getSnapshot().revision, 8);
  assert.equal(store.getSnapshot().settings.global.soundProfileId, 'sound.restored');
  assert.equal(timers.length, 0);
});

test('event presentation restore keeps a local update made while load is pending', async () => {
  const store = new EventPresentationSettingsStore();
  let releaseLoad;
  const loadStarted = new Promise((resolve) => { releaseLoad = resolve; });
  const coordinator = new EventPresentationSettingsPersistenceCoordinator({
    store,
    filePath: 'event-presentation-settings.json',
    load: async () => {
      await loadStarted;
      return createEventPresentationSettingsStoreSnapshot({
        global: {
          soundProfileId: 'sound.disk',
          visualProfileId: 'visual.disk',
          behaviorProfileId: 'stack',
          behaviorChannelId: 'stack.main'
        }
      }, 8);
    },
    schedule: (callback) => ({ callback }),
    cancel: () => {}
  });
  coordinator.observe();
  const restoring = coordinator.restore();
  await Promise.resolve();
  store.updateSettings({ global: {
    soundProfileId: 'sound.local',
    visualProfileId: 'visual.local',
    behaviorProfileId: 'popup',
    behaviorChannelId: 'popup.alert'
  } });
  releaseLoad();
  await restoring;

  assert.equal(store.getSnapshot().settings.global.soundProfileId, 'sound.local');
  assert.equal(coordinator.pendingSnapshot.settings.global.soundProfileId, 'sound.local');
});

test('event presentation background save failure schedules an automatic retry', async () => {
  const store = new EventPresentationSettingsStore();
  const timers = [];
  let attempts = 0;
  const coordinator = new EventPresentationSettingsPersistenceCoordinator({
    store,
    filePath: 'event-presentation-settings.json',
    save: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('disk unavailable');
    },
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel: (timer) => { timer.cancelled = true; }
  });
  coordinator.observe();
  store.updateSettings({ global: {
    soundProfileId: 'sound.retry',
    visualProfileId: 'visual.retry',
    behaviorProfileId: 'stack',
    behaviorChannelId: 'stack.main'
  } });
  const firstTimer = timers.at(-1);
  firstTimer.callback();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(attempts, 1);
  assert.equal(timers.length, 2);

  timers[1].callback();
  await coordinator.flush();
  assert.equal(attempts, 2);
  assert.equal(coordinator.pendingSnapshot, null);
});

test('event presentation save failure keeps the snapshot and emits a diagnostic', async () => {
  const store = new EventPresentationSettingsStore();
  const diagnostics = [];
  let attempts = 0;
  const coordinator = new EventPresentationSettingsPersistenceCoordinator({
    store,
    filePath: 'event-presentation-settings.json',
    save: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('disk unavailable');
    },
    schedule: (callback) => ({ callback }),
    cancel: () => {}
  });
  coordinator.on('diagnostic', (diagnostic) => diagnostics.push(diagnostic));
  coordinator.observe();
  store.updateSettings({ events: { 'chat.assistant_reply.completed': {
    soundProfileId: 'sound.reply',
    visualProfileId: 'visual.default',
    behaviorProfileId: 'stack',
    behaviorChannelId: 'stack.main'
  } } });

  await assert.rejects(() => coordinator.flush(), (error) => error.code === 'EVENT_PRESENTATION_SETTINGS_PERSIST_FAILED');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, 'EVENT_PRESENTATION_SETTINGS_PERSIST_FAILED');

  await coordinator.flush();
  assert.equal(attempts, 2);
});

test('event presentation snapshot round-trips through an atomic file', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nh-event-presentation-'));
  const filePath = path.join(directory, 'event-presentation-settings.json');
  try {
    const snapshot = createEventPresentationSettingsStoreSnapshot({
      global: {
        soundProfileId: 'sound.file',
        visualProfileId: 'visual.file',
        behaviorProfileId: 'popup',
        behaviorChannelId: 'popup.alert'
      }
    }, 5);
    await saveEventPresentationSettingsSnapshot(snapshot, filePath);
    const restored = await loadEventPresentationSettingsSnapshot(filePath);
    assert.equal(restored.revision, 5);
    assert.equal(restored.settings.global.behaviorChannelId, 'popup.alert');
    assert.equal((await readFile(filePath, 'utf8')).endsWith('\n'), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('plugin lifecycle restores and flushes event presentation settings through the real file factory', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nh-event-presentation-plugin-'));
  const context = {
    dataDir: directory,
    pluginDir: path.join(directory, 'plugin'),
    config: {
      runtimeEnabled: false,
      notificationPersistenceEnabled: false,
      soundSettingsPersistenceEnabled: false,
      visualSettingsPersistenceEnabled: false,
      eventPresentationSettingsPersistenceEnabled: true
    },
    log: { info() {}, debug() {}, warn() {}, error() {} }
  };
  try {
    const first = new NotificationHubVNextPlugin(context);
    await first.onload();
    await first.updateEventPresentationSettings({ global: {
      soundProfileId: 'sound.persisted',
      visualProfileId: 'visual.persisted',
      behaviorProfileId: 'ticker',
      behaviorChannelId: 'ticker.persisted'
    } });
    await first.onunload();

    const second = new NotificationHubVNextPlugin(context);
    await second.onload();
    const restored = second.getEventPresentationSettings();
    assert.equal(restored.settings.global.soundProfileId, 'sound.persisted');
    assert.equal(restored.settings.global.behaviorChannelId, 'ticker.persisted');
    assert.equal(restored.persistence.enabled, true);
    await second.onunload();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('event presentation persistence validates its construction seam', () => {
  assert.throws(
    () => new EventPresentationSettingsPersistenceCoordinator({ filePath: 'event-presentation-settings.json' }),
    (error) => error.code === 'EVENT_PRESENTATION_SETTINGS_PERSISTENCE_INVALID'
  );
  assert.throws(
    () => new EventPresentationSettingsPersistenceCoordinator({ store: new EventPresentationSettingsStore() }),
    (error) => error.code === 'EVENT_PRESENTATION_SETTINGS_PATH_INVALID'
  );
});
