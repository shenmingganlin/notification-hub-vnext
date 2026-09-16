import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import NotificationHubVNextPlugin, { pluginName, pluginVersion } from '../../plugin/index.js';
import { createAudioEngineBackend } from '../../plugin/domain/audio-engine-backend.js';
import { createEventPresentationSettingsStoreSnapshot } from '../../plugin/domain/event-presentation-settings-store.js';

class FakePersistence {
  constructor({ restoreResult = null, restoreError = null, flushError = null, events = [] } = {}) {
    this.restoreResult = restoreResult;
    this.restoreError = restoreError;
    this.flushError = flushError;
    this.events = events;
    this.observing = false;
  }

  observe() {
    this.events.push('observe');
    this.observing = true;
    return () => {
      this.events.push('unsubscribe');
      this.observing = false;
    };
  }

  async restore() {
    this.events.push('restore');
    if (this.restoreError) throw this.restoreError;
    return this.restoreResult;
  }

  async flush() {
    this.events.push('flush');
    if (this.flushError) throw this.flushError;
    return 'notification-store.json';
  }
}

class FakeAdapter extends EventEmitter {
  constructor({ configUpdateError = null } = {}) {
    super();
    this.pipeName = '\\\\.\\pipe\\notification-hub-vnext-test';
    this.started = 0;
    this.stopped = 0;
    this.state = 'stopped';
    this.sceneStatePersistence = {
      filePath: 'C:\\Hana\\data\\scene-state.json',
      debounceMs: 100,
      pendingSnapshot: null
    };
    this.configUpdateError = configUpdateError;
    this.lastError = null;
    this.client = {
      state: 'disconnected',
      connected: false,
      requests: [],
      async request(type, payload, options) {
        this.requests.push({ type, payload, options });
        if (type === 'config.update') {
          if (thisHost.configUpdateError) throw thisHost.configUpdateError;
          return {
            type: 'ack',
            payload: {
              result: { applied: true, revision: payload.revision }
            }
          };
        }
        if (type === 'health') {
          return {
            type: 'ack',
            payload: {
              result: {
                layout: { layout: 'shelf', direction: 'right', anchor: 'bottom-left', spacing: 12 },
                sceneCards: [
                  { id: 'nh-vnext-test-existing', title: 'Test', body: 'body', x: 1, y: 2 },
                  { id: 'user-card', title: 'User', body: 'keep', x: 3, y: 4 }
                ],
                workArea: { width: 1920, height: 1080, dpiScale: 1.25 },
                sceneStateSnapshot: { version: 1 }
              }
            }
          };
        }
        if (type === 'visual-assets.configure' || type === 'font-assets.configure' || type === 'agent-avatars.configure') {
          return {
            type: 'ack',
            payload: {
              result: {
                applied: true,
                assetCount: Array.isArray(payload?.assets) ? payload.assets.length : 0
              }
            }
          };
        }
        return { type: 'ack', payload: { result: { sceneCards: [] } } };
      }
    };
    const thisHost = this;
  }

  async start() {
    this.started += 1;
    this.state = 'running';
    this.client.state = 'connected';
    this.client.connected = true;
    this.emit('diagnostic', { code: 'TEST_DIAGNOSTIC' });
  }

  async stop() {
    this.stopped += 1;
    this.state = 'stopped';
    this.client.state = 'closed';
    this.client.connected = false;
  }

  getRuntimeStatus() {
    return {
      state: this.state,
      message: this.state === 'running' ? 'Runtime 正常运行' : 'Runtime 已停止',
      lastError: this.lastError,
      connected: this.client.connected,
      clientState: this.client.state
    };
  }
}

function context(config = {}, extras = {}) {
  const logs = [];
  return {
    pluginDir: 'C:\\Hana\\plugins\\notification-hub-vnext',
    dataDir: path.join(os.tmpdir(), `nh-vnext-lifecycle-${randomUUID()}`),
    config,
    log: {
      info: (...args) => logs.push(['info', ...args]),
      debug: (...args) => logs.push(['debug', ...args]),
      warn: (...args) => logs.push(['warn', ...args]),
      error: (...args) => logs.push(['error', ...args])
    },
    logs,
    ...extras
  };
}

function createBusHarness() {
  let listener = null;
  let unsubscribed = false;
  return {
    bus: {
      subscribe(callback) {
        listener = callback;
        return () => {
          unsubscribed = true;
          listener = null;
        };
      }
    },
    emit(event, sessionPath) {
      listener?.(event, sessionPath);
    },
    get listener() {
      return listener;
    },
    get unsubscribed() {
      return unsubscribed;
    }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('concurrent onload calls share one lifecycle promise and one runtime host', async () => {
  let created = 0;
  const plugin = new NotificationHubVNextPlugin(context({ notificationPersistenceEnabled: false }), {
    adapterFactory: () => { created += 1; return new FakeAdapter(); }
  });
  const first = plugin.onload();
  const second = plugin.onload();
  assert.strictEqual(first, second);
  await first;
  assert.equal(created, 1);
  await plugin.onunload();
});

test('onunload waits for an in-flight onload and cleans the completed startup', async () => {
  const gate = deferred();
  let stopped = 0;
  const adapter = new FakeAdapter();
  adapter.stop = async () => { stopped += 1; adapter.state = 'stopped'; };
  const plugin = new NotificationHubVNextPlugin(context({ notificationPersistenceEnabled: false }), {
    adapterFactory: () => adapter
  });
  plugin.startAudioEngineHost = async () => {
    await gate.promise;
    plugin.audioEngineStatus = { state: 'disabled', reason: 'test' };
    return plugin.audioEngineStatus;
  };
  const loading = plugin.onload();
  const unloading = plugin.onunload();
  gate.resolve();
  await loading;
  await unloading;
  assert.equal(stopped, 1);
  assert.equal(plugin.runtimeHost, null);
});

test('failed startup rolls back completed resources in reverse order', async () => {
  const cleanup = [];
  const plugin = new NotificationHubVNextPlugin(context({ notificationPersistenceEnabled: false }), {
    adapterFactory: () => {
      cleanup.push('runtime-create');
      return {
        async start() { cleanup.push('runtime-start'); },
        async stop() { cleanup.push('runtime-stop'); },
        getRuntimeStatus() { return { state: 'running', connected: true, clientState: 'connected' }; },
        on() {}
      };
    }
  });
  plugin.startAudioEngineHost = async () => {
    cleanup.push('audio-start');
    plugin.audioEngineStatus = { state: 'disabled', reason: 'test' };
    return plugin.audioEngineStatus;
  };
  plugin.stopAudioEngineHost = async () => { cleanup.push('audio-stop'); };
  plugin.restoreSoundAssets = async () => { cleanup.push('restore-sound-assets'); throw Object.assign(new Error('restore failed'), { code: 'SOUND_ASSET_RESTORE_FAILED' }); };
  await assert.rejects(plugin.onload(), { code: 'SOUND_ASSET_RESTORE_FAILED' });
  assert.deepEqual(cleanup, ['audio-start', 'restore-sound-assets', 'audio-stop']);
  await plugin.onunload();
});

test('audio host and backend activation failures do not block plugin startup and remain diagnosable', async () => {
  const hostFailure = new NotificationHubVNextPlugin(context({ notificationPersistenceEnabled: false }), { adapterFactory: () => new FakeAdapter() });
  hostFailure.startAudioEngineHost = async () => {
    hostFailure.audioEngineStatus = { state: 'failed', code: 'AUDIO_ENGINE_START_FAILED', message: 'spawn failed' };
    hostFailure.recordSoundDiagnostic(Object.assign(new Error('spawn failed'), { code: 'AUDIO_ENGINE_START_FAILED' }), 'audio-engine-start');
    return hostFailure.audioEngineStatus;
  };
  await hostFailure.onload();
  assert.equal(hostFailure.runtimeHost.state, 'running');
  assert.equal(hostFailure.getAudioEngineStatus().state, 'failed');
  await hostFailure.onunload();

  const activationFailure = new NotificationHubVNextPlugin(context({ notificationPersistenceEnabled: false }), { adapterFactory: () => new FakeAdapter() });
  activationFailure.startAudioEngineHost = async () => {
    activationFailure.audioEngineHost = { client: {}, dispose: async () => {}, getStatus: () => ({ state: 'ready', health: { ready: true } }) };
    activationFailure.audioEngineStatus = { state: 'ready' };
    return activationFailure.audioEngineStatus;
  };
  activationFailure.activateAudioEngineBackend = async () => { throw Object.assign(new Error('backend rejected'), { code: 'AUDIO_ENGINE_BACKEND_ACTIVATION_FAILED' }); };
  await activationFailure.onload();
  assert.equal(activationFailure.runtimeHost.state, 'running');
  assert.equal(activationFailure.getAudioEngineStatus().state, 'degraded');
  assert.equal(activationFailure.getSoundSettingsStatus().diagnostics.some((entry) => entry.code === 'AUDIO_ENGINE_BACKEND_ACTIVATION_FAILED'), true);
  await activationFailure.onunload();
});

test('audio engine activation preloads the default built-in cue before first playback', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false });
  const preloadCalls = [];
  const requests = [];
  const client = {
    async request(type, payload) {
      requests.push({ type, payload });
      return type === 'audio.load' ? { loaded: true } : {};
    }
  };
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => ({
      playCue: async () => ({ played: true }),
      playFile: async () => ({ played: true }),
      dispose() {}
    }),
    audioEngineBackendFactory: (options) => {
      preloadCalls.push(options.preload);
      return createAudioEngineBackend(options);
    }
  });
  plugin.audioEngineHost = { client, getStatus: () => ({ state: 'ready' }) };

  await plugin.activateAudioEngineBackend();
  await plugin.soundBackend.warmup();

  assert.deepEqual(preloadCalls, [[{
    soundId: 'builtin.chat-incoming',
    path: `${process.env.WINDIR}\\Media\\chimes.wav`,
    fingerprint: `${process.env.WINDIR}\\Media\\chimes.wav`
  }]]);
  assert.deepEqual(requests, [{
    type: 'audio.load',
    payload: { soundId: 'builtin.chat-incoming', path: 'C:/Windows/Media/chimes.wav' }
  }]);
});

