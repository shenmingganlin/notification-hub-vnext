import assert from 'node:assert/strict';
import test from 'node:test';

import NotificationHubVNextPlugin from '../../plugin/index.js';

class Adapter {
  state = 'stopped';
  client = { connected: false, state: 'disconnected', async request() { return { payload: { result: { sceneCards: [], workArea: { width: 1920, height: 1080 } } } }; } };
  async start() { this.state = 'running'; this.client.connected = true; this.client.state = 'connected'; }
  async stop() { this.state = 'stopped'; this.client.connected = false; this.client.state = 'closed'; }
  getRuntimeStatus() { return { state: this.state, message: this.state === 'running' ? 'Runtime 正常运行' : 'Runtime 已停止', lastError: null, connected: this.client.connected, clientState: this.client.state }; }
}

function context(registerTool) {
  return {
    dataDir: 'C:\\Hana\\data\\notification-hub-test',
    pluginDir: 'C:\\Hana\\plugins\\notification-hub-test',
    config: { getAll() { return { runtimeEnabled: false, notificationPersistenceEnabled: false }; } },
    log: { info() {}, debug() {}, warn() {}, error() {} },
    registerTool
  };
}

test('notification test tool suppresses repeated physical Windows resources while active', async () => {
  const calls = [];
  const pending = [];
  const backend = {
    playCue(input) {
      calls.push(input);
      return new Promise((resolve) => pending.push(resolve));
    },
    playFile(input) {
      calls.push(input);
      return new Promise((resolve) => pending.push(resolve));
    },
    dispose() {}
  };
  const plugin = new NotificationHubVNextPlugin(context(() => () => {}), {
    adapterFactory: () => new Adapter(),
    soundBackendFactory: () => backend,
    soundPreviewBackendFactory: () => backend
  });
  await plugin.updateSoundSettings({ globalSoundEnabled: true });
  const run = plugin.runNotificationTest({
    count: 12,
    intervalMs: 0,
    events: ['chat_message', 'channel_message', 'tool_completed', 'tool_error', 'timeout', 'system_warning'],
    createCards: false,
    playSound: true
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 4);
  while (pending.length) pending.shift()({ played: true });
  const result = await run;
  assert.equal(result.generated, 12);
  assert.equal(result.results.filter((entry) => entry.scheduling?.status === 'merged').length, 8);
  assert.equal(result.results.filter((entry) => entry.scheduling?.status === 'played').length, 4);
});

test('notification test wait drains every channel queue after the channel queue refactor', async () => {
  const plugin = new NotificationHubVNextPlugin(context(() => () => {}), {
    adapterFactory: () => new Adapter()
  });
  plugin.runtimeHost = { state: 'running', client: { request: async () => ({}) } };
  const processed = [];
  plugin.showNotificationScene = async (record) => {
    processed.push(record.notificationId);
  };
  const records = [
    { notificationId: 'queue-test-a' },
    { notificationId: 'queue-test-b' }
  ];
  plugin.notificationSceneQueues.set('channel-a', [records[0]]);
  plugin.notificationSceneQueues.set('channel-b', [records[1]]);
  await plugin.waitForNotificationSceneQueues();
  assert.deepEqual(processed, ['queue-test-a', 'queue-test-b']);
  assert.equal(plugin.notificationSceneQueues.size, 0);
  assert.equal(plugin.notificationSceneDrainPromises.size, 0);
});

test('plugin exposes bounded notification test tool and removes it on unload', async () => {
  const registrations = [];
  const ctx = context((tool) => {
    registrations.push(tool);
    return () => { tool.removed = true; };
  });
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => new Adapter() });
  await plugin.onload();
  try {
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].name, 'run-notification-test');
    assert.equal(registrations[0].parameters.properties.count.maximum, 100);
    const result = await registrations[0].execute({ count: 6, intervalMs: 0, playSound: false, createCards: false });
    assert.deepEqual(result.content?.map((part) => part.type), ['text']);
    assert.match(result.content?.[0]?.text ?? '', /"generated":6/);
    assert.equal(result.details?.ok, true);
    assert.equal(result.details?.generated, 6);
    assert.equal(result.details?.failed, 0);
    assert.equal(result.details?.historyWritten, true);
    assert.equal(result.details?.storedNotifications, 6);
    assert.equal(plugin.notificationStore.size, 6);
    assert.equal(plugin.notificationStore.get(result.details.results[0].notificationId).metadata.test, true);
  } finally {
    await plugin.onunload();
  }
  assert.equal(registrations[0].removed, true);
});
