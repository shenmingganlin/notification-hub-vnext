import assert from 'node:assert/strict';
import test from 'node:test';
import NotificationHubVNextPlugin from '../../plugin/index.js';

function setup({ request, mode = 'takeover' } = {}) {
  const calls = [];
  const soundCalls = [];
  const scheduler = { schedule: async (...args) => { soundCalls.push(args); return { status: 'played', playback: { played: true } }; }, waitForIdle: async () => true, clear() {} };
  const plugin = new NotificationHubVNextPlugin({ config: { visualRuntimeMode: mode, globalSoundEnabled: true }, dataDir: '', pluginDir: process.cwd() }, { soundSchedulerFactory: () => scheduler, soundBackendFactory: () => ({ warmup: async () => true, playCue: async () => ({ played: true }), playFile: async () => ({ played: true }), dispose() {} }) });
  plugin.visualRuntimeModeController.setMode(mode, { declaration: 'test' });
  plugin.runtimeHost = { state: 'running', client: { async request(type, payload, options) { calls.push({ type, payload, options }); return request(type, payload, options); } } };
  plugin.stopNotificationSceneSubscription();
  return { plugin, calls, soundCalls };
}

test('Native takeover failure rolls back to legacy and preserves one notification status transition', async () => {
  let creates = 0;
  const { plugin, calls, soundCalls } = setup({ request: async (type) => {
    if (type === 'health') return { payload: { result: { sceneCards: [], layout: { spacing: 12, direction: 'right', anchor: 'bottom-left' }, workArea: { left: 0, top: 0, width: 1920, height: 1080 } } } };
    if (type === 'scene.create') { creates += 1; if (creates === 1) throw Object.assign(new Error('native create failed'), { code: 'NATIVE_CREATE_FAILED' }); return { payload: { result: { status: 'created' } } }; }
    return { payload: { result: {} } };
  } });
  await plugin.updateSoundSettings({ globalSoundEnabled: true, profile: { global: { enabled: true, suppressDuplicates: false }, soundProfiles: { 'sound.default': { enabled: true, cue: 'chat-incoming' } } } });
  const ingested = plugin.notificationApi.ingestEvent({ event: { eventId: 'takeover-fallback-event', type: 'toolUse', stopReason: 'tool_completed', traceId: 'takeover-fallback-trace' }, notification: { notificationId: 'takeover-fallback', type: 'tool_completed', source: 'test', title: 'Tool', content: 'body' }, profiles: [{ id: 'default' }] });
  await ingested.sound.playback;
  await plugin.showNotificationScene(ingested.record);
  assert.equal(calls.filter((item) => item.type === 'scene.create').length, 2);
  assert.equal(soundCalls.length, 1);
  assert.equal(plugin.getVisualRuntimeModeStatus().mode, 'legacy');
  assert.equal(plugin.notificationStore.get('takeover-fallback').status, 'shown');
});

test('unsupported takeover policy rolls back before Native request and legacy creates once', async () => {
  const { plugin, calls, soundCalls } = setup({ request: async (type) => {
    if (type === 'health') return { payload: { result: { sceneCards: [], layout: { spacing: 12, direction: 'right', anchor: 'bottom-left' }, workArea: { left: 0, top: 0, width: 1920, height: 1080 } } } };
    return { payload: { result: { status: 'created' } } };
  } });
  await plugin.updateEventPresentationSettings({ events: { 'tool.execution.succeeded': { soundProfileId: 'sound.default', visualProfileId: 'visual.default', behaviorProfileId: 'ticker', behaviorChannelId: 'ticker.main' } } });
  await plugin.updateSoundSettings({ globalSoundEnabled: true, profile: { global: { enabled: true, suppressDuplicates: false }, soundProfiles: { 'sound.default': { enabled: true, cue: 'chat-incoming' } } } });
  const ingested = plugin.notificationApi.ingestEvent({ event: { eventId: 'takeover-policy-fallback-event', type: 'toolUse', stopReason: 'tool_completed', traceId: 'takeover-policy-fallback-trace' }, notification: { notificationId: 'takeover-policy-fallback', type: 'tool_completed', source: 'test', title: 'Tool', content: 'body' }, profiles: [{ id: 'default' }] });
  await ingested.sound.playback;
  await plugin.showNotificationScene(ingested.record);
  assert.equal(calls.filter((item) => item.type === 'scene.create').length, 1);
  assert.equal(soundCalls.length, 1);
  assert.equal(plugin.getVisualRuntimeModeStatus().mode, 'legacy');
  assert.equal(plugin.notificationStore.get('takeover-policy-fallback').status, 'shown');
});