test('restored builtin sound cue is the only cue selected for audio engine preload', async () => {
  const ctx = context({ notificationPersistenceEnabled: false });
  const events = [];
  const requests = [];
  const soundSnapshot = {
    version: 1,
    revision: 2,
    settings: {
      globalSoundEnabled: true,
      profile: { global: { enabled: true, cue: 'critical-error' } }
    },
    updatedAt: '2026-08-23T00:00:00.000Z'
  };
  const persistence = {
    on() {},
    observe() { events.push('observe'); return () => {}; },
    async restore() { events.push('restore'); plugin.soundSettingsStore.restoreSnapshot(soundSnapshot); },
    async flush() {},
    dispose() {}
  };
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundSettingsPersistenceFactory: () => persistence,
    audioEngineHostFactory: () => ({
      client: { async request(type, payload) { requests.push({ type, payload }); return { loaded: true }; } },
      async start() {},
      async dispose() {},
      getStatus: () => ({ state: 'ready', health: { ready: true } })
    }),
    audioEngineBackendFactory: (options) => createAudioEngineBackend(options)
  });
  plugin.startAudioEngineHost = async () => {
    plugin.audioEngineHost = {
      client: { async request(type, payload) { requests.push({ type, payload }); return { loaded: true }; } },
      getStatus: () => ({ state: 'ready', health: { ready: true } }),
      async dispose() {}
    };
    plugin.audioEngineStatus = { state: 'ready' };
    return plugin.audioEngineStatus;
  };

  await plugin.onload();
  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.deepEqual(events.slice(0, 2), ['restore', 'observe']);
    assert.deepEqual(requests.filter(({ type }) => type === 'audio.load').map(({ payload }) => payload.soundId), ['builtin.critical-error']);
  } finally {
    await plugin.onunload();
  }
});

test('warmup delay or rejection never blocks onload and remains diagnosable', async () => {
  const warmupGate = deferred();
  const plugin = new NotificationHubVNextPlugin(context({ notificationPersistenceEnabled: false }), {
    adapterFactory: () => new FakeAdapter(),
    audioEngineHostFactory: () => ({
      client: {},
      async start() {},
      async dispose() {},
      getStatus: () => ({ state: 'ready', health: { ready: true } })
    }),
    audioEngineBackendFactory: () => ({
      warmup: () => warmupGate.promise,
      playCue: async () => ({ played: true }),
      playFile: async () => ({ played: true }),
      load: async () => {},
      unload: async () => {},
      dispose: async () => {}
    })
  });
  plugin.startAudioEngineHost = async () => {
    plugin.audioEngineHost = { client: {}, getStatus: () => ({ state: 'ready', health: { ready: true } }), async dispose() {} };
    plugin.audioEngineStatus = { state: 'ready' };
    return plugin.audioEngineStatus;
  };

  const loading = plugin.onload();
  await Promise.race([loading, new Promise((_, reject) => setTimeout(() => reject(new Error('onload waited for warmup')), 100))]);
  assert.equal(plugin.runtimeHost.state, 'running');
  warmupGate.reject(Object.assign(new Error('warmup refused'), { code: 'AUDIO_ENGINE_WARMUP_FAILED' }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(plugin.getSoundSettingsStatus().diagnostics.at(-1).stage, 'audio-engine-warmup');
  await plugin.onunload();
});

test('warmup diagnostics do not delay notification subscriptions or Runtime initialization', async () => {
  const warmupGate = deferred();
  const bus = createBusHarness();
  const plugin = new NotificationHubVNextPlugin(context({ notificationPersistenceEnabled: false }, { bus: bus.bus }), {
    adapterFactory: () => new FakeAdapter(),
    audioEngineHostFactory: () => ({
      client: {},
      async start() {},
      async dispose() {},
      getStatus: () => ({ state: 'ready', health: { ready: true } })
    }),
    audioEngineBackendFactory: () => ({
      warmup: () => warmupGate.promise,
      playCue: async () => ({ played: true }),
      playFile: async () => ({ played: true }),
      load: async () => {},
      unload: async () => {},
      dispose: async () => {}
    })
  });
  plugin.startAudioEngineHost = async () => {
    plugin.audioEngineHost = { client: {}, getStatus: () => ({ state: 'ready', health: { ready: true } }), async dispose() {} };
    plugin.audioEngineStatus = { state: 'ready' };
    return plugin.audioEngineStatus;
  };

  await plugin.onload();
  assert.equal(plugin.runtimeHost.state, 'running');
  assert.equal(typeof bus.listener, 'function');
  warmupGate.resolve(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(plugin.getSoundSettingsStatus().diagnostics.at(-1).stage, 'audio-engine-warmup');
  await plugin.onunload();
});

test('active audio engine backend falls back to legacy playCue after engine failure', async () => {
  const cueCalls = [];
  const legacyBackend = {
    playCue: async (options) => {
      cueCalls.push(options);
      return { played: true, source: 'legacy' };
    },
    playFile: async () => ({ played: true }),
    dispose() {}
  };
  const engineError = Object.assign(new Error('audio engine request timed out'), { code: 'AUDIO_ENGINE_REQUEST_TIMEOUT' });
  const plugin = new NotificationHubVNextPlugin(context({ notificationPersistenceEnabled: false }), {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => legacyBackend,
    audioEngineHostFactory: () => ({ client: {}, dispose: async () => {}, getStatus: () => ({ state: 'ready' }) }),
    audioEngineBackendFactory: () => ({
      warmup: async () => {},
      playCue: async () => { throw engineError; },
      playFile: async () => ({ played: true }),
      load: async () => {},
      unload: async () => {},
      dispose: async () => {}
    })
  });
  plugin.audioEngineHost = { client: {}, dispose: async () => {}, getStatus: () => ({ state: 'ready' }) };

  await plugin.activateAudioEngineBackend();
  try {
    const result = await plugin.soundBackend.playCue({ cue: 'default', volume: 0.7 });
    assert.deepEqual(result, { played: true, source: 'legacy' });
    assert.deepEqual(cueCalls, [{ cue: 'default', volume: 0.7 }]);
    const fallback = plugin.getSoundSettingsStatus().diagnostics.at(-1);
    assert.equal(fallback.stage, 'audio-engine-media-fallback');
    assert.equal(fallback.code, 'AUDIO_ENGINE_REQUEST_TIMEOUT');
  } finally {
    await plugin.onunload();
  }
});

test('promotion queue is closed during plugin unload and rejects pending work', async () => {
  const plugin = new NotificationHubVNextPlugin(context({ notificationPersistenceEnabled: false }), { adapterFactory: () => new FakeAdapter() });
  await plugin.onload();
  plugin.promoteNotificationScene = () => new Promise(() => {});
  const pending = plugin.notificationPromotionQueue.enqueue({ record: { notificationId: 'unload-pending' }, promotedCard: {}, channelId: 'test' });
  const rejection = assert.rejects(pending, /promotion queue closed/);
  await plugin.onunload();
  await rejection;
  assert.equal(plugin.notificationPromotionQueue.size, 0);
});

test('vNext plugin registers and cleans the dedicated test capability when EventBus supports handlers', async () => {
  const calls = [];
  const cleanup = () => calls.push('cleanup');
  const ctx = context({ notificationPersistenceEnabled: false }, {
    bus: {
      handle(type, handler) { calls.push({ type, handler }); return cleanup; },
      subscribe() { return () => {}; }
    }
  });
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => new FakeAdapter() });
  await plugin.onload();
  const registration = calls.find((entry) => entry?.type === 'notification-hub-vnext.run-test');
  assert.ok(registration);
  const result = await registration.handler({ count: 1, createCards: false, playSound: false, entryPoint: 'command' });
  assert.equal(result.entryPoint, 'command');
  await plugin.onunload();
  assert.equal(calls.includes('cleanup'), true);
});

test('vNext plugin owns one isolated RuntimeHostAdapter through onload/onunload', async () => {
  const ctx = context();
  let adapter;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => {
      adapter = new FakeAdapter();
      return adapter;
    }
  });

  await plugin.onload();
  assert.equal(pluginName, 'notification-hub-vnext');
  assert.equal(pluginVersion, '0.1.7');
  assert.equal(adapter.started, 1);
  assert.equal(plugin.runtimeHost, adapter);
  assert.equal(ctx.logs.some(([level, ...args]) => level === 'debug' && args.some((value) => JSON.stringify(value).includes('TEST_DIAGNOSTIC'))), true);

  await plugin.onunload();
  assert.equal(adapter.stopped, 1);
  assert.equal(plugin.runtimeHost, null);
});

test('vNext plugin restores and updates independent sound settings without changing Runtime settings', async () => {
  const ctx = context({ notificationPersistenceEnabled: false });
  const events = [];
  const soundSnapshot = {
    version: 1,
    revision: 5,
    settings: {
      globalSoundEnabled: true,
      profile: { global: { enabled: true, volume: 0.35 } }
    },
    updatedAt: '2026-08-05T00:00:00.000Z'
  };
  const soundPersistence = {
    filePath: 'C:\\Hana\\data\\sound-settings.json',
    pendingSnapshot: null,
    on() {},
    observe() { events.push('observe'); return () => events.push('unsubscribe'); },
    async restore() { events.push('restore'); plugin.soundSettingsStore.restoreSnapshot(soundSnapshot); return soundSnapshot; },
    async flush() { events.push('flush'); return this.filePath; },
    dispose() { events.push('dispose'); }
  };
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => ({
      playCue: async () => ({ played: true }),
      playFile: async () => ({ played: true })
    }),
    soundSettingsPersistenceFactory: (contextValue, options) => {
      assert.equal(contextValue, ctx);
      assert.equal(options.store, plugin.soundSettingsStore);
      return soundPersistence;
    }
  });

  await plugin.onload();
  try {
    assert.equal(plugin.soundSettingsStore.getSnapshot().revision, 5);
    assert.equal('filePath' in plugin.getSoundSettingsStatus().persistence, false);
    assert.equal(plugin.notificationApi.ingestEvent({
      event: { eventId: 'sound-lifecycle-unique', type: 'message_end', stopReason: 'end_turn', source: 'model' },
      notification: { notificationId: 'sound-lifecycle-unique', title: '声音生命周期', content: '测试' },
      profiles: [{ id: 'default' }]
    }).sound.decision.volume, 0.35);

    const updated = await plugin.updateSoundSettings({ profile: { global: { volume: 0.55 } } });
    assert.equal(updated.settings.profile.global.volume, 0.55);
    const enabledByUi = await plugin.updateSoundSettings({ globalSoundEnabled: true });
    assert.equal(enabledByUi.settings.profile.global.enabled, true);
    const disabledByUi = await plugin.updateSoundSettings({ globalSoundEnabled: false });
    assert.equal(disabledByUi.settings.profile.global.enabled, false);
    const mutedByWorkMode = await plugin.updateSoundSettings({ globalSoundEnabled: true, workModeMuted: true });
    assert.equal(mutedByWorkMode.settings.workModeMuted, true);
    const mutedNotification = plugin.notificationApi.ingestEvent({
      event: { eventId: 'sound-lifecycle-work-mode-muted', type: 'message_end', stopReason: 'end_turn', source: 'model' },
      notification: { title: '静音测试', content: '工作模式静音不应播放。' },
      profiles: [{ id: 'default', soundPolicy: { enabled: true, cue: 'success' } }]
    });
    assert.equal(mutedNotification.sound.scheduled, false);
    assert.equal(mutedNotification.sound.decision.reason, 'global-disabled');
    assert.equal(updated.status, 'applied');
    assert.equal(plugin.settingsStore.getSnapshot().revision, 1);
  } finally {
    await plugin.onunload();
  }
  assert.deepEqual(events, ['restore', 'observe', 'flush', 'dispose']);
});

