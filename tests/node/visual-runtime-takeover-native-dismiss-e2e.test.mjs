import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import NotificationHubVNextPlugin from '../../plugin/index.js';
import { RuntimeHostAdapter } from '../../plugin/runtime/host-adapter.js';

const runtimePath = process.env.NOTIFICATION_HUB_RUNTIME_PATH;
const execFileAsync = promisify(execFile);

async function closeNativeCardWindow(title) {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NotificationHubDismissTest {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindow(string className, string windowName);
  [DllImport("user32.dll")]
  public static extern IntPtr PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
}
'@
$hwnd = [NotificationHubDismissTest]::FindWindow('NotificationHubVNextSceneWindow', '${title.replaceAll("'", "''")}')
if ($hwnd -eq [IntPtr]::Zero) { throw 'Native scene card window was not found' }
[void][NotificationHubDismissTest]::PostMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
`;
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 3000, windowsHide: true });
}

test('Native dismiss cleans takeover state and promotes the queued card', async (t) => {
  if (!runtimePath) return t.skip('set NOTIFICATION_HUB_RUNTIME_PATH to the Release Runtime executable');
  const runId = `${process.pid}-dismiss-${Date.now()}`;
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'nh-takeover-dismiss-'));
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-takeover-dismiss-${runId}`;
  const ctx = {
    dataDir,
    pluginDir: path.dirname(runtimePath),
    config: { runtimeEnabled: true, visualRuntimeMode: 'takeover', visualRuntimeTakeoverEnabled: true, visualRuntimeTakeoverDeclaration: 'operator-approved', notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false, visualSettingsPersistenceEnabled: false },
    log: { info() {}, debug() {}, warn() {}, error() {} }
  };
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: (context) => new RuntimeHostAdapter({ context, runtimePath, pipeName }) });
  await plugin.onload();
  // This E2E drives showNotificationScene explicitly; disable the store subscriber to avoid a duplicate enqueue.
  plugin.stopNotificationSceneSubscription();
  t.after(async () => { await plugin.onunload().catch(() => {}); await rm(dataDir, { recursive: true, force: true }); });
  await plugin.updateEventPresentationSettings({
    channelPolicies: { 'stack.dismiss-e2e': { suppression: 'off', maxVisible: 1, maxActive: 3, overflow: 'queue' } },
    channels: { 'stack.dismiss-e2e': { behaviorProfileId: 'stack', policy: { policyId: 'stack.dismiss-e2e', suppression: 'off', maxVisible: 1, maxActive: 3, overflow: 'queue' } } },
    global: { soundProfileId: 'sound.default', visualProfileId: 'visual.default', behaviorProfileId: 'stack', behaviorChannelId: 'stack.dismiss-e2e' },
    categories: { tool: { soundProfileId: 'sound.default', visualProfileId: 'visual.default', behaviorProfileId: 'stack', behaviorChannelId: 'stack.dismiss-e2e' } },
    events: { 'tool.execution.succeeded': { soundProfileId: 'sound.default', visualProfileId: 'visual.default', behaviorProfileId: 'stack', behaviorChannelId: 'stack.dismiss-e2e' } }
  });
  const create = async (id) => {
    const result = plugin.notificationApi.ingestEvent({ event: { eventId: 'tool.execution.succeeded', type: 'toolUse', stopReason: 'tool_completed', traceId: `trace-${id}` }, notification: { notificationId: id, type: 'tool_completed', source: 'dismiss-e2e', title: id, content: id }, profiles: [{ id: 'default' }] });
    await result.sound.playback;
    await plugin.showNotificationScene(result.record);
    return result.record;
  };
  const first = await create(`dismiss-${runId}-1`);
  const second = await create(`dismiss-${runId}-2`);
  const firstCardId = `nh-vnext-notification-${encodeURIComponent(first.notificationId)}`;
  const before = await plugin.runtimeHost.client.request('health', {}, { retryable: false });
  assert.deepEqual(before.payload.result.sceneCards.map((card) => card.id), [firstCardId]);
  await closeNativeCardWindow(first.title);
  const deadline = Date.now() + 3000;
  let after;
  while (Date.now() < deadline) {
    after = await plugin.runtimeHost.client.request('health', {}, { retryable: false });
    if (plugin.notificationStore.get(first.notificationId)?.status === 'dismissed'
      && after.payload.result.sceneCards.some((card) => card.id === `nh-vnext-notification-${encodeURIComponent(second.notificationId)}`)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  after ??= await plugin.runtimeHost.client.request('health', {}, { retryable: false });
  assert.equal(plugin.notificationStore.get(first.notificationId).status, 'dismissed');
  assert.equal(plugin.notificationSceneVisibleIds.has(first.notificationId), false);
  assert.ok(after.payload.result.sceneCards.some((card) => card.id === `nh-vnext-notification-${encodeURIComponent(second.notificationId)}`));
});

