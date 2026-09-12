import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import NotificationHubVNextPlugin from '../../plugin/index.js';
import { RuntimeHostAdapter } from '../../plugin/runtime/host-adapter.js';

const runtimePath = process.env.NOTIFICATION_HUB_RUNTIME_PATH;

test('takeover config without the experiment gate stays legacy before Native startup', () => {
  const plugin = new NotificationHubVNextPlugin({ config: { visualRuntimeMode: 'takeover', visualRuntimeTakeoverDeclaration: 'operator-approved' }, dataDir: '', pluginDir: process.cwd() });
  const status = plugin.getVisualRuntimeModeStatus();
  assert.equal(status.mode, 'legacy');
  assert.equal(status.config.allowed, false);
  assert.equal(status.config.reason, 'takeover-disabled');
});

test('takeover e2e uses explicit config gates with the Release Native Runtime', async (t) => {
  if (!runtimePath) {
    t.skip('set NOTIFICATION_HUB_RUNTIME_PATH to the Release Runtime executable');
    return;
  }
  const runId = `${process.pid}-${Date.now()}`;
  const pipeName = `\\\\.\\pipe\\notification-hub-vnext-takeover-e2e-${runId}`;
  const ctx = {
    dataDir: path.dirname(runtimePath),
    pluginDir: path.dirname(runtimePath),
    config: {
      runtimeEnabled: true,
      visualRuntimeMode: 'takeover',
      visualRuntimeTakeoverEnabled: true,
      visualRuntimeTakeoverDeclaration: 'operator-approved',
      notificationPersistenceEnabled: false,
      soundSettingsPersistenceEnabled: false,
      visualSettingsPersistenceEnabled: false
    },
    log: { info() {}, debug() {}, warn() {}, error() {} }
  };
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: (context) => new RuntimeHostAdapter({ context, runtimePath, pipeName })
  });
  await plugin.onload();
  t.after(async () => { await plugin.onunload().catch(() => {}); });

  assert.equal(plugin.getVisualRuntimeModeStatus().mode, 'takeover');
  assert.equal(plugin.getVisualRuntimeModeStatus().config.allowed, true);
  const notificationId = `native-takeover-e2e-${runId}`;
  const cardId = `nh-vnext-notification-${encodeURIComponent(notificationId)}`;
  const record = plugin.notificationApi.createNotification({ notificationId, type: 'tool_completed', source: 'e2e', title: 'Native takeover', content: 'Release Runtime' });
  await plugin.showNotificationScene(record);
  const health = await plugin.runtimeHost.client.request('health', {}, { retryable: false });
  const card = health.payload.result.sceneCards.find((item) => item.id === cardId);
  assert.ok(card);
  assert.equal(card.behavior?.behaviorProfileId, 'stack');
  assert.equal(card.behavior?.behaviorChannelId, 'stack.main');
  assert.equal(plugin.notificationStore.get(notificationId).status, 'shown');
  await plugin.runtimeHost.client.request('scene.dismiss', { id: cardId }, { retryable: false });
});