test('vNext saved global suppression off reaches real notification decisions and never merges', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false });
  const calls = [];
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => ({
      playCue: async (input) => { calls.push(input); return { played: true }; },
      playFile: async () => ({ played: true }),
      dispose() {}
    })
  });
  await plugin.onload();
  try {
    const settings = await plugin.updateSoundSettings({
      globalSoundEnabled: true,
      profile: { global: { enabled: true, suppressDuplicates: false } }
    });
    assert.equal(settings.profile.global.suppressDuplicates, false);
    const first = plugin.notificationApi.ingestEvent({
      event: { eventId: 'sound-global-off-1', traceId: 'sound-global-off-a', type: 'message_end', stopReason: 'end_turn', source: 'model' },
      notification: { notificationId: 'sound-global-off-1', title: '一', content: '一' },
      profiles: [{ id: 'default' }]
    });
    const second = plugin.notificationApi.ingestEvent({
      event: { eventId: 'sound-global-off-2', traceId: 'sound-global-off-b', type: 'message_end', stopReason: 'end_turn', source: 'model' },
      notification: { notificationId: 'sound-global-off-2', title: '二', content: '二' },
      profiles: [{ id: 'default' }]
    });
    assert.equal(first.sound.decision.suppressDuplicates, false);
    assert.equal(second.sound.decision.suppressDuplicates, false);
    assert.equal((await first.sound.playback).status, 'played');
    assert.equal((await second.sound.playback).status, 'played');
    assert.equal(calls.length, 2);
    assert.equal(plugin.getSoundSettingsStatus().soundDiagnostics.some((entry) => entry.scheduling.status === 'merged'), false);
  } finally {
    await plugin.onunload();
  }
});

test('vNext sound rule explanation reuses the effective preview without playback', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false });
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => new FakeAdapter() });
  await plugin.onload();
  try {
    const result = plugin.explainSoundSettings({ labels: ['chat'], event: 'arrived', importance: 'normal' });
    assert.equal(result.explanation.outcome, 'skip');
    assert.equal(result.explanation.reasonCode, 'policy-disabled');
    assert.equal(Object.isFrozen(result.explanation), true);
  } finally {
    await plugin.onunload();
  }
});

test('vNext sound workbench runs formal scheduler without writing notification history', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false });
  const calls = [];
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => ({
      playCue: async (input) => { calls.push(input); return { played: true }; },
      playFile: async () => ({ played: true }),
      dispose() {}
    })
  });
  await plugin.onload();
  try {
    await plugin.updateSoundSettings({ globalSoundEnabled: true, profile: { global: { enabled: true } } });
    const result = await plugin.runSoundWorkbench({ input: { labels: ['chat'], event: 'arrived', importance: 'normal', soundId: 'must-use-profile-rule' }, count: 2 });
    await plugin.soundScheduler.waitForIdle({ timeoutMs: 500, pollMs: 1 });
    assert.equal(result.runs.length, 2);
    assert.equal('soundId' in result.runs[0].input, false);
    assert.equal(result.runs[0].explanation.outcome, 'play');
    assert.equal(result.runs[1].explanation.outcome, 'merge');
    assert.equal(calls.length, 1);
    assert.equal(plugin.notificationStore.list().length, 0);
    assert.equal(plugin.getSoundSettingsStatus().soundDiagnostics.at(-1).source, 'sound-workbench');
  } finally {
    await plugin.onunload();
  }
});

test('vNext sound workbench records one diagnostic for one click after playback settles', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false });
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => ({
      playCue: async () => ({ played: true }),
      playFile: async () => ({ played: true }),
      dispose() {}
    })
  });
  await plugin.onload();
  try {
    await plugin.updateSoundSettings({ globalSoundEnabled: true, profile: { global: { enabled: true } } });
    await plugin.runSoundWorkbench({ input: { labels: ['chat'], event: 'arrived', importance: 'normal' }, count: 1 });
    await plugin.soundScheduler.waitForIdle({ timeoutMs: 500, pollMs: 1 });
    const diagnostics = plugin.getSoundSettingsStatus().soundDiagnostics.filter((entry) => entry.source === 'sound-workbench');
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].summary.outcome, 'played');
  } finally {
    await plugin.onunload();
  }
});

test('vNext sound workbench returns after scheduling without waiting for playback completion', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false });
  let releasePlayback;
  const playbackGate = new Promise((resolve) => { releasePlayback = resolve; });
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => ({
      playCue: async () => { await playbackGate; return { played: true }; },
      playFile: async () => ({ played: true }),
      dispose() {}
    })
  });
  await plugin.onload();
  try {
    await plugin.updateSoundSettings({ globalSoundEnabled: true, profile: { global: { enabled: true } } });
    const result = await Promise.race([
      plugin.runSoundWorkbench({ input: { labels: ['chat'], event: 'arrived', importance: 'normal' } }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('workbench waited for playback')), 100))
    ]);
    assert.equal(result.runs[0].playback.status, 'started');
    releasePlayback();
    await plugin.soundScheduler.waitForIdle({ timeoutMs: 500, pollMs: 1 });
  } finally {
    await plugin.onunload();
  }
});

test('vNext sound workbench rejects invalid bounds and never bypasses global mute', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false });
  const calls = [];
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => ({
      playCue: async () => { calls.push('play'); return { played: true }; },
      playFile: async () => ({ played: true }),
      dispose() {}
    })
  });
  await plugin.onload();
  try {
    await assert.rejects(() => plugin.runSoundWorkbench({ input: { labels: ['chat'], event: 'arrived' }, count: 21 }), (error) => error.code === 'SOUND_WORKBENCH_INPUT_INVALID');
    await plugin.updateSoundSettings({ globalSoundEnabled: false });
    const result = await plugin.runSoundWorkbench({ input: { labels: ['chat'], event: 'arrived', importance: 'normal' }, count: 2 });
    assert.equal(result.runs.every((run) => run.explanation.outcome === 'skip'), true);
    assert.equal(calls.length, 0);
  } finally {
    await plugin.onunload();
  }
});

test('vNext sound settings test plays an audible cue but global mute still blocks it', async () => {
  const ctx = context({ notificationPersistenceEnabled: false });
  const calls = [];
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => ({
      playCue: async (input) => { calls.push(input); return { played: true }; },
      playFile: async () => ({ played: true })
    })
  });
  await plugin.onload();
  try {
    const tested = await plugin.testSoundSettings({ labels: ['chat'], event: 'arrived', importance: 'normal' });
    assert.equal(tested.scheduled, true);
    assert.equal(tested.playback.status, 'played');
    assert.equal(tested.playback.playback.played, true);
    assert.equal(calls.length, 1);
    const playedDiagnostics = plugin.getSoundSettingsStatus().soundDiagnostics;
    assert.equal(playedDiagnostics.at(-1).source, 'settings-test');
    assert.equal(playedDiagnostics.at(-1).summary.outcome, 'played');
    assert.equal(playedDiagnostics.at(-1).playback.played, true);
    await plugin.updateSoundSettings({ globalSoundEnabled: false });
    const muted = await plugin.testSoundSettings({ labels: ['chat'], event: 'arrived', importance: 'normal' });
    assert.equal(muted.scheduled, false);
    assert.equal(calls.length, 1);
    const mutedDiagnostics = plugin.getSoundSettingsStatus().soundDiagnostics;
    assert.equal(mutedDiagnostics.at(-1).summary.outcome, 'skipped');
    assert.equal(mutedDiagnostics.at(-1).summary.explanation, '声音策略决定不播放。');
  } finally {
    await plugin.onunload();
  }
});

test('vNext sound settings test merges same sound while the first preview is active', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false });
  const calls = [];
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => ({
      warmup: async () => true,
      playCue: async (input) => {
        calls.push(input);
        return calls.length === 1 ? pending : { played: true };
      },
      playFile: async (input) => {
        calls.push(input);
        return calls.length === 1 ? pending : { played: true };
      },
      dispose() {}
    })
  });
  await plugin.onload();
  try {
    const firstPromise = plugin.testSoundSettings({ labels: ['chat'], event: 'arrived', importance: 'normal' });
    const secondPromise = plugin.testSoundSettings({ labels: ['chat'], event: 'arrived', importance: 'normal' });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    const second = await secondPromise;
    assert.equal(second.playback.status, 'merged');
    assert.equal(second.playback.soundKey, 'windows-media:chimes.wav');
    assert.equal(second.playback.suppressDuplicates, true);
    assert.equal(second.decision.suppressDuplicates, true);
    release({ played: true });
    const first = await firstPromise;
    assert.equal(first.playback.status, 'played');
    assert.equal(first.playback.soundKey, 'windows-media:chimes.wav');
    const afterPlayback = await plugin.testSoundSettings({ labels: ['chat'], event: 'arrived', importance: 'normal' });
    assert.equal(afterPlayback.playback.status, 'played');
  } finally {
    release?.({ played: true });
    await plugin.onunload();
  }
});

test('vNext sound settings test suppresses rapid accepted playback for the asset duration', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false });
  const calls = [];
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => ({
      warmup: async () => true,
      playCue: async (input) => { calls.push(input); return { played: true, accepted: true, voiceId: `voice-${calls.length}` }; },
      playFile: async (input) => { calls.push(input); return { played: true, accepted: true, voiceId: `voice-${calls.length}` }; },
      dispose() {}
    })
  });
  await plugin.onload();
  try {
    const firstPromise = plugin.testSoundSettings({ labels: ['chat'], event: 'arrived', importance: 'normal' });
    await new Promise((resolve) => setImmediate(resolve));
    const second = await plugin.testSoundSettings({ labels: ['chat'], event: 'arrived', importance: 'normal' });
    assert.equal(calls.length, 1);
    assert.equal(second.playback.status, 'merged');
    const first = await firstPromise;
    assert.equal(first.playback.status, 'played');
  } finally {
    await plugin.onunload();
  }
});