test('Native promotion failure remains pending and succeeds after explicit retry', async (t) => {
  if (!runtimePath) return t.skip('set NOTIFICATION_HUB_RUNTIME_PATH to the Release Runtime executable');
  const runId = `${process.pid}-retry-${Date.now()}`;
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'nh-takeover-retry-'));
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-takeover-retry-${runId}`;
  const ctx = { dataDir, pluginDir: path.dirname(runtimePath), config: { runtimeEnabled: true, visualRuntimeMode: 'takeover', visualRuntimeTakeoverEnabled: true, visualRuntimeTakeoverDeclaration: 'operator-approved', notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false, visualSettingsPersistenceEnabled: false }, log: { info() {}, debug() {}, warn() {}, error() {} } };
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: (context) => new RuntimeHostAdapter({ context, runtimePath, pipeName }) });
  await plugin.onload();
  plugin.stopNotificationSceneSubscription();
  t.after(async () => { await plugin.onunload().catch(() => {}); await rm(dataDir, { recursive: true, force: true }); });
  await plugin.updateEventPresentationSettings({ channelPolicies: { 'stack.retry-e2e': { suppression: 'off', maxVisible: 1, maxActive: 3, overflow: 'queue' } }, channels: { 'stack.retry-e2e': { behaviorProfileId: 'stack', policy: { policyId: 'stack.retry-e2e', suppression: 'off', maxVisible: 1, maxActive: 3, overflow: 'queue' } } }, global: { soundProfileId: 'sound.default', visualProfileId: 'visual.default', behaviorProfileId: 'stack', behaviorChannelId: 'stack.retry-e2e' }, categories: { tool: { soundProfileId: 'sound.default', visualProfileId: 'visual.default', behaviorProfileId: 'stack', behaviorChannelId: 'stack.retry-e2e' } }, events: { 'tool.execution.succeeded': { soundProfileId: 'sound.default', visualProfileId: 'visual.default', behaviorProfileId: 'stack', behaviorChannelId: 'stack.retry-e2e' } } });
  const create = async (id) => { const result = plugin.notificationApi.ingestEvent({ event: { eventId: 'tool.execution.succeeded', type: 'toolUse', stopReason: 'tool_completed', traceId: `trace-${id}` }, notification: { notificationId: id, type: 'tool_completed', source: 'retry-e2e', title: id, content: id }, profiles: [{ id: 'default' }] }); await result.sound.playback; await plugin.showNotificationScene(result.record); return result.record; };
  const first = await create(`retry-${runId}-1`);
  const second = await create(`retry-${runId}-2`);
  const originalPromote = plugin.promoteNotificationScene.bind(plugin);
  let injectedFailure = true;
  plugin.promoteNotificationScene = async (...args) => { if (injectedFailure) { injectedFailure = false; const error = new Error('injected Native create failure'); error.code = 'RUNTIME_SCENE_CREATE_INJECTED_FAILURE'; throw error; } return originalPromote(...args); };
  await closeNativeCardWindow(first.title);
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && plugin.notificationPromotionQueue.size === 0) await new Promise((resolve) => setTimeout(resolve, 50));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(plugin.notificationStore.get(first.notificationId)?.status, 'dismissed');
  assert.equal(plugin.notificationPromotionQueue.size, 1);
  const failedHealth = await plugin.runtimeHost.client.request('health', {}, { retryable: false });
  assert.equal(failedHealth.payload.result.sceneCards.length, 0);
  await plugin.stopRuntimeAfterFailure();
  await plugin.retryRuntime();
  await plugin.retryNotificationPromotions();
  const successDeadline = Date.now() + 3000;
  let health;
  while (Date.now() < successDeadline) { health = await plugin.runtimeHost.client.request('health', {}, { retryable: false }); if (health.payload.result.sceneCards.some((card) => card.id === `nh-vnext-notification-${encodeURIComponent(second.notificationId)}`)) break; await new Promise((resolve) => setTimeout(resolve, 50)); }
  assert.equal(plugin.notificationPromotionQueue.size, 0);
  assert.ok(health.payload.result.sceneCards.some((card) => card.id === `nh-vnext-notification-${encodeURIComponent(second.notificationId)}`));
  const promotionCreates = plugin.getNotificationLifecycleTrace(second.notificationId).filter((entry) => entry.event === 'scene.create.request');
  assert.equal(promotionCreates.length, 1);
});
