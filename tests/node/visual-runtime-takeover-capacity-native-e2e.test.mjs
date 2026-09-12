import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import test from 'node:test';
import NotificationHubVNextPlugin from '../../plugin/index.js';
import { RuntimeHostAdapter } from '../../plugin/runtime/host-adapter.js';

const runtimePath = process.env.NOTIFICATION_HUB_RUNTIME_PATH;

function context(runId, dataDir, runtimeMode = 'takeover') {
  return {
    dataDir, pluginDir: path.dirname(runtimePath),
    config: { runtimeEnabled: true, visualRuntimeMode: runtimeMode, visualRuntimeTakeoverEnabled: true, visualRuntimeTakeoverDeclaration: 'operator-approved', notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false, visualSettingsPersistenceEnabled: false },
    log: { info() {}, debug() {}, warn() {}, error() {} }
  };
}

async function createPlugin(runId) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'nh-takeover-capacity-'));
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-takeover-capacity-${runId}`;
  const plugin = new NotificationHubVNextPlugin(context(runId, dataDir), { adapterFactory: (ctx) => new RuntimeHostAdapter({ context: ctx, runtimePath, pipeName }) });
  plugin.__e2eDataDir = dataDir;
  await plugin.onload();
  // These tests explicitly drive showNotificationScene(); avoid a second Store-subscriber enqueue.
  plugin.stopNotificationSceneSubscription();
  return plugin;
}

async function applyStackPolicy(plugin, overflow, maxVisible = 1) {
  await plugin.updateEventPresentationSettings({
    channelPolicies: { [`stack.capacity.${overflow}`]: { suppression: 'off', maxVisible, maxActive: 4, overflow } },
    channels: { [`stack.capacity.${overflow}`]: { behaviorProfileId: 'stack', policy: { policyId: `stack.capacity.${overflow}`, suppression: 'off', maxVisible, maxActive: 4, overflow } } },
    global: { soundProfileId: 'sound.default', visualProfileId: 'visual.default', behaviorProfileId: 'stack', behaviorChannelId: `stack.capacity.${overflow}` },
    categories: { tool: { soundProfileId: 'sound.default', visualProfileId: 'visual.default', behaviorProfileId: 'stack', behaviorChannelId: `stack.capacity.${overflow}` } },
    events: { 'tool.execution.succeeded': { soundProfileId: 'sound.default', visualProfileId: 'visual.default', behaviorProfileId: 'stack', behaviorChannelId: `stack.capacity.${overflow}` } }
  });
}

async function show(plugin, id) {
  const result = plugin.notificationApi.ingestEvent({ event: { eventId: 'tool.execution.succeeded', type: 'toolUse', stopReason: 'tool_completed', traceId: `trace-${id}` }, notification: { notificationId: id, type: 'tool_completed', source: 'capacity-e2e', title: id, content: id }, profiles: [{ id: 'default' }] });
  await result.sound.playback;
  const selector = result.record.presentation?.selector ?? result.sound.presentation?.selector;
  assert.equal(selector?.behavior?.channelId, plugin.getEventPresentationSettings().settings.global.behaviorChannelId);
  const shown = await plugin.showNotificationScene(result.record);
  return { result, shown };
}

test('takeover E2E queue keeps Native visible count bounded and promotes after dismiss', async (t) => {
  if (!runtimePath) return t.skip('set NOTIFICATION_HUB_RUNTIME_PATH to the Release Runtime executable');
  const runId = `${process.pid}-queue-${Date.now()}`;
  const plugin = await createPlugin(runId);
  t.after(async () => { await plugin.onunload().catch(() => {}); await rm(plugin.__e2eDataDir, { recursive: true, force: true }); });
  await applyStackPolicy(plugin, 'queue', 1);
  assert.equal(plugin.getEventPresentationSettings().settings.global.behaviorChannelId, `stack.capacity.queue`);
  assert.equal(plugin.getEventPresentationSettings().settings.channels['stack.capacity.queue'].policy.maxVisible, 1);
  await show(plugin, `queue-${runId}-1`);
  await show(plugin, `queue-${runId}-2`);
  const health = await plugin.runtimeHost.client.request('health', {}, { retryable: false });
  const ids = health.payload.result.sceneCards.map((card) => card.id);
  assert.equal(ids.length, 1);
  assert.ok(ids[0].includes(encodeURIComponent(`queue-${runId}-1`)));
  assert.equal(plugin.notificationBehaviorManagers?.size ?? 0, 1);
});

test('takeover E2E drop-oldest does not let Native Shelf exceed the configured visible bound', async (t) => {
  if (!runtimePath) return t.skip('set NOTIFICATION_HUB_RUNTIME_PATH to the Release Runtime executable');
  const runId = `${process.pid}-drop-${Date.now()}`;
  const plugin = await createPlugin(runId);
  t.after(async () => { await plugin.onunload().catch(() => {}); await rm(plugin.__e2eDataDir, { recursive: true, force: true }); });
  await applyStackPolicy(plugin, 'drop-oldest', 1);
  assert.equal(plugin.getEventPresentationSettings().settings.global.behaviorChannelId, `stack.capacity.drop-oldest`);
  assert.equal(plugin.getEventPresentationSettings().settings.channels['stack.capacity.drop-oldest'].policy.maxVisible, 1);
  await show(plugin, `drop-${runId}-1`);
  await show(plugin, `drop-${runId}-2`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const health = await plugin.runtimeHost.client.request('health', {}, { retryable: false });
  assert.equal(health.payload.result.sceneCards.length, 1);
  assert.ok(health.payload.result.sceneCards[0].id.includes(encodeURIComponent(`drop-${runId}-2`)));
});