test('vNext restores custom sound assets into the registry captured by the scheduler', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-restore-'));
  const assetRoot = path.join(dataDir, 'sound-assets');
  const assetPath = path.join(assetRoot, 'custom', 'restored.wav');
  await mkdir(path.dirname(assetPath), { recursive: true });
  await writeFile(assetPath, Buffer.from('wav'));
  await writeFile(path.join(dataDir, 'sound-assets.json'), JSON.stringify({
    version: 1,
    assets: [{
      soundId: 'custom.restored',
      name: 'Restored sound',
      kind: 'custom',
      format: 'wav',
      relativePath: 'custom/restored.wav',
      durationMs: 160,
      fileSizeBytes: 3,
      sha256: '0000000000000000000000000000000000000000000000000000000000000000',
      enabled: true
    }]
  }));
  const calls = [];
  const plugin = new NotificationHubVNextPlugin(context({
    runtimeEnabled: false,
    notificationPersistenceEnabled: false,
    soundSettingsPersistenceEnabled: false
  }, { dataDir }), {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => ({
      playCue: async () => ({ played: true }),
      playFile: async (input) => { calls.push(input); return { played: true }; },
      dispose() {}
    })
  });
  const registry = plugin.soundAssetRegistry;
  await plugin.onload();
  try {
    assert.strictEqual(plugin.soundAssetRegistry, registry);
    assert.ok(plugin.soundAssetRegistry.get('custom.restored'));
    const result = await plugin.testSoundAsset({ soundId: 'custom.restored' });
    await plugin.soundScheduler.waitForIdle({ timeoutMs: 500, pollMs: 1 });
    assert.equal(result.playback.status, 'played');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].soundId, 'custom.restored');
  } finally {
    await plugin.onunload();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('vNext sound asset test suppresses rapid accepted playback for the asset duration', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false });
  const calls = [];
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => ({
      warmup: async () => true,
      playCue: async (input) => { calls.push(input); return { played: true, accepted: true, voiceId: `voice-${calls.length}` }; },
      playFile: async (input) => { calls.push(input); return { played: true, accepted: true, voiceId: `voice-${calls.length}` }; },
      dispose() {}
    })
  });
  await plugin.onload();
  try {
    const firstPromise = plugin.testSoundAsset({ soundId: 'builtin.chat-incoming' });
    await new Promise((resolve) => setImmediate(resolve));
    const second = await plugin.testSoundAsset({ soundId: 'builtin.chat-incoming' });
    assert.equal(calls.length, 1);
    assert.equal(second.playback.status, 'merged');
    const first = await firstPromise;
    assert.equal(first.playback.status, 'played');
  } finally {
    await plugin.onunload();
  }
});

test('vNext sound settings test propagates a backend played:false result as failed', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false });
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundBackendFactory: () => ({
      playCue: async () => ({ played: false, reason: 'playback-failed', diagnostic: 'SOUND_PLAYBACK_FAILED' }),
      playFile: async () => ({ played: false, reason: 'playback-failed', diagnostic: 'SOUND_PLAYBACK_FAILED' })
    })
  });
  await plugin.onload();
  try {
    const tested = await plugin.testSoundSettings({ labels: ['chat'], event: 'arrived', importance: 'normal' });
    assert.equal(tested.scheduled, true);
    assert.equal(tested.playback.status, 'failed');
    assert.equal(tested.playback.diagnostic, 'SOUND_PLAYBACK_FAILED');
    assert.equal(tested.playback.playback.played, false);
    const diagnostics = plugin.getSoundSettingsStatus().soundDiagnostics;
    assert.equal(diagnostics.at(-1).summary.outcome, 'failed');
    assert.equal(diagnostics.at(-1).playback.diagnostic, 'SOUND_PLAYBACK_FAILED');
  } finally {
    await plugin.onunload();
  }
});

test('vNext visual package diagnostics export uses the save picker and writes the last import report', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, runtimeEnabled: false });
  const pickerCalls = [];
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundFilePickerFactory: () => ({
      async save(input) {
        pickerCalls.push(input);
        return { cancelled: false, path: 'C:\\Exports\\visual-import-diagnostics.json' };
      }
    })
  });
  await plugin.onload();
  try {
    plugin.lastVisualPackageReport = { packageId: 'visual-package-test', packageName: 'Test', version: '1.0.0', strategy: 'copy', issues: [] };
    const result = await plugin.exportVisualPackageDiagnostics({ name: 'visual-import-diagnostics' });
    assert.equal(result.savedToFile, true);
    assert.equal(result.format, 'notification-hub-visual-package-import-diagnostics');
    assert.equal(pickerCalls[0].extension, 'json');
    assert.equal(pickerCalls[0].title, '导出视觉配置包导入诊断');
    assert.match(pickerCalls[0].content, /visual-package-import-diagnostics/);
  } finally {
    await plugin.onunload();
  }
});

test('vNext visual package diagnostics export rejects when no import report exists', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, runtimeEnabled: false });
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => new FakeAdapter() });
  await plugin.onload();
  try {
    await assert.rejects(() => plugin.exportVisualPackageDiagnostics(), { code: 'VISUAL_PACKAGE_DIAGNOSTIC_NOT_FOUND' });
  } finally {
    await plugin.onunload();
  }
});

test('vNext diagnostics export uses the指定位置 picker and writes JSON metadata', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, runtimeEnabled: false });
  const pickerCalls = [];
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    soundFilePickerFactory: () => ({
      async save(input) {
        pickerCalls.push(input);
        return { cancelled: false, path: 'C:\\Exports\\diagnostics.json' };
      }
    })
  });
  await plugin.onload();
  try {
    const result = await plugin.exportDiagnostics({ name: 'diagnostics-test' });
    assert.equal(result.savedToFile, true);
    assert.equal(result.cancelled, false);
    assert.equal(result.savedFilename, 'C:\\Exports\\diagnostics.json');
    assert.equal(result.format, 'notification-hub-diagnostics');
    assert.equal(pickerCalls.length, 1);
    assert.equal(pickerCalls[0].extension, 'json');
    assert.equal(pickerCalls[0].title, '导出 Notification Hub 诊断记录');
    assert.match(pickerCalls[0].filter, /\*\.json/);
    assert.match(pickerCalls[0].content, /notification-hub-diagnostics/);
  } finally {
    await plugin.onunload();
  }
});

test('vNext batch history removal uses one Store batch operation', async () => {
  const ctx = context({ notificationPersistenceEnabled: false });
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => new FakeAdapter() });
  await plugin.onload();
  try {
    const calls = [];
    plugin.notificationApi.removeNotifications = (ids) => { calls.push(ids); return { removed: ids, missing: [] }; };
    const result = await plugin.removeNotificationsFromHistory(['a', 'b', 'a']);
    assert.deepEqual(result, { removed: ['a', 'b'], missing: [] });
    assert.deepEqual(calls, [['a', 'b']]);
  } finally {
    await plugin.onunload();
  }
});

test('vNext plugin persists and restores notification display settings independently', async () => {
  const ctx = context();
  const events = [];
  const persistence = {
    filePath: 'C:\\Hana\\data\\notification-display-settings.json',
    async restore() { events.push('display-restore'); return { mode: 'custom', limit: 321, cardLifetimeSeconds: 120 }; },
    async save(settings) { events.push(['display-save', settings]); return this.filePath; }
  };
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    notificationDisplaySettingsPersistenceFactory: () => persistence
  });

  await plugin.onload();
  assert.deepEqual(await plugin.getNotificationDisplaySettings(), {
    settings: { mode: 'custom', limit: 321, cardLifetimeSeconds: 120 },
    limit: 321,
    cardLifetimeSeconds: 120,
    persistence: { enabled: true, filePath: 'C:\\Hana\\data\\notification-display-settings.json' }
  });
  const updated = await plugin.updateNotificationDisplaySettings({ mode: 'preset', limit: 500, cardLifetimeSeconds: 0 });
  assert.deepEqual(updated, { settings: { mode: 'preset', limit: 500, cardLifetimeSeconds: 0 }, limit: 500, cardLifetimeSeconds: 0, persistence: { enabled: true, filePath: 'C:\\Hana\\data\\notification-display-settings.json' } });
  assert.deepEqual(events, ['display-restore', ['display-save', { mode: 'preset', limit: 500, cardLifetimeSeconds: 0 }]]);
  await plugin.onunload();
});

test('vNext plugin restores and flushes event presentation settings independently', async () => {
  const ctx = context({
    runtimeEnabled: false,
    notificationPersistenceEnabled: false,
    soundSettingsPersistenceEnabled: false,
    visualSettingsPersistenceEnabled: false,
    eventPresentationSettingsPersistenceEnabled: true
  });
  const events = [];
  const persistence = new FakePersistence({
    restoreResult: createEventPresentationSettingsStoreSnapshot({
      events: {
        'chat.assistant_reply.completed': {
          soundProfileId: 'sound.reply',
          visualProfileId: 'visual.reply',
          behaviorProfileId: 'ticker',
          behaviorChannelId: 'ticker.reply'
        }
      }
    }, 7),
    events
  });
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    eventPresentationSettingsPersistenceFactory: (_context, { store }) => ({
      async restore() {
        events.push('restore');
        store.restoreSnapshot(persistence.restoreResult);
        return persistence.restoreResult;
      },
      observe() {
        events.push('observe');
      },
      async flush() {
        events.push('flush');
      },
      pendingSnapshot: null,
      filePath: 'C:\\Hana\\data\\event-presentation-settings.json'
    })
  });

  await plugin.onload();
  assert.deepEqual(events.slice(0, 2), ['restore', 'observe']);
  assert.equal(plugin.getEventPresentationSettings().revision, 7);
  assert.ok(Array.isArray(plugin.getEventPresentationSettings().visualProfiles));
  assert.ok(Array.isArray(plugin.getEventPresentationSettings().testEvents));
  assert.equal(plugin.getEventPresentationSettings().settings.events['chat.assistant_reply.completed'].soundProfileId, 'sound.reply');
  const probe = plugin.notificationApi.ingestEvent({
    event: { type: 'message_end', eventId: 'probe-message', traceId: 'probe-trace', stopReason: 'end_turn' },
    notification: { notificationId: 'probe-notification', title: 'probe', content: 'probe', type: 'message', source: 'test' }
  });
  assert.equal(probe.record.presentation.behaviorChannelId, 'ticker.reply');

  await plugin.updateEventPresentationSettings({ global: {
    soundProfileId: 'sound.updated',
    visualProfileId: 'visual.updated',
    behaviorProfileId: 'popup',
    behaviorChannelId: 'popup.alert'
  } });
  assert.equal(plugin.getEventPresentationSettings().status, 'applied');
  await plugin.onunload();
  assert.equal(events.includes('flush'), true);
});

test('vNext plugin persists sidebar display count independently', async () => {
  const ctx = context({ notificationPersistenceEnabled: false });
  const events = [];
  const persistence = {
    filePath: 'C:\\Hana\\data\\sidebar-display-settings.json',
    async restore() { events.push('sidebar-restore'); return { mode: 'custom', limit: 7 }; },
    async save(settings) { events.push(['sidebar-save', settings]); return this.filePath; }
  };
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    sidebarDisplaySettingsPersistenceFactory: () => persistence
  });

  await plugin.onload();
  plugin.notificationApi.createNotification({ notificationId: 'sidebar-fixture-1', traceId: 'sidebar-trace-1', type: 'message', source: 'test', title: '侧边栏通知一', content: '一' });
  plugin.notificationApi.createNotification({ notificationId: 'sidebar-fixture-2', traceId: 'sidebar-trace-2', type: 'message', source: 'test', title: '侧边栏通知二', content: '二' });
  assert.deepEqual(await plugin.getSidebarDisplaySettings(), {
    settings: { mode: 'custom', limit: 7 },
    limit: 7
  });
  const widget = await plugin.getNotificationWidgetStatus();
  assert.equal(widget.recent.length, 2);
  const updated = await plugin.updateSidebarDisplaySettings({ mode: 'preset', limit: 5 });
  assert.deepEqual(updated, { settings: { mode: 'preset', limit: 5 }, limit: 5 });
  assert.deepEqual(events, ['sidebar-restore', ['sidebar-save', { mode: 'preset', limit: 5 }]]);
  await plugin.onunload();
});

test('vNext plugin restores and applies settings after Runtime startup', async () => {
  const ctx = context();
  const events = [];
  const persistedSettings = {
    version: 1,
    revision: 4,
    settings: { globalSoundEnabled: false },
    updatedAt: '2026-08-05T00:00:00.000Z'
  };
  const persistence = new FakePersistence({ restoreResult: persistedSettings, events });
  let adapter;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => {
      adapter = new FakeAdapter();
      return adapter;
    },
    settingsPersistenceFactory: (contextValue, options) => {
      assert.equal(contextValue, ctx);
      assert.equal(options.store, plugin.settingsStore);
      return persistence;
    }
  });

  await plugin.onload();

  assert.deepEqual(events, ['restore', 'observe']);
  assert.equal(plugin.settingsStore.getSnapshot().revision, 4);
  assert.equal(plugin.settingsStore.getSnapshot().status, 'applied');
  const configUpdates = adapter.client.requests.filter((request) => request.type === 'config.update');
  assert.equal(configUpdates.length, 1);
  assert.equal(configUpdates.at(-1).payload.revision, 4);
  const settingsStatus = await plugin.getSettingsStatus();
  assert.equal(settingsStatus.revision, 4);
  assert.equal(settingsStatus.appliedRevision, 4);
  assert.equal(settingsStatus.runtimeHealth.cardCount, 2);
  assert.equal(settingsStatus.sceneStatePersistence.enabled, true);
  const updated = await plugin.updateSettings({ globalSoundEnabled: true, defaultPolicy: { volume: 0.4 } });
  assert.equal(updated.settings.globalSoundEnabled, true);
  assert.equal(updated.settings.defaultPolicy.volume, 0.4);
  assert.equal(updated.status, 'applied');
  const retried = await plugin.retrySettingsApply();
  assert.equal(retried.status, 'applied');

  await plugin.onunload();
  assert.deepEqual(events, ['restore', 'observe', 'unsubscribe', 'flush']);
});

test('vNext settings API exposes Runtime config apply failure and preserves saved revision', async () => {
  const ctx = context();
  const runtimeError = Object.assign(new Error('Runtime rejected config'), {
    code: 'RUNTIME_CONFIG_AUDIO_INVALID'
  });
  const adapter = new FakeAdapter({ configUpdateError: runtimeError });
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => adapter,
    settingsPersistenceFactory: () => new FakePersistence()
  });

  await plugin.onload();
  const result = await plugin.updateSettings({ defaultPolicy: { volume: 0.4 } });

  assert.equal(result.status, 'apply-failed');
  assert.equal(result.revision, 2);
  assert.equal(result.savedRevision, 2);
  assert.equal(result.appliedRevision, 0);
  assert.deepEqual(result.applyError, {
    code: 'RUNTIME_CONFIG_AUDIO_INVALID',
    message: 'Runtime rejected config'
  });
  assert.equal(result.runtimeStatus.connected, true);
  await plugin.onunload();
});

test('vNext plugin keeps settings recovery diagnostics separate from Runtime startup', async () => {
  const ctx = context();
  const restoreError = Object.assign(new Error('corrupt settings'), {
    code: 'SETTINGS_STORE_LOAD_FAILED',
    details: { path: 'settings.json' }
  });
  const persistence = new FakePersistence({ restoreError });
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    settingsPersistenceFactory: () => persistence
  });

  await plugin.onload();

  assert.equal(plugin.runtimeHost.state, 'running');
  assert.equal(plugin.settingsStore.getSnapshot().revision, 1);
  assert.equal(plugin.settingsDiagnostics.at(-1).code, 'SETTINGS_RUNTIME_RESTORE_FAILED');
  assert.equal(plugin.settingsStore.getSnapshot().status, 'applied');
  await plugin.onunload();
});

test('vNext plugin applies settings again after Runtime restart', async () => {
  const ctx = context();
  const adapter = new FakeAdapter();
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => adapter,
    settingsPersistenceFactory: () => new FakePersistence()
  });

  await plugin.onload();
  const before = adapter.client.requests.filter((request) => request.type === 'config.update').length;
  adapter.emit('restarted');
  await plugin.settingsRuntimeSync.idle();
  const after = adapter.client.requests.filter((request) => request.type === 'config.update').length;

  assert.equal(after, before + 1);
  await plugin.onunload();
});

test('vNext Runtime page status exposes user-readable health and persistence summary', async () => {
  const ctx = context();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => new FakeAdapter() });
  await plugin.onload();

  const status = await plugin.getRuntimePageStatus();
  assert.equal(status.state, 'running');
  assert.equal(status.connected, true);
  assert.equal(status.health.cardCount, 2);
  assert.equal(status.health.layout.layout, 'shelf');
  assert.equal(status.sceneStatePersistence.enabled, true);
  assert.equal(status.sceneStatePersistence.pending, false);
  assert.equal(typeof status.pipeName, 'string');
  assert.equal(status.runtimeVersion, pluginVersion);
  assert.equal('sceneCards' in status.health, false);

  await plugin.onunload();
});

test('vNext Runtime page separates a recovered transport retry from the current failure', async () => {
  const ctx = context();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => new FakeAdapter() });
  await plugin.onload();

  plugin.runtimeHost.lastError = {
    code: 'TRANSPORT_RECONNECT_RETRY',
    message: 'Retrying health after transport failure',
    recoverable: true
  };
  const status = await plugin.getRuntimePageStatus();

  assert.equal(status.state, 'running');
  assert.equal(status.connected, true);
  assert.equal(status.lastError, null);
  assert.deepEqual(status.recoveryNotice, {
    code: 'TRANSPORT_RECONNECT_RETRY',
    message: 'Retrying health after transport failure',
    recoverable: true
  });

  await plugin.onunload();
});

test('vNext diagnostics status does not project recovered transport errors as the current failure', async () => {
  const ctx = context();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => new FakeAdapter() });
  await plugin.onload();

  plugin.runtimeHost.lastError = {
    code: 'TRANSPORT_RECONNECT_RETRY',
    message: 'Retrying health after transport failure',
    recoverable: true
  };
  const status = await plugin.getDiagnosticsPageStatus();

  assert.equal(status.runtime.connected, true);
  assert.equal(status.runtime.currentError, null);
  assert.equal(status.summary.currentFailure, false);

  await plugin.onunload();
});

test('vNext diagnostics status treats a connected scene-state error as the current failure', async () => {
  const ctx = context();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => new FakeAdapter() });
  await plugin.onload();

  plugin.runtimeHost.lastError = {
    code: 'RUNTIME_SCENE_STATE_CARD_INVALID',
    message: 'SceneState card visual decision is invalid',
    recoverable: true
  };
  const status = await plugin.getDiagnosticsPageStatus();

  assert.equal(status.runtime.connected, true);
  assert.equal(status.runtime.currentError.code, 'RUNTIME_SCENE_STATE_CARD_INVALID');
  assert.equal(status.summary.currentFailure, true);

  await plugin.onunload();
});

test('vNext diagnostics status exposes bounded evidence without raw streams or scene card lists', async () => {
  const ctx = context();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => new FakeAdapter() });
  await plugin.onload();

  plugin.runtimeDiagnostics = [];
  plugin.recordRuntimeDiagnostic({
    code: 'TRANSPORT_RECONNECT_RETRY',
    message: 'Retrying health after transport failure',
    stage: 'transport',
    severity: 'warning',
    recoverable: true,
    traceId: 'trace-diagnostics-1',
    details: { source: 'client', stderr: 'must-not-leak' },
    timestamp: '2026-08-12T10:00:00.000Z'
  });
  const status = await plugin.getDiagnosticsPageStatus();

  assert.equal(status.runtime.connected, true);
  assert.equal(status.runtime.health.cardCount, 2);
  assert.equal('sceneCards' in status.runtime.health, false);
  assert.equal(status.diagnostics[0].code, 'TRANSPORT_RECONNECT_RETRY');
  assert.equal(status.diagnostics[0].traceId, 'trace-diagnostics-1');
  assert.equal(status.diagnostics[0].details.stderr, undefined);
  assert.equal(status.summary.warnings, 1);
  assert.equal(status.summary.recoverable, 1);
  assert.equal(status.summary.currentFailure, false);
  assert.equal('stdout' in status, false);
  assert.equal('stderr' in status, false);

  await plugin.onunload();
});

test('vNext Runtime retry reuses the existing lifecycle and does not duplicate a running host', async () => {
  const ctx = context();
  let created = 0;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => {
      created += 1;
      return new FakeAdapter();
    }
  });
  await plugin.onload();

  const runningRetry = await plugin.retryRuntime();
  assert.equal(created, 1);
  assert.equal(runningRetry.state, 'running');

  await plugin.stopRuntimeAfterFailure();
  const restarted = await plugin.retryRuntime();
  assert.equal(created, 2);
  assert.equal(restarted.state, 'running');
  assert.equal(restarted.connected, true);

  await plugin.onunload();
});

test('vNext Runtime retry restarts a host that is running but has lost its Pipe connection', async () => {
  const ctx = context();
  let created = 0;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => {
      created += 1;
      return new FakeAdapter();
    }
  });
  await plugin.onload();

  plugin.runtimeHost.client.connected = false;
  plugin.runtimeHost.client.state = 'disconnected';
  const restarted = await plugin.retryRuntime();

  assert.equal(created, 2);
  assert.equal(restarted.state, 'running');
  assert.equal(restarted.connected, true);

  await plugin.onunload();
});

test('vNext Runtime retry restarts when a recoverable transport diagnostic remains after reconnection', async () => {
  const ctx = context();
  let created = 0;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => {
      created += 1;
      return new FakeAdapter();
    }
  });
  await plugin.onload();

  plugin.runtimeHost.lastError = {
    code: 'TRANSPORT_RECONNECT_RETRY',
    message: 'Retrying health after transport failure',
    recoverable: true
  };
  const restarted = await plugin.retryRuntime();

  assert.equal(created, 2);
  assert.equal(restarted.state, 'running');
  assert.equal(restarted.connected, true);

  await plugin.onunload();
});

test('vNext Runtime retry returns a recoverable failed status when a new host cannot start', async () => {
  const ctx = context();
  let created = 0;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => {
      created += 1;
      if (created > 1) {
        return {
          state: 'stopped',
          client: null,
          async start() { throw Object.assign(new Error('bundled Runtime missing'), { code: 'RUNTIME_START_FAILED' }); },
          async stop() {},
          getRuntimeStatus() { return { state: 'failed', message: 'Runtime 启动或恢复失败', connected: false, clientState: null, lastError: null }; },
          on() {}
        };
      }
      return new FakeAdapter();
    }
  });
  await plugin.onload();
  await plugin.stopRuntimeAfterFailure();

  const result = await plugin.retryRuntime();
  assert.equal(created, 2);
  assert.equal(result.state, 'failed');
  assert.equal(result.lastError.code, 'RUNTIME_START_FAILED');
  assert.equal(result.lastError.recoverable, true);
  assert.equal(result.lastError.userAction, 'retry');

  await plugin.onunload();
});

test('vNext plugin exposes a bounded Runtime test API through context', async () => {
  const ctx = context();
  const adapter = new FakeAdapter();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });

  await plugin.onload();
  const status = await ctx._notificationHubVNextPlugin.getRuntimeTestStatus();
  assert.equal(status.state, 'running');
  assert.equal(status.runtimeStatus.state, 'running');
  assert.equal(status.runtimeStatus.message, 'Runtime 正常运行');
  assert.equal(status.health.sceneCards.length, 2);

  const created = await ctx._notificationHubVNextPlugin.createRuntimeTestCard({
    title: '  测试标题  ',
    body: '中文 / emoji ✦'
  });
  assert.match(created.card.id, /^nh-vnext-test-/);
  assert.equal(created.card.title, '测试标题');
  assert.equal(adapter.client.requests.at(-1).type, 'scene.create');

  const cleared = await ctx._notificationHubVNextPlugin.clearRuntimeTestCards();
  assert.deepEqual(cleared.dismissed, ['nh-vnext-test-existing']);
  assert.deepEqual(adapter.client.requests.slice(-2).map((request) => request.type), ['scene.dismiss', 'health']);

  const layout = await ctx._notificationHubVNextPlugin.applyRuntimeTestLayout({
    direction: 'left',
    anchor: 'top-right',
    spacing: 8
  });
  const layoutRequest = adapter.client.requests.filter((request) => request.type === 'scene.set-mode').at(-1);
  assert.ok(layoutRequest);
  assert.deepEqual(layoutRequest.payload, {
    layout: 'shelf',
    direction: 'left',
    anchor: 'top-right',
    spacing: 8
  });
  assert.deepEqual(layout.layout, { layout: 'shelf' });

  await plugin.onunload();
  assert.equal(ctx._notificationHubVNextPlugin, undefined);
});

test('vNext plugin applies formal Shelf settings through the Runtime API', async () => {
  const ctx = context();
  const adapter = new FakeAdapter();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });

  await plugin.onload();
  const result = await plugin.updateLayoutSettings({
    direction: 'left',
    anchor: 'top-right',
    spacing: 8
  });

  assert.equal(result.layoutStatus.status, 'applied');
  assert.deepEqual(result.layoutStatus.applied, {
    layout: 'shelf',
    direction: 'left',
    anchor: 'top-right',
    spacing: 8
  });
  const request = adapter.client.requests.filter((entry) => entry.type === 'scene.set-mode').at(-1);
  assert.deepEqual(request.payload, {
    layout: 'shelf',
    direction: 'left',
    anchor: 'top-right',
    spacing: 8
  });
  await plugin.onunload();
});

test('vNext plugin keeps the previous layout after a failed formal layout apply', async () => {
  const ctx = context();
  const adapter = new FakeAdapter();
  const originalRequest = adapter.client.request;
  let failLayout = false;
  adapter.client.request = async function (type, payload, options) {
    if (type === 'scene.set-mode' && failLayout) {
      throw Object.assign(new Error('Shelf cards exceed the work area width'), {
        code: 'LAYOUT_SHELF_OUT_OF_BOUNDS'
      });
    }
    return originalRequest.call(this, type, payload, options);
  };
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });

  await plugin.onload();
  const applied = await plugin.updateLayoutSettings({
    direction: 'left',
    anchor: 'top-right',
    spacing: 8
  });
  assert.deepEqual(applied.layoutStatus.applied, {
    layout: 'shelf', direction: 'left', anchor: 'top-right', spacing: 8
  });

  failLayout = true;
  const result = await plugin.updateLayoutSettings({
    direction: 'right',
    anchor: 'bottom-left',
    spacing: 12
  });

  assert.equal(result.layoutStatus.status, 'apply-failed');
  assert.deepEqual(result.layoutStatus.applied, {
    layout: 'shelf', direction: 'left', anchor: 'top-right', spacing: 8
  });
  assert.equal(result.layoutStatus.error.code, 'LAYOUT_SHELF_OUT_OF_BOUNDS');
  await plugin.onunload();
});

test('vNext plugin rejects invalid formal layout settings before Runtime request', async () => {
  const ctx = context();
  const adapter = new FakeAdapter();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });

  await plugin.onload();
  await assert.rejects(
    plugin.updateLayoutSettings({ direction: 'left', anchor: 'bottom-left', spacing: 12 }),
    (error) => error.code === 'RUNTIME_LAYOUT_INVALID' && error.details.direction === 'left'
  );
  assert.equal(adapter.client.requests.some((request) => request.type === 'scene.set-mode'), false);
  await plugin.onunload();
});

test('vNext plugin rejects formal layout changes when Runtime is unavailable', async () => {
  const ctx = context({ runtimeEnabled: false });
  const plugin = new NotificationHubVNextPlugin(ctx);

  await plugin.onload();
  await assert.rejects(
    plugin.updateLayoutSettings({ direction: 'right', anchor: 'bottom-left', spacing: 12 }),
    (error) => error.code === 'RUNTIME_LAYOUT_RUNTIME_UNAVAILABLE'
  );
  await plugin.onunload();
});

test('vNext plugin rejects invalid shelf layout choices before Runtime request', async () => {
  const ctx = context();
  const adapter = new FakeAdapter();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });

  await plugin.onload();
  await assert.rejects(
    plugin.applyRuntimeTestLayout({ direction: 'down', anchor: 'top-left', spacing: -1 }),
    (error) => error.code === 'RUNTIME_TEST_LAYOUT_INVALID'
  );
  assert.equal(adapter.client.requests.some((request) => request.type === 'scene.set-mode'), false);
  await plugin.onunload();
});

test('vNext test cards are placed without overlapping existing cards', async () => {
  const ctx = context();
  const adapter = new FakeAdapter();
  const cards = [];
  adapter.client.request = async function request(type, payload) {
    this.requests.push({ type, payload });
    if (type === 'health') {
      return {
        type: 'ack',
        payload: {
          result: {
            sceneCards: cards.map((card) => ({ ...card })),
            workArea: { left: 0, top: 0, width: 1000, height: 800 }
          }
        }
      };
    }
    if (type === 'scene.create') cards.push({ ...payload });
    return { type: 'ack', payload: { result: { sceneCards: cards.map((card) => ({ ...card })) } } };
  };
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });

  await plugin.onload();
  const first = await plugin.createRuntimeTestCard({ title: 'First', body: 'First card' });
  const second = await plugin.createRuntimeTestCard({ title: 'Second', body: 'Second card' });

  assert.deepEqual(
    [first.card.x, first.card.y, second.card.x, second.card.y],
    [80, 80, 460, 80]
  );
  assert.equal(second.card.x > first.card.x, true);

  await plugin.onunload();
});

test('vNext plugin instance exposes a JSON-safe install response boundary', async () => {
  const ctx = context();
  let timer;
  const adapter = new FakeAdapter();
  adapter.start = async function start() {
    timer = setTimeout(() => {}, 60_000);
    this.timer = timer;
  };
  adapter.stop = async function stop() {
    clearTimeout(timer);
    this.timer = null;
  };
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });

  await plugin.onload();
  const serialized = JSON.stringify({ id: pluginName, ctx, instance: plugin });

  assert.match(serialized, /"pluginName":"notification-hub-vnext"/);
  assert.match(serialized, /"pluginVersion":"0\.1\.7"/);
  await plugin.onunload();
});

test('vNext plugin does not start Runtime when disabled', async () => {
  const ctx = context({ runtimeEnabled: false });
  let factoryCalls = 0;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => {
      factoryCalls += 1;
      return new FakeAdapter();
    }
  });

  await plugin.onload();
  assert.equal(factoryCalls, 0);
  assert.equal(plugin.runtimeHost, null);
  assert.ok(plugin.settingsRuntimeSync);
  const settingsStatus = await plugin.getSettingsStatus();
  assert.equal(settingsStatus.runtimeHealth, null);
  assert.equal(settingsStatus.sceneStatePersistence.enabled, false);
  await plugin.onunload();
});

test('vNext plugin restores and flushes settings even when Runtime is disabled', async () => {
  const ctx = context({ runtimeEnabled: false });
  const events = [];
  const persistence = new FakePersistence({
    restoreResult: {
      version: 1,
      revision: 5,
      settings: { globalSoundEnabled: false },
      updatedAt: '2026-08-05T00:00:00.000Z'
    },
    events
  });
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    settingsPersistenceFactory: () => persistence
  });

  await plugin.onload();
  assert.equal(plugin.settingsStore.getSnapshot().revision, 5);
  assert.equal(plugin.settingsStore.getSnapshot().status, 'saved');
  await plugin.onunload();
  assert.deepEqual(events, ['restore', 'observe', 'unsubscribe', 'flush']);
});

test('vNext plugin restores notifications, observes changes, and exposes the Notification API', async () => {
  const ctx = context();
  const events = [];
  const persistence = new FakePersistence({ events });
  let factoryInput;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    notificationPersistenceFactory: (contextValue, options) => {
      factoryInput = { contextValue, options };
      return persistence;
    }
  });

  await plugin.onload();
  assert.equal(plugin.notificationStore.size, 0);
  assert.equal(plugin.notificationApi.store, plugin.notificationStore);
  assert.equal(plugin.notificationPersistence, persistence);
  assert.deepEqual(events, ['restore', 'observe']);
  assert.equal(ctx._notificationHubVNextNotificationApi, plugin.notificationApi);
  assert.equal(ctx._notificationHubVNextSoundSettingsServices, plugin.soundSettingsServices);
  assert.equal(ctx._notificationHubVNextSoundAssetServices, plugin.soundAssetServices);
  assert.equal(Object.isFrozen(ctx._notificationHubVNextSoundSettingsServices), true);
  assert.equal(Object.isFrozen(ctx._notificationHubVNextSoundAssetServices), true);
  assert.equal(factoryInput.contextValue, ctx);
  assert.equal(factoryInput.options.store, plugin.notificationStore);

  const loadedSettingsServices = plugin.soundSettingsServices;
  const loadedAssetServices = plugin.soundAssetServices;
  await plugin.stopNotificationPersistence();
  assert.notEqual(plugin.soundSettingsServices, loadedSettingsServices);
  assert.notEqual(plugin.soundAssetServices, loadedAssetServices);
  assert.equal(ctx._notificationHubVNextSoundSettingsServices, plugin.soundSettingsServices);
  assert.equal(ctx._notificationHubVNextSoundAssetServices, plugin.soundAssetServices);

  await plugin.onunload();
  assert.deepEqual(events, ['restore', 'observe', 'unsubscribe', 'flush']);
  assert.equal(ctx._notificationHubVNextNotificationApi, undefined);
  assert.equal(ctx._notificationHubVNextSoundSettingsServices, undefined);
  assert.equal(ctx._notificationHubVNextSoundAssetServices, undefined);
});

test('vNext ingests tool execution errors through the Hana bus subscription', async () => {
  const harness = createBusHarness();
  const ctx = context({ notificationPersistenceEnabled: false });
  ctx.bus = harness.bus;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter()
  });

  await plugin.onload();
  harness.emit({
    type: 'tool_execution_end',
    eventId: 'tool-event-lifecycle-1',
    toolCallId: 'call-lifecycle-1',
    toolName: 'exec_command',
    isError: true,
    error: '工具执行失败'
  }, 'session-tool');

  const records = plugin.notificationApi.listNotifications();
  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'tool_error');
  assert.equal(records[0].source, 'hana.tool');
  assert.equal(records[0].importance, 'normal');
  assert.equal(records[0].metadata.eventClassification.classification, 'tool_error');
  await plugin.onunload();
});

test('vNext ingests successful Pi tool execution through the Hana bus subscription', async () => {
  const harness = createBusHarness();
  const ctx = context({ notificationPersistenceEnabled: false });
  ctx.bus = harness.bus;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter()
  });

  await plugin.onload();
  harness.emit({
    type: 'tool_execution_end',
    toolCallId: 'call-lifecycle-success-1',
    toolName: 'read',
    isError: false,
    result: {
      content: [{ type: 'text', text: '文件内容已读取' }],
      details: {}
    }
  }, 'session-tool-success');

  const records = plugin.notificationApi.listNotifications();
  assert.equal(records.length, 1);
  assert.equal(records[0].notificationId, 'hana-tool-result-call-lifecycle-success-1');
  assert.equal(records[0].type, 'tool_result');
  assert.equal(records[0].source, 'hana.tool');
  assert.equal(records[0].title, '工具执行完成');
  assert.equal(records[0].content, '文件内容已读取');
  assert.equal(records[0].metadata.toolName, 'read');
  assert.equal(records[0].metadata.isError, false);
  assert.equal(records[0].metadata.eventClassification.classification, 'tool_result');
  await plugin.onunload();
});

test('vNext ingests system warning events through the Hana bus subscription', async () => {
  const harness = createBusHarness();
  const ctx = context({ notificationPersistenceEnabled: false });
  ctx.bus = harness.bus;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter()
  });

  await plugin.onload();
  harness.emit({
    type: 'session_unhealthy_warning',
    recentErrors: 2,
    totalChecked: 4
  }, 'session-system');

  const records = plugin.notificationApi.listNotifications();
  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'system_notification');
  assert.equal(records[0].source, 'hana.system');
  assert.equal(records[0].title, '会话健康警告');
  assert.equal(records[0].importance, 'high');
  assert.equal(records[0].metadata.eventClassification.classification, 'system_notification');
  await plugin.onunload();
});

test('vNext subscribes Hana message_end events and releases the subscription', async () => {
  const harness = createBusHarness();
  const ctx = context({ notificationPersistenceEnabled: false });
  ctx.bus = harness.bus;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter()
  });

  await plugin.onload();
  harness.emit({
    type: 'message_end',
    message: {
      role: 'assistant',
      id: 'message-end-1',
      stopReason: 'end_turn',
      content: [{ type: 'text', text: '真实回复' }]
    }
  }, 'session-a');

  assert.equal(plugin.notificationApi.listNotifications().length, 1);
  assert.equal(plugin.notificationApi.listNotifications()[0].content, '真实回复');
  await plugin.onunload();
  assert.equal(harness.unsubscribed, true);
  assert.equal(harness.listener, null);
});

test('vNext notification scene carries one resolved visual decision', async () => {
  // Isolate from the host data directory: event presentation persistence defaults to on,
  // and a real persisted binding would override the expectations below.
  const ctx = context({ notificationPersistenceEnabled: false, visualSettingsPersistenceEnabled: false, eventPresentationSettingsPersistenceEnabled: false });
  const adapter = new FakeAdapter();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });

  await plugin.onload();
  plugin.stopNotificationSceneSubscription();
  await plugin.updateVisualSettings({ profile: {
    global: { enabled: true, defaultMode: 'stack', preset: 'minimal', intensity: 'balanced' },
    categories: { error: { enabled: true, preset: 'warning', intensity: 'expressive' } },
    card: { types: { minimal: { properties: { space: { anchor: 'top-right', gap: 20, margin: 24 } }, appearance: { size: 'large', aspectRatio: 'wide', width: 600, backgroundColor: '#123456', backgroundAssetId: null, borderRadius: 24, opacity: 0.82 } } } }
  } });
  const record = plugin.notificationApi.createNotification({
    notificationId: 'notification-visual-critical',
    traceId: 'trace-visual-critical',
    type: 'tool_error',
    source: 'test',
    title: '错误通知',
    content: 'body',
    importance: 'critical'
  });
  await plugin.showNotificationScene(record);

  const create = adapter.client.requests.find((request) => request.type === 'scene.create');
  assert.ok(create);
  assert.deepEqual(create.payload.visual, {
    enabled: true,
    preset: 'critical',
    intensity: 'balanced',
    category: 'tool',
    cardType: 'minimal',
    behavior: { layout: 'simple', boundary: 'work-area' },
    interaction: { dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 30000 },
    appearance: { size: 'large', aspectRatio: 'wide', backgroundColor: '#123456', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 24, opacity: 0.82 }
  });
  assert.equal(create.payload.width, 600);
  assert.equal(create.payload.height, 288);
  assert.equal('gap' in create.payload, false);
  assert.equal('margin' in create.payload, false);
  assert.deepEqual(create.payload.presentation, {
    eventId: 'tool.execution.failed',
    categoryId: 'tool',
    eventTypeId: 'execution.failed',
    visualProfileId: 'visual.tool.default'
  });
  assert.deepEqual(create.payload.behavior, {
    behaviorProfileId: 'stack',
    behaviorChannelId: 'visual.event.stack'
  });

  await plugin.onunload();
});

test('vNext notification scene applies an explicit event visual profile before legacy category policy', async () => {
  // Isolate from the host data directory: a persisted event binding from a real install
  // would replace the event default presentation profile this test is asserting on.
  const ctx = context({ notificationPersistenceEnabled: false, visualSettingsPersistenceEnabled: false, eventPresentationSettingsPersistenceEnabled: false });
  const adapter = new FakeAdapter();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });

  await plugin.onload();
  plugin.stopNotificationSceneSubscription();
  await plugin.updateVisualSettings({ profile: {
    global: { enabled: true, defaultMode: 'stack', preset: 'minimal', intensity: 'balanced' },
    categories: { tool: { enabled: true, preset: 'accent', intensity: 'balanced' } },
    visualProfiles: { 'visual.tool.default': { preset: 'soft', intensity: 'expressive' } }
  } });
  const record = plugin.notificationApi.createNotification({
    notificationId: 'notification-visual-profile',
    traceId: 'trace-visual-profile',
    type: 'tool_completed',
    source: 'test',
    title: '工具完成',
    content: 'body',
    importance: 'normal'
  });
  await plugin.showNotificationScene(record);

  const create = adapter.client.requests.find((request) => request.type === 'scene.create');
  assert.deepEqual(create?.payload.visual, {
    enabled: true,
    preset: 'soft',
    intensity: 'expressive',
    category: 'tool',
    cardType: 'minimal',
    behavior: { layout: 'simple', boundary: 'work-area' },
    interaction: { dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 30000 },
    appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0e1916', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 16, opacity: 0.96 }
  });
  assert.deepEqual(create?.payload.presentation, {
    eventId: 'tool.execution.succeeded',
    categoryId: 'tool',
    eventTypeId: 'execution.succeeded',
    visualProfileId: 'visual.tool.default'
  });
  assert.deepEqual(create?.payload.behavior, {
    behaviorProfileId: 'stack',
    behaviorChannelId: 'visual.event.stack'
  });

  await plugin.onunload();
});

test('vNext notification scene resolves the applied Registry profile in legacy Runtime mode', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, visualSettingsPersistenceEnabled: false });
  const adapter = new FakeAdapter();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });
  await plugin.onload();
  plugin.stopNotificationSceneSubscription();
  plugin.queueVisualRegistryPersistence = () => {};
  plugin.saveVisualProfile({ profileId: 'visual.applied', name: '应用方案', profile: {
    global: { enabled: true, preset: 'critical', intensity: 'expressive' },
    categories: { tool: { enabled: true, preset: 'critical', intensity: 'expressive' } },
    card: { types: { minimal: { appearance: { size: 'large', backgroundColor: '#123456' } } } }
  } });
  plugin.applyVisualProfileToEvents({ profileId: 'visual.applied', eventIds: ['tool.execution.succeeded'], behaviorChannelId: 'applied.main' });
  const record = plugin.notificationApi.createNotification({ notificationId: 'notification-applied-profile', traceId: 'trace-applied-profile', type: 'tool_completed', source: 'test', title: '应用方案', content: 'body' });
  await plugin.showNotificationScene(record);
  const create = adapter.client.requests.find((request) => request.type === 'scene.create');
  assert.equal(create.payload.behavior.behaviorChannelId, 'visual.event.stack');
  assert.equal(create.payload.visual.preset, 'critical');
  assert.equal(create.payload.visual.appearance.size, 'large');
  await plugin.onunload();
});

test('vNext notification scene no longer evicts stack cards for leftover shelf width', async () => {
  // Isolate from the host data directory and give the existing cards the same channel
  // as unbound defaultMode stack. Plugin no longer lifts oldest cards for 8-count or shelf width.
  const ctx = context({ notificationPersistenceEnabled: false, eventPresentationSettingsPersistenceEnabled: false });
  const adapter = new FakeAdapter();
  const sceneCards = [
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `nh-vnext-notification-existing-${index}`,
      title: `通知 ${index}`,
      body: 'body',
      x: index * 480,
      y: 0,
      width: 420,
      height: 220,
      behavior: { behaviorProfileId: 'stack', behaviorChannelId: 'visual.event.stack' }
    })),
    { id: 'user-card', title: 'User', body: 'keep', x: 0, y: 300, width: 360, height: 180 }
  ];
  adapter.client.request = async function request(type, payload) {
    this.requests.push({ type, payload });
    if (type === 'health') {
      return {
        type: 'ack',
        payload: {
          result: {
            layout: { layout: 'shelf', direction: 'right', anchor: 'bottom-left', spacing: 12 },
            sceneCards: sceneCards.map((card) => ({ ...card })),
            workArea: { left: 0, top: 0, width: 1920, height: 1080 }
          }
        }
      };
    }
    if (type === 'scene.dismiss') {
      const index = sceneCards.findIndex((card) => card.id === payload.id);
      if (index >= 0) sceneCards.splice(index, 1);
      return { type: 'ack', payload: { result: { status: 'changed' } } };
    }
    if (type === 'scene.create') {
      sceneCards.push({ ...payload });
      return { type: 'ack', payload: { result: { status: 'created' } } };
    }
    if (type === 'visual-assets.configure' || type === 'font-assets.configure' || type === 'agent-avatars.configure') {
      return {
        type: 'ack',
        payload: {
          result: {
            applied: true,
            assetCount: Array.isArray(payload?.items) ? payload.items.length : (Array.isArray(payload?.assets) ? payload.assets.length : 0)
          }
        }
      };
    }
    return { type: 'ack', payload: { result: {} } };
  };
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });

  await plugin.onload();
  plugin.stopNotificationSceneSubscription();
  await plugin.updateVisualSettings({ profile: { global: { enabled: true, defaultMode: 'stack' } } });
  const record = plugin.notificationApi.createNotification({
    notificationId: 'notification-overflow',
    traceId: 'trace-overflow',
    type: 'assistant_message',
    source: 'test',
    title: '新通知',
    content: 'body'
  });
  await plugin.showNotificationScene(record);

  const dismissals = adapter.client.requests
    .filter((request) => request.type === 'scene.dismiss')
    .map((request) => request.payload.id);
  const create = adapter.client.requests.find((request) => request.type === 'scene.create' && request.payload.id.includes('notification-overflow'));
  assert.deepEqual(dismissals, []);
  assert.ok(create);

  await plugin.onunload();
});

test('vNext forwards a real notification into a Native Scene card', async () => {
  const harness = createBusHarness();
  const ctx = context({ notificationPersistenceEnabled: false });
  ctx.bus = harness.bus;
  const adapter = new FakeAdapter();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });

  await plugin.onload();
  await plugin.updateVisualSettings({ profile: { global: { enabled: true, defaultMode: 'stack' } } });
  harness.emit({
    type: 'message_end',
    message: {
      role: 'assistant',
      id: 'scene-forward-message-1',
      stopReason: 'end_turn',
      content: [{ type: 'text', text: '真实 Scene 卡片内容' }]
    }
  }, 'session-scene-forward');
  await new Promise((resolve) => setImmediate(resolve));

  const createRequest = adapter.client.requests.find((request) => request.type === 'scene.create');
  assert.ok(createRequest);
  assert.match(createRequest.payload.id, /^nh-vnext-notification-/);
  assert.equal(createRequest.payload.title, '助手回复完成');
  assert.equal(createRequest.payload.body, '真实 Scene 卡片内容');
  assert.equal(plugin.notificationApi.listNotifications()[0].status, 'shown');
  await plugin.onunload();
});

test('vNext uses configured card lifetime including zero seconds for new notification scenes', async () => {
  const ctx = context({ notificationPersistenceEnabled: false });
  const adapter = new FakeAdapter();
  const persistence = {
    filePath: 'C:\\Hana\\data\\notification-display-settings.json',
    async restore() { return { mode: 'preset', limit: 100, cardLifetimeSeconds: 0 }; },
    async save() { return this.filePath; }
  };
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => adapter,
    notificationDisplaySettingsPersistenceFactory: () => persistence
  });
  await plugin.onload();
  const record = plugin.notificationApi.createNotification({
    notificationId: 'lifetime-zero',
    traceId: 'lifetime-zero-trace',
    type: 'message',
    source: 'test',
    title: '立即消失',
    content: '持续时间为零的测试通知'
  });
  await plugin.showNotificationScene(record);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const dismissRequest = adapter.client.requests.find((request) => request.type === 'scene.dismiss' && request.payload.id === 'nh-vnext-notification-lifetime-zero');
  assert.equal(dismissRequest, undefined);
  await plugin.onunload();
});

test('vNext reconciles Native Scene dismissal for notification cards', async () => {
  const harness = createBusHarness();
  const ctx = context({ notificationPersistenceEnabled: false });
  ctx.bus = harness.bus;
  const adapter = new FakeAdapter();
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });

  await plugin.onload();
  await plugin.updateVisualSettings({ profile: { global: { enabled: true, defaultMode: 'stack' } } });
  for (const [id, text] of [['scene-dismiss-1', '第一张'], ['scene-dismiss-2', '第二张']]) {
    harness.emit({
      type: 'message_end',
      message: {
        role: 'assistant',
        id,
        stopReason: 'end_turn',
        content: [{ type: 'text', text }]
      }
    }, `session-${id}`);
  }
  await new Promise((resolve) => setImmediate(resolve));

  const records = plugin.notificationApi.listNotifications();
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.status), ['shown', 'shown']);
  assert.equal(adapter.client.requests.filter((request) => request.type === 'scene.create').length, 2);

  const firstCardId = adapter.client.requests.find((request) => request.type === 'scene.create')?.payload.id;
  adapter.emit('scene.changed', {
    payload: {
      snapshot: {
        cards: [],
        cardOrder: []
      },
      change: {
        target: 'card',
        targetId: firstCardId,
        reason: 'user-close'
      }
    }
  });
  const dismissedRecords = plugin.notificationApi.listNotifications();
  const firstNotificationId = firstCardId.slice('nh-vnext-notification-'.length);
  assert.equal(dismissedRecords.find((record) => record.notificationId === firstNotificationId)?.status, 'dismissed');
  assert.equal(dismissedRecords.find((record) => record.notificationId !== firstNotificationId)?.status, 'shown');
  await plugin.onunload();
});

test('vNext plugin keeps loading without a Hana bus', async () => {
  const ctx = context({ runtimeEnabled: false });
  const plugin = new NotificationHubVNextPlugin(ctx);

  await plugin.onload();

  assert.equal(plugin.notificationEventAdapter, null);
  assert.equal(plugin.notificationEventUnsubscribe, null);
  await plugin.onunload();
});

test('bus event ingestion failure is diagnostic only and does not reject the lifecycle', async () => {
  const harness = createBusHarness();
  const ctx = context({ runtimeEnabled: false, notificationPersistenceEnabled: false });
  ctx.bus = harness.bus;
  const plugin = new NotificationHubVNextPlugin(ctx);

  await plugin.onload();
  harness.emit({
    type: 'session:message',
    role: 'assistant',
    content: '失败后仍能继续运行',
    timestamp: 'invalid timestamp'
  }, 'session-a');

  assert.equal(plugin.notificationStore.size, 0);
  assert.equal(plugin.notificationDiagnostics.at(-1).stage, 'event');
  assert.equal(plugin.notificationDiagnostics.at(-1).code, 'NOTIFICATION_RECORD_TIMESTAMP_INVALID');
  await plugin.onunload();
});

test('Notification persistence restore failure is diagnostic only and does not block Runtime', async () => {
  const ctx = context();
  const events = [];
  const restoreError = Object.assign(new Error('corrupt notifications'), {
    code: 'NOTIFICATION_STORE_LOAD_FAILED',
    details: { path: 'notifications.json' }
  });
  const persistence = new FakePersistence({ restoreError, events });
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    notificationPersistenceFactory: () => persistence
  });

  await plugin.onload();
  assert.equal(plugin.runtimeHost.state, 'running');
  assert.equal(plugin.notificationDiagnostics.at(-1).code, 'NOTIFICATION_STORE_LOAD_FAILED');
  assert.deepEqual(events, ['restore']);
  assert.equal(ctx.logs.some(([level, message]) => level === 'warn' && message.includes('NOTIFICATION_STORE_LOAD_FAILED')), true);
  await plugin.onunload();
});

test('Notification persistence flush failure does not mask Runtime stop', async () => {
  const ctx = context();
  const events = [];
  const flushError = Object.assign(new Error('disk full'), {
    code: 'NOTIFICATION_STORE_PERSIST_FAILED',
    details: { path: 'notifications.json' }
  });
  const persistence = new FakePersistence({ flushError, events });
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    notificationPersistenceFactory: () => persistence
  });

  await plugin.onload();
  await plugin.onunload();
  assert.deepEqual(events, ['restore', 'observe', 'unsubscribe', 'flush']);
  assert.equal(plugin.runtimeHost, null);
  assert.equal(plugin.notificationDiagnostics.at(-1).code, 'NOTIFICATION_STORE_PERSIST_FAILED');
  assert.equal(ctx.logs.some(([level, message]) => level === 'warn' && message.includes('NOTIFICATION_STORE_PERSIST_FAILED')), true);
});

test('Notification persistence can be disabled without creating a coordinator', async () => {
  const ctx = context({ notificationPersistenceEnabled: false });
  let factoryCalls = 0;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => new FakeAdapter(),
    notificationPersistenceFactory: () => {
      factoryCalls += 1;
      return new FakePersistence();
    }
  });

  await plugin.onload();
  assert.equal(factoryCalls, 0);
  assert.equal(plugin.notificationPersistence, null);
  assert.equal(plugin.notificationStore.size, 0);
  await plugin.onunload();
});

test('Plugin injects a narrow notification center service without visual methods', async () => {
  const ctx = context({ notificationPersistenceEnabled: false, runtimeEnabled: false });
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => new FakeAdapter() });

  await plugin.onload();
  assert.strictEqual(ctx._notificationHubVNextNotificationCenterServices, plugin.notificationCenterServices);
  assert.strictEqual(ctx._notificationHubVNextSoundSettingsServices, plugin.soundSettingsServices);
  assert.equal(typeof ctx._notificationHubVNextSoundSettingsServices.getSoundSettingsStatus, 'function');
  assert.equal('openVisualWorkbenchCard' in ctx._notificationHubVNextSoundSettingsServices, false);
  assert.equal('getRuntimeTestStatus' in ctx._notificationHubVNextSoundSettingsServices, false);
  assert.equal('listNotifications' in ctx._notificationHubVNextSoundSettingsServices, false);
  assert.equal(typeof ctx._notificationHubVNextNotificationCenterServices.listNotifications, 'function');
  assert.equal(typeof ctx._notificationHubVNextNotificationCenterServices.getNotificationDisplaySettings, 'function');
  assert.equal('openVisualWorkbenchCard' in ctx._notificationHubVNextNotificationCenterServices, false);
  assert.equal('_notificationHubVNextPlugin' in ctx._notificationHubVNextNotificationCenterServices, false);
  await plugin.onunload();
  assert.equal('_notificationHubVNextNotificationCenterServices' in ctx, false);
  assert.equal('_notificationHubVNextSoundSettingsServices' in ctx, false);
});

test('Runtime startup failure is logged and does not escape plugin onload', async () => {
  const ctx = context();
  let stopped = 0;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => ({
      on() {},
      async start() {
        throw Object.assign(new Error('missing bundled runtime'), { code: 'RUNTIME_START_FAILED' });
      },
      async stop() { stopped += 1; }
    })
  });

  await plugin.onload();
  assert.equal(plugin.runtimeHost, null);
  assert.equal(plugin.runtimeError.code, 'RUNTIME_START_FAILED');
  assert.equal(plugin.runtimeStatus.state, 'failed');
  assert.equal(plugin.runtimeStatus.lastError.code, 'RUNTIME_START_FAILED');
  assert.equal(stopped, 1);
  assert.equal(ctx.logs.some(([level, message]) => level === 'error' && message.includes('RUNTIME_START_FAILED')), true);
});
